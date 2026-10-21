import { Toolkit } from "./toolkit.js";
import { Resources, ResourceSources } from "./resources.js";
import { Library } from "../library/index.js";
import path from "node:path";
import { promises as fs } from "node:fs";
import { randomUUID } from "node:crypto";
import { z } from "zod";
import {
  Contracts,
  Operations,
  PublicOperations,
  VERSION,
  Run,
  Task,
  jsonSchema,
  type OperationResult,
  type OperationName,
  type TaskRecord,
  type Knowledge,
} from "./contracts.js";
import { KnowledgeBase, validateClaim } from "./knowledge.js";
import {
  Fault,
  Store,
  digest,
  hash,
  readJson,
  atomicJson,
  exists,
  now,
} from "./storage.js";
export { Operations, Contracts, jsonSchema } from "./contracts.js";
export type CoreOptions = {
  root: string;
  workspace?: string;
  knowledge?: string;
  config?: string;
  legacy?: boolean;
};
export class Core {
  resources = new Resources();
  store: Store;
  kb: KnowledgeBase;
  library: Library;
  toolkit: Toolkit;
  constructor(public options: CoreOptions) {
    this.toolkit = new Toolkit(options.root, options.workspace ?? options.root);
    this.store = new Store(
      path.join(options.workspace ?? options.root, ".owngame"),
    );
    this.library = new Library(this.store, [
      options.root,
      options.workspace ?? options.root,
    ]);
    this.kb = new KnowledgeBase(
      options.knowledge ?? path.join(options.root, "starter-knowledge"),
      { owngame: options.root },
    );
  }
  async initialize() {
    const config =
      this.options.config ??
      path.join(
        this.options.workspace ?? this.options.root,
        ".owngame",
        "local.json",
      );
    if (await exists(config)) {
      const data = z
        .strictObject({ source_aliases: z.record(z.string(), z.string()) })
        .parse(await readJson(config));
      for (const [alias, dir] of Object.entries(data.source_aliases)) {
        if (alias === "owngame")
          throw new Fault(
            "RESERVED_ALIAS",
            "owngame alias is fixed to repository root",
          );
        if (!path.isAbsolute(dir))
          throw new Fault("INVALID_ALIAS", "Alias paths must be absolute");
        this.kb.aliases[alias] = dir;
      }
    }
  }
  result(
    operation: string,
    status: OperationResult["status"],
    data: unknown = null,
    code?: string,
    message?: string,
  ): OperationResult {
    return {
      schema_version: VERSION,
      operation_id: randomUUID(),
      operation,
      status,
      data,
      diagnostics: code ? [{ code, message: message ?? code }] : [],
      unknowns:
        status === "unknown"
          ? [message ?? code ?? "Verification unavailable"]
          : [],
      artifacts: [],
    };
  }
  get operations() {
    return this.options.legacy ? Operations : PublicOperations;
  }
  async call(operation: string, input: unknown = {}): Promise<OperationResult> {
    try {
      if (!Object.hasOwn(this.operations, operation))
        throw new Fault("UNKNOWN_OPERATION", operation);
      const args = Operations[operation as OperationName].parse(input);
      if (
        operation.startsWith("knowledge.") ||
        operation.startsWith("source.") ||
        ["research.prepare", "run.create", "task.execute"].includes(operation)
      )
        await this.kb.load();
      return await this.dispatch(operation as OperationName, args as any);
    } catch (e) {
      if (e instanceof z.ZodError)
        return this.result(
          operation,
          "failed",
          null,
          "INVALID_CONTRACT",
          e.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; "),
        );
      if (e instanceof Fault)
        return this.result(
          operation,
          e.unknown ? "unknown" : "failed",
          null,
          e.code,
          e.message,
        );
      const code = (e as NodeJS.ErrnoException).code;
      return this.result(
        operation,
        "unknown",
        null,
        code === "ENOENT" ? "STATE_UNAVAILABLE" : "ENVIRONMENT_ERROR",
        e instanceof Error ? e.message : String(e),
      );
    }
  }
  async dispatch(op: OperationName, a: any): Promise<OperationResult> {
    const ok = (d: unknown) => this.result(op, "succeeded", d);
    switch (op) {
      case "resource.sources":
        return ok({ sources: ResourceSources });
      case "resource.search": {
        const data = await this.resources.search(a);
        return this.result(op, data.complete ? "succeeded" : "unknown", data,
          data.complete ? undefined : "RESOURCE_SEARCH_INCOMPLETE",
          data.complete ? undefined : "Some sources could not be searched; inspect provider status. Available results are retained.");
      }
      case "resource.get":
        return ok(await this.resources.get(a));
      case "style.list":
        return ok(await this.toolkit.styles());
      case "style.get":
        return ok(await this.toolkit.style(a.id));
      case "guidance.get":
        return ok(await this.toolkit.guidance(a.topic));
      case "project.create":
        return ok(await this.toolkit.create(a));
      case "web.inspect":
        return ok(await this.toolkit.inspect(a.directory));
      case "cocos.build": {
        const report = await this.toolkit.build(a);
        const result = this.result(
          op,
          report.status,
          report,
          report.status === "succeeded" ? undefined : "BUILD_NOT_VERIFIED",
        );
        result.artifacts = [
          {
            path: report.report_path,
            sha256: hash(await fs.readFile(report.report_path)),
          },
        ];
        return result;
      }
      case "research.prepare": {
        const matches = this.kb.search({ query: a.query, limit: a.limit });
        if (!matches.length)
          throw new Fault("RESEARCH_NOT_FOUND", a.query, true);
        const records = this.kb.closure(matches);
        const refs = [
          ...new Map(
            records
              .flatMap((r) => r.source_refs)
              .map((r) => [`${r.source_id}@${r.version}`, r]),
          ).values(),
        ];
        const sources = [];
        for (const ref of refs.slice(0, a.limit)) {
          try {
            sources.push(
              await this.kb.read(
                this.kb.source(ref.source_id, ref.version),
                a.mode,
              ),
            );
          } catch (e) {
            sources.push({
              id: ref.source_id,
              freshness: "unavailable",
              error: e instanceof Error ? e.message : String(e),
            });
          }
        }
        const incomplete =
          a.mode === "snapshot" ||
          refs.length > a.limit ||
          sources.some((s) => s.freshness !== "current");
        return this.result(
          op,
          incomplete ? "unknown" : "succeeded",
          {
            records,
            pins: this.kb.pins(records),
            sources,
            truncated: refs.length > a.limit,
            interpretation:
              "Snapshots are historical source excerpts, not live verification. Reported rules are not independent gameplay observations. No run/task or history was created.",
            next: "Choose an original change and a game art direction; save design and acceptance artifacts, then build and test through real input.",
          },
          incomplete ? "RESEARCH_EVIDENCE_INCOMPLETE" : undefined,
        );
      }
      case "delivery.register":
        return ok(await this.library.register(a));
      case "delivery.list":
        return ok({ items: await this.library.list() });
      case "delivery.get":
        return ok(await this.library.current(a.id, a.build_sha256));
      case "assessment.record":
        return ok(await this.library.assess(a));
      case "assessment.list":
        return ok({
          items: await this.library.assessments(a.delivery_id, a.build_sha256),
        });
      case "capabilities":
        return ok({
          version: VERSION,
          package_version: (await readJson(path.join(this.options.root, "package.json"))).version,
          operations: Object.keys(this.operations),
          task_execution:
            "legacy M2 experiment only; not required for authoring; no background scheduler",
          agent_workflow:
            "host-owned planning and execution; owngame provides tools and artifacts, no creation queue or agent runner",
          engines: ["web-canvas", "phaser@3.90.0", "cocos@3.8.8/web-desktop"],
          limits: { source_bytes: 1048576, research_sources: 8 },
          game_implementation:
            "bundled two-player Web starter; three curated historical case studies; runtime checks and human evaluation must be reported per project",
        });
      case "contract.get":
        return ok(jsonSchema(Contracts[a.name as keyof typeof Contracts]));
      case "contract.validate": {
        const doc = Contracts[a.name as keyof typeof Contracts].parse(
          a.document,
        );
        this.semantic(a.name, doc);
        return ok({
          valid: true,
          name: a.name,
          evidence_verification: "not_performed",
        });
      }
      case "knowledge.search":
        return ok({ items: this.kb.search(a) });
      case "knowledge.get": {
        const record = this.kb.get(a.id, a.version),
          audit = await this.kb.audit(this.kb.closure([record]));
        return this.result(
          op,
          audit.some((s) => s.freshness !== "current")
            ? "unknown"
            : "succeeded",
          {
            record: a.view === "full" ? record : this.kb.summary(record),
            sources: audit,
            interpretation:
              "Current hashes confirm source identity, not independent gameplay verification.",
          },
          audit.some((s) => s.freshness !== "current")
            ? "EVIDENCE_UNAVAILABLE"
            : undefined,
        );
      }
      case "knowledge.validate": {
        const audit = await this.kb.audit(this.kb.records);
        return this.result(
          op,
          audit.some((s) => s.freshness !== "current")
            ? "unknown"
            : "succeeded",
          {
            records: this.kb.records.length,
            sources: audit,
            graph_valid: true,
          },
          audit.some((s) => s.freshness !== "current")
            ? "EVIDENCE_UNAVAILABLE"
            : undefined,
        );
      }
      case "source.list":
        return ok({
          sources: this.kb.sources.map((s) => ({
            ...s,
            alias_configured: !!this.kb.aliases[s.alias],
            freshness: "not_checked",
          })),
        });
      case "source.read":
        return ok(await this.kb.read(this.kb.source(a.id, a.version), a.mode));
      case "run.create":
        return this.store.lock(async () => {
          this.semantic("request", a.request);
          this.semantic("design", a.design);
          this.semantic("checks", a.checks);
          if (
            digest(a.request.reference) !== digest(a.design.reference) ||
            digest(a.checks.design_ref) !==
              digest({ id: a.design.id, version: a.design.version })
          )
            throw new Fault(
              "REFERENCE_MISMATCH",
              "Request, design and check versions disagree",
            );
          const reference = this.kb.get(
            a.request.reference.id,
            a.request.reference.version,
          );
          if (reference.type !== "reference_game")
            throw new Fault(
              "INVALID_REFERENCE",
              "Request reference must be a reference_game",
            );
          const records = this.kb.closure([
            a.request.reference,
            ...a.design.knowledge_refs,
          ]);
          const sourceRefs = [
            ...new Map(
              records
                .flatMap((r) => r.source_refs)
                .map((r) => [`${r.source_id}@${r.version}`, r]),
            ).values(),
          ];
          const source_pins = sourceRefs.map((r) => ({
            id: r.source_id,
            version: r.version,
            sha256: digest(this.kb.source(r.source_id, r.version)),
          }));
          const input_sha256 = digest({
            request: a.request,
            design: a.design,
            checks: a.checks,
            pins: this.kb.pins(records),
            source_pins,
          });
          const id = `run-${digest(a.idempotency_key).slice(0, 32)}`,
            file = path.join(this.store.runPath(id), "run.json");
          if (await exists(file)) {
            const run = await this.getRun(id);
            if (run.input_sha256 !== input_sha256)
              throw new Fault(
                "IDEMPOTENCY_CONFLICT",
                "Run key already identifies different inputs or knowledge",
              );
            return ok(run);
          }
          const run = Run.parse({
            schema_version: VERSION,
            id,
            created_at: now(),
            input_sha256,
            stage: "research",
            game_verdict: "not_run",
            request: a.request,
            design: a.design,
            checks: a.checks,
            pins: this.kb.pins(records),
            source_pins,
          });
          await atomicJson(file, run);
          return ok(run);
        });
      case "run.get":
        return ok(await this.getRun(a.run_id));
      case "task.create":
        return this.store.lock(async () => {
          const run = await this.getRun(a.run_id),
            budget_ms = Math.min(
              a.budget_ms,
              run.request.budgets.research_ms,
              run.request.budgets.run_ms,
            ),
            source_limit = Math.min(
              a.source_limit,
              run.request.budgets.research_sources,
            );
          const input_sha256 = digest({
            run: run.input_sha256,
            kind: a.kind,
            budget_ms,
            source_limit,
          });
          const id = `task-${digest(a.idempotency_key).slice(0, 32)}`,
            file = this.store.taskPath(run.id, id);
          if (await exists(file)) {
            const t = await this.getTask(run.id, id);
            if (t.input_sha256 !== input_sha256)
              throw new Fault(
                "IDEMPOTENCY_CONFLICT",
                "Task key already identifies different inputs",
              );
            return ok(t);
          }
          const t = Task.parse({
            schema_version: VERSION,
            id,
            run_id: run.id,
            kind: a.kind,
            status: "pending",
            created_at: now(),
            updated_at: now(),
            deadline_at: null,
            budget_ms,
            source_limit,
            cancel_requested: false,
            stop_reason: null,
            input_sha256,
            result: null,
          });
          await atomicJson(file, t);
          return ok(t);
        });
      case "task.get":
        return this.store.lock(async () =>
          ok(await this.recoverTask(a.run_id, a.task_id)),
        );
      case "task.cancel":
        return this.store.lock(async () => {
          const t = await this.recoverTask(a.run_id, a.task_id);
          if (["pending", "running"].includes(t.status)) {
            t.cancel_requested = true;
            if (t.status === "pending") {
              t.status = "cancelled";
              t.stop_reason = "cancelled";
            }
            t.updated_at = now();
            await this.saveTask(t);
          }
          return ok(t);
        });
      case "task.execute":
        return this.execute(a.run_id, a.task_id);
    }
  }
  semantic(name: string, doc: any) {
    const unique = (items: { id: string }[]) =>
      new Set(items.map((i) => i.id)).size === items.length;
    if (name === "knowledge") validateClaim(doc as Knowledge);
    if (name === "request" && doc.budgets.research_ms > doc.budgets.run_ms)
      throw new Fault(
        "INVALID_BUDGET",
        "Research time cannot exceed run budget",
      );
    if (
      name === "design" &&
      (doc.candidates.filter((c: any) => c.selected).length !== 1 ||
        !unique(doc.rules))
    )
      throw new Fault(
        "INVALID_DESIGN",
        "Select exactly one candidate and use unique rule ids",
      );
    if (name === "checks" && !unique(doc.checks))
      throw new Fault("DUPLICATE_CHECK", "Check ids must be unique");
  }
  async getRun(id: string) {
    const r = Run.parse(
      await readJson(path.join(this.store.runPath(id), "run.json")),
    );
    if (
      r.id !== id ||
      digest({
        request: r.request,
        design: r.design,
        checks: r.checks,
        pins: r.pins,
        source_pins: r.source_pins,
      }) !== r.input_sha256
    )
      throw new Fault("FROZEN_INPUT_CHANGED", "Frozen run input hash mismatch");
    return r;
  }
  async getTask(run: string, id: string) {
    const t = Task.parse(await readJson(this.store.taskPath(run, id)));
    if (t.id !== id || t.run_id !== run)
      throw new Fault("TASK_ID_MISMATCH", "Task identity mismatch");
    return t;
  }
  async saveTask(t: TaskRecord) {
    await atomicJson(this.store.taskPath(t.run_id, t.id), t);
  }
  async recoverTask(run: string, id: string) {
    const t = await this.getTask(run, id);
    if (
      t.status === "running" &&
      t.deadline_at &&
      Date.now() > Date.parse(t.deadline_at)
    ) {
      t.status = t.cancel_requested ? "cancelled" : "interrupted";
      t.stop_reason = t.cancel_requested ? "cancelled" : "budget_exhausted";
      t.updated_at = now();
      t.result = this.result(
        "research.prepare",
        "unknown",
        null,
        "EXECUTOR_EXPIRED",
        "Executor deadline expired; saved partial results are not a completed research report",
      );
      await this.saveTask(t);
    }
    return t;
  }
  async executionResult(task: TaskRecord) {
    const response = this.result("task.execute", "succeeded", task);
    const output = path.join(
      this.store.runPath(task.run_id),
      "results",
      `${task.id}.json`,
    );
    if (await exists(output))
      response.artifacts = [
        {
          path: path.relative(
            this.options.workspace ?? this.options.root,
            output,
          ),
          sha256: hash(await fs.readFile(output)),
        },
      ];
    return response;
  }
  async execute(runId: string, taskId: string) {
    const claimed = await this.store.lock(async () => {
      const t = await this.recoverTask(runId, taskId);
      if (t.status !== "pending") return { t, claimed: false };
      const run = await this.getRun(runId);
      const budgetFile = path.join(this.store.runPath(runId), "budget.json");
      const budget = (await exists(budgetFile))
        ? await readJson(budgetFile)
        : {
            started_at: now(),
            deadline_at: new Date(
              Date.now() + run.request.budgets.run_ms,
            ).toISOString(),
          };
      if (!(await exists(budgetFile))) await atomicJson(budgetFile, budget);
      t.status = "running";
      t.updated_at = now();
      t.deadline_at = new Date(
        Math.min(Date.now() + t.budget_ms, Date.parse(budget.deadline_at)),
      ).toISOString();
      await this.saveTask(t);
      return { t, claimed: true };
    });
    if (!claimed.claimed) return this.executionResult(claimed.t);
    const task = claimed.t;
    let result: OperationResult;
    let stop: TaskRecord["stop_reason"] = "completed";
    const reads: unknown[] = [];
    try {
      const run = await this.getRun(runId),
        records = run.pins.map((pin) => {
          const r = this.kb.get(pin.id, pin.version);
          if (digest(r) !== pin.sha256)
            throw new Fault("KNOWLEDGE_CHANGED", pin.id, true);
          return r;
        });
      for (const pin of run.source_pins) {
        const latest = await this.getTask(runId, taskId);
        if (latest.cancel_requested || latest.status === "cancelled")
          throw new Fault("CANCELLED", "Research task cancelled", true);
        if (
          Date.now() >= Date.parse(task.deadline_at!) ||
          reads.length >= task.source_limit
        )
          throw new Fault(
            "BUDGET_EXHAUSTED",
            "Research budget reached before all sources were checked",
            true,
          );
        const source = this.kb.source(pin.id, pin.version);
        if (digest(source) !== pin.sha256)
          throw new Fault("SOURCE_REGISTRATION_CHANGED", pin.id, true);
        reads.push(await this.kb.read(source, "live"));
      }
      const dossier = {
        run_id: runId,
        design: run.design,
        checks: run.checks,
        game_verdict: "not_run",
        reference_facts: records.filter((r) =>
          ["reported", "observed"].includes(r.claim_kind),
        ),
        inferences: records.filter((r) => r.claim_kind === "inferred"),
        proposals: records.filter((r) => r.claim_kind === "proposed"),
        experiments: records.filter((r) => r.claim_kind === "test_result"),
        sources: reads,
        unknowns: [
          ...new Set(
            records.flatMap((r) => r.unknowns).concat(run.design.unknowns),
          ),
        ],
      };
      result = this.result("research.prepare", "succeeded", dossier);
    } catch (e) {
      const f =
        e instanceof Fault
          ? e
          : new Fault(
              "RESEARCH_ERROR",
              e instanceof Error ? e.message : String(e),
              true,
            );
      stop =
        f.code === "CANCELLED"
          ? "cancelled"
          : f.code === "BUDGET_EXHAUSTED"
            ? "budget_exhausted"
            : f.code === "RESEARCH_ERROR"
              ? "environment_unavailable"
              : "verification_unavailable";
      result = this.result(
        "research.prepare",
        f.unknown ? "unknown" : "failed",
        { partial_sources: reads, game_verdict: "not_run" },
        f.code,
        f.message,
      );
    }
    return this.store.lock(async () => {
      const current = await this.getTask(runId, taskId);
      if (current.status !== "running") return this.executionResult(current);
      if (current.cancel_requested) {
        stop = "cancelled";
        result = this.result(
          "research.prepare",
          "unknown",
          { partial_sources: reads },
          "CANCELLED",
          "Research task cancelled",
        );
      } else if (Date.now() >= Date.parse(current.deadline_at!)) {
        stop = "budget_exhausted";
        result = this.result(
          "research.prepare",
          "unknown",
          { partial_sources: reads },
          "BUDGET_EXHAUSTED",
          "Research deadline reached before result commit",
        );
      }
      current.status =
        stop === "cancelled"
          ? "cancelled"
          : result.status === "succeeded"
            ? "succeeded"
            : result.status === "failed"
              ? "failed"
              : "interrupted";
      current.stop_reason = stop;
      current.updated_at = now();
      current.result = result;
      const output = path.join(
        this.store.runPath(runId),
        "results",
        `${taskId}.json`,
      );
      await atomicJson(output, result);
      await this.saveTask(current);
      return this.executionResult(current);
    });
  }
}
