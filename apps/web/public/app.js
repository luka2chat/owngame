import { t, localizeGame, matchesGame } from "./i18n.js";
import {
  track,
  gameParams,
  selectGame,
  eventId,
  safeSearch,
} from "./analytics.js";
import { openRemix } from "./remix.js";
import { supportsPlatform, devicePlatform, platformLabel, platformNotice } from "./platforms.js";
import {
  $,
  element,
  art,
  catalog,
  getStore,
  setStore,
  toast,
  playUrl,
  offlineReady,
  download,
  serviceWorker,
  currentPlatform,
} from "./data.js";
let platform = currentPlatform();
let games = [],
  view = "all",
  query = "",
  ready = new Set(),
  favorites = new Set(getStore("favorites", [])),
  recent = getStore("recent", {});
const busy = new Set();
const downloadProgress = new Map();
let catalogLoaded = false;
const views = [
  ["all", "▦", "全部游戏"],
  ["favorites", "☆", "我的收藏"],
  ["recent", "◷", "最近玩过"],
  ["offline", "↓", "离线游戏"],
  ["益智", "✦", "益智"],
  ["街机", "↝", "街机"],
  ["竞速", "↗", "竞速"],
  ["冒险", "⚑", "冒险"],
  ["模拟", "⌂", "模拟"],
  ["射击", "◎", "射击"],
];
let searchTimer,
  searchContext = {},
  lastSearchKey = "",
  visibleCount = 0;
