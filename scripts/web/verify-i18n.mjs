import "../lib/codex-browser-preflight.mjs";
import { chromium } from "playwright";
import fs from "node:fs/promises";
import path from "node:path";
import os from "node:os";
import assert from "node:assert/strict";

const base = process.argv[2] || "http://127.0.0.1:3238";
const out = path.resolve(
  process.env.OWNGAME_I18N_EVIDENCE || "artifacts/web/2026-10-20-i18n",
);
await fs.mkdir(out, { recursive: true });
const profile = await fs.mkdtemp(path.join(os.tmpdir(), "owngame-i18n-"));
let context;
const errors = [];
try {
  context = await chromium.launchPersistentContext(profile, {
    headless: true,
    executablePath:
      process.env.OWNGAME_CHROME_PATH ||
      (process.platform === "darwin"
        ? "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"
        : undefined),
    locale: "en-US",
    viewport: { width: 1440, height: 900 },
  });
  const page = await context.newPage();
  page.on("pageerror", (e) => errors.push(e.message));
  const settled = () =>
    page.waitForFunction(
      () => document.querySelector("#games")?.dataset.state === "ready",
    );
  const language = async (value) => {
    const select = page.locator("[data-language-select]:visible").first();
    await select.selectOption(value);
    await page.waitForFunction(
      (expected) => document.documentElement.lang === expected,
      value,
    );
  };
  const englishOnly = async () => {
    const chinese = await page.locator("body").evaluate((body) => {
      const walker = document.createTreeWalker(body, NodeFilter.SHOW_TEXT);
      const result = [];
      while (walker.nextNode()) {
        const node = walker.currentNode,
          parent = node.parentElement;
        if (
          parent.closest("script,style,select,option,noscript,textarea,iframe")
        )
          continue;
        if (
          parent.checkVisibility() &&
          /\p{Script=Han}/u.test(node.textContent)
        )
          result.push(node.textContent.trim());
      }
      return result;
    });
    assert.deepEqual(chinese, [], "Untranslated visible site copy");
  };
  await page.goto(base);
  await settled();
  assert.equal(await page.locator("html").getAttribute("lang"), "en");
  assert.equal(
    await page.locator(".game-card h3").first().innerText(),
    "Azeroth Strike",
  );
  await englishOnly();
  const gameCount = await page.locator(".game-card").count();
  const viewports = [];
  for (const [width, height] of [
    [1440, 900],
    [1024, 768],
    [390, 844],
    [360, 800],
  ]) {
    await page.setViewportSize({ width, height });
    assert(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
      "Page overflow at " + width,
    );
    assert(await page.locator("[data-language-select]").first().isVisible());
    await page.screenshot({
      path: path.join(out, "english-" + width + ".png"),
      animations: "disabled",
    });
    await language("zh-CN");
    assert.equal(
      await page.locator(".game-card h3").first().innerText(),
      "潮汐回收站",
    );
    assert(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    );
    if (width === 1440 || width === 390)
      await page.screenshot({
        path: path.join(out, "chinese-" + width + ".png"),
        animations: "disabled",
      });
    await language("en");
    viewports.push({ width, height });
  }
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.locator("#search").fill("harbor");
  assert.equal(await page.locator(".game-card").count(), 1);
  await page.locator(".favorite").click();
  await language("zh-CN");
  assert.equal(await page.locator("#search").inputValue(), "harbor");
  assert.equal(await page.locator(".game-card").count(), 1);
  assert.equal(
    await page.locator(".favorite").getAttribute("aria-pressed"),
    "true",
  );
  await page.locator("#search").fill("潮光");
  await language("en");
  assert.equal(await page.locator(".game-card").count(), 1);
  await page.locator("#search").fill("");
  await page.locator('#nav [data-view="favorites"]').click();
  assert.equal(await page.locator(".game-card").count(), 1);
  await language("zh-CN");
  assert.equal(await page.locator("#section-title").innerText(), "我的收藏");
  await language("en");
  await page.reload();
  await settled();
  assert.equal(await page.locator("html").getAttribute("lang"), "en");
  assert.equal(
    await page.evaluate(() => localStorage.getItem("owngame:language")),
    "en",
  );
  await page.goto(base + "/?lang=zh-CN");
  await settled();
  assert.equal(await page.locator("html").getAttribute("lang"), "zh-CN");
  await language("en");
  await page
    .getByRole("button", {
      name: "Remix Neon Defender: copy for your AI",
      exact: true,
    })
    .click();
  await page.waitForFunction(
    () => !document.querySelector(".remix-copy").disabled,
  );
  assert(
    (await page.locator("#remix-prompt").inputValue()).startsWith(
      "Use owngame",
    ),
  );
  await page.locator("#remix-change").fill("a rainy café");
  assert(
    (await page.locator("#remix-prompt").inputValue()).includes("a rainy café"),
  );
  const editedPrompt = await page.locator("#remix-prompt").inputValue();
  const other = await context.newPage();
  await other.goto(base + "/?lang=en");
  await other.locator("[data-language-select]").first().selectOption("zh-CN");
  await page.waitForFunction(() => document.documentElement.lang === "zh-CN");
  assert.equal(await page.locator("#remix-prompt").inputValue(), editedPrompt);
  assert.equal(
    await page.locator("#remix-change").inputValue(),
    "a rainy café",
  );
  await page.getByRole("button", { name: "关闭复刻", exact: true }).click();
  await other.close();
  await page.goto(base + "/play.html?game=star-triad&lang=en");
  await page.waitForFunction(
    () =>
      document.querySelector("#stage iframe") &&
      !document.querySelector("#enter-game").disabled,
  );
  const frame = page.frames().find((f) => f !== page.mainFrame());
  const entry = frame.url();
  const start = await frame.evaluate(() => performance.timeOrigin);
  await language("zh-CN");
  assert.equal(await page.locator("#game-title").innerText(), "星图三连");
  assert.equal(
    await frame.evaluate(() => performance.timeOrigin),
    start,
    "Language switch reloaded the game",
  );
  assert.equal(frame.url(), entry);
  await language("en");
  assert.equal(await page.locator("#game-title").innerText(), "Star Triad");
  await englishOnly();
  await page.screenshot({
    path: path.join(out, "english-player.png"),
    animations: "disabled",
  });
  await page.setViewportSize({ width: 390, height: 844 });
  await page
    .getByRole("button", { name: "More game options", exact: true })
    .click();
  await language("zh-CN");
  assert.equal(await page.locator("#continue").innerText(), "继续游戏");
  await language("en");
  await page.getByRole("button", { name: "Close menu", exact: true }).click();
  assert.equal(await frame.evaluate(() => performance.timeOrigin), start);
  for (const pathname of [
    "/privacy.html",
    "/404.html",
    "/cases/star-letters/",
  ]) {
    await page.goto(base + pathname + "?lang=en");
    await page.waitForFunction(() => document.documentElement.lang === "en");
    await englishOnly();
    assert(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
      pathname + " overflow",
    );
  }
  await page.screenshot({
    path: path.join(out, "english-case-mobile.png"),
    animations: "disabled",
  });
  await page.goto(base + "/play.html?game=missing&lang=en");
  await page.waitForFunction(() => document.querySelector("#more").disabled);
  assert((await page.locator("#loading").innerText()).includes("not found"));
  // The header is hidden in the immersive phone player; use desktop for errors.
  await page.setViewportSize({ width: 1440, height: 900 });
  await language("zh-CN");
  assert((await page.locator("#loading").innerText()).includes("没有找到"));
  // Verify both dictionaries and page shells are available without the network.
  await page.goto(base + "/?lang=en");
  await settled();
  await page.evaluate(() => navigator.serviceWorker.ready);
  await page.waitForFunction(() => navigator.serviceWorker.controller !== null);
  await context.setOffline(true);
  await page.reload();
  await settled();
  assert.equal(await page.locator("html").getAttribute("lang"), "en");
  await language("zh-CN");
  assert.equal(await page.locator(".game-card").count(), gameCount);
  await page.goto(base + "/privacy.html?lang=en");
  await page.waitForFunction(() => document.documentElement.lang === "en");
  await englishOnly();
  await context.setOffline(false);
  const blocked = await context.browser().newContext({ locale: "en-GB" });
  await blocked.addInitScript(() => {
    Object.defineProperty(window, "localStorage", {
      get() {
        throw new DOMException("Blocked", "SecurityError");
      },
    });
  });
  const denied = await blocked.newPage();
  await denied.goto(base + "/?lang=en");
  await denied.waitForFunction(
    () => document.querySelector("#games").dataset.state === "ready",
  );
  await denied.locator("[data-language-select]").first().selectOption("zh-CN");
  assert.equal(await denied.locator("html").getAttribute("lang"), "zh-CN");
  await denied.close();
  await blocked.close();
  assert.deepEqual(errors, []);
  const report = {
    passed: true,
    base,
    gameCount,
    viewports,
    checks: [
      "browser language",
      "explicit URL preference",
      "persistent manual preference",
      "blocked storage fallback",
      "cross-language search",
      "favorite and filter preservation",
      "English remix prompt",
      "player iframe preserved",
      "mobile player language menu",
      "privacy, case and 404 translation",
      "offline language switching",
    ],
    errors,
  };
  await fs.writeFile(
    path.join(out, "browser-verification.json"),
    JSON.stringify(report, null, 2) + "\n",
  );
  console.log(JSON.stringify(report, null, 2));
} finally {
  await context?.close();
  await fs.rm(profile, { recursive: true, force: true });
}
