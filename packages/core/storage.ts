import { createHash, randomUUID } from "node:crypto";
import { promises as fs } from "node:fs";
import path from "node:path";
export class Fault extends Error {
  constructor(
    public code: string,
    message: string,
    public unknown = false,
  ) {
    super(message);
  }
}
export const canonical = (value: unknown): string =>
  JSON.stringify(value, (_key, v) =>
    v && typeof v === "object" && !Array.isArray(v)
      ? Object.fromEntries(
          Object.keys(v)
            .sort()
            .map((k) => [k, v[k]]),
        )
      : v,
  );
export const hash = (value: string | Buffer) =>
  createHash("sha256").update(value).digest("hex");
export const digest = (value: unknown) => hash(canonical(value));
export const now = () => new Date().toISOString();
export async function readJson(file: string) {
  return JSON.parse(await fs.readFile(file, "utf8"));
}
export async function atomicJson(file: string, value: unknown) {
  await fs.mkdir(path.dirname(file), { recursive: true });
  const tmp = `${file}.${randomUUID()}.tmp`;
  await fs.writeFile(tmp, JSON.stringify(value, null, 2) + "\n", {
    flag: "wx",
  });
  await fs.rename(tmp, file);
}
export async function exists(file: string) {
  try {
    await fs.access(file);
    return true;
  } catch {
    return false;
  }
}
export class Store {
  constructor(public root: string) {}
  runPath(id: string) {
    if (!/^run-[a-f0-9]{32}$/.test(id))
      throw new Fault("INVALID_RUN_ID", "Invalid generated run id");
    return path.join(this.root, "runs", id);
  }
  taskPath(run: string, id: string) {
    if (!/^task-[a-f0-9]{32}$/.test(id))
      throw new Fault("INVALID_TASK_ID", "Invalid generated task id");
    return path.join(this.runPath(run), "tasks", `${id}.json`);
  }
  async lock<T>(fn: () => Promise<T>): Promise<T> {
    await fs.mkdir(this.root, { recursive: true });
    const lock = path.join(this.root, "write.lock");
    let owned = false;
    for (let i = 0; i < 100; i++) {
      try {
        await fs.mkdir(lock);
        owned = true;
        break;
      } catch (e: any) {
        if (e.code !== "EEXIST") throw e;
        await new Promise((r) => setTimeout(r, 10));
      }
    }
    if (!owned)
      throw new Fault(
        "STATE_BUSY",
        "State lock occupied; inspect a crashed writer before removing write.lock",
        true,
      );
    try {
      return await fn();
    } finally {
      await fs.rmdir(lock);
    }
  }
}