const seenImpressions = new Set();
const deferredArt = new WeakMap();
const artworkObserver = new IntersectionObserver((entries) => {
  for (const entry of entries) {
    if (!entry.isIntersecting) continue;
    const game = deferredArt.get(entry.target);
    if (game) entry.target.replaceWith(art(game));
    deferredArt.delete(entry.target);
    artworkObserver.unobserve(entry.target);
  }
}, { rootMargin: "200px" });
const impressionObserver = new IntersectionObserver(
  (entries) => {
    for (const entry of entries) {
      if (
        !entry.isIntersecting ||
        entry.intersectionRatio < 0.5 ||
        document.visibilityState !== "visible"
      )
        continue;
      const { game, position } = entry.target.analyticsItem;
      const key = [game.id, view, query].join("|");
      if (query && !searchContext.search_id) continue;
      if (
        !seenImpressions.has(key) &&
        track("game_impression", {
          ...gameParams(game),
          ...searchContext,
          filter: view,
          position,
        })
      )
        seenImpressions.add(key);
    }
  },
  { threshold: 0.5 },
);
function recordSearch() {
  clearTimeout(searchTimer);
  if (!catalogLoaded || !query) return;
  const key = view + "|" + query;
  if (key === lastSearchKey) return;
  const term = safeSearch(query);
  searchContext = {
    search_id: eventId(),
    search_status: term ? "recorded" : "redacted",
    ...(term ? { search_term: term } : {}),
    result_count: visibleCount,
  };
  if (track("view_search_results", { ...searchContext, filter: view }))
    lastSearchKey = key;
  document.querySelectorAll(".game-card").forEach((card) => {
    impressionObserver.unobserve(card);
    impressionObserver.observe(card);
  });
}
function selection(raw, entry_point, position) {
  recordSearch();
  selectGame(raw, {
    ...searchContext,
    has_search: query ? 1 : 0,
    filter: view,
    entry_point,
    position,
  });
}
function select(id) {
  recordSearch();
  track("filter_select", { filter: id, has_search: query ? 1 : 0 });
  searchContext = {};
  lastSearchKey = "";
  view = id;
  render();
  if (query) searchTimer = setTimeout(recordSearch, 1500);
}
function render() {
  document.querySelectorAll("[data-platform]").forEach((button) => {
    button.setAttribute("aria-pressed", String(button.dataset.platform === platform));
  });
  artworkObserver.disconnect();
  const nav = $("nav");
  nav.replaceChildren();
  views.forEach(([id, mark, name], i) => {
    if (i === 4) nav.append(element("div", "nav-label", t("按喜好挑选")));
    const b = element("button", "nav-button" + (view === id ? " active" : ""));
    b.dataset.view = id;
    b.setAttribute("aria-pressed", String(view === id));
    b.append(element("span", "symbol", mark), element("span", "", t(name)));
    b.onclick = () => select(id);
    nav.append(b);
  });
  if (!catalogLoaded) return;
  let list = games.filter(
    (g) =>
      supportsPlatform(g, platform) &&
      (view === "all" ||
        view === g.category ||
        (view === "favorites" && favorites.has(g.id)) ||
        (view === "recent" && recent[g.id]) ||
        (view === "offline" && ready.has(g.id))) &&
      (!query || matchesGame(g, query)),
  );
  if (view === "recent") list.sort((a, b) => recent[b.id] - recent[a.id]);
  $("section-title").textContent = query
    ? t("找到的游戏")
    : view === "all"
      ? t("挑一款，开始快乐")
      : t(views.find((v) => v[0] === view)[2]);
  $("count").textContent = t("{count} 款游戏", { count: list.length });
  const grid = $("games");
  visibleCount = list.length;
  impressionObserver.disconnect();
  grid.replaceChildren();
  if (!list.length) {
    const box = element("div", "empty");
    box.append(
      element(
        "h2",
        "",
        view === "favorites"
          ? t("把喜欢的游戏留在这里")
          : t("这份快乐，还在路上"),
      ),
      element(
        "p",
        "",
        view === "offline"
          ? t("下载完成的游戏会出现在这里。")
          : query
            ? t("换个名字搜搜，或看看全部游戏。")
            : t("先看看已经准备好的游戏吧。"),
      ),
    );
    const b = element("button", "", t("看看全部游戏"));
    b.onclick = () => {
      $("search").value = "";
      query = "";
      select("all");
    };
    box.append(b);
    grid.append(box);
    return;
  }
  for (const [index, raw] of list.entries()) {
    const g = localizeGame(raw);
    const card = element("article", "game-card " + g.art);
    const cover = element("a", "cover");
    cover.href = playUrl(g);
    cover.onclick = () => selection(raw, "cover", index + 1);
    cover.onauxclick = (e) => {
      if (e.button === 1) selection(raw, "cover", index + 1);
    };
    cover.setAttribute(
      "aria-label",
      t("开始游戏：{title}", { title: g.title }),
    );
    // Layered CSS art otherwise downloads its textures even far below the fold.
    if (!g.cover && index >= 2) {
      const placeholder = element("div", "art");
      deferredArt.set(placeholder, g);
      cover.append(placeholder);
      artworkObserver.observe(placeholder);
    } else cover.append(art(g, { priority: index < 2 }));
    const image = cover.querySelector(".board-cover");
    if (image && !(image.complete && image.naturalWidth > 0)) {
      cover.classList.add("cover-pending");
      const placeholder = element("span", "cover-placeholder");
      placeholder.setAttribute("aria-hidden", "true");
      placeholder.append(
        element("span", "loading-mark", "✷"),
        element("span", "", t("封面加载中")),
      );
      cover.append(placeholder);
      image.addEventListener(
        "load",
        () => {
          cover.classList.remove("cover-pending");
          placeholder.remove();
        },
        { once: true },
      );
      const failed = () => {
        cover.classList.add("cover-failed");
        placeholder.textContent = t("封面暂未加载 · 仍可开玩");
      };
      image.addEventListener("error", failed, { once: true });
      if (image.complete && !image.naturalWidth) failed();
    }
    const label = element("div", "cover-label", g.title);
    label.append(element("small", "", g.subtitle));
    if (!g.coverTitleBaked) cover.append(label);
    if (!g.coverTitleBaked) cover.append(element("span", "genre-tag", g.tag));
    const copy = element("div", "card-info"),
      title = element("div", "title-line"),
      fav = element("button", "favorite", favorites.has(g.id) ? "★" : "☆");
    fav.setAttribute("aria-pressed", String(favorites.has(g.id)));
    fav.setAttribute(
      "aria-label",
      t(favorites.has(g.id) ? "取消收藏：{title}" : "收藏：{title}", {
        title: g.title,
      }),
    );
    fav.onclick = () => {
      favorites.has(g.id) ? favorites.delete(g.id) : favorites.add(g.id);
      const saved = setStore("favorites", [...favorites]);
      track("favorite_change", {
        ...gameParams(raw),
        is_favorite: Number(favorites.has(g.id)),
        storage_saved: Number(saved),
        entry_point: "gallery",
      });
      if (!saved) toast(t("浏览器未允许保存收藏"));
      render();
    };
    title.append(element("h3", "", g.title), fav);
    copy.append(title, element("small", "platform-label", t(platformLabel(g))), element("p", "", g.description));
    const foot = element("div", "card-foot"),
      play = element("a", "play-link", t("开玩 ▶"));
    play.href = playUrl(g);
    play.onclick = () => selection(raw, "play_button", index + 1);
    play.onauxclick = (e) => {
      if (e.button === 1) selection(raw, "play_button", index + 1);
    };
    const dl = element(
      "button",
      "download",
      ready.has(g.id)
        ? t("✓ 已下载 · 离线可玩")
        : busy.has(g.id)
          ? t("正在下载 {percent}%", {
              percent: downloadProgress.get(g.id) || 0,
            })
          : t("↓ 下载离线包 · {size} MB", {
              size: (g.bytes / 1048576).toFixed(1),
            }),
    );
    dl.dataset.downloadGame = g.id;
    dl.disabled = busy.has(g.id) || !supportsPlatform(g, devicePlatform());
    if (!supportsPlatform(g, devicePlatform())) dl.textContent = t(platformNotice(g));
    dl.onclick = async () => {
      if (ready.has(g.id)) {
        track("download_cached", {
          ...gameParams(raw),
          entry_point: "gallery",
        });
        toast(t("已下载完成，可在当前浏览器离线打开"));
        return;
      }
      busy.add(g.id);
      dl.disabled = true;
      try {
        await download(raw, (n) => {
          downloadProgress.set(g.id, n);
          const button = document.querySelector(
            '[data-download-game="' + g.id + '"]',
          );
          if (button)
            button.textContent = t("正在下载 {percent}%", { percent: n });
        });
        ready.add(g.id);
        toast(
          t("已下载 {title}，离线也能玩", { title: localizeGame(raw).title }),
        );
      } catch (e) {
        toast(e.message);
      } finally {
        busy.delete(g.id);
        downloadProgress.delete(g.id);
        render();
      }
    };
    const remix = element("button", "card-remix", t("↻ 复刻"));
    remix.type = "button";
    remix.setAttribute(
      "aria-label",
      t("复刻 {title}，复制给 AI", { title: g.title }),
    );
    remix.onclick = () => openRemix(raw);
    foot.append(play, dl, remix);
    copy.append(foot);
    card.append(cover, copy);
    grid.append(card);
    card.analyticsItem = { game: raw, position: index + 1 };
    impressionObserver.observe(card);
  }
}
document.querySelectorAll("[data-platform]").forEach((button) => {
  button.onclick = () => {
    recordSearch();
    platform = button.dataset.platform;
    setStore("platform", platform);
    const url = new URL(location.href);
    url.searchParams.set("platform", platform);
    history.replaceState(null, "", url);
    searchContext = {};
    lastSearchKey = "";
    render();
    if (query) searchTimer = setTimeout(recordSearch, 1500);
  };
});
$("search").oninput = (e) => {
  const previous = query;
  query = e.target.value.trim().toLowerCase();
  if (query !== previous) {
    searchContext = {};
    lastSearchKey = "";
  }
  clearTimeout(searchTimer);
  render();
  if (!query && previous) track("search_clear");
  if (query && !e.isComposing) searchTimer = setTimeout(recordSearch, 1500);
};
$("search").addEventListener("compositionend", () => {
  clearTimeout(searchTimer);
  searchTimer = setTimeout(recordSearch, 1500);
});
$("search").addEventListener("keydown", (e) => {
  if (e.key === "Enter" && !e.isComposing) recordSearch();
});
$("search").addEventListener("blur", recordSearch);
document.querySelector(".top-mine").onclick = () => select("favorites");
document.addEventListener("keydown", (e) => {
  if (
    e.key === "/" &&
    !["INPUT", "TEXTAREA"].includes(document.activeElement.tagName)
  ) {
    e.preventDefault();
    $("search").focus();
  }
});
window.addEventListener("storage", () => {
  favorites = new Set(getStore("favorites", []));
  recent = getStore("recent", {});
  render();
});
{
  const params = new URLSearchParams(location.search);
  if (views.some(([id]) => id === params.get("view")))
    view = params.get("view");
  query = (params.get("q") || "").trim().toLowerCase();
  $("search").value = params.get("q") || "";
}
window.addEventListener("owngame:languagechange", () => {
  render();
  if (document.querySelector("#games").dataset.state === "error")
    document.querySelector("#catalog-message").textContent = t(
      navigator.onLine
        ? "游戏库暂时没加载出来，请重试。"
        : "网络已断开，连接后再试试。",
    );
});
render();
try {
  const loadedAt = performance.now();
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 20000);
  try {
    games = await catalog({ signal: controller.signal });
  } finally {
    clearTimeout(timeout);
  }
  catalogLoaded = true;
  $("games").dataset.state = "ready";
  $("games").setAttribute("aria-busy", "false");
  $("catalog-status").hidden = true;
  window.dispatchEvent(new Event("owngame:catalog-settled"));
  track("catalog_ready", {
    game_count: games.length,
    duration_ms: performance.now() - loadedAt,
  });
  render();
  if (query) searchTimer = setTimeout(recordSearch, 1500);
  // Cache storage can be slow/unavailable; it must never block the game cards.
  Promise.allSettled(
    games.map(async (g) => {
      if (await offlineReady(g)) {
        ready.add(g.id);
        const button = document.querySelector(
          '[data-download-game="' + g.id + '"]',
        );
        if (button && !busy.has(g.id))
          button.textContent = t("✓ 已下载 · 离线可玩");
      }
    }),
  ).then(() => {
    if (view === "offline") render();
  });
  serviceWorker().catch(() => {});
} catch (e) {
  $("games").dataset.state = "error";
  $("games").setAttribute("aria-busy", "false");
  window.dispatchEvent(new Event("owngame:catalog-settled"));
  track("catalog_error", { error_type: "catalog_unavailable" });
  $("catalog-message").textContent = t(
    navigator.onLine
      ? "游戏库暂时没加载出来，请重试。"
      : "网络已断开，连接后再试试。",
  );
  $("catalog-retry").hidden = false;
  $("games").classList.add("catalog-failed");
}
