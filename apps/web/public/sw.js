const CORE = "owngame-web-__BUILD__";
const CORE_FILES = __CORE_FILES__;
// Pages redirects HTML to clean URLs. Cached responses must be replayable for navigation.
const replayable = (r) =>
  new Response(r.body, {
    status: r.status,
    statusText: r.statusText,
    headers: r.headers,
  });
self.addEventListener("install", (event) =>
  event.waitUntil(
    (async () => {
      const c = await caches.open(CORE);
      await Promise.all(
        // Art is cached when requested, not eagerly downloaded alongside the game.
        CORE_FILES.filter(url => !url.startsWith("/vendor/") && !url.startsWith("/blueprint-media/") && !/\.(png|jpe?g|webp|gif|avif)$/i.test(url)).map(async (url) => {
          // A new shell cache must not inherit stale scripts from the HTTP cache.
          const response = await fetch(url, { cache: "reload" });
          if (!response.ok) throw Error("Page shell unavailable");
          await c.put(url, replayable(response));
        }),
      );
      await self.skipWaiting();
    })(),
  ),
);
self.addEventListener("activate", (event) =>
  event.waitUntil(
    (async () => {
      for (const name of await caches.keys())
        if (name.startsWith("owngame-web-") && name !== CORE)
          await caches.delete(name);
      await self.clients.claim();
    })(),
  ),
);
self.addEventListener("fetch", (event) => {
  const url = new URL(event.request.url);
  if (url.origin !== self.location.origin || event.request.method !== "GET")
    return;
  event.respondWith(
    (async () => {
      if (url.pathname.startsWith("/games/")) {
        const key = url.pathname.endsWith("/")
          ? url.pathname + "index.html"
          : event.request;
        const cached = await caches.match(key);
        return cached || fetch(event.request);
      }
      const cache = await caches.open(CORE);
      let key = url.pathname;
      // Content hashes make these images safe to reuse without a network round trip.
      if (key.startsWith("/art/optimized/") || key.startsWith("/blueprint-media/") || key.startsWith("/vendor/")) {
        const cached = await cache.match(key);
        if (cached) return cached;
      }
      if (event.request.mode === "navigate") {
        if (key === "/" || key === "/index.html") key = "/index.html";
        else if (key === "/play" || key === "/play.html") key = "/play.html";
        else if (key === "/privacy" || key === "/privacy.html") key = "/privacy.html";
        else if (key === "/blueprint-model" || key === "/blueprint-model.html") key = "/blueprint-model.html";
        else if (key === "/usage" || key === "/usage.html") key = "/usage.html";
        else if (key.endsWith('/') && CORE_FILES.includes(key + 'index.html')) key += 'index.html';
      }
      try {
        const response = await fetch(event.request);
        if (response.ok && CORE_FILES.includes(key))
          await cache.put(key, replayable(response.clone()));
        return response;
      } catch (e) {
        const cached = await cache.match(key);
        if (cached) return cached;
        // Covers not viewed while controlled are optional, not failed game downloads.
        // Use a neutral branded placeholder offline instead of a broken image.
        if (key.startsWith("/art/") && /\.(png|jpe?g|webp|gif|avif)$/i.test(key)) {
          return new Response('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 320 180"><rect width="320" height="180" fill="#faf5e8"/><path d="m160 45 13 27 30 4-22 21 5 30-26-14-26 14 5-30-22-21 30-4z" fill="#ffce27" stroke="#22251f" stroke-width="4" stroke-linejoin="round"/></svg>', {
            headers: { "Content-Type": "image/svg+xml", "Cache-Control": "no-store" },
          });
        }
        return new Response("离线内容尚未下载，请联网后重试。 / This content is not downloaded. Reconnect and try again.", {
          status: 503,
          headers: { "Content-Type": "text/plain; charset=utf-8" },
        });
      }
    })(),
  );
});
const running = new Set();
self.addEventListener("message", (event) => {
  if (event.data?.type !== "download" || !event.ports[0]) return;
  const port = event.ports[0];
  const send = (x) => port.postMessage(x);
  event.waitUntil(
    (async () => {
      let cacheName,
        ownsLock = false,
        id = event.data.id;
      try {
        if (typeof id !== "string" || !/^[a-z0-9][a-z0-9-]{0,63}$/.test(id))
          throw Error("无效的游戏");
        if (running.has(id)) throw Error("这款游戏正在下载，请稍后查看");
        running.add(id);
        ownsLock = true;
        const c = await caches.open(CORE);
        const catalogResponse =
          (await c.match("/catalog.json")) || (await fetch("/catalog.json"));
        const games = await catalogResponse.json();
        const game = games.find((g) => g.id === id);
        if (!game) throw Error("未找到游戏");
        const response = await fetch(game.manifest);
        if (!response.ok) throw Error("无法读取下载清单");
        const files = await response.json();
        if (!Array.isArray(files) || files.length > 4096)
          throw Error("下载清单不可用");
        cacheName = "owngame-game-" + game.version;
        const cache = await caches.open(cacheName);
        let complete = 0,
          total = files.reduce((sum, f) => sum + f.bytes, 0);
        for (const file of files) {
          if (
            !file.url.startsWith("/games/" + id + "/" + game.version + "/") ||
            file.url.includes("..") ||
            !Number.isSafeInteger(file.bytes) ||
            file.bytes < 0 ||
            !/^[a-f0-9]{64}$/.test(file.sha256)
          )
            throw Error("下载清单校验失败");
          const r = await fetch(file.url);
          if (!r.ok) throw Error("部分文件下载失败");
          const bytes = await r.clone().arrayBuffer();
          const digest = [
            ...new Uint8Array(await crypto.subtle.digest("SHA-256", bytes)),
          ]
            .map((b) => b.toString(16).padStart(2, "0"))
            .join("");
          if (bytes.byteLength !== file.bytes || digest !== file.sha256)
            throw Error("下载文件不完整，请重试");
          await cache.put(file.url, replayable(r));
          complete += file.bytes;
          send({
            type: "progress",
            percent: Math.round((complete / total) * 100),
          });
        }
        await cache.put("/__complete/" + id, new Response(game.version));
        send({ type: "done" });
      } catch (e) {
        if (cacheName) await caches.delete(cacheName);
        send({ type: "error", message: e.message });
      } finally {
        if (ownsLock) running.delete(id);
      }
    })(),
  );
});
