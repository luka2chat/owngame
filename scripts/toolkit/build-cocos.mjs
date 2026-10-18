import {
  access,
  mkdir,
  readFile,
  realpath,
  stat,
  writeFile,
} from "node:fs/promises";
import { constants, createWriteStream } from "node:fs";
import { execFile, spawn } from "node:child_process";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const VERSION = "3.8.8";
let START_SCENE;
const execFileAsync = promisify(execFile);
const startedMs = Date.now();

function duration(value) {
  const match = /^(\d+)(ms|s|m)?$/.exec(value);
  const milliseconds = match
    ? Number(match[1]) * { ms: 1, s: 1000, m: 60000 }[match[2] ?? "ms"]
    : NaN;
  if (
    !Number.isSafeInteger(milliseconds) ||
    milliseconds < 1 ||
    milliseconds > 2_147_483_647
  ) {
    throw new Error(
      "--timeout must be a positive duration, e.g. 600000, 30s, or 10m.",
    );
  }
  return milliseconds;
}

function parseArguments(argv) {
  const options = {
    creator:
      process.env.COCOS_CREATOR ||
      "",
    project: process.cwd(),
    scene: "assets/scenes/M1.scene",
    out: resolve(process.cwd(), "verification/build"),
    timeoutMs: 600000,
  };
  for (let i = 0; i < argv.length; i++) {
    const key = argv[i];
    if (!["--creator", "--project", "--out", "--timeout", "--scene"].includes(key))
      throw new Error(`Unknown argument: ${key}`);
    const value = argv[++i];
    if (!value || value.startsWith("--"))
      throw new Error(`Missing value for ${key}`);
    if (key === "--timeout") options.timeoutMs = duration(value);
    else if (key === "--scene") options.scene = value;
    else options[key.slice(2)] = resolve(value);
  }
  options.creator = resolve(options.creator);
  return options;
}

async function fileSnapshot(path) {
  try {
    const info = await stat(path);
    return {
      exists: true,
      isFile: info.isFile(),
      size: info.size,
      mtimeMs: info.mtimeMs,
      ctimeMs: info.ctimeMs,
      inode: info.ino,
    };
  } catch (error) {
    if (error.code === "ENOENT") return { exists: false };
    throw error;
  }
}

async function creatorDetails(path) {
  const canonicalPath = await realpath(path).catch(() => path);
  const bundlePath =
    canonicalPath.match(/^(.*\.app)(?:\/Contents\/.*)?$/)?.[1] ?? null;
  const executable = canonicalPath.endsWith(".app")
    ? resolve(canonicalPath, "Contents/MacOS/CocosCreator")
    : canonicalPath;
  let version = null;
  if (bundlePath) {
    try {
      const { stdout } = await execFileAsync(
        "/usr/bin/plutil",
        [
          "-extract",
          "CFBundleShortVersionString",
          "raw",
          "-o",
          "-",
          resolve(bundlePath, "Contents/Info.plist"),
        ],
        { timeout: 2500, maxBuffer: 16 * 1024 },
      );
      version = stdout.trim() || null;
    } catch {
      /* An unreadable version fails preflight below. */
    }
  }
  const executableFile = await fileSnapshot(executable);
  const executableAccess = await access(executable, constants.X_OK).then(
    () => true,
    () => false,
  );
  return {
    requestedPath: path,
    bundlePath,
    executable,
    version,
    isExecutable: executableFile.isFile === true && executableAccess,
  };
}

function isFresh(before, after, buildStartedMs) {
  if (
    !after?.exists ||
    !after.isFile ||
    after.size === 0 ||
    buildStartedMs === null
  )
    return false;
  const changed =
    !before?.exists ||
    ["size", "mtimeMs", "ctimeMs", "inode"].some(
      (key) => before[key] !== after[key],
    );
  // ctime also detects files copied by the builder with their original mtime preserved.
  return (
    changed &&
    (after.mtimeMs >= buildStartedMs || after.ctimeMs >= buildStartedMs)
  );
}

