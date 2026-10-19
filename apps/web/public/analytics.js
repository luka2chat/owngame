import { measurementId, analyticsHosts } from "./analytics-config.js";
import {
  events,
  cleanParams,
  safeSearch,
  schemaVersion,
} from "./analytics-schema.js";
import { t } from "./i18n.js";
export { safeSearch };
const consentKey = "owngame:analytics-consent-v1";
const production =
  analyticsHosts.includes(location.hostname) &&
  /^G-[A-Z0-9]+$/.test(measurementId);
const disabledByBrowser =
  navigator.globalPrivacyControl === true || navigator.doNotTrack === "1";
// Site default is enabled. Persist only an explicit visitor choice, never an
// inferred opt-in; existing refusals and browser privacy signals take priority.
let consent = "granted";
try {
  const saved = localStorage.getItem(consentKey);
  if (saved === "granted" || saved === "denied") consent = saved;
} catch {}
let started = false,
  sequence = 0,
  pageGame,
  pageViewed = false,
  scriptFailed = false;
const startedAt = performance.now();
export const eventId = () => crypto.randomUUID();
const pageViewId = eventId();
const pageType = /^\/play(?:\.html)?\/?$/.test(location.pathname)
  ? "player"
  : "gallery";
let pageContext = {};
let consentStartedAt = consent === "granted" ? startedAt : Infinity;
export function gameParams(g) {
  return g
    ? {
        game_id: g.id,
        game_name: g.title,
        game_category: g.category,
        game_version: g.version,
      }
    : {};
}
function command() {
  window.dataLayer.push(arguments);
}
function allowed() {
  return (
    production && !disabledByBrowser && consent === "granted" && !scriptFailed
  );
}
function safeLocation() {
  return (
    location.origin +
    (pageType === "player"
      ? "/play" + (pageGame ? "?game=" + encodeURIComponent(pageGame.id) : "")
      : "/")
  );
}
function referrer() {
  try {
    return document.referrer ? new URL(document.referrer).origin + "/" : "";
  } catch {
    return "";
  }
}
export function track(name, params = {}) {
  try {
    if (!events.has(name) || !started || !allowed() || !navigator.onLine)
      return false;
    // Bounded pre-load queue; no persistence/replay of offline or disabled events.
    if (window.dataLayer.length > 2000) return false;
    command("event", name, {
      ...cleanParams({ ...pageContext, ...gameParams(pageGame), ...params }),
      schema_version: schemaVersion,
      page_type: pageType,
      page_view_id: pageViewId,
      event_sequence: ++sequence,
      elapsed_ms: Math.round(performance.now() - startedAt),
      network_state: navigator.onLine ? "online" : "offline",
      page_location: safeLocation(),
      page_referrer: referrer(),
      page_title: pageGame
        ? pageGame.title + " · owngame"
        : "owngame · 做属于自己的游戏",
      send_to: measurementId,
    });
    return true;
  } catch {
    return false;
  }
}
function sendPageView() {
  if (pageViewed || (pageType === "player" && !pageGame)) return;
  pageViewed = track("page_view");
}
export function setPageGame(g) {
  pageGame = g;
  try {
    const pending = JSON.parse(
      sessionStorage.getItem("owngame:navigation") || "null",
    );
    if (pending?.game_id === g.id && Date.now() - pending.at < 30 * 60 * 1000) {
      const { navigation_id, entry_point, search_id } = cleanParams(
        pending.context,
      );
      pageContext = { navigation_id, entry_point, search_id };
    }
    sessionStorage.removeItem("owngame:navigation");
  } catch {}
  sendPageView();
}
export function selectGame(g, context) {
  const navigation_id = eventId();
  const params = { ...context, navigation_id };
  if (track("game_select", { ...gameParams(g), ...params })) {
    try {
      sessionStorage.setItem(
        "owngame:navigation",
        JSON.stringify({
          game_id: g.id,
          at: Date.now(),
          context: cleanParams(params),
        }),
      );
    } catch {}
  }
}
function start() {
  if (!allowed() || started || !navigator.onLine) return;
  started = true;
  window.dataLayer = window.dataLayer || [];
  window.gtag = command;
  command("consent", "default", {
    analytics_storage: "granted",
    ad_storage: "denied",
    ad_user_data: "denied",
    ad_personalization: "denied",
  });
  command("js", new Date());
  command("config", measurementId, {
    send_page_view: false,
    allow_google_signals: false,
    allow_ad_personalization_signals: false,
    page_location: safeLocation(),
    page_referrer: referrer(),
    cookie_flags: "SameSite=Lax;Secure",
    cookie_expires: 60 * 60 * 24 * 365,
  });
  const script = document.createElement("script");
  script.async = true;
  script.src = "https://www.googletagmanager.com/gtag/js?id=" + measurementId;
  script.onerror = () => {
    scriptFailed = true;
    window.dataLayer.length = 0;
  };
  document.head.append(script);
  sendPageView();
}
function clearCookies() {
  for (const item of document.cookie.split(";")) {
    const name = item.trim().split("=")[0];
    if (!/^_ga(?:_|$)/.test(name)) continue;
    for (const domain of ["", location.hostname, ".owngame.dev"]) {
      document.cookie =
        `${name}=; Max-Age=0; Path=/` + (domain ? "; Domain=" + domain : "");
    }
  }
}
function choose(value) {
  consent = value;
  try {
    localStorage.setItem(consentKey, value);
  } catch {}
  if (value !== "granted") {
    window["ga-disable-" + measurementId] = true;
    if (started) command("consent", "update", { analytics_storage: "denied" });
    clearCookies();
    try {
      sessionStorage.removeItem("owngame:navigation");
    } catch {}
  } else {
    consentStartedAt = performance.now();
    window["ga-disable-" + measurementId] = false;
    if (started) command("consent", "update", { analytics_storage: "granted" });
    start();
    sendPageView();
  }
  document.getElementById("analytics-choice")?.remove();
}
function showChoice() {
  if (document.getElementById("analytics-choice")) return;
  const bar = document.createElement("section");
  bar.id = "analytics-choice";
  bar.className = "analytics-choice";
  bar.setAttribute("aria-label", t("访问统计选择"));
  const text = document.createElement("p");
  text.textContent = t(
    disabledByBrowser
      ? "已按浏览器的隐私偏好关闭访问统计。"
      : consent === "denied"
        ? "访问统计已关闭。你可以随时重新开启。"
        : "访问统计已开启：Google Analytics 使用 Cookie 统计访问、游戏操作与搜索词。你可以随时关闭。",
  );
  const link = document.createElement("a");
  link.href = "/privacy.html?lang=" + document.documentElement.lang;
  link.textContent = t("隐私说明");
  const no = document.createElement("button");
  no.textContent = t(disabledByBrowser ? "知道了" : "关闭统计");
  no.onclick = () => choose("denied");
  bar.append(text, link, no);
  if (!disabledByBrowser) {
    const yes = document.createElement("button");
    yes.textContent = t(consent === "denied" ? "开启统计" : "保持开启");
    yes.onclick = () => choose("granted");
    bar.append(yes);
  }
  document.body.append(bar);
}
function init() {
  if (!production) return;
  const settings = document.createElement("button");
  settings.className = "analytics-settings";
  settings.textContent = t("隐私与统计");
  settings.onclick = showChoice;
  (
    document.querySelector("footer") ||
    document.querySelector(".player-info") ||
    document.body
  ).append(settings);
  window.addEventListener("owngame:languagechange", () => {
    settings.textContent = t("隐私与统计");
    if (document.getElementById("analytics-choice")) {
      document.getElementById("analytics-choice").remove();
      showChoice();
    }
  });
  // Open only from settings; do not interrupt visits with an automatic prompt.
  start();
  let visibleStart =
    document.visibilityState === "visible" ? performance.now() : null;
  function flushActive() {
    const now = performance.now();
    if (visibleStart !== null && allowed())
      track("page_active_time", {
        active_ms: now - Math.max(visibleStart, consentStartedAt),
      });
    visibleStart = document.visibilityState === "visible" ? now : null;
  }
  document.addEventListener("visibilitychange", flushActive);
  window.addEventListener("pagehide", () => {
    flushActive();
    visibleStart = null;
  });
  window.addEventListener("pageshow", () => {
    visibleStart =
      document.visibilityState === "visible" ? performance.now() : null;
  });
  setInterval(flushActive, 60000);
  window.addEventListener("online", () => {
    start();
    track("network_change", { outcome: "online" });
  });
  window.addEventListener("appinstalled", () => track("app_installed"));
  window.addEventListener("error", () =>
    track("shell_error", { error_type: "javascript" }),
  );
  window.addEventListener("unhandledrejection", () =>
    track("shell_error", { error_type: "unhandled_promise" }),
  );
  const depths = new Set();
  document.addEventListener(
    "scroll",
    () => {
      const extent = document.documentElement.scrollHeight - innerHeight;
      if (extent <= 0) return;
      const percent = (scrollY / extent) * 100;
      for (const depth of [25, 50, 75, 90])
        if (
          percent >= depth &&
          !depths.has(depth) &&
          track("scroll_depth", { scroll_percent: depth })
        )
          depths.add(depth);
    },
    { passive: true },
  );
  window.addEventListener("storage", (e) => {
    if (e.key === consentKey) {
      consent = e.newValue;
      if (consent !== "granted") choose("denied");
      else {
        consentStartedAt = performance.now();
        window["ga-disable-" + measurementId] = false;
        if (started)
          command("consent", "update", { analytics_storage: "granted" });
        start();
        sendPageView();
        document.getElementById("analytics-choice")?.remove();
      }
    }
  });
}
init();
