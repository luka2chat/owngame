import fs from "node:fs/promises";
import path from "node:path";
import { createHash } from "node:crypto";
const sha = (bytes) => createHash("sha256").update(bytes).digest("hex");
export const sceneCardHash = (card) =>
  sha(
    JSON.stringify({ title: card.title, body: card.body, fields: card.fields }),
  );

// Reviewed screenshots are captured from immutable, already-published games.
// A game-version or card-content change requires review and recapture.
export async function writeBlueprintScenes(root, out, game, document, source) {
  if (!source?.online_build_sha256) return {};
  const manifest = JSON.parse(
    await fs.readFile(
      path.join(root, "scripts/web/blueprint-scenes.json"),
      "utf8",
    ),
  );
  if (
    manifest.schema !== "owngame.blueprint-scenes.v1" ||
    !/^https:\/\/github\.com\/luka2chat\/owngame\/tree\/[a-f0-9]{40}\/examples\/[a-z0-9-]+$/.test(
      source.sourceUrl || "",
    )
  )
    throw Error("Invalid reviewed scene manifest or source");
  const reviewed = manifest.games[game.id];
  if (!reviewed) return {};
  if (reviewed.gameVersion !== source.online_build_sha256)
    throw Error(
      "Scene previews do not match the selected game version: " + game.id,
    );
  const result = {};
  for (const [id, entry] of Object.entries(reviewed.cards)) {
    const card = document.project.cards.find((c) => c.id === id);
    if (
      !card ||
      card.section !== "levels" ||
      sceneCardHash(card) !== entry.cardSha256 ||
      !Array.isArray(entry.items) ||
      !entry.items.length ||
      entry.items.length > 10
    )
      throw Error(
        "Scene previews do not match the reviewed level card: " + game.id,
      );
    const items = [];
    for (const item of entry.items) {
      if (
        !/^[a-f0-9]{64}$/.test(item.sha256) ||
        item.file !== `art/scene-previews/${item.sha256}.webp` ||
        !["runtime", "runtime-camera"].includes(item.kind) ||
        typeof item.title !== "string" ||
        item.title.length > 400 ||
        !/^\d{4}-\d{2}-\d{2}T/.test(item.capturedAt) ||
        !Number.isInteger(item.width) ||
        item.width < 1 ||
        item.width > 4096 ||
        !Number.isInteger(item.height) ||
        item.height < 1 ||
        item.height > 4096 ||
        item.gameVersion !== reviewed.gameVersion ||
        !/^[a-f0-9]{40}$/.test(item.sourceCommit)
      )
        throw Error("Invalid scene-preview provenance");
      const bytes = await fs.readFile(
        path.join(root, "apps/web/public", item.file),
      );
      if (sha(bytes) !== item.sha256 || bytes.length > 4 * 1024 * 1024)
        throw Error("Scene preview changed after review: " + game.id);
      const url = "/blueprint-media/" + item.sha256 + ".webp";
      await fs.mkdir(path.join(out, "blueprint-media"), { recursive: true });
      await fs.writeFile(path.join(out, url), bytes);
      items.push({
        title: item.title,
        source:
          source.sourceUrl.replace("/tree/", "/blob/") + "/game-outline.json",
        preview: url,
        scene: {
          gameVersion: item.gameVersion,
          sourceCommit: item.sourceCommit,
          capturedAt: item.capturedAt,
          kind: item.kind,
        },
      });
    }
    result[id] = { ...items[0], items };
  }
  return result;
}
