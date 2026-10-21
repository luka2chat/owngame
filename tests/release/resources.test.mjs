import test from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import fs from "node:fs/promises";
import os from "node:os";
import { spawn } from "node:child_process";
import { Core } from "../../dist/packages/core/index.js";
import { Resources } from "../../dist/packages/core/resources.js";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";

const root = path.resolve(import.meta.dirname, "../..");
const model = {
  name: "Wooden Table",
  type: 2,
  tags: ["wood", "furniture"],
  categories: ["table"],
  authors: { Artist: "All" },
  polycount: 196,
};
const ambient = {
  id: "Wood096",
  title: "Wood 096",
  type: "material",
  tags: ["wood"],
  thumbnails: { "256-PNG": "https://example.org/wood.png" },
};
const image = {
  id: "image-id",
  title: "Forest rendering",
  license: "cc0",
  license_url: "https://creativecommons.org/publicdomain/zero/1.0/",
  foreign_landing_url: "https://example.org/source",
  url: "https://example.org/image.png",
  thumbnail: "https://example.org/preview.png",
  tags: [{ name: "forest" }],
};
const response = (data) =>
  new Response(JSON.stringify(data), {
    headers: { "content-type": "application/json" },
  });
function fixture(fetcher) {
  const core = new Core({ root });
  core.resources = new Resources(fetcher);
  return core;
}

test("search aggregates actual source metadata, filters types, and paginates each source", async () => {
  const calls = [];
  const core = fixture(async (url, options) => {
    calls.push(new URL(url));
    assert.match(options.headers["User-Agent"], /owngame/);
    assert.equal(options.redirect, "error");
    if (url.includes("polyhaven"))
      return response({
        table_b: model,
        table_a: model,
        texture: { name: "Wooden Table Surface", type: 1 },
      });
    return response({
      assets: [{ ...ambient, type: "3d-model" }],
      totalResults: 10,
    });
  });
  const r = await core.call("resource.search", {
    query: " wooden table ",
    type: "model",
    limit: 1,
    page: 2,
  });
  assert.equal(r.status, "succeeded");
  assert.equal(r.data.query, "wooden table");
  assert.equal(r.data.items.length, 2);
  assert.deepEqual(
    r.data.items.map((i) => i.id),
    ["table_b", "Wood096"],
  );
  assert.equal(r.data.providers[0].total, 2);
  assert.equal(calls[0].searchParams.get("t"), "models");
  assert.equal(calls[1].searchParams.get("offset"), "1");
  assert.equal(calls[1].searchParams.get("type"), "3d-model");
  assert.equal(r.data.items[0].license.id, "CC0-1.0");
});

test("a failing source preserves other results and cannot report complete success", async () => {
  const core = fixture(async (url) =>
    url.includes("polyhaven")
      ? response({ table: model })
      : new Response("", { status: 429 }),
  );
  const r = await core.call("resource.search", {
    query: "table",
    type: "model",
  });
  assert.equal(r.status, "unknown");
  assert.equal(r.data.complete, false);
  assert.equal(r.data.items[0].id, "table");
  assert.equal(r.data.providers[1].error.code, "RESOURCE_RATE_LIMITED");
  assert.equal(r.diagnostics[0].code, "RESOURCE_SEARCH_INCOMPLETE");
  assert(r.unknowns.length);
});

test("model relevance favors asset names and never treats adjustable as table", async () => {
  const core = fixture(async () =>
    response({
      adjustable_wrench: {
        name: "Adjustable Wrench",
        type: 2,
        description: "Tool with a wooden handle",
      },
      workshop: {
        name: "Workshop",
        type: 2,
        description: "A wooden table in a workshop",
      },
      wooden_table_02: model,
    }),
  );
  const r = await core.call("resource.search", {
    query: "wooden table",
    type: "model",
    sources: ["polyhaven"],
  });
  assert.deepEqual(
    r.data.items.map((i) => i.id),
    ["wooden_table_02", "workshop"],
  );
});

