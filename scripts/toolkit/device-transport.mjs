import fs from "node:fs/promises";
import path from "node:path";
import os from "node:os";
import { spawn } from "node:child_process";
const bundleId = "dev.owngame.app";
const inbox = "/sdcard/Android/data/" + bundleId + "/files/DevelopmentInbox";
export function run(
  command,
  args,
  { input, timeout = 30000, maxBytes = 1024 * 1024 } = {},
) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { stdio: ["pipe", "pipe", "pipe"] });
    let stdout = "",
      stderr = "",
      size = 0;
    const timer = setTimeout(() => {
      child.kill("SIGTERM");
      reject(Error(command + " timed out"));
    }, timeout);
    child.on("error", (e) => {
      clearTimeout(timer);
      reject(e);
    });
    child.stdout.on("data", (chunk) => {
      size += chunk.length;
      if (size > maxBytes) {
        child.kill("SIGTERM");
        reject(Error("Device response too large"));
      } else stdout += chunk;
    });
    child.stderr.on("data", (chunk) => {
      stderr = (stderr + chunk).slice(-16000);
    });
    child.on("close", (code) => {
      clearTimeout(timer);
      code === 0
        ? resolve(stdout)
        : reject(Error((stdout || stderr || command + " failed").trim()));
    });
    child.stdin.on("error", () => {});
    child.stdin.end(input);
  });
}
function adbBinary() {
  return (
    process.env.OWNGAME_ADB ||
    (process.env.ANDROID_SDK_ROOT || process.env.ANDROID_HOME
      ? path.join(
          process.env.ANDROID_SDK_ROOT || process.env.ANDROID_HOME,
          "platform-tools",
          process.platform === "win32" ? "adb.exe" : "adb",
        )
      : process.platform === "darwin"
        ? path.join(os.homedir(), "Library/Android/sdk/platform-tools/adb")
        : "adb")
  );
}
async function ios(input) {
  const managed = path.join(
    os.homedir(),
    ".local",
    "share",
    "owngame",
    "device-tools",
    "python",
    process.platform === "win32" ? "Scripts" : "bin",
    process.platform === "win32" ? "python.exe" : "python",
  );
  const python =
    process.env.OWNGAME_IOS_PYTHON ||
    (await fs.access(managed).then(
      () => managed,
      () => "python3",
    ));
  const transferSeconds =
    input.operation === "sync"
      ? Math.min(300, Math.ceil((input.bytes || 0) / (1024 * 1024)) * 2 + 30)
      : 30;
  let raw;
  try {
    raw = await run(python, [path.join(import.meta.dirname, "device-ios.py")], {
      input: JSON.stringify(input),
      timeout: ((input.timeout || 30) + transferSeconds) * 1000,
    });
  } catch (error) {
    let message;
    try {
      message = JSON.parse(error.message).error;
    } catch {}
    throw Error(message || error.message);
  }
  return JSON.parse(raw);
}

