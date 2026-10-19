import { readFile, writeFile } from "node:fs/promises";
import { createHash } from "node:crypto";
const origin = new URL(process.argv[2] || "https://owngame.dev").origin;
const dist = process.env.OWNGAME_WEB_OUT || "apps/web/dist";
const local = JSON.parse(await readFile(dist + "/catalog.json", "utf8"));
const remote = await fetch(origin + "/catalog.json");
if (!remote.ok) throw Error("Catalog HTTP " + remote.status);
const catalog = await remote.json();
if (JSON.stringify(local) !== JSON.stringify(catalog))
  throw Error("Remote catalog differs");
const results = [];
for (const g of catalog) {
  const files = JSON.parse(
    await readFile(dist + g.manifest, "utf8"),
  );
  let cursor = 0;
  await Promise.all(
    Array.from({ length: 4 }, async () => {
      while (cursor < files.length) {
        const f = files[cursor++];
        const r = await fetch(origin + f.url);
        if (
          f.url.endsWith(".html") &&
          !r.headers
            .get("cache-control")
            ?.split(",")
            .some((v) => v.trim() === "no-transform")
        )
          throw Error("Missing immutable body protection " + f.url);
        const bytes = Buffer.from(await r.arrayBuffer());
        const digest = createHash("sha256").update(bytes).digest("hex");
        if (!r.ok || bytes.length !== f.bytes || digest !== f.sha256)
          throw Error("Asset mismatch " + f.url);
        results.push({
          path: f.url,
          status: r.status,
          bytes: bytes.length,
          sha256: digest,
          redirected: r.redirected,
        });
      }
    }),
  );
}
const home = await fetch(origin + "/");
const text = await home.text();
const sw = await fetch(origin + "/sw.js");
const swMatches =
  (await sw.text()) === (await readFile(dist + "/sw.js", "utf8"));
const result = {
  origin,
  verified_at: new Date().toISOString(),
  home_status: home.status,
  title: text.match(/<title>(.*?)<\/title>/)?.[1],
  service_worker_matches: swMatches,
  verified_assets: results.length,
  bytes: results.reduce((s, f) => s + f.bytes, 0),
  html_redirects: results.filter((f) => f.redirected).map((f) => f.path),
  failures: [],
};
if (!swMatches || home.status !== 200) throw Error("Shell verification failed");
console.log(JSON.stringify(result, null, 2));
if (process.argv[3])
  await writeFile(process.argv[3], JSON.stringify(result, null, 2) + "\n");
