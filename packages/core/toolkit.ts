import path from "node:path";
import { promises as fs } from "node:fs";
import { spawn } from "node:child_process";
import { randomUUID } from "node:crypto";
import { z } from "zod";
import { Fault, readJson, digest, hash } from "./storage.js";

const text = z.string().min(1).max(4000);
export const ToolkitOperations = {
  "research.prepare": z.strictObject({
    query: z.string().min(1).max(200),
    mode: z.enum(["live", "snapshot"]).default("live"),
    limit: z.number().int().min(1).max(8).default(8),
  }),
  "style.list": z.strictObject({}),
  "style.get": z.strictObject({ id: z.string().regex(/^[a-z-]+$/) }),
  "guidance.get": z.strictObject({
    topic: z
      .enum(["authoring", "web", "cocos", "testing", "art", "iteration"])
      .default("authoring"),
  }),
  "project.create": z.strictObject({
    directory: text,
    name: z.string().regex(/^[a-z][a-z0-9-]{0,63}$/),
    template: z.enum(["web-canvas", "web-phaser", "cocos-minimal"]).default("web-canvas"),
  }),
  "cocos.build": z.strictObject({
    project: text,
    creator: text,
    scene: text.default("assets/scenes/M1.scene"),
    timeout_ms: z.number().int().min(1000).max(900000).default(600000),
  }),
  "web.inspect": z.strictObject({ directory: text }),
};

export class Toolkit {
  constructor(
    public root: string,
    public workspace: string,
  ) {}
  async inside(value: string, newLeaf = false) {
    const root = await fs.realpath(this.workspace);
    const full = path.resolve(root, value);
    const real = newLeaf
      ? path.join(await fs.realpath(path.dirname(full)), path.basename(full))
      : await fs.realpath(full);
    const rel = path.relative(root, real);
    if (rel === ".." || rel.startsWith(`..${path.sep}`) || path.isAbsolute(rel))
      throw new Fault(
        "WORKSPACE_ESCAPE",
        "Path must stay in the selected workspace",
      );
    return real;
  }
  async styles() {
    return readJson(path.join(this.root, "docs/style-recipes.json"));
  }
  async style(id: string) {
    const value = (await this.styles()).styles.find((s: any) => s.id === id);
    if (!value) throw new Fault("STYLE_NOT_FOUND", id);
    return value;
  }
  async guidance(topic: string) {
    const file = topic === "authoring" ? "SKILL.md" : `references/${topic}.md`;
    return {
      topic,
      text: await fs.readFile(
        path.join(this.root, "skills/owngame", file),
        "utf8",
      ),
    };
  }
  async create(a: { directory: string; name: string; template: string }) {
    const dest = await this.inside(a.directory, true);
    // Exclusive creation prevents replacing an existing user project, including empty directories.
    try {
      await fs.mkdir(dest);
    } catch (e) {
      if ((e as NodeJS.ErrnoException).code === "EEXIST")
        throw new Fault("PROJECT_EXISTS", dest);
      throw e;
    }
    const template = path.join(this.root, "templates", a.template);
    for (const item of await fs.readdir(template)) {
      await fs.cp(path.join(template, item), path.join(dest, item), {
        recursive: true,
        force: false,
        errorOnExist: true,
      });
    }
    const pkg = await readJson(path.join(dest, "package.json"));
    pkg.name = a.name;
    if (a.template === "cocos-minimal") pkg.uuid = randomUUID();
    if (a.template === "web-canvas") await fs.writeFile(path.join(dest, "src/project.js"), `export const gameId = ${JSON.stringify(a.name + "-" + randomUUID().slice(0,8))};\n`);
    await fs.writeFile(
      path.join(dest, "package.json"),
      JSON.stringify(pkg, null, 2) + "\n",
    );
    return {
      project: dest,
      template: a.template,
      engine: a.template === "cocos-minimal" ? "cocos@3.8.8" : a.template === "web-phaser" ? "phaser@3.90.0" : "canvas2d+dom",
      ...(a.template === "cocos-minimal" ? { scene: "assets/scenes/M1.scene" } : {
        build: { command: "npm", args: ["run", "build"], cwd: dest },
        preview: { command: "npm", args: ["run", "preview"], cwd: dest },
      }),
      state: a.template === "web-canvas" ? "playable two-player starter; customize design and verify actual input before delivery" : "scaffold only; author rules, art and content before delivery",
    };
  }

