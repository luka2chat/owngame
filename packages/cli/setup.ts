import fs from "node:fs/promises";
import path from "node:path";
import { createHash, randomUUID } from "node:crypto";
import { spawnSync } from "node:child_process";
import { Core } from "../core/index.js";

const sha = (s: string) => createHash("sha256").update(s).digest("hex");
const json = (v: unknown) => JSON.stringify(v, null, 2) + "\n";
const begin = "# BEGIN owngame managed MCP";
const end = "# END owngame managed MCP";
type Agent = "codex" | "cursor" | "generic";
type Manifest = { version: string; files: Record<string, string>; config_hash: string; agent: Agent };
async function read(file: string) {
  try { return await fs.readFile(file, "utf8"); }
  catch (e) { if ((e as NodeJS.ErrnoException).code === "ENOENT") return null; throw e; }
}
// Refuse symlink traversal, including existing final files, before inspecting or writing configuration.
async function safe(workspace: string, relative: string) {
  const parts = relative.split("/");
  if (parts.some(p => p === ".." || p === "")) throw Error("Invalid managed path");
  let current = workspace;
  for (const part of parts) {
    current = path.join(current, part);
    try { if ((await fs.lstat(current)).isSymbolicLink()) throw Error(`Symlink in managed path: ${relative}`); }
    catch (e) { if ((e as NodeJS.ErrnoException).code !== "ENOENT") throw e; }
  }
  return current;
}
async function skillFiles(root: string) {
  const files: Record<string, string> = {};
  async function walk(relative: string) {
    for (const entry of await fs.readdir(path.join(root, "skills/owngame", relative), { withFileTypes: true })) {
      const name = relative ? `${relative}/${entry.name}` : entry.name;
      if (entry.isSymbolicLink()) throw Error("Packaged skill contains a symlink");
      if (entry.isDirectory()) await walk(name);
      else files[name] = await fs.readFile(path.join(root, "skills/owngame", name), "utf8");
    }
  }
  await walk("");
  return files;
}
export async function setup(root: string, workspaceArg: string, argv: string[]) {
  const workspace = await fs.realpath(workspaceArg);
  let agent: Agent = "codex", apply = false;
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === "--apply") apply = true;
    else if (argv[i] === "--agent" && ["codex", "cursor", "generic"].includes(argv[i + 1])) agent = argv[++i] as Agent;
    else throw Error("Usage: owngame setup [--agent codex|cursor|generic] [--apply] [--workspace path]");
  }
  const version = JSON.parse(await fs.readFile(path.join(root, "package.json"), "utf8")).version as string;
  // npx caches are disposable; provision the exact version in a project-owned prefix.
  const ephemeral = root.split(path.sep).includes("_npx");
  const prefix = await safe(workspace, ".owngame/toolkit");
  const runtime = ephemeral ? path.join(prefix, "node_modules/@owngame/cli") : root;
  const server = { command: process.execPath, args: [path.join(runtime, "dist/packages/mcp/index.js"), "--workspace", workspace] };
  const configRel = agent === "codex" ? ".codex/config.toml" : agent === "cursor" ? ".cursor/mcp.json" : ".owngame/mcp.json";
  const skillBase = agent === "cursor" ? ".cursor/skills/owngame" : ".agents/skills/owngame";
  const manifestRel = `.owngame/setup-${agent}.json`;
  const manifestPath = await safe(workspace, manifestRel);
  const priorRaw = await read(manifestPath);
  const prior: Manifest | null = priorRaw ? JSON.parse(priorRaw) : null;
  const configPath = await safe(workspace, configRel);
  const previous = await read(configPath);
  let config: string, owned: string;
  if (agent === "codex") {
    owned = `${begin}\n[mcp_servers.owngame]\ncommand = ${JSON.stringify(server.command)}\nargs = ${JSON.stringify(server.args)}\ntool_timeout_sec = 660\n${end}`;
    const old = previous ?? "";
    const start = old.indexOf(begin), finish = old.indexOf(end);
    if (start >= 0 || finish >= 0) {
      if (start < 0 || finish < start || old.indexOf(begin, start + 1) >= 0 || old.indexOf(end, finish + 1) >= 0)
        throw Error("Malformed owngame config block; resolve it manually");
      const block = old.slice(start, finish + end.length);
      if (!prior || sha(block) !== prior.config_hash) throw Error("owngame config was edited; preserve or reconcile it before setup");
      const outside = old.slice(0, start) + old.slice(finish + end.length);
      if (/owngame/i.test(outside)) throw Error("Additional owngame configuration found outside the managed block");
      config = old.slice(0, start) + owned + old.slice(finish + end.length);
    } else {
      if (/owngame/i.test(old)) throw Error("Existing owngame configuration is not managed by setup");
      config = old + (old.endsWith("\n") || !old ? "" : "\n") + owned + "\n";
    }
  } else {
    const data = previous ? JSON.parse(previous) : {};
    if (!data || typeof data !== "object" || Array.isArray(data) || (data.mcpServers && (typeof data.mcpServers !== "object" || Array.isArray(data.mcpServers))))
      throw Error("Invalid MCP config object");
    const existing = data.mcpServers?.owngame;
    if (existing && (!prior || sha(json(existing)) !== prior.config_hash)) throw Error("Existing owngame MCP entry is not managed or was edited");
    owned = json(server);
    config = json({ ...data, mcpServers: { ...data.mcpServers, owngame: server } });
  }
  const desired: Record<string, string> = { [configRel]: config };
  const hashes: Record<string, string> = {};
  for (const [name, contents] of Object.entries(await skillFiles(root))) {
    const relative = `${skillBase}/${name}`;
    const old = await read(await safe(workspace, relative));
    if (old !== null && old !== contents && (!prior?.files[relative] || sha(old) !== prior.files[relative]))
      throw Error(`Skill file has local changes: ${relative}`);
    desired[relative] = contents;
    hashes[relative] = sha(contents);
  }
  // Keep locally customized/removed-from-package files; report them rather than deleting.
  const retained = Object.keys(prior?.files ?? {}).filter(f => !(f in hashes));
  desired[manifestRel] = json({ version, agent, files: hashes, config_hash: sha(owned) });
  const changes: { relative: string; file: string; before: string | null; after: string }[] = [];
  for (const [relative, after] of Object.entries(desired)) {
    const file = await safe(workspace, relative), before = await read(file);
    if (before !== after) changes.push({ relative, file, before, after });
  }
  const install = ephemeral ? ["install", "--prefix", prefix, "--ignore-scripts", "--no-audit", "--no-fund", "--save-exact", `@owngame/cli@${version}`] : null;
  const result = { version, agent, workspace, applied: false, changes: changes.map(c => c.relative), retained, runtime, install, mcp_connection: "not_checked", next: "Restart the host in this project; enable/trust the project MCP configuration. Then ask it to call owngame_capabilities." };
  if (!apply) return result;
  const stateDir = await safe(workspace, ".owngame");
  await fs.mkdir(stateDir, { recursive: true });
  const lock = await safe(workspace, ".owngame/setup.lock");
  await fs.mkdir(lock).catch(() => { throw Error("Setup lock exists; finish the other setup or inspect a previous interrupted run"); });
  const completed: typeof changes = [];
  try {
    if (install) {
      await fs.mkdir(prefix, { recursive: true });
      const npmCli = process.env.npm_execpath;
      if (process.platform === "win32" && !npmCli) throw Error("On Windows, run setup through npm exec or install the package locally first");
      const out = spawnSync(process.platform === "win32" ? process.execPath : "npm", process.platform === "win32" ? [npmCli!, ...install] : install, { encoding: "utf8", timeout: 120000, shell: false });
      if (out.error || out.status !== 0) throw Error(`Pinned runtime installation failed: ${out.error?.message ?? out.stderr}`);
    }
    const backup = `.owngame/setup-backups/${randomUUID()}`;
    for (const change of changes) {
      await safe(workspace, change.relative);
      if (await read(change.file) !== change.before) throw Error(`File changed during setup: ${change.relative}`);
      if (change.before !== null) {
        const dest = await safe(workspace, `${backup}/${change.relative}`);
        await fs.mkdir(path.dirname(dest), { recursive: true });
        await fs.writeFile(dest, change.before, { flag: "wx" });
      }
      await fs.mkdir(path.dirname(change.file), { recursive: true });
      const temp = change.file + `.${randomUUID()}.tmp`;
      await fs.writeFile(temp, change.after, { flag: "wx" });
      await fs.rename(temp, change.file);
      completed.push(change);
    }
    return { ...result, applied: true, backups: changes.some(c => c.before !== null) ? backup : null };
  } catch (e) {
    for (const change of completed.reverse()) {
      if (await read(change.file) !== change.after) continue;
      if (change.before === null) await fs.unlink(change.file);
      else await fs.writeFile(change.file, change.before);
    }
    throw e;
  } finally { await fs.rmdir(lock); }
}

export async function doctor(root: string, workspace: string) {
  const core = new Core({ root, workspace });
  await core.initialize();
  const knowledge = await core.call("knowledge.validate");
  const version = JSON.parse(await fs.readFile(path.join(root, "package.json"), "utf8")).version;
  const configurations = [];
  for (const agent of ["codex", "cursor", "generic"] as const) {
    const raw = await read(await safe(workspace, `.owngame/setup-${agent}.json`));
    if (!raw) continue;
    const saved = JSON.parse(raw) as Manifest;
    const edited = [];
    for (const [file, expected] of Object.entries(saved.files)) {
      const content = await read(await safe(workspace, file));
      if (content === null || sha(content) !== expected) edited.push(file);
    }
    configurations.push({ agent, skill_version: saved.version, version_matches: saved.version === version, edited_or_missing_skills: edited });
  }
  return { version, node: process.version, node_supported: Number(process.versions.node.split(".")[0]) >= 22, knowledge: knowledge.status, configurations, mcp_connection: "not_checked", browser_and_image_tools: "provided_by_host; not_checked", cocos: "optional; not_checked", runtime_playtest: "not_run" };
}
