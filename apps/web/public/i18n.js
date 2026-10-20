import { messages, games as englishGames } from "./locales/en.js";

export const languages = ["zh-CN", "en"];
export const languageKey = "owngame:language";
export function normalizeLanguage(value) {
  if (typeof value !== "string") return null;
  if (/^zh(?:[-_].*)?$/i.test(value)) return "zh-CN";
  if (/^en(?:[-_].*)?$/i.test(value)) return "en";
  return null;
}
export function resolveLanguage({ query, saved, preferred = [] } = {}) {
  return (
    normalizeLanguage(query) ||
    normalizeLanguage(saved) ||
    preferred.map(normalizeLanguage).find(Boolean) ||
    "en"
  );
}
export function translate(key, values = {}, locale = language) {
  let text =
    locale === "en" && Object.hasOwn(messages, key) ? messages[key] : key;
  if (locale === "en" && key === "{count} 款游戏" && Number(values.count) === 1)
    text = "{count} game";
  return text.replace(/\{(\w+)\}/g, (match, name) =>
    Object.hasOwn(values, name) ? String(values[name]) : match,
  );
}
let language = "zh-CN";
if (typeof window !== "undefined") {
  let saved;
  try {
    saved = localStorage.getItem(languageKey);
  } catch {}
  language = resolveLanguage({
    query: new URLSearchParams(location.search).get("lang"),
    saved,
    preferred: navigator.languages || [navigator.language],
  });
}
export const getLanguage = () => language;
export const t = (key, values) => translate(key, values, language);
export function localizeGame(game, locale = language) {
  return locale === "en" && Object.hasOwn(englishGames, game.id)
    ? { ...game, ...englishGames[game.id] }
    : { ...game };
}
export function matchesGame(game, query) {
  const english = localizeGame(game, "en");
  return [
    game.title,
    game.description,
    game.subtitle,
    english.title,
    english.description,
    game.category,
    translate(game.category, {}, "en"),
  ]
    .join(" ")
    .toLocaleLowerCase()
    .includes(query.toLocaleLowerCase());
}
export function localizeUrl(value, locale = language) {
  const base =
    typeof location === "undefined" ? "https://owngame.dev/" : location.href;
  const url = new URL(value, base);
  if (
    url.origin !== new URL(base).origin ||
    !/^\/(?:$|index(?:\.html)?\/?$|play(?:\.html)?\/?$|privacy(?:\.html)?\/?$|usage(?:\.html)?\/?$|cases\/)/.test(
      url.pathname,
    )
  )
    return value;
  url.searchParams.set("lang", locale);
  return url.pathname + url.search + url.hash;
}
export function applyTranslations(root = document) {
  for (const node of root.querySelectorAll("[data-i18n]"))
    node.textContent = t(node.dataset.i18n);
  for (const attr of ["placeholder", "aria-label", "alt", "content"]) {
    for (const node of root.querySelectorAll("[data-i18n-" + attr + "]"))
      node.setAttribute(attr, t(node.getAttribute("data-i18n-" + attr)));
  }
  for (const link of root.querySelectorAll("a[href]")) {
    const href = link.getAttribute("href");
    if (!href || href.startsWith("#")) continue;
    link.setAttribute("href", localizeUrl(href));
  }
  for (const select of root.querySelectorAll("[data-language-select]"))
    select.value = language;
  for (const manifest of root.querySelectorAll('link[rel="manifest"]'))
    manifest.href =
      language === "en" ? "/manifest-en.webmanifest" : "/manifest.webmanifest";
  document.documentElement.lang = language;
}
export function setLanguage(value, { persist = true, updateUrl = true } = {}) {
  const next = normalizeLanguage(value);
  if (!next) return;
  language = next;
  if (persist)
    try {
      localStorage.setItem(languageKey, next);
    } catch {}
  if (updateUrl)
    try {
      const url = new URL(location.href);
      url.searchParams.set("lang", next);
      history.replaceState(history.state, "", url);
    } catch {}
  applyTranslations();
  window.dispatchEvent(new Event("owngame:languagechange"));
}
function init() {
  const host =
    document.querySelector(".topbar") || document.querySelector("main");
  if (host) {
    const label = document.createElement("label");
    label.className = "language-switch";
    const icon = document.createElement("span");
    icon.textContent = "◎";
    icon.setAttribute("aria-hidden", "true");
    const select = document.createElement("select");
    select.dataset.languageSelect = "";
    select.setAttribute("data-i18n-aria-label", "网站语言");
    for (const [value, name] of [
      ["zh-CN", "中文"],
      ["en", "English"],
    ]) {
      const option = document.createElement("option");
      option.value = value;
      option.textContent = name;
      select.append(option);
    }
    select.onchange = () => setLanguage(select.value);
    label.append(icon, select);
    if (host.matches(".topbar")) host.append(label);
    else host.prepend(label);
    const menu = document.getElementById("menu");
    if (menu) {
      const menuLabel = label.cloneNode(true);
      menuLabel.classList.add("menu-language");
      menuLabel.querySelector("select").onchange = (event) =>
        setLanguage(event.target.value);
      menu.append(menuLabel);
    }
  }
  applyTranslations();
  window.owngameI18n = { t };
  // Preserve the current language when submitting a search from another page.
  document.addEventListener("submit", (event) => {
    const form = event.target;
    if (
      !(form instanceof HTMLFormElement) ||
      new URL(form.action).origin !== location.origin
    )
      return;
    let input = form.querySelector('input[name="lang"]');
    if (!input) {
      input = document.createElement("input");
      input.type = "hidden";
      input.name = "lang";
      form.append(input);
    }
    input.value = language;
  });
  window.addEventListener("storage", (event) => {
    if (event.key === languageKey && normalizeLanguage(event.newValue))
      setLanguage(event.newValue, { persist: false });
  });
}
if (typeof document !== "undefined") {
  if (document.readyState === "loading")
    document.addEventListener("DOMContentLoaded", init, { once: true });
  else init();
}
