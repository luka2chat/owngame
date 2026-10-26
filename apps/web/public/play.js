import { t, localizeGame, localizeUrl } from "./i18n.js";
import { track, gameParams, selectGame, setPageGame } from "./analytics.js";
import { openRemix } from "./remix.js";
import { openBlueprint } from "./blueprint.js";
import { supportsPlatform, platformLabel, playerPresentation, playerSandbox, needsComputer, sourceLinkDestination } from "./platforms.js";
import {
  $,
  catalog,
  getStore,
  setStore,
  toast,
  playUrl,
  download,
  offlineReady,
  serviceWorker,
  element,
  art,
} from "./data.js";
const query = new URLSearchParams(location.search);
const id = query.get("game");
function fullscreenUrl() {
  const url = new URL(playUrl(game), location.origin);
  url.searchParams.set("fullscreen", "");
  return url.pathname + url.search;
}
let game,
  allGames = [],
  loadError,
  frame,
  favorites = new Set(getStore("favorites", [])),
  ready = false,
  busy = false,
  downloadPercent = 0,
  downloadFailed = false;
function renderComputerNotice() {
  document.getElementById("computer-notice")?.remove();
  if (!needsComputer(game)) return;
  const notice = element("section", "computer-notice");
  notice.id = "computer-notice";
  const cover = element("div", "computer-cover");
  cover.append(art(game, {priority:true}));
  const coverImage = cover.querySelector("img");
  if (coverImage) coverImage.sizes = "(max-width:760px) calc(100vw - 76px), 680px";
  const heading = element("h2", "", t("请在电脑上游玩"));
  heading.id = "computer-notice-title";
  notice.setAttribute("aria-labelledby", heading.id);
  const copy = element("button", "player-button primary-action", t("复制链接，到电脑玩"));
  copy.id = "copy-computer-link";
  const fallback = element("input", "computer-link");
  fallback.readOnly = true;
  fallback.hidden = true;
  fallback.setAttribute("aria-label", t("游戏链接"));
  fallback.value = new URL(playUrl(game), location.origin).href;
  copy.onclick = async () => {
    try {
      await navigator.clipboard.writeText(fallback.value);
      toast(t("链接已复制，在电脑浏览器打开即可"));
    } catch {
      fallback.hidden = false;
      fallback.focus();fallback.select();
      toast(t("长按或选中下方链接即可复制"));
    }
  };
  const mobile = element("a", "computer-mobile-link", t("看看手机游戏"));
  mobile.href = localizeUrl("/?platform=mobile");
  notice.append(cover, heading, element("p", "", t("这款游戏需要电脑和键盘鼠标。把链接发到电脑，打开就能玩。")), copy, fallback, mobile);
  $("game-description").after(notice);
}
function updateDownloadCopy() {
  $("download").disabled = busy;
  $("menu-download").disabled = busy;
  $("download").textContent = busy
    ? t("下载中 {percent}%", { percent: downloadPercent })
    : ready
      ? t("✓ 已下载 · 离线可玩")
      : downloadFailed
        ? t("↓ 重试下载")
        : t("↓ 下载离线包");
  $("menu-download").textContent = ready
    ? t("✓ 已下载")
    : busy
      ? t("下载中 {percent}%", { percent: downloadPercent })
      : t("下载离线包");

}
function updateFavorite() {
  const text = favorites.has(game.id)
    ? t("★ 已收藏 · 取消收藏")
    : t("☆ 收藏游戏");
  $("favorite").textContent = text;
  $("menu-favorite").textContent = text;
  $("favorite").setAttribute("aria-pressed", String(favorites.has(game.id)));
}
function renderDetails(all) {
  const display = localizeGame(game);
  document.querySelector(".game-source-links")?.remove();
  $("keyboard-help").replaceChildren();
  $("recommend-games").replaceChildren();
  $("breadcrumb-title").textContent = display.title;
  $("stage-title").textContent = display.title;
  $("game-category").textContent = t(game.category);
  $("game-category").href = localizeUrl(
    "/?view=" + encodeURIComponent(game.category),
  );
  $("game-subtitle").textContent = display.subtitle + " · " + t(game.category) + " · " + t(platformLabel(game));
  if (game.caseUrl || game.sourceUrl) {
    const links = element("p", "game-source-links");
    for (const [url, label] of [
      [game.caseUrl, "制作案例"],
      [game.sourceUrl, "游戏源码 ↗"],
    ]) {
      if (!url) continue;
      const link = element("a", "", t(label));
      link.href = localizeUrl(url);
      if (url.startsWith("https://")) {
        link.target = "_blank";
        link.rel = "noopener";
      }
      links.append(link, "　");
    }
    $("game-description").after(links);
  }
  if (game.id === "neon-shooter") {
    for (const [keys, description] of [
      [["↑", "↓", "←", "→", "/", "W", "A", "S", "D"], "上下左右移动战机"],
      [null, "拖动战机上下左右移动"],
      [["Esc"], "暂停或继续"],
    ]) {
      const row = element("div"),
        term = element("dt"),
        detail = element("dd", "", t(description));
      if (keys)
        keys.forEach((key) => {
          term.append(element("kbd", "", t(key)), " ");
        });
      else term.textContent = t("鼠标拖动");
      row.append(term, detail);
      $("keyboard-help").append(row);
    }
    $("keyboard-help").hidden = false;
    $("keyboard-help").append(element("p", "", t("战斗中持续自动开火")));
  }
  if (game.id === "faune-dungeon") {
    for (const [keys, description] of [
      [["↑", "↓", "←", "→", "/", "W", "A", "S", "D"], "上下左右移动角色"],
      [null, "按住摇杆持续移动，松手停下"],
      [["Esc"], "暂停或继续"],
    ]) {
      const row = element("div"), term = element("dt"), detail = element("dd", "", t(description));
      if (keys) keys.forEach((key) => term.append(element("kbd", "", key), " "));
      else term.textContent = t("鼠标拖动");
      row.append(term, detail);
      $("keyboard-help").append(row);
    }
    $("keyboard-help").hidden = false;
    $("keyboard-help").append(element("p", "", t("自动投飞刀，靠近宝箱自动打开")));
  }
  renderComputerNotice();
  const others = all.filter((g) => g.id !== game.id && supportsPlatform(g, needsComputer(game) || supportsPlatform(game, "mobile") ? "mobile" : "pc"));
  // Prefer related games, then offer other worlds from the existing catalog.
  others.sort(
    (a, b) =>
      Number(b.category === game.category) -
      Number(a.category === game.category),
  );
  const selected = others.slice(0, 3);
  for (const g of selected) {
    const link = element("a", "recommend-game");
    link.href = playUrl(g);
    link.onclick = () =>
      selectGame(g, {
        entry_point: "recommendation",
        position: selected.indexOf(g) + 1,
      });
    const cover = element("div", "recommend-art");
    cover.append(art(g));
    const copy = element("span", "recommend-copy");
    copy.append(
      element("b", "", localizeGame(g).title),
      element("small", "", t(g.category)),
    );
    const arrow = element("strong", "recommend-arrow", "↗");
    arrow.setAttribute("aria-hidden", "true");
    link.append(cover, copy, arrow);
    $("recommend-games").append(link);
  }
  document.querySelector(".player-recommend").hidden = !selected.length;
}
function toggleFavorite() {
  favorites.has(game.id) ? favorites.delete(game.id) : favorites.add(game.id);
  const saved = setStore("favorites", [...favorites]);
  track("favorite_change", {
    is_favorite: Number(favorites.has(game.id)),
    storage_saved: Number(saved),
    entry_point: "player",
  });
  updateFavorite();
}
async function downloadGame() {
  if (busy || needsComputer(game)) return;
  if (ready) {
    track("download_cached");
    toast(t("游戏已下载，可在当前浏览器离线玩"));
    return;
  }
  busy = true;
  downloadPercent = 0;
  downloadFailed = false;
  updateDownloadCopy();
  $("menu").close();
  try {
    await download(game, (n) => {
      downloadPercent = n;
      $("download").textContent = t("下载中 {percent}%", { percent: n });
      toast(t("下载中 {percent}%", { percent: n }));
    });
    ready = true;
    $("download").textContent = t("✓ 已下载 · 离线可玩");
    $("menu-download").textContent = t("✓ 已下载");
    toast(t("下载完成，离线也能玩"));
  } catch (e) {
    downloadFailed = true;
    toast(e.message);
    $("download").textContent = t("↓ 重试下载");
  } finally {
    busy = false;
    updateDownloadCopy();
  }
}
async function fullscreen() {
  try {
    if (document.fullscreenElement) await document.exitFullscreen();
    else await document.body.requestFullscreen();
    track("player_fullscreen", {
      outcome: document.fullscreenElement ? "entered" : "exited",
    });
  } catch {
    track("player_fullscreen", { outcome: "failed" });
    toast(t("当前浏览器不支持此全屏模式"));
  }
}
function wire() {
  document.title = localizeGame(game).title + " · owngame";
  $("game-title").textContent = localizeGame(game).title;
  $("menu-title").textContent = localizeGame(game).title;
  $("game-description").textContent = localizeGame(game).description;
  $("instructions").textContent = localizeGame(game).instructions;
  $("new-window").href = fullscreenUrl();
  $("remix").disabled = false;
  $("remix").onclick = () => openRemix(game);
  $("blueprint").disabled = false;
  $("blueprint").onclick = () => openBlueprint(game);
  $("menu-blueprint").onclick = () => { $("menu").close(); openBlueprint(game); };
  $("menu-remix").onclick = () => {
    $("menu").close();
    openRemix(game);
  };
  $("favorite").disabled = false;
  $("download").disabled = false;
  $("enter-game").onclick = () => {
    track("player_focus");
    $("stage").scrollIntoView({
      behavior: matchMedia("(prefers-reduced-motion: reduce)").matches
        ? "instant"
        : "smooth",
      block: "center",
    });
    frame.focus();
  };
  $("favorite").onclick = toggleFavorite;
  $("menu-favorite").onclick = toggleFavorite;
  $("download").onclick = downloadGame;
  $("menu-download").onclick = downloadGame;
  $("fullscreen").onclick = fullscreen;
  $("menu-fullscreen").onclick = () => {
    $("menu").close();
    fullscreen();
  };
  $("menu-new-window").onclick = () => {
    window.open(fullscreenUrl(), "_blank", "noopener");
    $("menu").close();
  };
  $("more").onclick = () => $("menu").showModal();
  $("continue").onclick = () => $("menu").close();
  document.querySelector(".dialog-close").onclick = () => $("menu").close();
  $("restart").onclick = () => {
    $("menu").close();
    $("confirm").showModal();
  };
  $("cancel-restart").onclick = () => $("confirm").close();
  $("confirm-restart").onclick = () => {
    track("player_restart");
    frame.src = game.entry;
    $("confirm").close();
  };
  updateFavorite();
}
try {
  const all = await catalog();
  allGames = all;
  game = all.find((g) => g.id === id);
  if (!game) throw new Error("没有找到这款游戏，请回游戏库重新选择。");
  document.body.classList.toggle("desktop-required", needsComputer(game));
  document.body.classList.toggle("page-fullscreen", query.has("fullscreen") && !needsComputer(game));
  setPageGame(game);
  track("player_open");
  wire();
  renderDetails(all);
  if (!needsComputer(game)) {
  frame = document.createElement("iframe");
  frame.title = localizeGame(game).title;
  frame.allow = "autoplay; fullscreen";
  frame.setAttribute("sandbox", playerSandbox(game));
  const gameHeight =
    game.viewportHeight || (game.id === "signal-harbor" ? 800 : 1000);
  if (game.viewportHeight) document.body.classList.add("board-player");
  const presentation = playerPresentation(game);
  if (presentation.wide) document.body.classList.add("landscape-player");
  $("stage").style.setProperty("--stage-ratio", "450 / " + gameHeight);
  frame.style.height = gameHeight + "px";
  if (game.id === "signal-harbor") document.body.classList.add("harbor-player");
  const responsive = presentation.responsive;
  if (responsive) document.body.classList.add("responsive-player");
  frame.src = game.entry;
  // Safe-area env() values are zero inside Chrome's iframe. Keep the full-size
  // background, and pass only the intersecting system insets to the foreground.
  const safeArea = $("player-safe-area");
  const syncSafeArea = () => {
    if (!responsive || !frame.contentDocument?.head) return;
    const rect = frame.getBoundingClientRect(),
      outer = safeArea.getBoundingClientRect();
    const css = getComputedStyle(safeArea);
    const insets = [
      Math.max(0, outer.top + parseFloat(css.paddingTop) - rect.top),
      Math.max(0, rect.right - outer.right + parseFloat(css.paddingRight)),
      Math.max(0, rect.bottom - outer.bottom + parseFloat(css.paddingBottom)),
      Math.max(0, outer.left + parseFloat(css.paddingLeft) - rect.left),
    ].map((n) => `${n}px`);
    const doc = frame.contentDocument;
    let style = doc.getElementById("owngame-player-insets");
    if (!style) {
      style = doc.createElement("style");
      style.id = "owngame-player-insets";
      doc.head.append(style);
    }
    const rule = `:root { --safe-top:${insets[0]}; --safe-right:${insets[1]}; --safe-bottom:${insets[2]}; --safe-left:${insets[3]}; }
      #viewport { inset:${insets.join(" ")} !important; }
      #safe-insets { padding:${insets.join(" ")} !important; }`;
    if (style.textContent !== rule) {
      style.textContent = rule;
      frame.contentWindow.dispatchEvent(
        new frame.contentWindow.Event("resize"),
      );
    }
  };
  const frameStart = performance.now();
  let loadNumber = 0;
  const loadTimeout = setTimeout(
    () => track("player_load_timeout", { duration_ms: 30000 }),
    30000,
  );
  frame.onload = () => {
    clearTimeout(loadTimeout);
    track("player_frame_loaded", {
      ...(loadNumber === 0
        ? { duration_ms: performance.now() - frameStart }
        : {}),
      load_number: ++loadNumber,
    });
    syncSafeArea();
    frame.contentDocument?.addEventListener("click", (event) => {
      if (!event.isTrusted || event.defaultPrevented) return;
      const href = sourceLinkDestination(event.target?.closest?.("a[href]")?.href, game);
      if (!href) return;
      event.preventDefault();
      window.open(href, "_blank", "noopener,noreferrer");
    });
    $("loading").hidden = true;
    $("enter-game").disabled = false;
  };
  frame.onerror = () => {
    clearTimeout(loadTimeout);
    track("player_error", { error_type: "frame_error" });
  };
  $("stage").append(frame);
  // Responsive games receive the real stage; legacy packages keep their original viewport.
  const resizeGame = () => {
    const stage = $("stage");
    if (responsive) {
      // This responsive game must receive the real viewport, including tall phones.
      const bounds = stage.getBoundingClientRect();
      frame.style.width = bounds.width + "px";
      frame.style.height = bounds.height + "px";
      frame.style.transform = "translate(-50%, -50%)";
    } else {
      const scale = Math.min(
        stage.clientWidth / 450,
        stage.clientHeight / gameHeight,
      );
      frame.style.transform = `translate(-50%, -50%) scale(${scale})`;
    }
    syncSafeArea();
  };
  new ResizeObserver(resizeGame).observe($("stage"));
  new ResizeObserver(syncSafeArea).observe(safeArea);
  document.addEventListener("fullscreenchange", () =>
    requestAnimationFrame(resizeGame),
  );
  resizeGame();
  const recent = getStore("recent", {});
  recent[id] = Date.now();
  setStore("recent", recent);
  ready = await offlineReady(game);
  updateDownloadCopy();
  }
  serviceWorker().catch(() => {});
} catch (e) {
  loadError = e;
  track("player_error", {
    error_type: game ? "player_initialization" : "game_unavailable",
  });
  $("loading").textContent = t(e.message);
  $("game-title").textContent = t("游戏暂时无法打开");
  $("more").disabled = true;
}
document.addEventListener("keydown", (e) => {
  if (
    e.key === "/" &&
    !["INPUT", "TEXTAREA"].includes(document.activeElement.tagName)
  ) {
    e.preventDefault();
    document.querySelector(".player-header input").focus();
  }
});
window.addEventListener("owngame:languagechange", () => {
  if (loadError) {
    $("loading").textContent = t(loadError.message);
    $("game-title").textContent = t("游戏暂时无法打开");
    return;
  }
  if (!game) return;
  document.title = localizeGame(game).title + " · owngame";
  $("game-title").textContent = localizeGame(game).title;
  $("menu-title").textContent = localizeGame(game).title;
  $("game-description").textContent = localizeGame(game).description;
  $("instructions").textContent = localizeGame(game).instructions;
  $("new-window").href = fullscreenUrl();
  if (frame) frame.title = localizeGame(game).title;
  renderDetails(allGames);
  updateFavorite();
  updateDownloadCopy();
});
window.addEventListener("storage", () => {
  favorites = new Set(getStore("favorites", []));
  if (game) updateFavorite();
});