  async inventory(directory: string) {
    const files: { path: string; sha256: string; bytes: number }[] = [];
    const walk = async (dir: string) => {
      for (const item of (await fs.readdir(dir, { withFileTypes: true })).sort(
        (a, b) => a.name.localeCompare(b.name),
      )) {
        const full = path.join(dir, item.name);
        if (item.isSymbolicLink()) throw new Fault("SYMLINK_UNSUPPORTED", full);
        if (item.isDirectory()) await walk(full);
        else if (item.isFile()) {
          const raw = await fs.readFile(full);
          files.push({
            path: path.relative(directory, full).split(path.sep).join("/"),
            sha256: hash(raw),
            bytes: raw.length,
          });
        }
      }
    };
    await walk(directory);
    return files;
  }
  async inspect(value: string) {
    const directory = await this.inside(value);
    const files = await this.inventory(directory);
    if (!files.some((f) => f.path === "index.html" && f.bytes > 0))
      throw new Fault("ENTRYPOINT_MISSING", directory);
    return {
      directory,
      files,
      build_sha256: digest(files),
      verification: "static file inventory only",
      runtime: "not_run",
      offline: "not_run",
      human_art_and_feel: "not_evaluated",
      serve: {
        command: process.execPath,
        args: [
          path.join(this.root, "scripts/toolkit/serve.mjs"),
          directory,
          "3215",
        ],
      },
    };
  }
  async build(a: {
    project: string;
    creator: string;
    scene: string;
    timeout_ms: number;
  }) {
    const project = await this.inside(a.project);
    if (path.isAbsolute(a.scene) || a.scene.split(/[\\/]/).includes(".."))
      throw new Fault("SCENE_PATH_ESCAPE", a.scene);
    const scene = await fs.realpath(path.join(project, a.scene));
    if (!scene.startsWith(project + path.sep))
      throw new Fault("SCENE_PATH_ESCAPE", a.scene);
    const lock = path.join(project, ".owngame-build.lock");
    try {
      await fs.mkdir(lock);
    } catch (e) {
      if ((e as NodeJS.ErrnoException).code === "EEXIST")
        throw new Fault(
          "BUILD_BUSY",
          "A build lock exists; inspect the previous process before retrying",
          true,
        );
      throw e;
    }
    let release = true;
    try {
      const out = path.join(project, "verification", `build-${randomUUID()}`);
      const sourceFiles = await this.inventory(path.join(project, "assets"));
      const source_sha256 = digest(sourceFiles);
      const args = [
        path.join(this.root, "scripts/toolkit/build-cocos.mjs"),
        "--project",
        project,
        "--creator",
        path.resolve(a.creator),
        "--scene",
        a.scene,
        "--out",
        out,
        "--timeout",
        String(a.timeout_ms),
      ];
      release = false;
      await new Promise<void>((resolve, reject) => {
        const child = spawn(process.execPath, args, {
          cwd: project,
          stdio: ["ignore", "ignore", "pipe"],
        });
        let stderr = "";
        child.stderr.on("data", (b) => {
          stderr = (stderr + b).slice(-4000);
        });
        child.on("error", reject);
        child.on("close", (code) =>
          code === null
            ? reject(new Fault("BUILD_INTERRUPTED", stderr, true))
            : resolve(),
        );
      });
      const report = await readJson(path.join(out, "build.json"));
      release = report.status !== "unknown";
      const after = digest(await this.inventory(path.join(project, "assets")));
      const source_changed = after !== source_sha256;
      if (source_changed) report.status = "unknown";
      const result = {
        ...report,
        source_sha256,
        source_changed,
        report_path: path.join(out, "build.json"),
        build_sha256:
          report.status === "succeeded"
            ? digest(
                await this.inventory(path.join(project, "build/web-desktop")),
              )
            : null,
      };
      await fs.writeFile(
        result.report_path,
        JSON.stringify(result, null, 2) + "\n",
      );
      return result;
    } finally {
      if (release) await fs.rmdir(lock);
    }
  }
}
