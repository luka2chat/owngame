import { promises as fs } from "node:fs";
import path from "node:path";
import { createHash } from "node:crypto";
import {readGameEntries} from "./catalog.mjs";
import {loadPublishedSources} from "../games/source-policy.mjs";
import {writeUsagePage} from "./usage.mjs";
import {writeSharedFooters} from "./footer.mjs";
import {imageHtml, imageCss} from "./image-delivery.mjs";
import {imageAssets, imageIcons} from "../../apps/web/public/image-assets.js";
import {platformAcceptance} from "../../apps/web/public/platforms.js";
import {versionShellModules} from "./module-delivery.mjs";
import {writeBlueprints} from "./blueprints.mjs";
const root = path.resolve(import.meta.dirname, "../.."),
  out = process.env.OWNGAME_WEB_OUT ? path.resolve(process.env.OWNGAME_WEB_OUT) : path.join(root, "apps/web/dist");
// A separate candidate library supports batch acceptance without changing the live selection.
const libraryRoot = process.env.OWNGAME_LIBRARY_ROOT ? path.resolve(process.env.OWNGAME_LIBRARY_ROOT) : path.join(root, ".owngame/library");
if (process.env.OWNGAME_WEB_OUT && !path.basename(out).startsWith("web-")) throw new Error("Custom generated output must have a web- directory name");
const sha = (b) => createHash("sha256").update(b).digest("hex");
const entries = await readGameEntries(root);
const planned = await Promise.all(entries.map(async entry => ({...entry, version:JSON.parse(await fs.readFile(path.join(libraryRoot,entry.id,"current.json"),"utf8")).build_sha256})));
const receipt = JSON.parse(await fs.readFile(path.join(root,"artifacts/open-source/current.json"),"utf8").catch(() => "{}"));
const sources = await loadPublishedSources(process.env.OWNGAME_SOURCE_COMMIT || receipt.commit, planned);
await fs.rm(out, { recursive: true, force: true });
await fs.mkdir(out, { recursive: true });
await fs.cp(path.join(root, "apps/web/public"), out, { recursive: true });
await writeBlueprints(root, out, entries, sources);
await writeUsagePage(root, out);
await writeSharedFooters(root, out);
await versionShellModules(out);
for (const name of await fs.readdir(out)) {
  const file = path.join(out, name);
  if (name.endsWith(".html")) await fs.writeFile(file, imageHtml(await fs.readFile(file, "utf8"), imageAssets, imageIcons));
  if (name.endsWith(".css")) await fs.writeFile(file, imageCss(await fs.readFile(file, "utf8"), imageAssets));
  if (name.endsWith(".webmanifest")) {
    const manifest = JSON.parse(await fs.readFile(file, "utf8"));
    manifest.icons = [192, 512].map(size => ({src: imageIcons[size], sizes: `${size}x${size}`, type: "image/png", purpose: "any"}));
    await fs.writeFile(file, JSON.stringify(manifest));
  }
}
// Pages visitors may still have the previous shell scripts in their HTTP cache.
// Version only the gallery/player shell; frozen game files remain byte-identical.
for (const page of ["index.html", "play.html", "usage.html"]) {
  const file = path.join(out, page);
  let html = await fs.readFile(file, "utf8");
  const links = [...html.matchAll(/((?:src|href)=")\/(?!\/)([^"?]+\.(?:js|css))(?:\?[^"\s]*)?("\s*\/?>?)/g)];
  for (const link of links) {
    // Shared modules already carry the same graph revision as their imports.
    if (link[2].endsWith('.js') && !['app.js', 'play.js'].includes(link[2])) continue;
    const digest = sha(await fs.readFile(path.join(out, link[2]))).slice(0, 12);
    html = html.replace(link[0], `${link[1]}/${link[2]}?v=${digest}${link[3]}`);
  }
  await fs.writeFile(file, html);
}
const catalog = [];
// Preserve exact already-published packages; new versions must use directory indexes.
const legacyHtml = new Set([
  "petal-memory/bf288dc254fa872f1f166d88f4e0d02bc2ce3f837a6d784ee9dfa885f0edff3c/cover.html",
  "silk-serpent/5ac32187bf40b8b7afc6865a14a05f423c940084dc5401c305a5dc07cf01959a/cover.html",
  "bamboo-rally/fba12b98ca96da32ffac30101f5f4354a32808cda13ca0722d7c9b60e253f1e0/cover.html",
  "wind-chime-memory/2d9d8bf4720b204bb70d1646c2fb6747b3446ca075cfad7cc49223b9fe7ae995/cover.html",
]);
const covers = JSON.parse(await fs.readFile(path.join(root,"apps/web/public/art/rollout/catalog.json"),"utf8"));
// Keep the selection that was checked against the public source revision.
// A concurrent candidate registration must not switch versions midway through copying.
for (const {version, ...entry} of planned) {
  const base = path.join(libraryRoot, entry.id);
  if (sources.get(entry.id).online_build_sha256 !== version) throw Error("Source version changed during build");
  if (!/^[a-f0-9]{64}$/.test(version)) throw Error("Invalid version");
  const folder = path.join(base, version);
  const delivery = JSON.parse(
    await fs.readFile(path.join(folder, "delivery.json"), "utf8"),
  );
  const canonical = delivery.files.map((f) => ({
    bytes: f.bytes,
    path: f.path,
    sha256: f.sha256,
  }));
  if (sha(JSON.stringify(canonical)) !== version)
    throw Error("Manifest hash mismatch");
  const files = [];
  for (const f of delivery.files) {
    // Pages removes .html extensions; the native downloader accepts directory-index redirects only.
    if (/\.html$/i.test(f.path) && !/(^|\/)index\.html$/.test(f.path) && !legacyHtml.has(entry.id + "/" + version + "/" + f.path))
      throw Error("Package HTML as directory/index.html for native Pages downloads: " + entry.id + "/" + f.path);
    if (
      f.path.split("/").some((s) => s === ".." || s === "" || s === ".") ||
      f.path.includes("\\") ||
      f.path.startsWith("/")
    )
      throw Error("Invalid asset path");
    const bytes = await fs.readFile(path.join(folder, "files", f.path));
    if (sha(bytes) !== f.sha256 || bytes.length !== f.bytes)
      throw Error("Corrupt game asset " + f.path);
    if (bytes.length > 25 * 1024 * 1024) throw Error("Pages Free asset limit");
    const url = "/games/" + entry.id + "/" + version + "/" + f.path;
    await fs.mkdir(path.dirname(path.join(out, url)), { recursive: true });
    await fs.writeFile(path.join(out, url), bytes);
    files.push({ url, bytes: f.bytes, sha256: f.sha256 });
  }
  const manifest = "/games/" + entry.id + "/" + version + "/manifest.json";
  await fs.writeFile(path.join(out, manifest), JSON.stringify(files));
  catalog.push({
    ...entry,
    sourceUrl: sources.get(entry.id).sourceUrl,
    sourceCommit: sources.get(entry.id).sourceCommit,
    sourceManifest: sources.get(entry.id).source_manifest_sha256,
    sourceLicense: sources.get(entry.id).license,
    ...(covers[entry.id] || {}),
    version,
    entry: "/games/" + entry.id + "/" + version + "/" + delivery.entrypoint,
    manifest,
    bytes: files.reduce((s, f) => s + f.bytes, 0),
  });
}
await fs.writeFile(
  path.join(out, "catalog.json"),
  JSON.stringify(catalog, null, 2),
);
// Public, game-specific handoff documents let an AI read the reference without
// needing to execute the gallery or mistaking the starter for this full game.
await fs.mkdir(path.join(out, "remix"), { recursive: true });
for (const game of catalog) {
  const brief = {
    schema: "owngame.remix.v1",
    id: game.id,
    title: game.title,
    category: game.category,
    platforms: game.platforms,
    description: game.description,
    visual_direction: game.tag,
    rules_and_controls: game.instructions,
    play_url: "https://owngame.dev/play?game=" + encodeURIComponent(game.id),
    reference_build: game.version,
    source_url: game.sourceUrl,
    source_commit: game.sourceCommit,
    source_manifest_sha256: game.sourceManifest,
    source_license: game.sourceLicense,
    playable_entry: "https://owngame.dev" + game.entry,
    cover_url: game.cover ? "https://owngame.dev" + game.cover : null,
    toolkit: {
      repository: "https://github.com/luka2chat/owngame",
      installation: "https://github.com/luka2chat/owngame/blob/main/docs/install.md",
      package: "@owngame/cli@latest",
    },
    task: "Use owngame with the user's AI assistant to recreate the core play and build a personalized version. Show a running visual direction early, then iterate on rules, feedback, and content.",
    acceptance: ["Actual play through the core loop", "Restart and applicable save/reload", ...platformAcceptance(game), "Only declared platforms are required; add another target only when requested", "State untested behavior"],
    reference_scope: "The matching editable game source is available at source_url. Follow its LICENSE and THIRD_PARTY_NOTICES.md, especially GPL and third-party asset terms. The npm toolkit provides separate starters; this brief does not copy source into a new project.",
  };
  await fs.writeFile(path.join(out, "remix", game.id + ".json"), JSON.stringify(brief, null, 2) + "\n");
}
async function walk(dir) {
  let files = [];
  for (const x of await fs.readdir(dir, { withFileTypes: true })) {
    const p = path.join(dir, x.name);
    files.push(...(x.isDirectory() ? await walk(p) : [p]));
  }
  return files;
}
const core = (await walk(out))
  .filter(
    (p) =>
      !p.includes("/games/") &&
      !["sw.js", "_headers"].includes(path.basename(p)),
  )
  .map((p) => "/" + path.relative(out, p))
  .concat(catalog.map((g) => g.manifest));
const sw = await fs.readFile(path.join(out, "sw.js"), "utf8");
const digest = sha(
  Buffer.concat([
    Buffer.from(sw),
    ...(await Promise.all(core.map((p) => fs.readFile(path.join(out, p))))),
  ]),
);
await fs.writeFile(
  path.join(out, "sw.js"),
  sw
    .replace("__BUILD__", digest.slice(0, 12))
    .replace("__CORE_FILES__", JSON.stringify(core)),
);
const all = await walk(out);
const stats = await Promise.all(all.map((p) => fs.stat(p)));
console.log(
  JSON.stringify(
    {
      out,
      files: all.length,
      bytes: stats.reduce((s, f) => s + f.size, 0),
      build: digest.slice(0, 12),
      games: catalog.map((g) => ({ id: g.id, version: g.version })),
    },
    null,
    2,
  ),
);