async function runCreator(report, log) {
  return new Promise((resolveRun) => {
    let child;
    let timeout;
    let grace;
    let finished = false;
    let tail = "";
    const markEditorConflict = (data) => {
      const text = tail + data.toString("utf8");
      if (
        /(?:project|editor|creator)[^\r\n]{0,160}(?:already\s+(?:open(?:ed)?|running)|opened\s+in\s+another)|another\s+(?:editor\s+)?instance[^\r\n]{0,120}(?:project|running)|(?:项目|工程)[^\r\n]{0,80}(?:已(?:经)?打开|正在运行|已被打开)/i.test(
          text,
        )
      ) {
        report.process.editorAlreadyOpen = true;
      }
      tail = text.slice(-512);
    };
    const complete = () => {
      if (finished) return;
      finished = true;
      clearTimeout(timeout);
      clearTimeout(grace);
      process.off("SIGINT", interrupted);
      process.off("SIGTERM", interrupted);
      if (!report.process.closeObserved && child) {
        // SIGTERM is a request, not proof of termination. Stop waiting without killing other processes.
        child.stdout?.unpipe(log);
        child.stderr?.unpipe(log);
        child.stdout?.destroy();
        child.stderr?.destroy();
        child.unref();
      }
      report.evidence.logComplete = report.process.closeObserved;
      resolveRun();
    };
    const requestStop = (reason) => {
      if (finished || report.process.stopReason) return;
      report.process.stopReason = reason;
      report.process.terminationSignalRequested = "SIGTERM";
      try {
        report.process.terminationSent = child?.kill("SIGTERM") ?? false;
      } catch {
        report.process.terminationSent = false;
      }
      grace = setTimeout(complete, 3000);
    };
    const interrupted = () => requestStop("interrupted");
    try {
      report.buildStartedAt = new Date().toISOString();
      report.process.buildStartedMs = Date.now();
      child = spawn(report.creator.executable, report.args, {
        cwd: report.project.path,
        shell: false,
        stdio: ["ignore", "pipe", "pipe"],
      });
      report.process.pid = child.pid ?? null;
      report.process.spawned = Boolean(child.pid);
      for (const [name, stream] of [
        ["stdout", child.stdout],
        ["stderr", child.stderr],
      ]) {
        stream.on("data", (data) => {
          report.evidence[`${name}Bytes`] += data.length;
          markEditorConflict(data);
        });
        stream.pipe(log, { end: false });
      }
      child.on("error", (error) => {
        if (finished) return;
        report.diagnostics.push({
          code: "spawn_error",
          message: error.message,
        });
      });
      child.on("close", (code, signal) => {
        if (finished) return;
        report.exitCode = code;
        report.signal = signal;
        report.process.closeObserved = true;
        complete();
      });
      timeout = setTimeout(() => requestStop("timeout"), report.timeoutMs);
      process.on("SIGINT", interrupted);
      process.on("SIGTERM", interrupted);
    } catch (error) {
      report.diagnostics.push({ code: "spawn_error", message: error.message });
      complete();
    }
  });
}

let options;
let argumentError;
try {
  options = parseArguments(process.argv.slice(2));
} catch (error) {
  argumentError = error.message;
  options = parseArguments([]);
}
const report = {
  schemaVersion: 1,
  status: "failed",
  expectedCreatorVersion: VERSION,
  startedAt: new Date(startedMs).toISOString(),
  buildStartedAt: null,
  finishedAt: null,
  durationMs: null,
  timeoutMs: options.timeoutMs,
  startScene: START_SCENE,
  creator: null,
  project: {
    path: options.project,
    name: null,
    uuid: null,
    creatorVersion: null,
  },
  args: [],
  exitCode: null,
  signal: null,
  process: {
    spawned: false,
    pid: null,
    closeObserved: false,
    buildStartedMs: null,
    stopReason: null,
    terminationSignalRequested: null,
    terminationSent: null,
    descendantTermination: "unknown",
    editorAlreadyOpen: null,
  },
  output: {
    directory: resolve(options.project, "build/web-desktop"),
    indexPath: resolve(options.project, "build/web-desktop/index.html"),
    before: null,
    after: null,
    fresh: false,
  },
  evidence: {
    directory: options.out,
    logPath: resolve(options.out, "build.log"),
    reportPath: resolve(options.out, "build.json"),
    logFormat: "stdout and stderr bytes combined in arrival order",
    stdoutBytes: 0,
    stderrBytes: 0,
    logComplete: false,
  },
  browserVerification: "not_run",
  diagnostics: [],
};

