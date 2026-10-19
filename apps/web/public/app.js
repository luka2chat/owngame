import { track, gameParams, selectGame, eventId, safeSearch } from "./analytics.js";
import { openRemix } from "./remix.js";
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
} from "./data.js";
let games = [],
  view = "all",
  query = "",
  ready = new Set(),
  favorites = new Set(getStore("favorites", [])),
  recent = getStore("recent", {});
const busy = new Set();
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
let searchTimer, searchContext = {}, lastSearchKey = '', visibleCount = 0;
const seenImpressions = new Set();
const impressionObserver = new IntersectionObserver(entries => {
  for (const entry of entries) {
    if (!entry.isIntersecting || entry.intersectionRatio < .5 || document.visibilityState !== 'visible') continue;
    const {game, position} = entry.target.analyticsItem;
    const key = [game.id, view, query].join('|');
    if (query && !searchContext.search_id) continue;
    if (!seenImpressions.has(key) && track('game_impression', {...gameParams(game), ...searchContext, filter:view, position})) seenImpressions.add(key);
  }
}, {threshold:.5});
function recordSearch() {
  clearTimeout(searchTimer);
  if (!catalogLoaded || !query) return;
  const key = view + '|' + query;
  if (key === lastSearchKey) return;
  const term = safeSearch(query);
  searchContext = {search_id:eventId(), search_status:term ? 'recorded' : 'redacted', ...(term ? {search_term:term} : {}), result_count:visibleCount};
  if (track('view_search_results', {...searchContext, filter:view})) lastSearchKey=key;
  document.querySelectorAll('.game-card').forEach(card=>{impressionObserver.unobserve(card);impressionObserver.observe(card);});
}
function selection(g, entry_point, position) {
  recordSearch();
  selectGame(g, {...searchContext, has_search:query ? 1 : 0, filter:view, entry_point, position});
}
function select(id) {
  recordSearch();
  track('filter_select', {filter:id, has_search:query ? 1 : 0});
  searchContext={}; lastSearchKey='';
  view = id;
  render();
  if (query) searchTimer=setTimeout(recordSearch,1500);
}
function render() {
  const nav = $("nav");
  nav.replaceChildren();
  views.forEach(([id, mark, name], i) => {
    if (i === 4) nav.append(element("div", "nav-label", "按喜好挑选"));
    const b = element("button", "nav-button" + (view === id ? " active" : ""));
    b.dataset.view = id;
    b.setAttribute("aria-pressed", String(view === id));
    b.append(element("span", "symbol", mark), element("span", "", name));
    b.onclick = () => select(id);
    nav.append(b);
  });
  if (!catalogLoaded) return;
  let list = games.filter(
    (g) =>
      (view === "all" ||
        view === g.category ||
        (view === "favorites" && favorites.has(g.id)) ||
        (view === "recent" && recent[g.id]) ||
        (view === "offline" && ready.has(g.id))) &&
      (!query || (g.title + " " + g.description).toLowerCase().includes(query)),
  );
  if (view === "recent") list.sort((a, b) => recent[b.id] - recent[a.id]);
  $("section-title").textContent = query
    ? "找到的游戏"
    : view === "all"
      ? "挑一款，开始快乐"
      : views.find((v) => v[0] === view)[2];
  $("count").textContent = list.length + " 款游戏";
  const grid = $("games");
  visibleCount=list.length;
  impressionObserver.disconnect();
  grid.replaceChildren();
  if (!list.length) {
    const box = element("div", "empty");
    box.append(
      element(
        "h2",
        "",
        view === "favorites" ? "把喜欢的游戏留在这里" : "这份快乐，还在路上",
      ),
      element(
        "p",
        "",
        view === "offline"
          ? "下载完成的游戏会出现在这里。"
          : query
            ? "换个名字搜搜，或看看全部游戏。"
            : "先看看已经准备好的游戏吧。",
      ),
    );
    const b = element("button", "", "看看全部游戏");
    b.onclick = () => {
      $("search").value = "";
      query = "";
      select("all");
    };
    box.append(b);
    grid.append(box);
    return;
  }
  for (const [index, g] of list.entries()) {
    const card = element("article", "game-card " + g.art);
    const cover = element("a", "cover");
    cover.href = playUrl(g);
    cover.onclick = () => selection(g, "cover", index+1);
    cover.onauxclick = e => { if(e.button===1) selection(g,"cover",index+1); };
    cover.setAttribute("aria-label", "开始游戏：" + g.title);
    cover.append(art(g, {priority:index < 2}));
    const image = cover.querySelector('.board-cover');
    if (image && !(image.complete && image.naturalWidth > 0)) {
      cover.classList.add('cover-pending');
      const placeholder = element('span', 'cover-placeholder');
      placeholder.setAttribute('aria-hidden', 'true');
      placeholder.append(element('span', 'loading-mark', '✷'), element('span', '', '封面加载中'));
      cover.append(placeholder);
      image.addEventListener('load', () => { cover.classList.remove('cover-pending'); placeholder.remove(); }, {once:true});
      const failed = () => { cover.classList.add('cover-failed'); placeholder.textContent = '封面暂未加载 · 仍可开玩'; };
      image.addEventListener('error', failed, {once:true});
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
      (favorites.has(g.id) ? "取消收藏：" : "收藏：") + g.title,
    );
    fav.onclick = () => {
      favorites.has(g.id) ? favorites.delete(g.id) : favorites.add(g.id);
      const saved=setStore("favorites", [...favorites]);
      track("favorite_change", {...gameParams(g), is_favorite:Number(favorites.has(g.id)), storage_saved:Number(saved), entry_point:"gallery"});
      if (!saved) toast("浏览器未允许保存收藏");
      render();
    };
    title.append(element("h3", "", g.title), fav);
    copy.append(title, element("p", "", g.description));
    const foot = element("div", "card-foot"),
      play = element("a", "play-link", "开玩 ▶");
    play.href = playUrl(g);
    play.onclick = () => selection(g, "play_button", index+1);
    play.onauxclick = e => { if(e.button===1) selection(g,"play_button",index+1); };
    const dl = element(
      "button",
      "download",
      ready.has(g.id)
        ? "✓ 已下载 · 离线可玩"
        : "↓ 下载离线包 · " + (g.bytes / 1048576).toFixed(1) + " MB",
    );
    dl.dataset.downloadGame = g.id;
    dl.disabled = busy.has(g.id);
    dl.onclick = async () => {
      if (ready.has(g.id)) {
        track("download_cached", {...gameParams(g), entry_point:"gallery"});
        toast("已下载完成，可在当前浏览器离线打开");
        return;
      }
      busy.add(g.id);
      dl.disabled = true;
      try {
        await download(g, (n) => (dl.textContent = "正在下载 " + n + "%"));
        ready.add(g.id);
        toast("已下载 " + g.title + "，离线也能玩");
      } catch (e) {
        toast(e.message);
      } finally {
        busy.delete(g.id);
        render();
      }
    };
    const remix = element("button", "card-remix", "↻ 复刻");
    remix.type = "button";
    remix.setAttribute("aria-label", "复刻 " + g.title + "，复制给 AI");
    remix.onclick = () => openRemix(g);
    foot.append(play, dl, remix);
    copy.append(foot);
    card.append(cover, copy);
    grid.append(card);
    card.analyticsItem={game:g,position:index+1};
    impressionObserver.observe(card);
  }
}
$("search").oninput = (e) => {
  const previous=query;
  query = e.target.value.trim().toLowerCase();
  if (query !== previous) { searchContext={}; lastSearchKey=''; }
  clearTimeout(searchTimer);
  render();
  if (!query && previous) track('search_clear');
  if (query && !e.isComposing) searchTimer=setTimeout(recordSearch,1500);
};
$("search").addEventListener('compositionend',()=>{clearTimeout(searchTimer);searchTimer=setTimeout(recordSearch,1500);});
$("search").addEventListener('keydown',e=>{if(e.key==='Enter' && !e.isComposing) recordSearch();});
$("search").addEventListener('blur',recordSearch);
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
$("offline-help").onclick = () => { track("offline_help"); $("info").showModal(); };
document
  .querySelectorAll(".dialog-close")
  .forEach((b) => (b.onclick = () => $("info").close()));
