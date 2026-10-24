import fs from "node:fs/promises";
import path from "node:path";
import { SECTIONS, TYPES, STATUSES } from "../../apps/outline/model.mjs";
import { writeBlueprintMedia } from "./blueprint-media.mjs";
import { validatePublicOutline } from "../games/outline-policy.mjs";

// The public export carries only explicitly reviewed snapshots in one portable
// bundle. Production reads registered .public.json files; neither path reads a
// private game-outline.json or a running local outline service.
export async function readBlueprintSnapshots(root, games) {
  const bundlePath = path.join(root, "scripts/web/blueprint-snapshots.json");
  const bundleStat = await fs.lstat(bundlePath).catch((error) => {
    if (error.code !== "ENOENT") throw error;
    return null;
  });
  if (bundleStat && !bundleStat.isFile())
    throw Error("Blueprint bundle must be a regular reviewed file");
  const bundle = bundleStat
    ? JSON.parse(await fs.readFile(bundlePath, "utf8"))
    : null;
  const specs = bundleStat
    ? null
    : JSON.parse(
        await fs.readFile(
          path.join(root, "scripts/games/projects.json"),
          "utf8",
        ),
      );
  const snapshots = {};
  for (const game of games) {
    if (!/^[a-z0-9-]+$/.test(game.id)) throw Error("Invalid blueprint ID");
    let document;
    if (bundleStat) {
      if (!Object.hasOwn(bundle, game.id))
        throw Error("Reviewed blueprint missing: " + game.id);
      document = bundle[game.id];
    } else {
      const spec = specs[game.id];
      if (spec?.outline !== "game-outline.public.json")
        throw Error("Reviewed blueprint required: " + game.id);
      const file = path.join(root, spec.project, spec.outline);
      if (!(await fs.lstat(file)).isFile())
        throw Error("Blueprint must be a regular reviewed file");
      document = JSON.parse(await fs.readFile(file, "utf8"));
    }
    snapshots[game.id] = validatePublicOutline(document);
  }
  return snapshots;
}

export async function writeBlueprints(root, out, games, sources, options = {}) {
  const snapshots = await readBlueprintSnapshots(root, games);
  const pending = [];
  for (const game of games) {
    const document = snapshots[game.id];
    const source = sources.get(game.id);
    const assets = await writeBlueprintMedia(
      root,
      out,
      game,
      document,
      source,
      options,
    );
    for (const card of document.project.cards) {
      if (assets[card.id]) continue;
      const relative = card.fields.file?.replace(/^\.\//, "");
      if (
        !relative ||
        relative.startsWith("/") ||
        relative.includes("\\") ||
        relative.split("/").some((s) => !s || s.startsWith(".")) ||
        !/\.(png|jpe?g|webp|glb)$/i.test(relative)
      )
        continue;
      const sourcePath = relative.split("/").map(encodeURIComponent).join("/");
      if (
        !/^https:\/\/github\.com\/luka2chat\/owngame\/tree\/[a-f0-9]{40}\/examples\/[a-z0-9-]+$/.test(
          source?.sourceUrl || "",
        )
      )
        continue;
      assets[card.id] = {
        source: source.sourceUrl.replace("/tree/", "/blob/") + "/" + sourcePath,
      };
      if (/\.(png|jpe?g|webp|glb)$/i.test(relative))
        assets[card.id][/\.glb$/i.test(relative) ? "model" : "preview"] =
          source.sourceUrl
            .replace(
              "https://github.com/",
              "https://raw.githubusercontent.com/",
            )
            .replace("/tree/", "/") +
          "/" +
          sourcePath;
    }
    pending.push([game.id, { ...document, gameId: game.id, assets }]);
  }
  await fs.mkdir(path.join(out, "blueprints"), { recursive: true });
  await fs.writeFile(
    path.join(out, "blueprints/meta.json"),
    JSON.stringify({ sections: SECTIONS, types: TYPES, statuses: STATUSES }),
  );
  for (const [id, document] of pending)
    await fs.writeFile(
      path.join(out, "blueprints", id + ".json"),
      JSON.stringify(document),
    );
  return { games: pending.length, privateBoardsCopied: false };
}
