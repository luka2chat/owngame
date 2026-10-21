import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import vm from "node:vm";
import {readGameEntries} from "../../scripts/web/catalog.mjs";
import {validPlatforms, supportsPlatform, devicePlatform, resolvePlatform, platformAcceptance, playerPresentation} from "../../apps/web/public/platforms.js";

test("every published game explicitly declares supported platforms", async () => {
  const entries = await readGameEntries(process.cwd());
  for (const game of entries) assert(validPlatforms(game.platforms), game.id);
  assert.deepEqual(entries.filter(g => supportsPlatform(g, "pc")).map(g => g.id), ["star-letters"]);
  assert.equal(entries.filter(g => supportsPlatform(g, "mobile")).length, 17);
});

test("single-platform games stay separate; historical catalogues stay usable", () => {
  const mobile = {id: "tap", platforms: ["mobile"]};
  const pc = {id: "fps", platforms: ["pc"]};
  const both = {id: "puzzle", platforms: ["mobile", "pc"]};
  const games = [mobile, pc, both];
  assert.deepEqual(games.filter(g => supportsPlatform(g, "mobile")), [mobile, both]);
  assert.deepEqual(games.filter(g => supportsPlatform(g, "pc")), [pc, both]);
  assert.deepEqual(platformAcceptance(pc), ["PC controls, layout and performance"]);
  assert.deepEqual(platformAcceptance(mobile), ["Mobile touch controls, layout and device performance"]);
  for (const target of ["mobile", "pc"]) assert(supportsPlatform({id: "legacy"}, target));
  for (const value of [null, [], "pc", ["desktop"], ["pc", "pc"], ["pc", "unknown"]]) {
    assert(!validPlatforms(value));
    assert(!supportsPlatform({platforms: value}, "mobile"));
    assert(!supportsPlatform({platforms: value}, "pc"));
  }
  assert(!supportsPlatform(both, "unknown"));
});

test("the library defaults to all platforms regardless of device or legacy preference", () => {
  const pc = {userAgent: "Mozilla/5.0 Windows NT", maxTouchPoints: 10};
  const iphone = {userAgent: "Mozilla/5.0 iPhone"};
  const ipad = {userAgent: "Mozilla/5.0 Macintosh", platform: "MacIntel", maxTouchPoints: 5};
  assert.equal(devicePlatform(pc), "pc");
  for (const device of [iphone, ipad, {userAgentData: {mobile: true}}]) assert.equal(devicePlatform(device), "mobile");
  assert.equal(resolvePlatform({query: "pc", saved: "mobile", device: iphone}), "pc");
  assert.equal(resolvePlatform({query: "invalid", saved: "pc", device: iphone}), "all");
  assert.equal(resolvePlatform({device: iphone}), "all");
  assert.equal(resolvePlatform({saved: "mobile", device: pc}), "all");
  assert.equal(resolvePlatform({query: "all", saved: "pc"}), "all");
  assert.equal(resolvePlatform({query: "mobile"}), "mobile");
});

test("Recreate asks for only the selected game's support targets in both languages", async () => {
  const source = (await fs.readFile("apps/web/public/remix.js", "utf8"))
    .replace(/^import .* from .*;\n/gm, "").replaceAll("export ", "");
  for (const language of ["en", "zh-CN"]) {
    for (const target of ["mobile", "pc"]) {
      const game = {id: "example", title: "Example", platforms: [target], instructions: "Play", tag: "Art", description: "Game"};
      const prompt = vm.runInNewContext(source + "\nremixPrompt(game)", {
        game, platforms: ["mobile", "pc"], supportsPlatform,
        getLanguage: () => language, localizeGame: g => g,
      });
      assert(prompt.includes(target === "pc" ? "PC" : language === "en" ? "mobile" : "移动端"));
      assert(!prompt.includes(target === "pc" ? "mobile" : "PC"));
      assert(!prompt.includes("desktop and phone sizes"));
      assert(!prompt.includes("电脑和手机尺寸"));
    }
  }
});

test("PC classification uses the Star Letters player; mobile retains authored presentation", () => {
  assert.deepEqual(playerPresentation({id: "future-pc", platforms: ["pc"]}), {wide: true, responsive: true});
  assert.deepEqual(playerPresentation({id: "neon-shooter", platforms: ["mobile"]}), {wide: false, responsive: false});
  assert.deepEqual(playerPresentation({id: "star-triad", platforms: ["mobile"]}), {wide: false, responsive: true});
});
