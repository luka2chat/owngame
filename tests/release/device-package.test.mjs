import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import {
  snapshotBuild,
  resolveBuildDirectory,
  developmentId,
  sha,
  canonicalFiles,
} from "../../scripts/toolkit/device-package.mjs";
async function fixture() {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "owngame-dev-fixture-"));
  await fs.writeFile(path.join(dir, "index.html"), "<button>Play</button>");
  return dir;
}
test("snapshot binds exact files to a stable, isolated game ID; changed build gets a new version", async () => {
  const dir = await fixture();
  let first, second;
  try {
    await fs.mkdir(path.join(dir, "assets"));
    await fs.writeFile(path.join(dir, "assets", "中文.png"), "image");
    await fs.writeFile(path.join(dir, ".env"), "PRIVATE");
    await fs.writeFile(path.join(dir, "game-outline.json"), "PRIVATE");
    first = await snapshotBuild(dir, { id: "sample", title: "Sample" });
    assert.equal(first.manifest.game.id, "dev-sample");
    assert.equal(first.manifest.game.development, true);
    assert.equal(
      first.manifest.game.version,
      sha(canonicalFiles(first.manifest.files)),
    );
    assert.equal(
      JSON.parse(first.ready).packageSha256,
      sha(await fs.readFile(path.join(first.bundle, "package.json"))),
    );
    assert.deepEqual(
      first.manifest.files.map((f) => f.path),
      ["assets/中文.png", "index.html"],
    );
    assert.equal(await resolveBuildDirectory(dir), await fs.realpath(dir));
    await fs.writeFile(
      path.join(dir, "index.html"),
      "<button>Play v2</button>",
    );
    second = await snapshotBuild(dir, { id: "sample" });
    assert.equal(second.manifest.game.id, first.manifest.game.id);
    assert.notEqual(second.manifest.game.version, first.manifest.game.version);
    assert.equal(
      await fs.readFile(path.join(first.bundle, "files/index.html"), "utf8"),
      "<button>Play</button>",
    );
  } finally {
    await first?.cleanup();
    await second?.cleanup();
    await fs.rm(dir, { recursive: true, force: true });
  }
});
test("unsafe, symlinked, private-key, case-colliding and ambiguous build inputs are rejected", async () => {
  const dir = await fixture();
  try {
    await fs.symlink("index.html", path.join(dir, "link.html"));
    await assert.rejects(snapshotBuild(dir, { id: "sample" }), /Symlinks/);
    await fs.unlink(path.join(dir, "link.html"));
    await fs.writeFile(path.join(dir, "signing.pem"), "secret");
    await assert.rejects(snapshotBuild(dir, { id: "sample" }), /Private/);
    await fs.unlink(path.join(dir, "signing.pem"));
    await assert.rejects(
      snapshotBuild(dir, { id: "sample", entrypoint: "../index.html" }),
      /Unsafe/,
    );
    await fs.mkdir(path.join(dir, "dist"));
    await fs.writeFile(path.join(dir, "dist/index.html"), "build");
    await assert.rejects(resolveBuildDirectory(dir), /Multiple/);
    assert.equal(developmentId("x".repeat(64)).length, 64);
    assert.throws(() => developmentId("../official"));
  } finally {
    await fs.rm(dir, { recursive: true, force: true });
  }
});

test("CLI rejects ambiguous targets and cannot accept a stale or wrong-version load receipt", async () => {
  const { parseDeviceArgs } =
    await import("../../scripts/toolkit/device-launcher.mjs");
  const { validateReceipt } =
    await import("../../scripts/toolkit/device-transport.mjs");
  assert.throws(() =>
    parseDeviceArgs(["sync", "dist", "--platform", "desktop"]),
  );
  assert.throws(() => parseDeviceArgs(["list", "--watch"]));
  const parsed = parseDeviceArgs([
    "sync",
    "dist",
    "--platform",
    "ios",
    "--watch",
    "--id",
    "sample",
  ]);
  assert.equal(parsed.directory, "dist");
  assert(parsed.watch);
  assert.equal(parsed.id, "sample");
  const expected = {
    requestId: "123",
    game: { id: "dev-sample", version: "a".repeat(64) },
  };
  const receipt = {
    schema: "owngame.device-receipt.v1",
    requestId: "123",
    gameId: "dev-sample",
    version: "a".repeat(64),
    status: "running",
  };
  assert.equal(validateReceipt(receipt, expected), receipt);
  for (const patch of [
    { requestId: "old" },
    { gameId: "sample" },
    { version: "b".repeat(64) },
    { status: "installed" },
    { status: "failed", message: "Hash mismatch" },
  ])
    assert.throws(() => validateReceipt({ ...receipt, ...patch }, expected));
});

test("SMB metadata refresh is accepted only for byte-identical stable reads; real edits are rejected", async () => {
  const { readStableFile } =
    await import("../../scripts/toolkit/device-package.mjs");
  const stat = (mtime, ino = 1) => ({
    size: 4,
    mtimeMs: mtime,
    ino,
    isFile: () => true,
    isSymbolicLink: () => false,
  });
  const io = (states, bodies) => ({
    stat: async () => states.shift(),
    read: async () => Buffer.from(bodies.shift()),
  });
  assert.equal(
    String(
      await readStableFile(
        "fixture",
        io([stat(1), stat(2), stat(2)], ["same", "same"]),
      ),
    ),
    "same",
  );
  await assert.rejects(
    readStableFile(
      "fixture",
      io([stat(1), stat(2), stat(2)], ["same", "edit"]),
    ),
    /Build changed/,
  );
  await assert.rejects(
    readStableFile("fixture", io([stat(1), stat(2, 2)], ["same"])),
    /Build changed/,
  );
});