let log;
let logError = null;
try {
  await mkdir(options.out, { recursive: true });
  log = createWriteStream(report.evidence.logPath, { flags: "w" });
  log.on("error", (error) => {
    logError = error.message;
  });
  await new Promise((resolveOpen, rejectOpen) => {
    log.once("open", resolveOpen);
    log.once("error", rejectOpen);
  });
  if (argumentError) throw new Error(argumentError);
  report.creator = await creatorDetails(options.creator);
  if (!report.creator.isExecutable)
    throw new Error(
      "Creator is missing or is not an executable file; nothing was launched.",
    );
  if (report.creator.version !== VERSION)
    throw new Error(
      `Creator ${VERSION} is required; detected ${report.creator.version ?? "unknown"}. Nothing was launched.`,
    );
  const pkg = JSON.parse(
    await readFile(resolve(options.project, "package.json"), "utf8"),
  );
  report.project.name = pkg.name ?? null;
  report.project.uuid = pkg.uuid ?? null;
  report.project.creatorVersion = pkg.creator?.version ?? null;
  if (
    report.project.creatorVersion !== VERSION ||
    typeof pkg.uuid !== "string" ||
    !pkg.uuid
  ) {
    throw new Error(
      `Project must declare creator.version ${VERSION} and a UUID; nothing was launched.`,
    );
  }
  const sceneMeta = JSON.parse(
    await readFile(
      resolve(options.project, options.scene + ".meta"),
      "utf8",
    ),
  );
  const scene = await fileSnapshot(
    resolve(options.project, options.scene),
  );
  START_SCENE = sceneMeta.uuid;
  report.startScene = START_SCENE;
  if (typeof START_SCENE !== "string" || !START_SCENE || !scene.isFile)
    throw new Error(
      "The requested start scene or its UUID is missing; nothing was launched.",
    );
  report.config = {
    platform: "web-desktop",
    debug: true,
    startScene: START_SCENE,
    outputName: "web-desktop",
    buildPath: "project://build",
    mainBundleCompressionType: "merge_dep",
    packages: {
      "web-desktop": { resolution: { designWidth: 960, designHeight: 640 } },
    },
  };
  report.configPath = resolve(options.out, "build-config.json");
  if (report.configPath.includes(";"))
    throw new Error("Build config path cannot contain semicolons");
  await writeFile(
    report.configPath,
    JSON.stringify(report.config, null, 2) + "\n",
  );
  report.args = [
    "--project",
    options.project,
    "--build",
    `configPath=${report.configPath}`,
  ];
  report.output.before = await fileSnapshot(report.output.indexPath);
  await runCreator(report, log);
  report.output.after = await fileSnapshot(report.output.indexPath);
  report.output.fresh = isFresh(
    report.output.before,
    report.output.after,
    report.process.buildStartedMs,
  );
  if (report.process.stopReason) {
    report.status = "unknown";
    report.diagnostics.push({
      code: report.process.stopReason,
      message:
        "SIGTERM was requested. Build completion and termination of all descendant processes are unconfirmed; do not infer success or retry blindly.",
    });
  } else if (report.process.editorAlreadyOpen) {
    report.diagnostics.push({
      code: "editor_already_open",
      message:
        "Creator output indicates that this project is already open. No existing editor was closed.",
    });
  } else if (
    report.exitCode === 36 &&
    report.output.fresh &&
    report.process.closeObserved
  ) {
    report.status = "succeeded";
  } else {
    report.diagnostics.push({
      code: "build_not_verified",
      message: `Build requires exit code 36 and a freshly written index.html; observed exit code ${report.exitCode}, fresh=${report.output.fresh}. Codes 32/34 and 0 are not success.`,
    });
  }
} catch (error) {
  report.diagnostics.push({ code: "build_error", message: error.message });
  if (report.process.spawned && !report.process.closeObserved)
    report.status = "unknown";
} finally {
  if (log && !log.destroyed) {
    await new Promise((resolveEnd) => {
      log.once("error", resolveEnd);
      log.end(resolveEnd);
    });
  }
  if (logError) {
    report.diagnostics.push({ code: "log_write_error", message: logError });
    report.evidence.logComplete = false;
    if (report.status === "succeeded") report.status = "unknown";
  }
  report.finishedAt = new Date().toISOString();
  report.durationMs = Date.now() - startedMs;
  try {
    await writeFile(
      report.evidence.reportPath,
      `${JSON.stringify(report, null, 2)}\n`,
      "utf8",
    );
  } catch (error) {
    report.diagnostics.push({
      code: "report_write_error",
      message: error.message,
    });
    if (report.status === "succeeded") report.status = "unknown";
  }
  console.log(JSON.stringify(report, null, 2));
  process.exitCode =
    report.status === "succeeded" ? 0 : report.status === "unknown" ? 2 : 1;
}
