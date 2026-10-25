import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import path from "node:path";
import os from "node:os";
import { createHash } from "node:crypto";
import {
  writeBlueprintScenes,
  sceneCardHash,
} from "../../scripts/web/blueprint-scenes.mjs";
import { readBlueprintSnapshots } from "../../scripts/web/blueprints.mjs";
import { readGameEntries } from "../../scripts/web/catalog.mjs";
import { attachBlueprint } from "../../apps/web/public/remix-blueprint.js";
import {
  createWorkflow,
  validateWorkflow,
  workflowPrompt,
} from "../../apps/web/public/remix-workflow-model.js";
const sha = (bytes) => createHash("sha256").update(bytes).digest("hex");
const manifest = JSON.parse(
  await fs.readFile("scripts/web/blueprint-scenes.json"),
);

test("all public level cards have game-version-bound real scene captures; Faune chapters retain distinct pictures", async () => {
  const games = await readGameEntries(process.cwd()),
    boards = await readBlueprintSnapshots(process.cwd(), games);
  let count = 0;
  for (const game of games) {
    const reviewed = manifest.games[game.id];
    assert.match(reviewed.gameVersion, /^[a-f0-9]{64}$/);
    for (const card of boards[game.id].project.cards.filter(
      (c) => c.section === "levels",
    )) {
      const entry = reviewed.cards[card.id];
      assert(entry?.items.length, game.id + ":" + card.title);
      assert.equal(entry.cardSha256, sceneCardHash(card));
      for (const item of entry.items) {
        assert.equal(item.gameVersion, reviewed.gameVersion);
        assert.equal(
          sha(await fs.readFile("apps/web/public/" + item.file)),
          item.sha256,
        );
        assert(["runtime", "runtime-camera"].includes(item.kind));
      }
      count++;
    }
  }
  assert.equal(count, 25);
  const faune = Object.values(manifest.games["faune-dungeon"].cards);
  assert.equal(new Set(faune.slice(1).map((c) => c.items[0].sha256)).size, 5);
  for (const item of manifest.games["star-letters"].cards[
    Object.keys(manifest.games["star-letters"].cards)[0]
  ].items)
    assert(item.title.includes("家园"));
});

test("scene publication fails on stale game/card, unsafe path or changed screenshot", async (t) => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "owngame-scenes-"));
  t.after(() => fs.rm(root, { recursive: true, force: true }));
  await fs.mkdir(path.join(root, "scripts/web"), { recursive: true });
  await fs.mkdir(path.join(root, "apps/web/public/art/scene-previews"), {
    recursive: true,
  });
  const bytes = Buffer.from("reviewed scene"),
    hash = sha(bytes),
    file = "art/scene-previews/" + hash + ".webp";
  await fs.writeFile(path.join(root, "apps/web/public", file), bytes);
  const card = {
      id: "card",
      section: "levels",
      title: "Level",
      body: "Original scene",
      fields: { config: "three stations" },
    },
    version = "a".repeat(64),
    sourceCommit = "b".repeat(40);
  const document = { project: { cards: [card] } },
    entry = {
      cardSha256: sceneCardHash(card),
      items: [
        {
          file,
          sha256: hash,
          title: "Actual level",
          kind: "runtime",
          capturedAt: "2026-10-25T00:00:00.000Z",
          width: 1280,
          height: 800,
          gameVersion: version,
          sourceCommit,
        },
      ],
    };
  const data = {
      schema: "owngame.blueprint-scenes.v1",
      games: { example: { gameVersion: version, cards: { card: entry } } },
    },
    source = {
      online_build_sha256: version,
      sourceUrl: `https://github.com/luka2chat/owngame/tree/${sourceCommit}/examples/example`,
    };
  const write = () =>
    fs.writeFile(
      path.join(root, "scripts/web/blueprint-scenes.json"),
      JSON.stringify(data),
    );
  const run = () =>
    writeBlueprintScenes(
      root,
      path.join(root, "out"),
      { id: "example" },
      document,
      source,
    );
  await write();
  const emitted = await run();
  assert.deepEqual(
    await fs.readFile(path.join(root, "out", emitted.card.preview)),
    bytes,
  );
  assert.equal(emitted.card.items[0].scene.gameVersion, version);
  source.online_build_sha256 = "c".repeat(64);
  await assert.rejects(run(), /game version/);
  source.online_build_sha256 = version;
  card.fields.config = "four stations";
  await assert.rejects(run(), /level card/);
  card.fields.config = "three stations";
  entry.items[0].file = "../private.webp";
  await write();
  await assert.rejects(run(), /provenance/);
  entry.items[0].file = file;
  await write();
  await fs.writeFile(path.join(root, "apps/web/public", file), "changed");
  await assert.rejects(run(), /changed after review/);
});

test("scene evidence survives workflow import/export and cannot claim a different game build", async () => {
  const id = "faune-dungeon",
    document = (await readBlueprintSnapshots(process.cwd(), [{ id }]))[id],
    version = manifest.games[id].gameVersion,
    game = { id, title: "Faune", version };
  document.gameId = id;
  const out = await fs.mkdtemp(path.join(os.tmpdir(), "owngame-scene-draft-"));
  try {
    document.assets = await writeBlueprintScenes(
      process.cwd(),
      out,
      game,
      document,
      {
        online_build_sha256: version,
        sourceUrl:
          "https://github.com/luka2chat/owngame/tree/" +
          "a".repeat(40) +
          "/examples/" +
          id,
      },
    );
    const plan = attachBlueprint(createWorkflow(game), document, {}, game);
    assert.deepEqual(
      validateWorkflow(JSON.parse(JSON.stringify(plan)), id),
      plan,
    );
    const card = plan.blueprint.cards.find((c) => c.section === "levels");
    assert(
      workflowPrompt(plan, game).includes(
        "https://owngame.dev" + card.asset.preview,
      ),
    );
    card.asset.items[0].scene.gameVersion = "f".repeat(64);
    assert.throws(() => validateWorkflow(plan, id));
  } finally {
    await fs.rm(out, { recursive: true, force: true });
  }
});
