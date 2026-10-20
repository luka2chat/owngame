import { t, localizeUrl } from "./i18n.js";
import { track, gameParams, eventId } from "./analytics.js";
import { imageAssets } from "./image-assets.js";
export const $ = (id) => document.getElementById(id);
export function element(tag, cls, text) {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (text !== undefined) e.textContent = text;
  return e;
}
export function getStore(key, fallback) {
  try {
    return JSON.parse(localStorage.getItem("owngame:" + key)) ?? fallback;
  } catch {
    return fallback;
  }
}
export function setStore(key, value) {
  try {
    localStorage.setItem("owngame:" + key, JSON.stringify(value));
    return true;
  } catch {
    return false;
  }
}
export async function catalog(options = {}) {
  const r = await fetch("/catalog.json", options);
  if (!r.ok) throw new Error("游戏库暂时无法加载");
  return r.json();
}
export function art(g, { priority = false } = {}) {
  const a = element("div", "art art-" + g.art);
  a.setAttribute("aria-hidden", "true");
  if (g.cover) {
    a.classList.add("art-has-cover");
    const img = element("img", "board-cover");
    img.loading = priority ? "eager" : "lazy";
    img.fetchPriority = priority ? "high" : "auto";
    img.decoding = "async";
    const optimized = imageAssets[g.cover];
    if (optimized) {
      img.width = optimized.width;
      img.height = optimized.height;
      img.sizes = "(max-width: 760px) calc((100vw - 55px) / 2), (max-width: 1100px) calc((100vw - 258px) / 2), 580px";
      img.srcset = optimized.srcset || "";
    }
    img.src = optimized?.src || g.cover;
    img.alt = "";
    a.append(img);
    return a;
  }
  if (g.art === "star-triad") {
    const board = element("div", "moonlight-board");
    // Reuse the actual selected game art, so the cover matches what players open.
    for (const [cell, piece] of [
      [0, "star"],
      [2, "moon"],
      [4, "star"],
      [6, "moon"],
      [8, "star"],
    ]) {
      const token = element("span", "moonlight-piece " + piece);
      token.style.left = 21 + (cell % 3) * 29 + "%";
      token.style.top = 20 + Math.floor(cell / 3) * 28 + "%";
      board.append(token);
    }
    a.append(board);
  } else if (g.art === "firefly-four") {
    const board = element("div", "paper-lantern-board");
    const grid = element("div", "paper-lantern-grid");
    // A real gravity position, composed with the selected runtime lantern atlas.
    const occupied = new Map([
      [35, 1],
      [28, 2],
      [36, 2],
      [37, 1],
      [30, 1],
      [23, 2],
      [38, 2],
      [31, 1],
      [24, 1],
      [17, 2],
      [39, 1],
      [32, 2],
      [40, 2],
      [41, 1],
    ]);
    for (let i = 0; i < 42; i++) {
      const cell = element("span", "paper-lantern-cell");
      if (occupied.has(i))
        cell.append(
          element(
            "span",
            "paper-lantern-token " + (occupied.get(i) === 1 ? "amber" : "jade"),
          ),
        );
      grid.append(cell);
    }
    board.append(grid);
    a.append(board);
  } else if (
    [
      "postcard-slide",
      "kiln-merge",
      "petal-memory",
      "silk-serpent",
      "bamboo-rally",
    ].includes(g.art)
  ) {
    const img = element("img", "board-cover");
    img.src = "/art/" + g.art + ".png";
    img.alt = "";
    a.append(img);
  } else if (["moss-reversi"].includes(g.art)) {
    const img = element("img", "board-cover");
    img.src = "/art/" + g.art + ".svg";
    img.alt = "";
    a.append(img);
  } else if (g.art === "harbor") {
    const set = element("div", "tower-set");
    [
      ["b", "a"],
      ["a", "b"],
      ["c", "c"],
    ].forEach((colors) => {
      const t = element("div", "tower"),
        base = element("img");
      base.src = "/art/lighthouse.png";
      base.alt = "";
      t.append(base);
      colors.forEach((s, i) => {
        const n = element("img", "signal" + (i ? " lower" : ""));
        n.src = "/art/signal-" + s + ".png";
        n.alt = "";
        t.append(n);
      });
      set.append(t);
    });
    a.append(set);
  } else {
    const set = element("div", "bolt-set");
    [
      ["#d7826e", "#83b39b", "#d7826e"],
      ["#83b39b", "#dcc074", "#83b39b"],
      ["#dcc074", "#d7826e", "#dcc074"],
    ].forEach((colors) => {
      const t = element("div", "bolt");
      colors.forEach((c) => {
        const n = element("div", "nut");
        n.style.setProperty("--c", c);
        t.append(n);
      });
      set.append(t);
    });
    a.append(set);
  }
  return a;
}
export function toast(text) {
  const t = $("toast");
  t.textContent = text;
  t.hidden = false;
  clearTimeout(toast.timer);
  toast.timer = setTimeout(() => (t.hidden = true), 4500);
}
export function playUrl(g) {
  return localizeUrl("/play.html?game=" + encodeURIComponent(g.id));
}
let registration;
export async function serviceWorker() {
  if (!("serviceWorker" in navigator))
    throw new Error(t("当前浏览器暂不支持离线下载"));
  if (!registration)
    registration = await navigator.serviceWorker.register("/sw.js");
  return navigator.serviceWorker.ready;
}
export async function offlineReady(g) {
  if (!("caches" in window)) return false;
  const c = await caches.open("owngame-game-" + g.version);
  const done = await c.match("/__complete/" + g.id);
  return !!done;
}
export async function download(g, onProgress) {
  const action_id = eventId(),
    start = performance.now();
  const context = { ...gameParams(g), action_id, bytes: g.bytes };
  track("download_start", context);
  let bucket = 0;
  try {
    const reg = await serviceWorker();
    await new Promise((resolve, reject) => {
      const channel = new MessageChannel();
      const timeout = setTimeout(() => {
        channel.port1.close();
        reject(new Error(t("下载超时，请保持网络连接后重试")));
      }, 180000);
      channel.port1.onmessage = ({ data }) => {
        if (data.type === "progress") {
          onProgress(data.percent);
          const next = Math.floor(data.percent / 25) * 25;
          if (next > bucket && next < 100) {
            bucket = next;
            track("download_progress", { ...context, progress_percent: next });
          }
        } else {
          clearTimeout(timeout);
          channel.port1.close();
          data.type === "done"
            ? resolve()
            : reject(
                new Error(t(data.message || "下载失败，请检查网络和存储空间")),
              );
        }
      };
      reg.active.postMessage({ type: "download", id: g.id }, [channel.port2]);
    });
    track("download_complete", {
      ...context,
      duration_ms: performance.now() - start,
    });
  } catch (error) {
    const reason = /超时|timed out/i.test(error.message)
      ? "timeout"
      : /不支持|does not support/i.test(error.message)
        ? "unsupported"
        : /校验|完整|hash|verification|integrity/i.test(error.message)
          ? "integrity"
          : "network_or_storage";
    track("download_error", {
      ...context,
      reason,
      duration_ms: performance.now() - start,
    });
    throw error;
  }
}
