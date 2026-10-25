import fs from "node:fs/promises";
import path from "node:path";
import {
  snapshotBuild,
  resolveBuildDirectory,
  sha,
} from "./device-package.mjs";
import { devices, syncDevice, deviceReceipt } from "./device-transport.mjs";
export function parseDeviceArgs(args) {
  const result = { operation: args[0] || "help", timeout: 120, watch: false };
  const rest = [];
  for (let i = 1; i < args.length; i++) {
    const name = args[i];
    if (name === "--watch") {
      result.watch = true;
      continue;
    }
    if (
      [
        "--platform",
        "--device",
        "--id",
        "--title",
        "--entry",
        "--timeout",
      ].includes(name)
    ) {
      if (!args[i + 1] || args[i + 1].startsWith("--"))
        throw Error("Missing " + name);
      result[name.slice(2)] = args[++i];
      continue;
    }
    if (name.startsWith("-")) throw Error("Unknown device option: " + name);
    rest.push(name);
  }
  if (result.platform && !["android", "ios"].includes(result.platform))
    throw Error("Use --platform android or ios");
  result.timeout = Number(result.timeout);
  if (
    !Number.isInteger(result.timeout) ||
    result.timeout < 5 ||
    result.timeout > 600
  )
    throw Error("--timeout must be 5–600 seconds");
  if (
    !["help", "list", "sync", "logs", "status"].includes(result.operation) ||
    rest.length > 1 ||
    (rest.length && result.operation !== "sync")
  )
    throw Error(
      "Use: owngame device list | sync [build directory] --platform android|ios [--watch] | logs | status",
    );
  if (result.watch && result.operation !== "sync")
    throw Error("--watch belongs to device sync");
  result.directory = rest[0] || ".";
  return result;
}
export async function buildSignature(directory) {
  const rows = [];
  async function walk(relative = "") {
    for (const row of (
      await fs.readdir(path.join(directory, relative), { withFileTypes: true })
    ).sort((a, b) => (a.name < b.name ? -1 : 1))) {
      if (
        row.name.startsWith(".") ||
        [
          "node_modules",
          "game-outline.json",
          "project-files.json",
          "workspace.json",
        ].includes(row.name)
      )
        continue;
      const name = relative ? relative + "/" + row.name : row.name;
      if (row.isDirectory()) await walk(name);
      else {
        const stat = await fs.lstat(path.join(directory, name), {
          bigint: true,
        });
        rows.push([
          name,
          String(stat.size),
          String(stat.mtimeNs),
          String(stat.ino),
        ]);
      }
      if (rows.length > 4096) throw Error("Too many build files");
    }
  }
  await walk();
  return sha(JSON.stringify(rows));
}
async function projectName(build) {
  let cursor = build;
  for (let i = 0; i < 5; i++) {
    try {
      const pkg = JSON.parse(
        await fs.readFile(path.join(cursor, "package.json"), "utf8"),
      );
      if (typeof pkg.name === "string")
        return pkg.name.replace(/^@/, "").replaceAll("/", "-").slice(0, 64);
    } catch {}
    const parent = path.dirname(cursor);
    if (parent === cursor) break;
    cursor = parent;
  }
  const name = path.basename(build);
  if (["dist", "build", "web", "web-mobile", "web-desktop"].includes(name))
    throw Error("Set --id to a stable project name (for example --id my-game)");
  return name;
}
export async function launchDevice(
  args,
  { workspace = process.cwd(), output = console.log } = {},
) {
  const options = parseDeviceArgs(args);
  if (options.operation === "help") {
    output(
      'owngame device list\nowngame device sync ./dist --platform android|ios [--id my-game] [--title "My game"] [--device ID] [--watch]\nowngame device logs --platform android|ios\nowngame device status --platform android|ios\nUSB delivery to the existing container. Build the game first; this command does not publish it.',
    );
    return;
  }
  const discovery = await devices(options.platform);
  if (options.operation === "list") {
    output(JSON.stringify(discovery));
    return discovery;
  }
  const matching = discovery.devices.filter(
    (d) =>
      (!options.platform || d.platform === options.platform) &&
      (!options.device || d.id === options.device),
  );
  if (matching.length !== 1)
    throw Error(
      matching.length
        ? "More than one device matched. Select --platform and --device from device list."
        : "No matching trusted USB device. Unlock/connect the device. " +
            discovery.diagnostics.map((d) => d.message).join("; "),
    );
  const device = matching[0],
    stateDirectory = path.join(workspace, ".owngame", "device"),
    stateFile = path.join(
      stateDirectory,
      device.platform + "-" + sha(device.id).slice(0, 12) + ".json",
    );
  if (["logs", "status"].includes(options.operation)) {
    const previous = JSON.parse(
      await fs.readFile(stateFile, "utf8").catch(() => {
        throw Error("No device sync recorded in this workspace");
      }),
    );
    const receipt = await deviceReceipt(device, previous.requestId);
    if (
      receipt.schema !== "owngame.device-receipt.v1" ||
      receipt.requestId !== previous.requestId
    )
      throw Error("Invalid device receipt");
    output(
      JSON.stringify(
        options.operation === "logs"
          ? {
              requestId: receipt.requestId,
              status: receipt.status,
              logs: receipt.logs || [],
              message: receipt.message,
            }
          : receipt,
      ),
    );
    return receipt;
  }
  const build = await resolveBuildDirectory(
    path.resolve(workspace, options.directory),
  );
  const id = options.id || (await projectName(build));
  let lastVersion,
    lastSignature,
    stopping = false;
  const stop = () => {
    stopping = true;
  };
  if (options.watch) {
    process.on("SIGINT", stop);
    process.on("SIGTERM", stop);
  }
  async function deliver({ launch = true } = {}) {
    let signature = await buildSignature(build);
    let snapshot;
    try {
      for (let attempt = 0; attempt < 3; attempt++) {
        snapshot = await snapshotBuild(build, {
          id,
          title: options.title,
          entrypoint: options.entry || "index.html",
        });
        const after = await buildSignature(build);
        if (after === signature) break;
        await snapshot.cleanup();
        snapshot = undefined;
        signature = after;
      }
      if (!snapshot)
        throw Error(
          "Build changed while taking its snapshot; wait for the build to finish",
        );
      if (snapshot.manifest.game.version === lastVersion) {
        lastSignature = signature;
        return;
      }
      output(
        JSON.stringify({
          status: "transferring",
          platform: device.platform,
          gameId: snapshot.manifest.game.id,
          version: snapshot.manifest.game.version,
          files: snapshot.manifest.files.length,
          bytes: snapshot.manifest.game.bytes,
        }),
      );
      const receipt = await syncDevice(device, snapshot, {
        timeout: options.timeout,
        launch,
      });
      await fs.mkdir(stateDirectory, { recursive: true });
      const temp = stateFile + ".tmp";
      await fs.writeFile(
        temp,
        JSON.stringify(
          {
            device,
            requestId: receipt.requestId,
            gameId: receipt.gameId,
            version: receipt.version,
            build,
          },
          null,
          2,
        ),
      );
      await fs.rename(temp, stateFile);
      lastVersion = receipt.version;
      lastSignature = signature;
      output(
        JSON.stringify({
          status: "running",
          platform: device.platform,
          device: device.name,
          gameId: receipt.gameId,
          version: receipt.version,
          requestId: receipt.requestId,
          logs: receipt.logs || [],
        }),
      );
      return receipt;
    } finally {
      await snapshot?.cleanup();
    }
  }
  try {
    const initial = await deliver();
    if (!options.watch) return initial;
    output(
      JSON.stringify({
        status: "watching",
        directory: build,
        message:
          "Rebuild the game to sync changes. Ctrl+C stops watching; device saves are kept.",
      }),
    );
    let observed = lastSignature,
      changedAt = 0;
    while (!stopping) {
      await new Promise((r) => setTimeout(r, 500));
      if (stopping) break;
      try {
        const current = await buildSignature(build);
        if (current !== observed) {
          observed = current;
          changedAt = Date.now();
          continue;
        }
        if (current !== lastSignature && Date.now() - changedAt >= 750) {
          try {
            await deliver({ launch: false });
          } catch (error) {
            lastSignature = current;
            output(
              JSON.stringify({
                status: "failed",
                message: error.message,
                previousVersion: lastVersion,
              }),
            );
          }
        }
      } catch (error) {
        output(
          JSON.stringify({
            status: "waiting_for_build",
            message: error.message,
          }),
        );
      }
    }
  } finally {
    process.removeListener("SIGINT", stop);
    process.removeListener("SIGTERM", stop);
  }
}
