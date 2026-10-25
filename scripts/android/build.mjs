import { execFileSync } from "node:child_process";
import { promises as fs } from "node:fs";
import path from "node:path";
import { toolchain } from "./toolchain.mjs";
const root = path.resolve(import.meta.dirname, "../..");
import {localizationFiles} from '../mobile/localization.mjs';
for (const [relative, content] of await localizationFiles()) {
  if (relative.startsWith('apps/android/')) await fs.writeFile(path.join(root, relative), content);
}
const {java, tools, platform} = toolchain();
const out = path.resolve(process.argv[2] ?? path.join(root, "artifacts/android"));
const tempBase = path.resolve(process.env.OWNGAME_ANDROID_TEMP || path.join(root, ".local"));
await fs.mkdir(out, { recursive: true });
await fs.mkdir(tempBase, { recursive: true });
const temp = await fs.mkdtemp(path.join(tempBase, "android-build-"));
const log = [];
function run(bin, args) {
  const start = Date.now();
  try {
    const result = execFileSync(bin, args, {
      cwd: root,
      env: { ...process.env, JAVA_HOME: java },
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
    });
    log.push({
      bin,
      args: args.map((a) => (a.includes("pass:") ? "pass:<debug>" : a)),
      durationMs: Date.now() - start,
      output: result,
    });
    return result;
  } catch (e) {
    log.push({ bin, error: String(e.stderr ?? e) });
    throw e;
  }
}
try {
  await fs.cp(
    path.join(root, "apps/android/assets"),
    path.join(temp, "assets"),
    { recursive: true },
  );
  await fs.mkdir(path.join(temp, "classes"));
  await fs.mkdir(path.join(temp, "dex"));
  run(path.join(java, "bin/javac"), [
    "--release",
    "8",
    "-encoding",
    "UTF-8",
    "-classpath",
    platform,
    "-d",
    path.join(temp, "classes"),
    path.join(root, "apps/android/src/dev/owngame/app/MainActivity.java"),
    path.join(root, "apps/android/src/dev/owngame/app/AppText.java"),
    path.join(root, "apps/android/src/dev/owngame/app/GameActivity.java"),
    path.join(root, "apps/android/src/dev/owngame/app/GameRepository.java"),
    path.join(root, "apps/android/src/dev/owngame/app/AppUpdateChecker.java"),
    path.join(root, "apps/android/src/dev/owngame/app/OwngameApplication.java"),
    ...["AppUpdateDownload.java","AppUpdateInstaller.java","UpdateApkProvider.java","DevelopmentReceipt.java"].map(name=>path.join(root,"apps/android/src/dev/owngame/app",name)),
  ]);
  run(path.join(java, "bin/jar"), [
    "cf",
    path.join(temp, "classes.jar"),
    "-C",
    path.join(temp, "classes"),
    ".",
  ]);
  run(path.join(tools, "d8"), [
    "--lib",
    platform,
    "--min-api",
    "26",
    "--output",
    path.join(temp, "dex"),
    path.join(temp, "classes.jar"),
  ]);
  run(path.join(tools, "aapt2"), [
    "compile",
    "--dir",
    path.join(root, "apps/android/res"),
    "-o",
    path.join(temp, "resources.zip"),
  ]);
  run(path.join(tools, "aapt2"), [
    "link",
    "-R",
    path.join(temp, "resources.zip"),
    "-o",
    path.join(temp, "base.apk"),
    "-I",
    platform,
    "--manifest",
    path.join(root, "apps/android/AndroidManifest.xml"),
    "-A",
    path.join(temp, "assets"),
  ]);
  run("/usr/bin/zip", [
    "-j",
    path.join(temp, "base.apk"),
    path.join(temp, "dex/classes.dex"),
  ]);
  run(path.join(tools, "zipalign"), [
    "-f",
    "4",
    path.join(temp, "base.apk"),
    path.join(temp, "aligned.apk"),
  ]);
  const key = path.join(root, ".local/owngame-android-debug.jks");
  await fs.mkdir(path.dirname(key), { recursive: true });
  try {
    await fs.access(key);
  } catch {
    run(path.join(java, "bin/keytool"), [
      "-genkeypair",
      "-keystore",
      key,
      "-storepass",
      "android",
      "-keypass",
      "android",
      "-alias",
      "owngame-debug",
      "-dname",
      "CN=owngame local debug",
      "-keyalg",
      "RSA",
      "-keysize",
      "2048",
      "-validity",
      "3650",
    ]);
  }
  const apk = path.join(out, "owngame.apk");
  run(path.join(tools, "apksigner"), [
    "sign",
    "--ks",
    key,
    "--ks-key-alias",
    "owngame-debug",
    "--ks-pass",
    "pass:android",
    "--key-pass",
    "pass:android",
    "--out",
    apk,
    path.join(temp, "aligned.apk"),
  ]);
  run(path.join(tools, "apksigner"), ["verify", "--verbose", apk]);
  await fs.writeFile(
    path.join(out, "build.json"),
    JSON.stringify(
      { status: "succeeded", apk, sdk: "34", buildTools: "34.0.0", log },
      null,
      2,
    ) + "\n",
  );
  console.log(JSON.stringify({ status: "succeeded", apk }));
} catch (e) {
  await fs.writeFile(
    path.join(out, "build.json"),
    JSON.stringify({ status: "failed", log, error: e.message }, null, 2) + "\n",
  );
  throw e;
} finally {
  await fs.rm(temp, { recursive: true, force: true });
}
