import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import path from "node:path";
import os from "node:os";
import {assertPublicSource, publicPng, readPublicFiles} from "../../scripts/android/public-source.mjs";

const root = path.resolve(import.meta.dirname, "../..");

test("reviewed Android export is self-contained, sanitized and excludes local files", async () => {
  const files = await readPublicFiles(root);
  for (const file of ["apps/android/AndroidManifest.xml", "scripts/android/build.mjs", "scripts/android/toolchain.mjs",
    "scripts/android/test-repository.mjs", "tests/android/RepositoryTests.java", "apps/android/assets/LICENSES/GPL-3.0.txt"]) assert(files.has(file));
  for (const name of files.keys()) assertPublicSource(name, files.get(name));
  const actual = [];
  async function walk(dir) {
    for (const item of await fs.readdir(path.join(root, dir), {withFileTypes: true})) {
      const name = dir + "/" + item.name;
      if (item.isDirectory()) await walk(name); else actual.push(name);
    }
  }
  await walk("apps/android");
  await walk("tests/android");
  for (const name of actual) assert(files.has(name), "Unreviewed file: " + name);
  const manifest = files.get("apps/android/AndroidManifest.xml").toString();
  for (const setting of ['android:debuggable="false"', 'android:usesCleartextTraffic="false"', 'android:allowBackup="false"']) assert(manifest.includes(setting));
  for (const png of [...files.keys()].filter(p => p.endsWith(".png"))) {
    const original = await fs.readFile(path.join(root, png));
    assert.deepEqual(publicPng(original), files.get(png));
    assert.deepEqual(publicPng(files.get(png)), files.get(png));
  }
});

test("private paths, network addresses and credential values fail closed", () => {
  for (const name of [".env", ".local/key.jks", "apps/android/local.properties", "apps/android/debug.keystore",
    "apps/android/client.apk", "apps/android/../private.json", "apps/android/link.pem"]) {
    assert.throws(() => assertPublicSource(name, Buffer.from("data")));
  }
  const samples = [
    ["", "Users", "someone", "private"].join("/"),
    ["", "Volumes", "share", "private"].join("/"),
    ["", "home", "someone", "private"].join("/"),
    "https://" + [192, 168, 5, 12].join("."),
    "https://" + [10, 4, 3, 2].join("."),
    "http://" + [127, 0, 0, 1].join("."),
    "-----BEGIN " + "PRIVATE KEY-----",
    "ghp_" + "x".repeat(32),
    'pairing_token = "' + "x".repeat(24) + '"',
  ];
  for (const value of samples) assert.throws(() => assertPublicSource("apps/android/config.json", Buffer.from(value)));
  assert.doesNotThrow(() => assertPublicSource("apps/android/config.json", Buffer.from('{"origin":"https://owngame.dev"}')));
});

test("explicit allowlist omits extra files and refuses symlink ancestors", async t => {
  const fixture = await fs.mkdtemp(path.join(os.tmpdir(), "owngame-android-source-"));
  t.after(() => fs.rm(fixture, {recursive: true, force: true}));
  await fs.mkdir(path.join(fixture, "scripts/android"), {recursive: true});
  await fs.mkdir(path.join(fixture, "apps/android"), {recursive: true});
  await fs.writeFile(path.join(fixture, "scripts/android/public-files.json"), JSON.stringify(["apps/android/README.md"]));
  await fs.writeFile(path.join(fixture, "apps/android/README.md"), "Public client");
  await fs.writeFile(path.join(fixture, "apps/android/.env"), "PRIVATE");
  assert.deepEqual([...(await readPublicFiles(fixture)).keys()], ["apps/android/README.md"]);
  await fs.rename(path.join(fixture, "apps"), path.join(fixture, "private-apps"));
  await fs.symlink(path.join(fixture, "private-apps"), path.join(fixture, "apps"));
  await assert.rejects(readPublicFiles(fixture), /Symlink/);
});

test("PNG public copy retains rendering bytes and excludes embedded metadata", () => {
  const header = Buffer.from([137,80,78,71,13,10,26,10]);
  function chunk(type, text) {
    const data = Buffer.from(text), b = Buffer.alloc(data.length + 12);
    b.writeUInt32BE(data.length); b.write(type, 4); data.copy(b, 8); return b;
  }
  const render = [chunk("IHDR", "header"), chunk("IDAT", "pixels"), chunk("IEND", "")];
  const original = Buffer.concat([header, render[0], chunk("tEXt", "private author"), chunk("caBX", "private provenance"), ...render.slice(1)]);
  assert.throws(() => assertPublicSource("apps/android/assets/example.png", original), /metadata/);
  assert.deepEqual(publicPng(original), Buffer.concat([header, ...render]));
  assert.throws(() => publicPng(original.subarray(0, original.length - 2)), /Truncated|length/);
});
