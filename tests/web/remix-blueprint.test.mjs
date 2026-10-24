import test from "node:test";
import assert from "node:assert/strict";
import { readBlueprintSnapshots } from "../../scripts/web/blueprints.mjs";
import { readGameEntries } from "../../scripts/web/catalog.mjs";
import { TYPES } from "../../apps/outline/model.mjs";
import { attachBlueprint } from "../../apps/web/public/remix-blueprint.js";
import {
  createWorkflow,
  validateWorkflow,
  workflowPrompt,
} from "../../apps/web/public/remix-workflow-model.js";

const games = await readGameEntries(process.cwd());
const snapshots = await readBlueprintSnapshots(process.cwd(), games);
const game = games.find((g) => g.id === "faune-dungeon");
const input = (g) => ({ ...structuredClone(snapshots[g.id]), gameId: g.id });
const seeded = () =>
  attachBlueprint(createWorkflow(game), input(game), { types: TYPES }, game);

test("all 19 blueprints carry every card, field and relationship into the correct workflow step", () => {
  for (const g of games) {
    const doc = input(g),
      before = structuredClone(doc);
    const plan = attachBlueprint(createWorkflow(g), doc, { types: TYPES }, g);
    assert.deepEqual(doc, before);
    assert.equal(plan.blueprint.cards.length, doc.project.cards.length);
    assert.equal(plan.blueprint.edges.length, doc.project.edges.length);
    for (const card of plan.blueprint.cards) {
      const original = doc.project.cards.find((c) => c.id === card.id);
      assert.equal(card.title, original.title);
      assert.equal(card.body, original.body);
      assert.deepEqual(card.fields, original.fields);
      assert.deepEqual(card.original, {
        title: original.title,
        body: original.body,
        fields: original.fields,
      });
      assert.equal(
        plan.steps.find((s) => s.id === card.stepId).kind,
        {
          overview: "reference",
          world: "reference",
          rules: "rules",
          flow: "controls",
          levels: "levels",
          assets: "art",
        }[card.section],
      );
    }
    assert.deepEqual(
      validateWorkflow(JSON.parse(JSON.stringify(plan)), g.id),
      plan,
    );
  }
});

test("blueprint attachment preserves existing draft edits, including custom or deleted steps", () => {
  const old = createWorkflow(game);
  old.goal = "保留我的整体目标";
  old.steps[0].details = "保留已有数值";
  old.steps = old.steps.slice(0, 1);
  const before = structuredClone(old);
  const plan = attachBlueprint(old, input(game), { types: TYPES }, game);
  assert.deepEqual(old, before);
  assert.deepEqual(plan.steps, old.steps);
  assert.equal(plan.goal, old.goal);
  assert(plan.blueprint.cards.every((c) => c.stepId === old.steps[0].id));
  assert.doesNotThrow(() => validateWorkflow(plan, game.id));
  assert.deepEqual(validateWorkflow(old, game.id), old);
});

test("edited blueprints survive export/import and hand off full details without excluded card bodies", () => {
  const plan = seeded();
  const level = plan.blueprint.cards.find((c) => c.section === "levels");
  const original = structuredClone(level.original);
  level.title = "我的新关卡";
  level.fields.config = "敌人 7 个，奖励 23";
  level.request = "改为夜间，保留出口位置";
  const omitted = plan.blueprint.cards.find((c) => c.id !== level.id);
  omitted.body = "OMITTED_PRIVATE_DRAFT_SENTINEL";
  omitted.enabled = false;
  const roundtrip = validateWorkflow(JSON.parse(JSON.stringify(plan)), game.id);
  assert.deepEqual(roundtrip, plan);
  const prompt = workflowPrompt(roundtrip);
  for (const value of [
    level.title,
    level.fields.config,
    level.request,
    plan.blueprint.url,
  ])
    assert(prompt.includes(value));
  assert(!prompt.includes(omitted.body));
  assert(prompt.includes("不采用的卡片"));
  assert.deepEqual(level.original, original);
  assert(!prompt.includes(`${omitted.id} →`));
  plan.steps.find((s) => s.id === level.stepId).enabled = false;
  for (const step of plan.steps)
    step.dependsOn = step.dependsOn.filter((id) => id !== level.stepId);
  assert(!workflowPrompt(plan).includes(level.fields.config));
});

test("malformed snapshots, wrong-game payloads, orphan edges and unsafe assets cannot enter drafts", () => {
  assert.throws(() =>
    attachBlueprint(
      createWorkflow(game),
      { ...input(game), gameId: "other" },
      { types: TYPES },
      game,
    ),
  );
  const changes = [
    (p) => (p.blueprint.gameId = "other"),
    (p) => (p.blueprint.revision = -1),
    (p) => p.blueprint.cards.push(p.blueprint.cards[0]),
    (p) => (p.blueprint.cards[0].stepId = "missing"),
    (p) => (p.blueprint.cards[0].fields = { bad: { script: true } }),
    (p) => (p.blueprint.cards[0].original.body = "x".repeat(20001)),
    (p) => (p.blueprint.cards[0].asset = { source: "javascript:alert(1)" }),
    (p) =>
      p.blueprint.edges.push({
        from: "missing",
        to: p.blueprint.cards[0].id,
        label: "bad",
      }),
    (p) => (p.blueprint = null),
  ];
  for (const mutate of changes) {
    const plan = seeded();
    mutate(plan);
    assert.throws(() => validateWorkflow(plan, game.id));
  }
});
