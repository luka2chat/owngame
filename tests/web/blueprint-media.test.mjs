import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { createHash } from "node:crypto";
import {
  writeBlueprintMedia,
  safeMediaPath,
} from "../../scripts/web/blueprint-media.mjs";
import { safeMediaUrl } from "../../apps/web/public/blueprint-media-policy.js";
import { readBlueprintSnapshots } from "../../scripts/web/blueprints.mjs";
import { readGameEntries } from "../../scripts/web/catalog.mjs";
import { attachBlueprint } from "../../apps/web/public/remix-blueprint.js";
import {
  createWorkflow,
  validateWorkflow,
  workflowPrompt,
} from "../../apps/web/public/remix-workflow-model.js";
import { messages } from "../../apps/web/public/locales/en.js";

const commit = "a".repeat(40),
  source = {
    sourceUrl: `https://github.com/luka2chat/owngame/tree/${commit}/examples/example`,
  };
const hash = (bytes) => createHash("sha256").update(bytes).digest("hex");
test("reviewed media is copied from pinned public source with hashes; unsafe, changed and external-dependent models fail closed", async (t) => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "blueprint-media-"));
  t.after(() => fs.rm(root, { recursive: true, force: true }));
  await fs.mkdir(path.join(root, "scripts/web"), { recursive: true });
  const bytes = Buffer.from("fixture"),
    file = "public/art/hero.png",
    sha256 = hash(bytes);
  const manifest = { example: { card: [{ title: "Hero", file, sha256 }] } };
  const write = () =>
    fs.writeFile(
      path.join(root, "scripts/web/blueprint-media.json"),
      JSON.stringify(manifest),
    );
  const document = { project: { cards: [{ id: "card", section: "assets" }] } },
    out = path.join(root, "out");
  await write();
  let reads = 0;
  const run = () =>
    writeBlueprintMedia(root, out, { id: "example" }, document, source, {
      readSource: async (relative) => {
        reads++;
        assert.equal(relative, file);
        return bytes;
      },
    });
  const result = await run();
  assert.equal(reads, 1);
  const item = result.card.items[0];
  assert.equal(item.preview, `/blueprint-media/${sha256}.png`);
  assert.deepEqual(await fs.readFile(path.join(out, item.preview)), bytes);
  assert.equal(
    item.source,
    source.sourceUrl.replace("/tree/", "/blob/") + "/" + file,
  );
  manifest.example.card[0].sha256 = "b".repeat(64);
  await write();
  await assert.rejects(run(), /changed/);
  for (const invalid of [
    "../private.png",
    "/tmp/a.png",
    "public/../private.png",
    "public/.private/a.png",
    "https://example.com/a.png",
    "public/%2e%2e/a.png",
  ]) {
    assert.equal(safeMediaPath(invalid), false);
  }
  manifest.example.card[0].file = "../private.png";
  await write();
  await assert.rejects(run(), /path/);
  const json = Buffer.from(
    JSON.stringify({
      images: [{ uri: "https://unreviewed.example/texture.png" }],
    }),
  );
  const glb = Buffer.alloc(20 + json.length);
  glb.writeUInt32LE(0x46546c67, 0);
  glb.writeUInt32LE(json.length, 12);
  json.copy(glb, 20);
  manifest.example.card[0] = {
    title: "Model",
    file: "model.glb",
    sha256: hash(glb),
  };
  await write();
  await assert.rejects(
    writeBlueprintMedia(root, out, { id: "example" }, document, source, {
      readSource: async () => glb,
    }),
    /embed/,
  );
});

test("all 19 reviewed blueprints have explicit visual assets attached to their existing art cards", async () => {
  const games = await readGameEntries(process.cwd()),
    snapshots = await readBlueprintSnapshots(process.cwd(), games);
  const manifest = JSON.parse(
    await fs.readFile("scripts/web/blueprint-media.json"),
  );
  for (const game of games) {
    const art = snapshots[game.id].project.cards.filter(
      (c) => c.section === "assets",
    );
    assert(art.length);
    for (const card of art) {
      assert(manifest[game.id]?.[card.id]?.length, game.id + ":" + card.title);
      for (const item of manifest[game.id][card.id]) {
        assert(safeMediaPath(item.file));
        assert.match(item.sha256, /^[a-f0-9]{64}$/);
      }
    }
  }
});

test("draft galleries and GLB references survive import/export and contribute every source to handoff", async () => {
  const game = { id: "example", title: "Example" },
    document = (
      await readBlueprintSnapshots(process.cwd(), [{ id: "faune-dungeon" }])
    )["faune-dungeon"];
  document.gameId = game.id;
  const card = document.project.cards.find((c) => c.section === "assets");
  const items = [
    {
      title: "Hero",
      source: source.sourceUrl.replace("/tree/", "/blob/") + "/hero.png",
      preview: "/blueprint-media/" + "b".repeat(64) + ".png",
    },
    {
      title: "Robot",
      source: source.sourceUrl.replace("/tree/", "/blob/") + "/robot.glb",
      model: "/blueprint-media/" + "c".repeat(64) + ".glb",
    },
  ];
  document.assets = { [card.id]: { ...items[0], items } };
  const plan = attachBlueprint(createWorkflow(game), document, {}, game);
  assert.deepEqual(
    validateWorkflow(JSON.parse(JSON.stringify(plan)), game.id),
    plan,
  );
  const prompt = workflowPrompt(plan, game);
  for (const item of items) assert(prompt.includes(item.source));
  for (const invalid of [
    "/blueprint-media/../private.glb",
    "javascript:alert(1)",
    "https://example.com/a.glb",
    "/blueprint-media/" + "c".repeat(64) + ".html",
  ])
    assert.equal(safeMediaUrl(invalid, true), false);
  const broken = structuredClone(plan);
  broken.blueprint.cards.find((c) => c.id === card.id).asset.items[1].model =
    "https://unreviewed.example/model.glb";
  assert.throws(() => validateWorkflow(broken, game.id));
});

test("media controls have English translations", async () => {
  for (const name of ["blueprint-media.js", "blueprint-model.js"]) {
    const source = await fs.readFile("apps/web/public/" + name, "utf8");
    for (const [, key] of source.matchAll(/\bt\(["']([^"'\n]+)["']/g))
      assert(Object.hasOwn(messages, key), key);
  }
});
