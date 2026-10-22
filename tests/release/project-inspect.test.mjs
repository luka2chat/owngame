import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import path from "node:path";
import os from "node:os";
import { spawnSync } from "node:child_process";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { Core } from "../../dist/packages/core/index.js";

const root = path.resolve(import.meta.dirname, "../..");
async function fixture(t, pkg = {}) {
  const workspace = await fs.mkdtemp(
    path.join(os.tmpdir(), "owngame-inspect-"),
  );
  t.after(() => fs.rm(workspace, { recursive: true, force: true }));
  await fs.writeFile(path.join(workspace, "package.json"), JSON.stringify(pkg));
  const core = new Core({ root, workspace });
  await core.initialize();
  return { workspace, core };
}

test("import inspection exposes source-build candidates without executing scripts or exposing raw commands", async (t) => {
  const secret = "private-command-value-never-returned";
  const { workspace, core } = await fixture(t, {
    dependencies: { three: "0.186.1", "@dimforge/rapier3d-compat": "0.21.0" },
    packageManager: "pnpm@10.18.0",
    scripts: {
      dev: "node scripts/manus-game-assets/restore.mjs && vite",
      build: "node scripts/manus-game-sharing/build.mjs",
      "manus:build-source":
        "tsc --noEmit && vite build && node scripts/check-size.mjs",
      test: `node -e \"require('fs').writeFileSync('unexpected','${secret}')\"`,
    },
  });
  await fs.symlink("/does/not/exist", path.join(workspace, "node_modules"));
  await fs.writeFile(path.join(workspace, ".env"), secret);
  const before = await fs.readdir(workspace);
  const result = await core.call("project.inspect", { directory: "." });
  assert.equal(result.status, "succeeded");
  assert.deepEqual(result.data.engines, ["threejs", "rapier3d"]);
  assert.deepEqual(result.data.build_candidates, ["manus:build-source"]);
  assert(
    result.data.commands.find((command) => command.name === "build")
      .platform_markers,
  );
  assert.equal(result.data.verification.runtime, "not_run");
  assert.equal(result.data.verification.offline, "not_run");
  assert.equal(JSON.stringify(result).includes(secret), false);
  assert.deepEqual(await fs.readdir(workspace), before);
});

test("locked assets distinguish missing, size mismatch and uninspected external links", async (t) => {
  const { workspace, core } = await fixture(t);
  await fs.mkdir(path.join(workspace, "assets"));
  await fs.writeFile(path.join(workspace, "assets/present.glb"), "abc");
  await fs.symlink(os.tmpdir(), path.join(workspace, "assets/external"));
  await fs.writeFile(
    path.join(workspace, "assets.lock.json"),
    JSON.stringify({
      version: 2,
      assets: {
        "assets/present.glb": { size: 4 },
        "assets/missing.glb": { size: 3 },
        "assets/external/anything": { size: 1 },
      },
    }),
  );
  const { data } = await core.call("project.inspect", { directory: "." });
  assert.deepEqual(
    data.asset_lock.entries.map((asset) => asset.state),
    ["file", "missing", "symlink"],
  );
  assert.equal(data.asset_lock.entries[0].size_matches, false);
  assert.equal(data.asset_lock.hashes, "not_checked");
  assert(
    data.findings.some(
      (finding) => finding.code === "LOCKED_ASSET_UNAVAILABLE",
    ),
  );
});

test("metadata symlinks, traversal and oversized declarations cannot trigger external reads", async (t) => {
  const { workspace, core } = await fixture(t);
  await fs.symlink(os.tmpdir(), path.join(workspace, "outside"));
  assert.equal(
    (await core.call("project.inspect", { directory: "outside" }))
      .diagnostics[0].code,
    "WORKSPACE_ESCAPE",
  );
  await fs.writeFile(
    path.join(workspace, "assets.lock.json"),
    JSON.stringify({ assets: { "../outside": {} } }),
  );
  assert.equal(
    (await core.call("project.inspect", { directory: "." })).diagnostics[0]
      .code,
    "UNSAFE_PROJECT_PATH",
  );
  await fs.unlink(path.join(workspace, "assets.lock.json"));
  await fs.unlink(path.join(workspace, "package.json"));
  await fs.symlink("/etc/hosts", path.join(workspace, "package.json"));
  assert.equal(
    (await core.call("project.inspect", { directory: "." })).diagnostics[0]
      .code,
    "PROJECT_METADATA_UNREADABLE",
  );
  await fs.unlink(path.join(workspace, "package.json"));
  await fs.writeFile(
    path.join(workspace, "package.json"),
    " ".repeat(256 * 1024 + 1),
  );
  assert.equal(
    (await core.call("project.inspect", { directory: "." })).diagnostics[0]
      .code,
    "PROJECT_METADATA_LIMIT",
  );
});

test("CLI and MCP share read-only imported-project inspection", async (t) => {
  const { workspace } = await fixture(t, { scripts: { build: "vite build" } });
  const cli = spawnSync(
    process.execPath,
    [
      path.join(root, "dist/packages/cli/index.js"),
      "--workspace",
      workspace,
      "project.inspect",
      JSON.stringify({ directory: "." }),
    ],
    { encoding: "utf8" },
  );
  assert.equal(cli.status, 0, cli.stderr);
  const cliResult = JSON.parse(cli.stdout);
  const client = new Client({ name: "project-inspection-test", version: "1" });
  await client.connect(
    new StdioClientTransport({
      command: process.execPath,
      args: [
        path.join(root, "dist/packages/mcp/index.js"),
        "--workspace",
        workspace,
      ],
      stderr: "pipe",
    }),
  );
  t.after(() => client.close());
  const tool = (await client.listTools()).tools.find(
    (item) => item.name === "owngame_project_inspect",
  );
  assert.equal(tool.annotations.readOnlyHint, true);
  assert.equal(tool.annotations.openWorldHint, false);
  const result = await client.callTool({
    name: tool.name,
    arguments: { directory: "." },
  });
  assert.deepEqual(result.structuredContent.data, cliResult.data);
});