export async function devices(platform) {
  const all = [],
    diagnostics = [];
  if (!platform || platform === "android")
    try {
      const rows = (await run(adbBinary(), ["devices", "-l"]))
        .split("\n")
        .slice(1)
        .filter(Boolean);
      for (const row of rows) {
        const [id, state] = row.trim().split(/\s+/);
        if (state !== "device") {
          diagnostics.push({ platform: "android", id, message: state });
          continue;
        }
        all.push({
          platform: "android",
          id,
          name: /model:(\S+)/.exec(row)?.[1]?.replaceAll("_", " ") || id,
        });
      }
    } catch (e) {
      diagnostics.push({ platform: "android", message: e.message });
    }
  if (!platform || platform === "ios")
    try {
      all.push(...(await ios({ operation: "list" })).devices);
    } catch (e) {
      diagnostics.push({ platform: "ios", message: e.message });
    }
  return { devices: all, diagnostics };
}
export function validateReceipt(receipt, expected) {
  if (
    receipt?.schema !== "owngame.device-receipt.v1" ||
    receipt.requestId !== expected.requestId
  )
    throw Error("Invalid or stale container receipt");
  if (receipt.status === "failed")
    throw Error("Container rejected the build: " + receipt.message);
  if (
    receipt.status !== "running" ||
    receipt.gameId !== expected.game.id ||
    receipt.version !== expected.game.version
  )
    throw Error("Container did not load the transferred game version");
  return receipt;
}
export async function syncDevice(
  device,
  snapshot,
  { timeout = 120, launch = true } = {},
) {
  if (device.platform === "ios")
    return validateReceipt(
      await ios({
        operation: "sync",
        device: device.id,
        bundle: snapshot.bundle,
        bytes: snapshot.manifest.game.bytes,
        ready: snapshot.ready,
        requestId: snapshot.manifest.requestId,
        timeout,
        launch,
      }),
      snapshot.manifest,
    );
  const adb = (...args) =>
    run(adbBinary(), ["-s", device.id, ...args], {
      timeout: Math.max(30000, timeout * 1000),
    });
  let capable = false;
  try {
    capable =
      JSON.parse(await adb("shell", "cat", inbox + "/capabilities.json"))
        .protocol === 1;
  } catch {}
  if (!capable) {
    await adb(
      "shell",
      "am",
      "start",
      "-W",
      "-f",
      "0x24000000",
      "-n",
      bundleId + "/.MainActivity",
    );
    for (let i = 0; i < 10 && !capable; i++) {
      await new Promise((r) => setTimeout(r, 500));
      try {
        capable =
          JSON.parse(await adb("shell", "cat", inbox + "/capabilities.json"))
            .protocol === 1;
      } catch {}
    }
    if (!capable)
      throw Error(
        "This owngame container needs the device-development update. Update the app without clearing its data.",
      );
  }
  const remote = inbox + "/" + snapshot.manifest.requestId;
  // Android's scoped storage may let the shell create an app-directory path
  // while adbd's secure_mkdirs refuses it. Create directories via the standard
  // shell first; transfer bytes with adb push, without root or app-data access.
  const quote = (value) => "'" + value.replaceAll("'", "'\\''") + "'";
  const directories = [
    ...new Set([
      remote,
      remote + "/files",
      ...snapshot.manifest.files.map((file) =>
        path.posix.dirname(remote + "/files/" + file.path),
      ),
    ]),
  ];
  for (let i = 0; i < directories.length; i += 32)
    await adb(
      "shell",
      "mkdir",
      "-p",
      ...directories.slice(i, i + 32).map(quote),
    );
  await adb("push", snapshot.bundle, inbox + "/");
  const ready = path.join(snapshot.stage, "ready.json");
  await fs.writeFile(ready, snapshot.ready);
  await adb("push", ready, remote + "/ready.json");
  await adb(
    "shell",
    "am",
    "start",
    "-W",
    "-f",
    "0x24000000",
    "-n",
    bundleId + "/.MainActivity",
    "--es",
    "owngame_development",
    snapshot.manifest.requestId,
  );
  const end = Date.now() + timeout * 1000;
  while (Date.now() < end) {
    let receipt;
    try {
      receipt = JSON.parse(await adb("shell", "cat", remote + "/receipt.json"));
    } catch {}
    if (receipt && ["running", "failed"].includes(receipt.status))
      return validateReceipt(receipt, snapshot.manifest);
    await new Promise((r) => setTimeout(r, 750));
  }
  throw Error(
    "No container receipt. Unlock/open owngame and check the app update. The previous game remains installed.",
  );
}
export async function deviceReceipt(device, requestId) {
  if (
    !/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/.test(
      requestId,
    )
  )
    throw Error("Invalid request ID");
  if (device.platform === "ios")
    return ios({ operation: "receipt", device: device.id, requestId });
  return JSON.parse(
    await run(adbBinary(), [
      "-s",
      device.id,
      "shell",
      "cat",
      inbox + "/" + requestId + "/receipt.json",
    ]),
  );
}
