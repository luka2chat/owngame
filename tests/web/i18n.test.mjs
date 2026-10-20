import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import {
  languages,
  normalizeLanguage,
  resolveLanguage,
  translate,
  localizeGame,
  localizeUrl,
  matchesGame,
} from "../../apps/web/public/i18n.js";
import { messages, games } from "../../apps/web/public/locales/en.js";
import { readGameEntries } from "../../scripts/web/catalog.mjs";

test("language choice prefers supported URL, then saved choice, then browser languages", () => {
  assert.deepEqual(languages, ["zh-CN", "en"]);
  assert.equal(
    resolveLanguage({ query: "en-US", saved: "zh-CN", preferred: ["zh-TW"] }),
    "en",
  );
  assert.equal(
    resolveLanguage({ query: "unknown", saved: "zh-CN", preferred: ["en"] }),
    "zh-CN",
  );
  assert.equal(
    resolveLanguage({ saved: "bad", preferred: ["de-DE", "zh-Hant"] }),
    "zh-CN",
  );
  assert.equal(resolveLanguage({ preferred: ["en-GB"] }), "en");
  assert.equal(resolveLanguage({ preferred: ["fr"] }), "en");
  assert.equal(normalizeLanguage("zh-TW"), "zh-CN");
  assert.equal(normalizeLanguage(null), null);
  assert.equal(normalizeLanguage("<script>"), null);
});
test("messages keep Chinese fallback and interpolate values without interpreting markup", () => {
  assert.equal(
    translate("开始游戏：{title}", { title: "<b>Game</b>" }, "en"),
    "Play <b>Game</b>",
  );
  assert.equal(
    translate("开始游戏：{title}", { title: "潮光归位" }, "zh-CN"),
    "开始游戏：潮光归位",
  );
  assert.equal(translate("new fallback", {}, "en"), "new fallback");
  assert.equal(translate("{count} 款游戏", { count: 1 }, "en"), "1 game");
  assert.equal(translate("{count} 款游戏", { count: 18 }, "en"), "18 games");
  for (const [key, english] of Object.entries(messages)) {
    assert.deepEqual(
      [...key.matchAll(/\{\w+\}/g)].map((m) => m[0]).sort(),
      [...english.matchAll(/\{\w+\}/g)].map((m) => m[0]).sort(),
      key,
    );
  }
});
test("all published catalog entries have English discovery and instructions without changing runtime identity", async () => {
  const entries = await readGameEntries(process.cwd());
  assert.equal(entries.length, Object.keys(games).length);
  for (const game of entries) {
    const original = structuredClone(game);
    const english = localizeGame(game, "en");
    for (const key of ["title", "tag", "description", "instructions"]) {
      assert(english[key]?.length, key + " missing for " + game.id);
      assert(
        !/\p{Script=Han}/u.test(english[key]),
        key + " untranslated for " + game.id,
      );
    }
    for (const key of [
      "id",
      "category",
      "cover",
      "version",
      "entry",
      "sourceUrl",
    ])
      assert.equal(english[key], game[key]);
    assert.deepEqual(game, original);
    assert(matchesGame(game, english.title.toUpperCase()));
    assert(matchesGame(game, game.title));
  }
  assert.equal(
    localizeGame({ id: "future", title: "新游戏" }, "en").title,
    "新游戏",
  );
});
test("language links retain game, view, search and hash, and never rewrite assets or external sites", () => {
  assert.equal(
    localizeUrl("/play.html?game=star-triad#stage", "en"),
    "/play.html?game=star-triad&lang=en#stage",
  );
  assert.equal(
    localizeUrl("/?view=favorites&q=2048&lang=en", "zh-CN"),
    "/?view=favorites&q=2048&lang=zh-CN",
  );
  assert.equal(
    localizeUrl("/cases/star-letters/", "en"),
    "/cases/star-letters/?lang=en",
  );
  for (const value of [
    "https://github.com/luka2chat/owngame",
    "/games/game/version/index.html",
    "/art/cover.png",
    "/catalog.json",
  ])
    assert.equal(localizeUrl(value, "en"), value);
});
test("every static translation marker has English copy and every page loads the shared language module", async () => {
  for (const file of [
    "index.html",
    "play.html",
    "privacy.html",
    "usage.html",
    "404.html",
    "cases/star-letters/index.html",
  ]) {
    const html = await fs.readFile("apps/web/public/" + file, "utf8");
    assert(html.includes('src="/i18n.js"'), file);
    for (const match of html.matchAll(
      /data-i18n(?:-(?:placeholder|aria-label|alt|content))?="([^"]+)"/g,
    )) {
      const key = match[1]
        .replaceAll("&quot;", '"')
        .replaceAll("&#x27;", "'")
        .replaceAll("&amp;", "&");
      assert(Object.hasOwn(messages, key), file + ": " + key);
    }
  }
});
