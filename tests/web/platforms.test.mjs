import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import vm from "node:vm";
import {readGameEntries} from "../../scripts/web/catalog.mjs";
import {validPlatforms, supportsPlatform, devicePlatform, resolvePlatform, platformAcceptance, playerPresentation, playerSandbox, needsComputer, sourceLinkDestination} from "../../apps/web/public/platforms.js";

test("every published game explicitly declares supported platforms", async () => {
  const entries = await readGameEntries(process.cwd());
  for (const game of entries) assert(validPlatforms(game.platforms), game.id);
  assert.deepEqual(entries.slice(0, 3).map(g => g.id), ["azeroth-strike", "tidal-reclaim", "star-letters"]);
  assert.deepEqual(entries.filter(g => supportsPlatform(g, "pc")).map(g => g.id), ["azeroth-strike", "tidal-reclaim", "star-letters"]);
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

test("pointer lock is opt-in for declared PC games only", () => {
  assert.equal(playerSandbox({platforms:["pc"],pointerLock:true}), "allow-scripts allow-same-origin allow-pointer-lock");
  for (const game of [{}, {platforms:["pc"]}, {platforms:["mobile"],pointerLock:true}, {platforms:[],pointerLock:true}])
    assert.equal(playerSandbox(game), "allow-scripts allow-same-origin");
});

test("sandbox source links resolve only to the selected game's reviewed GitHub example", () => {
  const latest = "https://github.com/luka2chat/owngame/tree/main/examples/azeroth-strike";
  const game = {id:"azeroth-strike", sourceUrl:latest.replace("/main/", "/" + "a".repeat(40) + "/")};
  assert.equal(sourceLinkDestination(latest, game), latest);
  assert.equal(sourceLinkDestination(game.sourceUrl, game), game.sourceUrl);
  for (const href of [undefined, "javascript:alert(1)", latest + "?redirect=evil", latest + "/../../other", latest.replace("github.com", "github.com.evil.test"), latest.replace("azeroth-strike", "tidal-reclaim")])
    assert.equal(sourceLinkDestination(href, game), null);
  assert.equal(sourceLinkDestination(latest, {id:game.id}), null);
  assert.equal(sourceLinkDestination(latest, {...game,sourceUrl:"https://evil.test/"}), null);
  assert.equal(sourceLinkDestination(latest, {...game,id:"../azeroth-strike"}), null);
});

// Device checks must not turn a narrow desktop window into an unsupported device.
test("PC reminders apply to phones/tablets, never platform filters or touch laptops", () => {
  const pc = {platforms:["pc"]};
  for (const device of [{userAgent:"iPhone"}, {userAgent:"Android"}, {platform:"MacIntel",maxTouchPoints:5}]) {
    assert(needsComputer(pc,device));
    assert(!needsComputer({platforms:["mobile"]},device));
    assert(!needsComputer({platforms:["mobile","pc"]},device));
    assert(!needsComputer({},device));
  }
  assert(!needsComputer(pc,{userAgent:"Windows NT",maxTouchPoints:10}));
  assert(!needsComputer(pc,{userAgent:"Macintosh",platform:"MacIntel",maxTouchPoints:0}));
});
