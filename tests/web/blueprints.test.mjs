import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import {
  writeBlueprints,
  readBlueprintSnapshots,
} from "../../scripts/web/blueprints.mjs";
import { readGameEntries } from "../../scripts/web/catalog.mjs";
import { SECTIONS, TYPES, STATUSES } from "../../apps/outline/model.mjs";
import { messages } from "../../apps/web/public/locales/en.js";

test("all listed games have reviewed blueprints and shared outline metadata", async () => {
  const out = await fs.mkdtemp(path.join(os.tmpdir(), "owngame-blueprints-"));
  try {
    const games = await readGameEntries(process.cwd());
    const result = await writeBlueprints(process.cwd(), out, games, new Map());
    assert.equal(result.games, games.length);
    assert.equal(result.privateBoardsCopied, false);
    const bundle = await fs
      .readFile("scripts/web/blueprint-snapshots.json", "utf8")
      .then(JSON.parse, (error) => {
        if (error.code !== "ENOENT") throw error;
        return null;
      });
    const specs = bundle
      ? null
      : JSON.parse(await fs.readFile("scripts/games/projects.json"));
    for (const game of games) {
      const emitted = JSON.parse(
        await fs.readFile(path.join(out, "blueprints", game.id + ".json")),
      );
      const original = bundle
        ? bundle[game.id]
        : JSON.parse(
            await fs.readFile(
              path.join(specs[game.id].project, "game-outline.public.json"),
            ),
          );
      assert.deepEqual(emitted.project, original.project);
      assert.equal(emitted.revision, original.revision);
      assert.equal(emitted.gameId, game.id);
    }
    const meta = JSON.parse(
      await fs.readFile(path.join(out, "blueprints/meta.json")),
    );
    assert.deepEqual(meta, {
      sections: SECTIONS,
      types: TYPES,
      statuses: STATUSES,
    });
  } finally {
    await fs.rm(out, { recursive: true, force: true });
  }
});

test("missing public snapshots never fall back to private boards; invalid public content fails closed", async () => {
  const root = await fs.mkdtemp(
    path.join(os.tmpdir(), "owngame-blueprint-policy-"),
  );
  try {
    await fs.mkdir(path.join(root, "scripts/games"), { recursive: true });
    await fs.mkdir(path.join(root, "project"));
    await fs.writeFile(
      path.join(root, "scripts/games/projects.json"),
      JSON.stringify({
        example: { project: "project", outline: "game-outline.public.json" },
      }),
    );
    await fs.writeFile(
      path.join(root, "project/game-outline.json"),
      "PRIVATE_BOARD_SENTINEL",
    );
    const run = () =>
      writeBlueprints(
        root,
        path.join(root, "out"),
        [{ id: "example" }],
        new Map(),
      );
    await assert.rejects(run());
    await assert.rejects(fs.stat(path.join(root, "out")));
    const document = (
      await readBlueprintSnapshots(process.cwd(), [{ id: "star-triad" }])
    )["star-triad"];
    document.project.cards[0].body = "/Users/private/unpublished";
    await fs.writeFile(
      path.join(root, "project/game-outline.public.json"),
      JSON.stringify(document),
    );
    await assert.rejects(run(), /Private/);
    await assert.rejects(fs.stat(path.join(root, "out")));
    await fs.rm(path.join(root, "project/game-outline.public.json"));
    await fs.symlink(
      "game-outline.json",
      path.join(root, "project/game-outline.public.json"),
    );
    await assert.rejects(run(), /regular/);
  } finally {
    await fs.rm(root, { recursive: true, force: true });
  }
});

test("asset previews link only to safe project paths at the pinned public source revision", async () => {
  const out = await fs.mkdtemp(
    path.join(os.tmpdir(), "owngame-blueprint-assets-"),
  );
  try {
    const bundleExists = await fs
      .access("scripts/web/blueprint-snapshots.json")
      .then(
        () => true,
        () => false,
      );
    const sourceUrl =
      "https://github.com/luka2chat/owngame/tree/" +
      "a".repeat(40) +
      "/examples/tidal-reclaim";
    await writeBlueprints(
      process.cwd(),
      out,
      [{ id: "tidal-reclaim" }],
      new Map([["tidal-reclaim", { sourceUrl }]]),
      {
        readSource: (file) =>
          fs.readFile(
            path.join(
              process.cwd(),
              // Public CI uses the portable exported project; production uses its registered source.
              bundleExists
                ? "examples/tidal-reclaim"
                : "examples/imported/tidal-reclaim",
              file,
            ),
          ),
      },
    );
    const document = JSON.parse(
      await fs.readFile(path.join(out, "blueprints/tidal-reclaim.json")),
    );
    assert(
      Object.values(document.assets).some((a) => a.preview?.endsWith(".webp")),
    );
    for (const asset of Object.values(document.assets)) {
      assert(asset.source.startsWith(sourceUrl.replace("/tree/", "/blob/")));
      if (asset.source.endsWith(".glb"))
        assert.match(asset.model, /^\/blueprint-media\/[a-f0-9]{64}\.glb$/);
      if (asset.preview)
        assert.match(asset.preview, /^\/blueprint-media\/[a-f0-9]{64}\.webp$/);
      for (const item of asset.items)
        assert(
          (await fs.stat(path.join(out, item.preview || item.model))).size > 0,
        );
    }
  } finally {
    await fs.rm(out, { recursive: true, force: true });
  }
});

test("shared outline section, type, status and field labels have English UI translations", () => {
  for (const label of [
    ...SECTIONS.map((s) => s.name),
    ...Object.values(STATUSES),
    ...Object.values(TYPES).flatMap((t) => [
      t.name,
      ...Object.values(t.fields),
    ]),
  ])
    assert(Object.hasOwn(messages, label), label);
});

test("blueprint controls have English translations", async () => {
  const source = await fs.readFile("apps/web/public/blueprint.js", "utf8");
  for (const [, key] of source.matchAll(/\bt\("([^"\n]+)"/g))
    assert(Object.hasOwn(messages, key), key);
});

test("portable public bundles preserve reviewed snapshots and never fall back when incomplete or private", async () => {
  const root = await fs.mkdtemp(
    path.join(os.tmpdir(), "owngame-public-blueprints-"),
  );
  try {
    const games = await readGameEntries(process.cwd());
    const snapshots = await readBlueprintSnapshots(process.cwd(), games);
    await fs.mkdir(path.join(root, "scripts/web"), { recursive: true });
    const bundle = path.join(root, "scripts/web/blueprint-snapshots.json");
    await fs.writeFile(bundle, JSON.stringify(snapshots));
    assert.deepEqual(await readBlueprintSnapshots(root, games), snapshots);
    delete snapshots[games[0].id];
    await fs.writeFile(bundle, JSON.stringify(snapshots));
    await assert.rejects(readBlueprintSnapshots(root, games), /missing/);
    snapshots[games[1].id].project.scope = "/Users/private/plans";
    await fs.writeFile(bundle, JSON.stringify(snapshots));
    await assert.rejects(readBlueprintSnapshots(root, [games[1]]), /Private/);
  } finally {
    await fs.rm(root, { recursive: true, force: true });
  }
});
