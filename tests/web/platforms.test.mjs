import test from "node:test";
import assert from "node:assert/strict";
import {readGameEntries} from "../../scripts/web/catalog.mjs";
import {validPlatforms, supportsPlatform, devicePlatform, resolvePlatform} from "../../apps/web/public/platforms.js";

test("every published game explicitly declares supported platforms", async () => {
  const entries = await readGameEntries(process.cwd());
  for (const game of entries) assert(validPlatforms(game.platforms), game.id);
});

test("single-platform games stay separate; historical catalogues stay usable", () => {
  const mobile = {id: "tap", platforms: ["mobile"]};
  const pc = {id: "fps", platforms: ["pc"]};
  const both = {id: "puzzle", platforms: ["mobile", "pc"]};
  const games = [mobile, pc, both];
  assert.deepEqual(games.filter(g => supportsPlatform(g, "mobile")), [mobile, both]);
  assert.deepEqual(games.filter(g => supportsPlatform(g, "pc")), [pc, both]);
  for (const target of ["mobile", "pc"]) assert(supportsPlatform({id: "legacy"}, target));
  for (const value of [null, [], "pc", ["desktop"], ["pc", "pc"], ["pc", "unknown"]]) {
    assert(!validPlatforms(value));
    assert(!supportsPlatform({platforms: value}, "mobile"));
    assert(!supportsPlatform({platforms: value}, "pc"));
  }
  assert(!supportsPlatform(both, "unknown"));
});

test("device defaults do not mistake a narrow PC window for a phone; explicit choice wins", () => {
  const pc = {userAgent: "Mozilla/5.0 Windows NT", maxTouchPoints: 10};
  const iphone = {userAgent: "Mozilla/5.0 iPhone"};
  const ipad = {userAgent: "Mozilla/5.0 Macintosh", platform: "MacIntel", maxTouchPoints: 5};
  assert.equal(devicePlatform(pc), "pc");
  for (const device of [iphone, ipad, {userAgentData: {mobile: true}}]) assert.equal(devicePlatform(device), "mobile");
  assert.equal(resolvePlatform({query: "pc", saved: "mobile", device: iphone}), "pc");
  assert.equal(resolvePlatform({query: "invalid", saved: "pc", device: iphone}), "pc");
  assert.equal(resolvePlatform({device: iphone}), "mobile");
});
