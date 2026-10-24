import fs from "node:fs/promises";
import path from "node:path";
import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";

const sha = (bytes) => createHash("sha256").update(bytes).digest("hex");
export const safeMediaPath = (file) =>
  typeof file === "string" &&
  /\.(png|jpe?g|webp|glb)$/i.test(file) &&
  !file.includes("\\") &&
  !file.includes("%") &&
  !file.includes(":") &&
  !file.split("/").some((p) => !p || p.startsWith("."));

// Only reviewed, hash-pinned files already in the published game source may
// become site media. Never read a working game's assets or its private board.
export async function writeBlueprintMedia(
  root,
  out,
  game,
  document,
  source,
  { readSource } = {},
) {
  if (!source) return {};
  const manifest = JSON.parse(
    await fs.readFile(
      path.join(root, "scripts/web/blueprint-media.json"),
      "utf8",
    ),
  );
  const reviewed = manifest[game.id] || {};
  if (
    !/^https:\/\/github\.com\/luka2chat\/owngame\/tree\/[a-f0-9]{40}\/examples\/[a-z0-9-]+$/.test(
      source.sourceUrl || "",
    )
  )
    throw Error("Invalid blueprint media source");
  const [, commit, project] =
    /\/tree\/([a-f0-9]{40})\/(examples\/[a-z0-9-]+)$/.exec(source.sourceUrl);
  const read =
    readSource ||
    (async (file) => {
      // A checked-out public repository is a local cache of immutable Git blobs.
      const repo =
        process.env.OWNGAME_PUBLIC_REPOSITORY ||
        path.join(root, "../owngame-public");
      try {
        return execFileSync("git", ["show", `${commit}:${project}/${file}`], {
          cwd: repo,
          maxBuffer: 26 * 1024 * 1024,
          stdio: ["ignore", "pipe", "ignore"],
        });
      } catch {
        const response = await fetch(
          `https://raw.githubusercontent.com/luka2chat/owngame/${commit}/${project}/${file.split("/").map(encodeURIComponent).join("/")}`,
          { signal: AbortSignal.timeout(60000) },
        );
        if (!response.ok)
          throw Error(`Blueprint media missing: ${game.id}/${file}`);
        return Buffer.from(await response.arrayBuffer());
      }
    });
  const assets = {};
  for (const [cardId, files] of Object.entries(reviewed)) {
    const card = document.project.cards.find((c) => c.id === cardId);
    if (
      !card ||
      !["assets", "levels"].includes(card.section) ||
      !Array.isArray(files) ||
      files.length > 12
    )
      throw Error("Invalid reviewed media card: " + game.id);
    const items = [];
    for (const item of files) {
      if (
        !safeMediaPath(item.file) ||
        !/^[a-f0-9]{64}$/.test(item.sha256) ||
        typeof item.title !== "string" ||
        item.title.length > 400
      )
        throw Error("Invalid reviewed media path");
      const bytes = await read(item.file);
      if (sha(bytes) !== item.sha256 || bytes.length > 25 * 1024 * 1024)
        throw Error(
          "Reviewed blueprint media changed: " + game.id + "/" + item.file,
        );
      const ext = path.extname(item.file).toLowerCase();
      if (ext === ".glb") {
        if (bytes.readUInt32LE(0) !== 0x46546c67) throw Error("Invalid GLB");
        const json = JSON.parse(
          bytes.subarray(20, 20 + bytes.readUInt32LE(12)).toString(),
        );
        if (
          [...(json.images || []), ...(json.buffers || [])].some(
            (entry) => entry.uri,
          )
        )
          throw Error("Blueprint GLB must embed its dependencies");
      }
      const url = "/blueprint-media/" + item.sha256 + ext;
      await fs.mkdir(path.join(out, "blueprint-media"), { recursive: true });
      await fs.writeFile(path.join(out, url), bytes);
      items.push({
        title: item.title,
        source:
          source.sourceUrl.replace("/tree/", "/blob/") +
          "/" +
          item.file.split("/").map(encodeURIComponent).join("/"),
        [ext === ".glb" ? "model" : "preview"]: url,
      });
    }
    if (items.length) assets[cardId] = { ...items[0], items };
  }
  return assets;
}
