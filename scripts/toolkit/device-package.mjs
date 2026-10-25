import fs from "node:fs/promises";
import path from "node:path";
import os from "node:os";
import { createHash, randomUUID } from "node:crypto";

export const packageSchema = "owngame.device-package.v1";
export const limits = {
  file: 128 * 1024 * 1024,
  game: 512 * 1024 * 1024,
  count: 4096,
};
export const sha = (bytes) => createHash("sha256").update(bytes).digest("hex");
export const canonicalFiles = (files) =>
  JSON.stringify(
    files.map(({ path, bytes, sha256 }) => ({ bytes, path, sha256 })),
  );
export function safePath(name) {
  if (
    typeof name !== "string" ||
    !name ||
    Buffer.byteLength(name) > 512 ||
    /[\x00-\x1f\x7f\\%?#:]/.test(name) ||
    name.split("/").some((p) => !p || p === "." || p === "..")
  )
    throw Error("Unsafe game file path: " + name);
  return name;
}
const excluded = (name) =>
  name.startsWith(".") ||
  [
    "node_modules",
    "game-outline.json",
    "project-files.json",
    "workspace.json",
  ].includes(name);
const privateFile = (name) =>
  /\.(pem|key|jks|keystore|p12|pfx|mobileprovision)$/i.test(name);
export function developmentId(value) {
  if (!/^[a-z0-9][a-z0-9-]{0,63}$/.test(value))
    throw Error(
      "Game ID must contain 1–64 lowercase letters, digits or hyphens",
    );
  return value.length <= 60
    ? "dev-" + value
    : "dev-" + value.slice(0, 50) + "-" + sha(value).slice(0, 9);
}
export async function resolveBuildDirectory(directory) {
  const root = await fs.realpath(path.resolve(directory));
  const candidates = [];
  for (const relative of [
    "",
    "dist",
    "build/web-mobile",
    "build/web-desktop",
    "build/web",
  ]) {
    const full = path.join(root, relative);
    if (
      await fs.lstat(path.join(full, "index.html")).then(
        (s) => s.isFile() && !s.isSymbolicLink(),
        () => false,
      )
    )
      candidates.push(full);
  }
  if (candidates.length !== 1)
    throw Error(
      candidates.length
        ? "Multiple Web builds found; pass the exact build directory"
        : "No built index.html found; build the game and pass its Web output directory",
    );
  return candidates[0];
}
// SMB can refresh a copied file's cached mtime on the first read. Accept that
// only after a second, byte-identical read with stable metadata; a real writer
// or an atomic replacement still prevents a snapshot.
export async function readStableFile(
  source,
  io = { stat: fs.lstat, read: fs.readFile },
) {
  const before = await io.stat(source);
  if (!before.isFile() || before.isSymbolicLink() || before.size > limits.file)
    throw Error("Invalid or oversized game file: " + source);
  const data = await io.read(source),
    after = await io.stat(source);
  const sameFile = (a, b) =>
    b.isFile() && !b.isSymbolicLink() && a.size === b.size && a.ino === b.ino;
  if (!sameFile(before, after) || data.length !== before.size)
    throw Error("Build changed while taking its snapshot: " + source);
  if (before.mtimeMs !== after.mtimeMs) {
    const checked = await io.read(source),
      final = await io.stat(source);
    if (
      !sameFile(after, final) ||
      final.mtimeMs !== after.mtimeMs ||
      !data.equals(checked)
    )
      throw Error("Build changed while taking its snapshot: " + source);
  }
  return data;
}
export async function snapshotBuild(
  directory,
  {
    id,
    title,
    entrypoint = "index.html",
    requestId = randomUUID(),
    outputRoot = process.env.OWNGAME_DEVICE_TEMP || os.tmpdir(),
  } = {},
) {
  const root = await fs.realpath(directory);
  safePath(entrypoint);
  if (
    !/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/.test(
      requestId,
    )
  )
    throw Error("Invalid transfer request ID");
  const sourceId =
    id ||
    path
      .basename(root)
      .toLowerCase()
      .replace(/[^a-z0-9-]/g, "-")
      .replace(/^-+|-+$/g, "");
  const gameId = developmentId(sourceId);
  const displayTitle = title || sourceId;
  if (!displayTitle || displayTitle.length > 160)
    throw Error("Title must contain 1–160 characters");
  await fs.mkdir(outputRoot, { recursive: true });
  const stage = await fs.mkdtemp(path.join(outputRoot, "owngame-device-"));
  const bundle = path.join(stage, requestId);
  const files = [];
  let total = 0;
  try {
    await fs.mkdir(path.join(bundle, "files"), { recursive: true });
    const folded = new Set();
    async function walk(relative = "") {
      const children = await fs.readdir(path.join(root, relative), {
        withFileTypes: true,
      });
      children.sort((a, b) => (a.name < b.name ? -1 : a.name > b.name ? 1 : 0));
      for (const child of children) {
        if (excluded(child.name)) continue;
        const name = relative ? relative + "/" + child.name : child.name;
        safePath(name);
        if (child.isSymbolicLink())
          throw Error("Symlinks are not part of a device package: " + name);
        if (privateFile(child.name))
          throw Error("Private signing/key file in Web build: " + name);
        if (child.isDirectory()) {
          await walk(name);
          continue;
        }
        if (!child.isFile()) throw Error("Unsupported game file: " + name);
        if (files.length >= limits.count) throw Error("Too many game files");
        const source = path.join(root, name),
          data = await readStableFile(source);
        total += data.length;
        if (total > limits.game)
          throw Error("Game exceeds the container size limit");
        const key = name.normalize("NFC").toLowerCase();
        if (folded.has(key))
          throw Error("Case-insensitive filename collision: " + name);
        folded.add(key);
        const target = path.join(bundle, "files", name);
        await fs.mkdir(path.dirname(target), { recursive: true });
        await fs.writeFile(target, data);
        files.push({ path: name, bytes: data.length, sha256: sha(data) });
      }
    }
    await walk();
    files.sort((a, b) => (a.path < b.path ? -1 : a.path > b.path ? 1 : 0));
    if (!files.some((f) => f.path === entrypoint) || !total)
      throw Error("The entry point is missing or the build is empty");
    const version = sha(canonicalFiles(files)),
      prefix = `/games/${gameId}/${version}/`;
    const game = {
      id: gameId,
      title: displayTitle,
      description: "Local development build",
      category: "本地调试",
      version,
      entry: prefix + entrypoint,
      manifest: prefix + "manifest.json",
      bytes: total,
      platforms: ["mobile"],
      development: true,
    };
    const manifest = { schema: packageSchema, requestId, game, files };
    await fs.writeFile(
      path.join(bundle, "package.json"),
      JSON.stringify(manifest),
    );
    // Transports send this marker separately, after all other files are present.
    const ready = JSON.stringify({
      schema: packageSchema,
      requestId,
      packageSha256: sha(JSON.stringify(manifest)),
    });
    return {
      stage,
      bundle,
      manifest,
      ready,
      cleanup: () => fs.rm(stage, { recursive: true, force: true }),
    };
  } catch (error) {
    await fs.rm(stage, { recursive: true, force: true });
    throw error;
  }
}