test("empty search results, malformed API metadata and network failures stay distinct", async () => {
  for (const [fetcher, status, code] of [
    [async () => response({}), "succeeded", undefined],
    [async () => response([]), "unknown", "RESOURCE_RESPONSE_INVALID"],
    [
      async () => response({ bad: { name: "Broken", type: 99 } }),
      "unknown",
      "RESOURCE_RESPONSE_INVALID",
    ],
    [
      async () => {
        throw Error("Offline");
      },
      "unknown",
      "RESOURCE_UNAVAILABLE",
    ],
    [
      async () => new Response("<html>upstream error</html>"),
      "unknown",
      "RESOURCE_UNAVAILABLE",
    ],
  ]) {
    const r = await fixture(fetcher).call("resource.search", {
      query: "no such asset",
      sources: ["polyhaven"],
    });
    assert.equal(r.status, status);
    assert.equal(r.data.items.length, 0);
    assert.equal(r.data.providers[0].error?.code, code);
  }
});

test("Openverse uses CC0 by default, retains license provenance, and allows explicit broader searches", async () => {
  const urls = [];
  const core = fixture(async (url) => {
    urls.push(new URL(url));
    return response({
      results: [
        image,
        {
          ...image,
          id: "restricted",
          license: "by-nc",
          license_version: "4.0",
          creator: "Artist",
        },
      ],
      result_count: 2,
    });
  });
  let r = await core.call("resource.search", {
    query: "forest",
    type: "image",
    sources: ["openverse"],
  });
  assert.equal(r.data.items.length, 1);
  assert.equal(urls[0].searchParams.get("license"), "cc0");
  assert.equal(urls[0].searchParams.get("mature"), "false");
  r = await core.call("resource.search", {
    query: "forest",
    sources: ["openverse"],
    license: "all",
  });
  assert.equal(urls[1].searchParams.get("license"), null);
  assert.equal(r.data.items[1].license.id, "CC-BY-NC-4.0");
  assert.equal(r.data.items[1].license.creator, "Artist");
  assert.equal(r.data.items[1].license.attribution_required, true);
});

test("model detail preserves glTF dependencies and reports formats, resolution and file sizes without downloading", async () => {
  const calls = [];
  const core = fixture(async (url) => {
    calls.push(url);
    if (url.includes("/info/")) return response(model);
    return response({
      gltf: {
        "1k": {
          gltf: {
            url: "https://example.org/table.gltf",
            size: 2000,
            md5: "abc",
            include: {
              "table.bin": { url: "https://example.org/table.bin", size: 8000 },
              "textures/wood.jpg": {
                url: "https://example.org/wood.jpg",
                size: 20000,
              },
            },
          },
        },
      },
      fbx: {
        "2k": { fbx: { url: "https://example.org/table.fbx", size: 10000 } },
      },
    });
  });
  const r = await core.call("resource.get", {
    source: "polyhaven",
    id: "table",
    format: "gltf",
    resolution: "1k",
  });
  assert.equal(r.status, "succeeded");
  assert.deepEqual(r.data.available_formats, ["fbx", "gltf"]);
  assert.deepEqual(r.data.available_resolutions, ["1k", "2k"]);
  assert.equal(r.data.downloads.length, 1);
  assert.equal(r.data.downloads[0].bytes, 2000);
  assert.equal(r.data.downloads[0].total_with_dependencies_bytes, 30000);
  assert.deepEqual(
    r.data.downloads[0].dependencies.map((d) => d.path),
    ["table.bin", "textures/wood.jpg"],
  );
  assert.equal(r.data.downloaded, false);
  assert.equal(calls.length, 2);
  assert(calls.every((url) => url.startsWith("https://api.polyhaven.com/")));
});

test("ambientCG ZIP details retain actual size and resolution; missing IDs fail", async () => {
  const core = fixture(async (url) => {
    assert.equal(new URL(url).searchParams.get("id"), "Wood096");
    return response({
      assets: [
        {
          ...ambient,
          downloads: [
            {
              url: "https://ambientcg.com/get?file=Wood096_1K-JPG.zip",
              extension: "zip",
              attributes: "1K-JPG",
              size: 5358165,
            },
          ],
        },
      ],
    });
  });
  const r = await core.call("resource.get", {
    source: "ambientcg",
    id: "Wood096",
    resolution: "1k",
  });
  assert.equal(r.status, "succeeded");
  assert.equal(r.data.downloads[0].bytes, 5358165);
  assert.equal(r.data.downloads[0].format, "zip");
  assert.equal(
    (
      await fixture(async () => response({ assets: [] })).call("resource.get", {
        source: "ambientcg",
        id: "missing",
      })
    ).diagnostics[0].code,
    "RESOURCE_NOT_FOUND",
  );
});

