import { test } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import vm from "node:vm";
import { webcrypto, createHash } from "node:crypto";
const source = (await readFile("apps/web/public/sw.js", "utf8"))
  .replace("__BUILD__", "test")
  .replace(
    "__CORE_FILES__",
    '["/index.html","/play.html","/catalog.json","/art/huge-cover.png","/art/optimized/cover-abc123.webp","/blueprint-media/bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb.glb","/vendor/three-0.186.1/viewer.js"]',
  );
function harness({ corrupt = false, block = false } = {}) {
  const version = "a".repeat(64),
    id = "game",
    asset = `/games/${id}/${version}/index.html`,
    data = Buffer.from("verified game");
  const files = [
    {
      url: asset,
      bytes: data.length,
      sha256: createHash("sha256").update(data).digest("hex"),
    },
  ];
  const stores = new Map(),
    handlers = {};
  let release;
  const gate = block ? new Promise((r) => (release = r)) : Promise.resolve();
  const key = (x) =>
    new URL(typeof x === "string" ? x : x.url, "https://test.dev").pathname;
  const caches = {
    async open(name) {
      if (!stores.has(name)) stores.set(name, new Map());
      const m = stores.get(name);
      return {
        match: async (k) => m.get(key(k))?.clone(),
        put: async (k, v) => m.set(key(k), v.clone()),
        addAll: async () => {},
      };
    },
    keys: async () => [...stores.keys()],
    delete: async (n) => stores.delete(n),
    async match(k) {
      for (const m of stores.values())
        if (m.has(key(k))) return m.get(key(k)).clone();
    },
  };
  let offline = false;
  const fetched = [];
  async function fetch(url) {
    if (offline) throw Error("offline");
    const p = key(url);
    fetched.push(p);
    if (p === "/catalog.json")
      return Response.json([{ id, version, manifest: "/manifest.json" }]);
    if (p === "/manifest.json") return Response.json(files);
    if (p === asset) {
      await gate;
      return new Response(corrupt ? "bad" : data);
    }
    return new Response("shell");
  }
  vm.runInNewContext(source, {
    self: {
      location: { origin: "https://test.dev" },
      clients: { claim: async () => {} },
      skipWaiting: async () => {},
      addEventListener: (n, h) => (handlers[n] = h),
    },
    caches,
    fetch,
    URL,
    Response,
    crypto: webcrypto,
    Uint8Array,
    Set,
  });
  function download() {
    let done;
    const messages = [];
    handlers.message({
      data: { type: "download", id },
      ports: [{ postMessage: (x) => messages.push(x) }],
      waitUntil: (p) => (done = p),
    });
    return { done, messages };
  }
  function request(path, mode = "navigate") {
    let response;
    handlers.fetch({
      request: { url: "https://test.dev" + path, method: "GET", mode },
      respondWith: (r) => (response = r),
    });
    return response;
  }
  return {
    install: () => {
      let done;
      handlers.install({ waitUntil: (p) => (done = p) });
      return done;
    },
    fetched,
    download,
    request,
    caches,
    asset,
    version,
    release: () => release?.(),
    offline: () => (offline = true),
  };
}
test("verified downloads support offline directory URLs after Pages redirects", async () => {
  const h = harness();
  const job = h.download();
  await job.done;
  assert.equal(job.messages.at(-1).type, "done");
  h.offline();
  assert.equal(
    await (await h.request(h.asset.replace("index.html", ""))).text(),
    "verified game",
  );
  assert.ok(await h.caches.match("/__complete/game"));
});
test("corrupt content never publishes a completion marker or partial cache", async () => {
  const h = harness({ corrupt: true });
  const job = h.download();
  await job.done;
  assert.equal(job.messages.at(-1).type, "error");
  assert.equal(await h.caches.match("/__complete/game"), undefined);
  assert.ok(!(await h.caches.keys()).includes("owngame-game-" + h.version));
});
test("concurrent duplicate requests cannot release the original download lock", async () => {
  const h = harness({ block: true });
  const a = h.download();
  const b = h.download();
  await b.done;
  const c = h.download();
  await c.done;
  assert.equal(b.messages.at(-1).type, "error");
  assert.equal(c.messages.at(-1).type, "error");
  h.release();
  await a.done;
  assert.equal(a.messages.at(-1).type, "done");
});
test("offline navigation normalizes query routes and missing content fails explicitly", async () => {
  const h = harness();
  const c = await h.caches.open("owngame-web-test");
  await c.put("/play.html", new Response("player"));
  h.offline();
  assert.equal(await (await h.request("/play?game=game")).text(), "player");
  assert.equal((await h.request("/missing")).status, 503);
});

test("first install skips unrelated artwork while viewed covers remain available offline", async () => {
  const h = harness();
  await h.install();
  assert.ok(h.fetched.includes("/play.html"));
  assert.ok(!h.fetched.includes("/art/huge-cover.png"));
  assert.equal(
    await (await h.request("/art/huge-cover.png", "no-cors")).text(),
    "shell",
  );
  h.offline();
  assert.equal(
    await (await h.request("/art/huge-cover.png", "no-cors")).text(),
    "shell",
  );
});

test("unvisited artwork has a neutral offline fallback without weakening missing game errors", async () => {
  const h = harness();
  h.offline();
  const image = await h.request("/art/other-game.png", "no-cors");
  assert.equal(image.status, 200);
  assert.equal(image.headers.get("content-type"), "image/svg+xml");
  assert.ok((await image.text()).includes("#faf5e8"));
  await assert.rejects(h.request("/games/missing/index.html"), /offline/);
});

test("fingerprinted artwork reuses the cache and remains available offline", async () => {
  const h = harness();
  const url = "/art/optimized/cover-abc123.webp";
  await h.request(url, "no-cors");
  await h.request(url, "no-cors");
  assert.equal(h.fetched.filter((p) => p === url).length, 1);
  h.offline();
  assert.equal(await (await h.request(url, "no-cors")).text(), "shell");
});

test("blueprint models and renderer modules load on demand and remain reusable offline", async () => {
  const model = "/blueprint-media/" + "b".repeat(64) + ".glb";
  const vendor = "/vendor/three-0.186.1/viewer.js";
  const h = harness();
  await h.install();
  assert(!h.fetched.includes(model));
  assert(!h.fetched.includes(vendor));
  const cache = await h.caches.open("owngame-web-test");
  await cache.put(model, new Response("cached model"));
  await cache.put(vendor, new Response("cached renderer"));
  const before = h.fetched.length;
  assert.equal(await (await h.request(model, "cors")).text(), "cached model");
  assert.equal(
    await (await h.request(vendor, "cors")).text(),
    "cached renderer",
  );
  assert.equal(h.fetched.length, before);
});
