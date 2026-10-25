import test from "node:test";
import assert from "node:assert/strict";
import { routeBlueprintConnections } from "../../apps/web/public/blueprint-connections.js";
import { readBlueprintSnapshots } from "../../scripts/web/blueprints.mjs";
import { readGameEntries } from "../../scripts/web/catalog.mjs";
const crosses = (a, b, r) =>
  a.x === b.x
    ? a.x > r.x &&
      a.x < r.x + 268 &&
      Math.max(a.y, b.y) > r.y &&
      Math.min(a.y, b.y) < r.y + 208
    : a.y > r.y &&
      a.y < r.y + 208 &&
      Math.max(a.x, b.x) > r.x &&
      Math.min(a.x, b.x) < r.x + 268;
function check(nodes, edges) {
  const width = Math.max(...nodes.map((n) => n.x + 300)),
    height = Math.max(...nodes.map((n) => n.y + 240));
  const before = structuredClone({ nodes, edges }),
    routes = routeBlueprintConnections(nodes, edges, width, height);
  assert.deepEqual({ nodes, edges }, before);
  assert.equal(routes.length, edges.length);
  for (const route of routes) {
    assert(route.points.length >= 2);
    for (let i = 1; i < route.points.length; i++) {
      const a = route.points[i - 1],
        b = route.points[i];
      assert(a.x === b.x || a.y === b.y, "only orthogonal segments");
      assert(!nodes.some((n) => crosses(a, b, n)), "connection crosses a card");
      for (const p of [a, b])
        assert(p.x >= 0 && p.y >= 0 && p.x <= width && p.y <= height);
    }
    if (route.label) {
      const b = route.label;
      assert(
        !nodes.some(
          (n) =>
            b.x < n.x + 268 &&
            b.x + b.w > n.x &&
            b.y < n.y + 208 &&
            b.y + b.h > n.y,
        ),
        "label overlaps a card",
      );
    }
  }
  return routes;
}
test("all public sections retain every local relationship without lines through card bodies", async () => {
  const games = await readGameEntries(process.cwd()),
    boards = await readBlueprintSnapshots(process.cwd(), games);
  for (const game of games)
    for (const section of [
      "overview",
      "rules",
      "flow",
      "world",
      "levels",
      "assets",
    ]) {
      const cards = boards[game.id].project.cards.filter(
        (c) => c.section === section,
      );
      if (!cards.length) continue;
      const minX = Math.min(...cards.map((c) => c.x)),
        minY = Math.min(...cards.map((c) => c.y));
      const nodes = cards.map((c, i) => ({
        id: c.id,
        ...(["assets", "levels"].includes(section)
          ? { x: i * 300 + 32, y: 32 }
          : { x: c.x - minX + 32, y: c.y - minY + 32 }),
      }));
      const ids = new Set(nodes.map((n) => n.id)),
        edges = boards[game.id].project.edges.filter(
          (e) => ids.has(e.from) && ids.has(e.to),
        );
      check(nodes, edges);
    }
});
test("forward, backward, reciprocal and self-return routes stay visible and distinct", () => {
  const nodes = [
    { id: "a", x: 32, y: 32 },
    { id: "b", x: 382, y: 32 },
    { id: "c", x: 32, y: 382 },
    { id: "d", x: 382, y: 382 },
  ];
  const edges = [
    { from: "a", to: "b", label: "Start" },
    { from: "b", to: "c", label: "Pause" },
    { from: "c", to: "b", label: "Resume" },
    { from: "d", to: "a", label: "Return" },
    { from: "a", to: "a", label: "Retry" },
  ];
  const routes = check(nodes, edges);
  assert.equal(new Set(routes.map((r) => r.path)).size, edges.length);
  assert.deepEqual(routeBlueprintConnections(nodes, edges, 682, 622), routes);
});
