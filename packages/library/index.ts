import path from "node:path";
import { promises as fs } from "node:fs";
import { randomUUID } from "node:crypto";
import { z } from "zod";
import {
  Store,
  Fault,
  atomicJson,
  readJson,
  digest,
  hash,
  now,
  exists,
} from "../core/storage.js";
const slug = z.string().regex(/^[a-z0-9][a-z0-9-]{0,63}$/);
const sha = z.string().regex(/^[a-f0-9]{64}$/);
const text = z.string().min(1).max(4000);
export const Delivery = z.strictObject({
  schema_version: z.literal("1.0.0"),
  id: slug,
  title: text,
  description: z.string().max(4000),
  engine: z.literal("web"),
  entrypoint: text,
  build_sha256: sha,
  created_at: z.string().datetime(),
  source_path: text,
  files: z
    .array(
      z.strictObject({
        path: text,
        bytes: z.number().int().nonnegative(),
        sha256: sha,
      }),
    )
    .min(1),
  provenance: z.strictObject({
    reference: z.string().max(200),
    notes: z.string().max(4000),
  }),
});
export const Assessment = z.strictObject({
  schema_version: z.literal("1.0.0"),
  id: text,
  delivery_id: slug,
  build_sha256: sha,
  created_at: z.string().datetime(),
  reviewer: z.enum(["human", "agent", "automated"]),
  art: z.number().int().min(1).max(5).nullable(),
  feel: z.number().int().min(1).max(5).nullable(),
  note: text,
  issues: z.array(z.string().max(1000)).max(30),
  input_sha256: sha,
});
export const LibraryOperations = {
  "delivery.register": z.strictObject({
    id: slug,
    title: text,
    description: z.string().max(4000).default(""),
    build_path: text,
    entrypoint: z.string().default("index.html"),
    reference: z.string().max(200).default(""),
    notes: z.string().max(4000).default(""),
  }),
  "delivery.list": z.strictObject({}),
  "delivery.get": z.strictObject({ id: slug, build_sha256: sha.optional() }),
  "assessment.record": z.strictObject({
    delivery_id: slug,
    build_sha256: sha,
    reviewer: z.enum(["human", "agent", "automated"]),
    art: z.number().int().min(1).max(5).nullable().default(null),
    feel: z.number().int().min(1).max(5).nullable().default(null),
    note: text,
    issues: z.array(z.string().max(1000)).max(30).default([]),
    idempotency_key: z.string().min(1).max(160),
  }),
  "assessment.list": z.strictObject({
    delivery_id: slug,
    build_sha256: sha.optional(),
  }),
};
export function safeRelative(value: string) {
  if (
    !value ||
    value.startsWith("/") ||
    value.includes("\\") ||
    value.split("/").some((s) => !s || s === "." || s === "..") ||
    /[\x00-\x1f]/.test(value)
  )
    throw new Fault("INVALID_ARTIFACT_PATH", value);
  return value;
}
export class Library {
  constructor(
    public store: Store,
    public allowedRoots: string[],
  ) {}
  base(id: string) {
    return path.join(this.store.root, "library", slug.parse(id));
  }
  async current(id: string, version?: string) {
    const selected =
      version ??
      (await readJson(path.join(this.base(id), "current.json"))).build_sha256;
    sha.parse(selected);
    const d = Delivery.parse(
      await readJson(path.join(this.base(id), selected, "delivery.json")),
    );
    if (
      d.id !== id ||
      d.build_sha256 !== selected ||
      digest(d.files) !== selected
    )
      throw new Fault(
        "DELIVERY_CHANGED",
        "Manifest fingerprint mismatch",
        true,
      );
    return d;
  }
  async file(id: string, version: string, name: string) {
    const d = await this.current(id, version);
    safeRelative(name);
    const expected = d.files.find((f) => f.path === name);
    if (!expected) throw new Fault("ARTIFACT_NOT_FOUND", name);
    const file = path.join(this.base(id), version, "files", name),
      real = await fs.realpath(file);
    if (
      !real.startsWith(
        (await fs.realpath(path.join(this.base(id), version, "files"))) +
          path.sep,
      )
    )
      throw new Fault("INVALID_ARTIFACT_PATH", name);
    const bytes = await fs.readFile(real);
    if (hash(bytes) !== expected.sha256)
      throw new Fault("DELIVERY_CHANGED", name, true);
    return bytes;
  }
  async list() {
    const dir = path.join(this.store.root, "library");
    if (!(await exists(dir))) return [];
    const result = [];
    for (const e of await fs.readdir(dir, { withFileTypes: true }))
      if (e.isDirectory() && slug.safeParse(e.name).success) {
        try {
          result.push(await this.current(e.name));
        } catch (e) {
          if ((e as NodeJS.ErrnoException).code !== "ENOENT") throw e;
        }
      }
    return result.sort((a, b) => b.created_at.localeCompare(a.created_at));
  }
  async register(a: z.infer<(typeof LibraryOperations)["delivery.register"]>) {
    return this.store.lock(async () => {
      safeRelative(a.entrypoint);
      const source = await fs.realpath(path.resolve(a.build_path));
      const allowed = await Promise.all(
        this.allowedRoots.map((p) => fs.realpath(p)),
      );
      if (!allowed.some((p) => source.startsWith(p + path.sep)))
        throw new Fault(
          "BUILD_OUTSIDE_WORKSPACE",
          "Select a build inside the workspace",
        );
      const collected: { path: string; bytes: number; sha256: string }[] = [],
        buffers = new Map<string, Buffer>();
      let total = 0;
      const walk = async (dir: string) => {
        for (const e of await fs.readdir(dir, { withFileTypes: true })) {
          if (e.isSymbolicLink())
            throw new Fault(
              "SYMLINK_ARTIFACT",
              "Delivery cannot contain symbolic links",
            );
          const p = path.join(dir, e.name);
          if (e.isDirectory()) await walk(p);
          else if (e.isFile()) {
            if (e.name === ".DS_Store") continue;
            const rel = path.relative(source, p).split(path.sep).join("/");
            safeRelative(rel);
            const size = (await fs.stat(p)).size;
            total += size;
            if (total > 128 * 1024 * 1024 || collected.length >= 4096)
              throw new Fault(
                "BUILD_LIMIT",
                "Build exceeds 128 MiB / 4096 files",
              );
            const bytes = await fs.readFile(p);
            collected.push({
              path: rel,
              bytes: bytes.length,
              sha256: hash(bytes),
            });
            buffers.set(rel, bytes);
          }
        }
      };
      await walk(source);
      collected.sort((a, b) => a.path.localeCompare(b.path, "en"));
      if (!buffers.has(a.entrypoint))
        throw new Fault("ENTRYPOINT_MISSING", a.entrypoint);
      const build_sha256 = digest(collected),
        target = path.join(this.base(a.id), build_sha256);
      const delivery = Delivery.parse({
        schema_version: "1.0.0",
        id: a.id,
        title: a.title,
        description: a.description,
        engine: "web",
        entrypoint: a.entrypoint,
        build_sha256,
        created_at: now(),
        source_path: source,
        files: collected,
        provenance: { reference: a.reference, notes: a.notes },
      });
      if (!(await exists(target))) {
        const staging = target + "." + randomUUID() + ".tmp";
        try {
          for (const [name, bytes] of buffers) {
            const p = path.join(staging, "files", name);
            await fs.mkdir(path.dirname(p), { recursive: true });
            await fs.writeFile(p, bytes, { flag: "wx" });
          }
          await atomicJson(path.join(staging, "delivery.json"), delivery);
          await fs.rename(staging, target);
        } finally {
          await fs.rm(staging, { recursive: true, force: true });
        }
      }
      const stored = await this.current(a.id, build_sha256);
      if (
        stored.title !== a.title ||
        stored.entrypoint !== a.entrypoint ||
        stored.description !== a.description ||
        stored.provenance.reference !== a.reference ||
        stored.provenance.notes !== a.notes
      )
        throw new Fault(
          "DELIVERY_METADATA_CONFLICT",
          "Same build is already registered with different metadata",
        );
      await atomicJson(path.join(this.base(a.id), "current.json"), {
        build_sha256,
      });
      return stored;
    });
  }
  async assess(a: z.infer<(typeof LibraryOperations)["assessment.record"]>) {
    return this.store.lock(async () => {
      const delivery = await this.current(a.delivery_id, a.build_sha256);
      // Recheck all published bytes so an assessment is tied to the actual saved build.
      for (const f of delivery.files)
        await this.file(a.delivery_id, a.build_sha256, f.path);
      const id = "assessment-" + digest(a.idempotency_key).slice(0, 32),
        file = path.join(this.base(a.delivery_id), "assessments", id + ".json"),
        input_sha256 = digest(a);
      if (await exists(file)) {
        const previous = Assessment.parse(await readJson(file));
        if (previous.input_sha256 !== input_sha256)
          throw new Fault(
            "IDEMPOTENCY_CONFLICT",
            "Assessment key identifies different feedback",
          );
        return previous;
      }
      const { idempotency_key: _key, ...feedback } = a;
      const record = Assessment.parse({
        ...feedback,
        schema_version: "1.0.0",
        id,
        created_at: now(),
        input_sha256,
      });
      await atomicJson(file, record);
      return record;
    });
  }
  async assessments(id: string, version?: string) {
    await this.current(id, version);
    const dir = path.join(this.base(id), "assessments");
    if (!(await exists(dir))) return [];
    const records = [];
    for (const e of await fs.readdir(dir))
      if (e.endsWith(".json")) {
        const r = Assessment.parse(await readJson(path.join(dir, e)));
        if (!version || r.build_sha256 === version) records.push(r);
      }
    return records.sort((a, b) => b.created_at.localeCompare(a.created_at));
  }
}
