import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import {
  createWorkflow,
  createStep,
  validateWorkflow,
  executionOrder,
  arrangeSteps,
  workflowIssues,
  workflowPrompt,
} from "../../apps/web/public/remix-workflow-model.js";
import { messages } from "../../apps/web/public/locales/en.js";

const game = {
  id: "example",
  title: "示例",
  instructions: "保留排序规则",
  platforms: ["pc"],
  version: "v1",
  sourceUrl: "https://github.com/example/game",
  sourceCommit: "abc",
};

test("workflow retains reference identity and platform scope without changing the source game", () => {
  const before = structuredClone(game),
    plan = createWorkflow(game);
  assert.deepEqual(game, before);
  assert.deepEqual(plan.targets, ["pc"]);
  assert.equal(plan.reference.version, "v1");
  assert.deepEqual(
    validateWorkflow(JSON.parse(JSON.stringify(plan)), game.id),
    plan,
  );
  const prompt = workflowPrompt(plan);
  assert(prompt.includes("保留排序规则"));
  assert(prompt.includes("game-outline.json"));
  assert(prompt.includes("https://github.com/example/game"));
  assert(prompt.includes("目标平台: PC"));
  assert(!prompt.includes("移动端"));
});

test("dependencies override preferred order; independent steps retain their preference", () => {
  const plan = createWorkflow(game);
  plan.steps.reverse();
  const ordered = executionOrder(plan.steps).map((s) => s.id);
  assert(ordered.indexOf("reference") < ordered.indexOf("rules"));
  assert(ordered.indexOf("rules") < ordered.indexOf("levels"));
  assert(ordered.indexOf("art") < ordered.indexOf("levels"));
  assert.equal(ordered.at(-1), "validation");
  assert(ordered.indexOf("controls") < ordered.indexOf("levels"));
  assert.throws(() =>
    executionOrder([
      { id: "a", dependsOn: ["b"] },
      { id: "b", dependsOn: ["a"] },
    ]),
  );
  assert.throws(() => executionOrder([{ id: "a", dependsOn: ["missing"] }]));
});

test("arranged cards flow from prerequisites to dependents and large plans stay bounded", () => {
  const plan = createWorkflow(game);
  for (const step of plan.steps)
    for (const id of step.dependsOn) {
      assert(plan.steps.find((s) => s.id === id).x < step.x);
    }
  plan.steps = Array.from({ length: 30 }, (_, i) => ({
    ...createStep("custom", "n" + i),
    dependsOn: i ? ["n" + (i - 1)] : [],
  }));
  arrangeSteps(plan.steps);
  assert.doesNotThrow(() => validateWorkflow(plan, game.id));
});

test("disabled prerequisites block handoff; removing them from dependencies permits an intentional omission", () => {
  const plan = createWorkflow(game);
  plan.steps.find((s) => s.id === "art").enabled = false;
  assert(workflowIssues(plan).length > 0);
  assert.throws(() => workflowPrompt(plan));
  for (const s of plan.steps)
    s.dependsOn = s.dependsOn.filter((id) => id !== "art");
  assert.deepEqual(workflowIssues(plan), []);
  assert(!workflowPrompt(plan).includes("## 2. 画面与素材"));
  plan.steps.forEach((s) => (s.enabled = false));
  assert.throws(() => workflowPrompt(plan));
});

test("prompt includes custom details, ordering and checkpoints exactly as authored", () => {
  const plan = createWorkflow(game),
    step = createStep("custom", "boss");
  step.title = "首领";
  step.details = "生命 100；第二阶段 40";
  step.acceptance = "两阶段都能通关";
  step.dependsOn = ["rules"];
  step.checkpoint = true;
  plan.steps.push(step);
  const text = workflowPrompt(plan);
  for (const expected of [
    step.title,
    step.details,
    step.acceptance,
    "完成后等我确认: 是",
    "前置步骤: 3. 玩法与规则",
  ])
    assert(text.includes(expected));
});

test("imports reject wrong games, malformed fields, oversize payloads and cycles", () => {
  const corruptions = [
    (p) => (p.gameId = "other"),
    (p) => (p.schema = "unknown"),
    (p) => p.steps.push(p.steps[0]),
    (p) => (p.steps[0].dependsOn = ["validation"]),
    (p) => (p.steps[0].dependsOn = ["missing"]),
    (p) => (p.steps[0].x = Infinity),
    (p) => (p.steps[0].details = "a".repeat(4001)),
    (p) => (p.targets = []),
    (p) => (p.targets = ["pc", "pc"]),
    (p) => (p.targets = ["unknown"]),
    (p) => (p.reference = {}),
    (p) => (p.steps = []),
    (p) => (p.steps[0].enabled = "yes"),
    (p) => (p.steps[0].id = "<img src=x>"),
  ];
  for (const change of corruptions) {
    const plan = createWorkflow(game);
    change(plan);
    assert.throws(() => validateWorkflow(plan, game.id));
  }
  const plan = createWorkflow(game);
  plan.extra = "discard";
  plan.steps[0].unknown = "discard";
  const clean = validateWorkflow(plan, game.id);
  assert(!Object.hasOwn(clean, "extra"));
  assert(!Object.hasOwn(clean.steps[0], "unknown"));
});

test("workflow UI and model translation keys have English messages", async () => {
  for (const name of ["remix-workflow.js", "remix-workflow-model.js"]) {
    const text = await fs.readFile("apps/web/public/" + name, "utf8");
    for (const [, key] of text.matchAll(/(?:t|button)\("([^"\n]+)"/g)) {
      if (/\p{Script=Han}/u.test(key))
        assert(Object.hasOwn(messages, key), key);
    }
  }
});
