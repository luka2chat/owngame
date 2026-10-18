import { promises as fs } from "node:fs";
import path from "node:path";
import {
  KnowledgeRecord,
  SourceRegistry,
  type Knowledge,
  type SourceEntry,
} from "./contracts.js";
import { Fault, hash, digest, readJson } from "./storage.js";
export type SourceRead = {
  source: SourceEntry;
  freshness: "current" | "snapshot_only";
  fragment: unknown;
};
export class KnowledgeBase {
  records: Knowledge[] = [];
  sources: SourceEntry[] = [];
  constructor(
    public directory: string,
    public aliases: Record<string, string>,
  ) {}
  async load() {
    this.sources = SourceRegistry.parse(
      await readJson(path.join(this.directory, "sources.json")),
    ).sources;
    const files = (await fs.readdir(path.join(this.directory, "records")))
      .filter((n) => n.endsWith(".json"))
      .sort();
    this.records = await Promise.all(
      files.map(async (f) =>
        KnowledgeRecord.parse(
          await readJson(path.join(this.directory, "records", f)),
        ),
      ),
    );
    this.validateGraph();
  }
  validateGraph() {
    const unique = (items: { id: string; version: number }[]) =>
      new Set(items.map((x) => `${x.id}@${x.version}`)).size === items.length;
    if (!unique(this.sources) || !unique(this.records))
      throw new Fault("DUPLICATE_VERSION", "IDs and versions must be unique");
    for (const s of this.sources) {
      if (path.isAbsolute(s.path) || s.path.split(/[\\/]/).includes(".."))
        throw new Fault("SOURCE_PATH_ESCAPE", s.id);
      if (s.selector.kind === "lines" && s.selector.end < s.selector.start)
        throw new Fault("INVALID_SELECTOR", s.id);
    }
    for (const r of this.records) {
      validateClaim(r);
      for (const ref of r.source_refs) this.source(ref.source_id, ref.version);
      for (const rel of r.relations)
        this.get(rel.target.id, rel.target.version);
    }
  }
  get(id: string, version?: number) {
    const r = this.records
      .filter(
        (r) => r.id === id && (version === undefined || r.version === version),
      )
      .sort((a, b) => b.version - a.version)[0];
    if (!r)
      throw new Fault("KNOWLEDGE_NOT_FOUND", `${id}@${version ?? "latest"}`);
    return r;
  }
  source(id: string, version: number) {
    const s = this.sources.find((s) => s.id === id && s.version === version);
    if (!s) throw new Fault("SOURCE_NOT_FOUND", `${id}@${version}`);
    return s;
  }
  summary(r: Knowledge) {
    return {
      id: r.id,
      version: r.version,
      type: r.type,
      title: r.title,
      summary: r.summary,
      claim_kind: r.claim_kind,
      status: r.status,
      source_refs: r.source_refs,
      relations: r.relations,
      validation: r.validation,
      freshness: "not_checked",
      unknowns: r.unknowns,
    };
  }
  search(input: {
    query: string;
    types?: string[];
    claim_kinds?: string[];
    limit: number;
  }) {
    const terms = input.query.toLocaleLowerCase().split(/\s+/).filter(Boolean);
    return this.records
      .filter(
        (r) =>
          r.status === "active" &&
          this.get(r.id).version === r.version &&
          (!input.types || input.types.includes(r.type)) &&
          (!input.claim_kinds || input.claim_kinds.includes(r.claim_kind)) &&
          terms.every((t) =>
            [r.id, r.title, r.summary, ...r.aliases, ...r.tags]
              .join(" ")
              .toLocaleLowerCase()
              .includes(t),
          ),
      )
      .slice(0, input.limit)
      .map((r) => this.summary(r));
  }
  closure(refs: { id: string; version: number }[]) {
    const found = new Map<string, Knowledge>();
    const visit = (id: string, v: number) => {
      const key = `${id}@${v}`;
      if (found.has(key)) return;
      const r = this.get(id, v);
      found.set(key, r);
      for (const rel of r.relations) visit(rel.target.id, rel.target.version);
    };
    for (const r of refs) visit(r.id, r.version);
    return [...found.values()];
  }
  async read(s: SourceEntry, mode: "live" | "snapshot"): Promise<SourceRead> {
    if (mode === "snapshot") {
      const raw = await fs.readFile(
        path.join(this.directory, "snapshots", `${s.snapshot_sha256}.json`),
      );
      if (hash(raw) !== s.snapshot_sha256)
        throw new Fault("SNAPSHOT_CORRUPT", s.id);
      return {
        source: s,
        freshness: "snapshot_only",
        fragment: JSON.parse(raw.toString()),
      };
    }
    const root = this.aliases[s.alias];
    if (!root)
      throw new Fault(
        "SOURCE_UNAVAILABLE",
        `No local alias configured: ${s.alias}`,
        true,
      );
    let raw: Buffer;
    try {
      const realRoot = await fs.realpath(root),
        realFile = await fs.realpath(path.resolve(realRoot, s.path));
      const relative = path.relative(realRoot, realFile);
      if (
        relative === ".." ||
        relative.startsWith(`..${path.sep}`) ||
        path.isAbsolute(relative)
      )
        throw new Fault("SOURCE_PATH_ESCAPE", s.id);
      const stat = await fs.stat(realFile);
      if (!stat.isFile() || stat.size > 1024 * 1024)
        throw new Fault("SOURCE_SIZE_LIMIT", s.id);
      raw = await fs.readFile(realFile);
    } catch (e) {
      if (e instanceof Fault) throw e;
      throw new Fault(
        "SOURCE_UNAVAILABLE",
        `Cannot read registered source: ${s.id}`,
        true,
      );
    }
    if (hash(raw) !== s.sha256)
      throw new Fault(
        "SOURCE_STALE",
        `Source fingerprint changed: ${s.id}`,
        true,
      );
    let fragment: unknown;
    if (s.selector.kind === "lines")
      fragment = raw
        .toString()
        .split(/\r?\n/)
        .slice(s.selector.start - 1, s.selector.end)
        .join("\n");
    else {
      fragment = JSON.parse(raw.toString());
      if (s.selector.pointer !== "" && !s.selector.pointer.startsWith("/"))
        throw new Fault("INVALID_SELECTOR", s.id);
      for (const key of s.selector.pointer === ""
        ? []
        : s.selector.pointer
            .slice(1)
            .split("/")
            .map((s) => s.replace(/~1/g, "/").replace(/~0/g, "~"))) {
        if (
          !fragment ||
          typeof fragment !== "object" ||
          !Object.hasOwn(fragment, key)
        )
          throw new Fault("INVALID_SELECTOR", s.id);
        fragment = (fragment as Record<string, unknown>)[key];
      }
    }
    // A registered whole-file hash and selected-fragment hash must both agree.
    if (hash(JSON.stringify(fragment, null, 2) + "\n") !== s.snapshot_sha256)
      throw new Fault("SOURCE_FRAGMENT_MISMATCH", s.id);
    return { source: s, freshness: "current", fragment };
  }
  async audit(records: Knowledge[]) {
    const refs = [
      ...new Map(
        records
          .flatMap((r) => r.source_refs)
          .map((r) => [`${r.source_id}@${r.version}`, r]),
      ).values(),
    ];
    return Promise.all(
      refs.map(async (r) => {
        try {
          await this.read(this.source(r.source_id, r.version), "live");
          return {
            id: r.source_id,
            version: r.version,
            freshness: "current",
            code: null,
          };
        } catch (e) {
          if (!(e instanceof Fault)) throw e;
          return {
            id: r.source_id,
            version: r.version,
            freshness: "unavailable",
            code: e.code,
          };
        }
      }),
    );
  }
  pins(records: Knowledge[]) {
    return records.map((r) => ({
      id: r.id,
      version: r.version,
      sha256: digest(r),
    }));
  }
}
export function validateClaim(r: Knowledge) {
  if (
    ["reported", "observed", "test_result"].includes(r.claim_kind) &&
    !r.source_refs.some((s) => s.relation === "supports")
  )
    throw new Fault("MISSING_EVIDENCE", r.id);
  if (
    ["design_hypothesis", "concept_proposal", "acceptance_check"].includes(
      r.type,
    ) &&
    r.claim_kind !== "proposed"
  )
    throw new Fault("PROPOSAL_AS_FACT", r.id);
  if (
    ["reference_game", "source_evidence"].includes(r.type) &&
    !["reported", "observed"].includes(r.claim_kind)
  )
    throw new Fault("INVALID_REFERENCE_CLAIM", r.id);
  if (r.claim_kind === "proposed" && r.validation.state !== "not_run")
    throw new Fault("UNTESTED_PROPOSAL", r.id);
  if (r.claim_kind === "inferred" && !r.relations.length)
    throw new Fault("MISSING_INFERENCE_BASIS", r.id);
  if (r.validation.state === "source_reviewed" && !r.source_refs.length)
    throw new Fault("MISSING_EVIDENCE", r.id);
  if (
    r.validation.state === "experiment_recorded" &&
    r.claim_kind !== "test_result"
  )
    throw new Fault("INVALID_EXPERIMENT", r.id);
  if (!Object.keys(r.content).length) throw new Fault("EMPTY_CONTENT", r.id);
}