let installEvent;
window.addEventListener("beforeinstallprompt", (e) => {
  e.preventDefault();
  installEvent = e;
  $("install").hidden = false;
});
$("install").onclick = async () => {
  if (installEvent) {
    track("install_prompt");
    await installEvent.prompt();
    const choice=await installEvent.userChoice;
    track("install_choice", {outcome:choice.outcome});
    installEvent = null;
    $("install").hidden = true;
  }
};
window.addEventListener("storage", () => {
  favorites = new Set(getStore("favorites", []));
  recent = getStore("recent", {});
  render();
});
{
  const params = new URLSearchParams(location.search);
  if (views.some(([id]) => id === params.get("view"))) view = params.get("view");
  query = (params.get("q") || "").trim().toLowerCase();
  $("search").value = params.get("q") || "";
}
render();
try {
  const loadedAt=performance.now();
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 20000);
  try { games = await catalog({signal:controller.signal}); }
  finally { clearTimeout(timeout); }
  catalogLoaded = true;
  $("games").dataset.state = 'ready';
  $("games").setAttribute('aria-busy', 'false');
  $("catalog-status").hidden = true;
  window.dispatchEvent(new Event('owngame:catalog-settled'));
  track("catalog_ready", {game_count:games.length,duration_ms:performance.now()-loadedAt});
  render();
  if(query) searchTimer=setTimeout(recordSearch,1500);
  // Cache storage can be slow/unavailable; it must never block the game cards.
  Promise.allSettled(
    games.map(async (g) => {
      if (await offlineReady(g)) {
        ready.add(g.id);
        const button = document.querySelector('[data-download-game="'+g.id+'"]');
        if (button && !busy.has(g.id)) button.textContent = '✓ 已下载 · 离线可玩';
      }
    }),
  ).then(() => { if (view === 'offline') render(); });
  serviceWorker().catch(() => {});
} catch (e) {
  $("games").dataset.state = 'error';
  $("games").setAttribute('aria-busy', 'false');
  window.dispatchEvent(new Event('owngame:catalog-settled'));
  track("catalog_error", {error_type:"catalog_unavailable"});
  $("catalog-message").textContent = navigator.onLine ? '游戏库暂时没加载出来，请重试。' : '网络已断开，连接后再试试。';
  $("catalog-retry").hidden = false;
  $("games").classList.add('catalog-failed');
}