test("contracts reject invalid filters, IDs and queries before making requests", async () => {
  let requests = 0;
  const core = fixture(async () => {
    requests++;
    return response({});
  });
  for (const args of [
    { query: " " },
    { query: "wood", sources: [] },
    { query: "wood", limit: 21 },
    { query: "wood", page: 0 },
    { query: "wood", sources: ["unknown"] },
    { query: "wood", url: "http://localhost" },
  ]) {
    assert.equal(
      (await core.call("resource.search", args)).diagnostics[0].code,
      "INVALID_CONTRACT",
    );
  }
  assert.equal(
    (
      await core.call("resource.search", {
        query: "wood",
        sources: ["openverse"],
        type: "model",
      })
    ).diagnostics[0].code,
    "RESOURCE_TYPE_UNSUPPORTED",
  );
  for (const id of ["../secret", "https://example.org", "a?b"])
    assert.equal(
      (await core.call("resource.get", { source: "polyhaven", id }))
        .diagnostics[0].code,
      "INVALID_CONTRACT",
    );
  assert.equal(requests, 0);
});

test("metadata requests expire and oversized responses are rejected", async () => {
  const core = fixture(
    (url, { signal }) =>
      new Promise((resolve, reject) =>
        signal.addEventListener("abort", () => reject(signal.reason), {
          once: true,
        }),
      ),
  );
  // A timer keeps this fake request alive, like a real network socket would.
  const keepalive = setTimeout(() => {}, 2000);
  try {
    const r = await core.call("resource.search", {
      query: "wood",
      sources: ["polyhaven"],
      timeout_ms: 1000,
    });
    assert.equal(r.status, "unknown");
    assert.equal(r.data.providers[0].error.code, "RESOURCE_UNAVAILABLE");
  } finally {
    clearTimeout(keepalive);
  }
  const huge = fixture(
    async () => new Response(new Uint8Array(12 * 1024 * 1024 + 1)),
  );
  assert.equal(
    (
      await huge.call("resource.search", {
        query: "wood",
        sources: ["polyhaven"],
      })
    ).data.providers[0].error.code,
    "RESOURCE_RESPONSE_TOO_LARGE",
  );
});

test("CLI and MCP expose matching resource sources, contracts and external-read annotations", async (t) => {
  const workspace = await fs.mkdtemp(
    path.join(os.tmpdir(), "owngame-resources-"),
  );
  t.after(() => fs.rm(workspace, { recursive: true, force: true }));
  const cli = await new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [
      path.join(root, "dist/packages/cli/index.js"),
      "resource.sources",
      "--workspace",
      workspace,
    ]);
    let out = "";
    child.stdout.on("data", (b) => (out += b));
    child.on("error", reject);
    child.on("close", (code) =>
      code === 0 ? resolve(JSON.parse(out)) : reject(Error(out)),
    );
  });
  const client = new Client({ name: "resource-test", version: "1" });
  t.after(() => client.close());
  await client.connect(
    new StdioClientTransport({
      command: process.execPath,
      args: [
        path.join(root, "dist/packages/cli/index.js"),
        "mcp",
        "--workspace",
        workspace,
      ],
      stderr: "pipe",
    }),
  );
  const tools = (await client.listTools()).tools;
  for (const op of ["search", "get", "sources"]) {
    const tool = tools.find((t) => t.name === `owngame_resource_${op}`);
    assert(tool);
    assert.equal(tool.annotations.readOnlyHint, true);
    assert.equal(tool.annotations.openWorldHint, op !== "sources");
  }
  const mcp = await client.callTool({
    name: "owngame_resource_sources",
    arguments: {},
  });
  assert.deepEqual(cli.data, mcp.structuredContent.data);
  assert.equal(cli.data.sources.length, 3);
  assert.deepEqual(await fs.readdir(workspace), []);
});
