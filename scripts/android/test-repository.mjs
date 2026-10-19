import { execFileSync } from "node:child_process";
import { promises as fs } from "node:fs";
import path from "node:path";
import { toolchain } from "./toolchain.mjs";

const root = path.resolve(import.meta.dirname, "../..");
const device = process.argv[2];
const compileOnly = device === "--compile-only";
const webview=process.argv[3]==="--webview";
const gameDir=process.argv[4]==="--star-letters-dir"&&process.argv[5]?path.resolve(process.argv[5]):null;
if (!device || (!compileOnly&&device.startsWith("-")) ||
  (compileOnly&&process.argv.length!==3) || (!compileOnly&&process.argv.length!==3&&
  !(webview&&(process.argv.length===4||(gameDir&&process.argv.length===6))))) {
  throw Error("Usage: node scripts/android/test-repository.mjs DEVICE_SERIAL [--webview [--star-letters-dir GAME_FILES]] | --compile-only");
}
const {java, tools, platform, sdk} = toolchain();
const local = path.join(root, ".local");
await fs.mkdir(local, {recursive: true});
const remote=gameDir?"/data/local/tmp/owngame-webview-"+crypto.randomUUID():null;
const adb=path.join(sdk,"platform-tools/adb");
const out = await fs.mkdtemp(path.join(local, "android-tests-"));
function run(bin, args) {
  return execFileSync(bin, args, {encoding: "utf8", env: {...process.env, JAVA_HOME: java}});
}
try {
  for (const dir of ["app-classes", "classes", "dex"]) await fs.mkdir(path.join(out, dir));
  run(path.join(java, "bin/javac"), ["--release", "8", "-encoding", "UTF-8", "-classpath", platform,
    "-d", path.join(out, "app-classes"), ...(await fs.readdir(path.join(root,"apps/android/src/dev/owngame/app"))).filter(p=>p.endsWith(".java")).map(p=>path.join(root,"apps/android/src/dev/owngame/app",p))]);
  run(path.join(java, "bin/javac"), ["--release", "8", "-encoding", "UTF-8", "-classpath",
    platform + path.delimiter + path.join(out, "app-classes"), "-d", path.join(out, "classes"),
    path.join(root, "tests/android/RepositoryTests.java"),path.join(root,"tests/android/WebViewTests.java")]);
  run(path.join(java, "bin/jar"), ["cf", path.join(out, "tests.jar"), "-C", path.join(out, "classes"), "."]);
  run(path.join(tools, "d8"), ["--lib", platform, "--classpath", path.join(out, "app-classes"),
    "--min-api", "26", "--output", path.join(out, "dex"), path.join(out, "tests.jar")]);
  if (compileOnly) {
    console.log("Android instrumentation harness compiled; device tests not run.");
  } else {
    run(path.join(tools, "aapt2"), ["link", "-o", path.join(out, "base.apk"), "-I", platform,
      "--manifest", path.join(root, "tests/android/AndroidManifest.xml")]);
    run("zip", ["-j", path.join(out, "base.apk"), path.join(out, "dex/classes.dex")]);
    run(path.join(tools, "zipalign"), ["-f", "4", path.join(out, "base.apk"), path.join(out, "aligned.apk")]);
    run(path.join(tools, "apksigner"), ["sign", "--ks", path.join(local, "owngame-android-debug.jks"),
      "--ks-key-alias", "owngame-debug", "--ks-pass", "pass:android", "--key-pass", "pass:android",
      "--out", path.join(out, "tests.apk"), path.join(out, "aligned.apk")]);
    if(gameDir)run(adb,["-s",device,"push",gameDir,remote]);
    run(adb, ["-s", device, "install", "-r", path.join(out, "tests.apk")]);
    const result = run(adb, ["-s", device, "shell", "am", "instrument", "-w",...(remote?["-e","gameFixture",remote]:[]),
      "dev.owngame.tests/dev.owngame.tests."+(webview?"WebViewTests":"RepositoryTests")]);
    const artifacts = path.join(root, "artifacts/android-tests");
    await fs.mkdir(artifacts, {recursive: true});
    await fs.writeFile(path.join(artifacts, webview?"webview-tests.txt":"repository-tests.txt"), result);
    console.log(result);
    if (!result.includes("INSTRUMENTATION_CODE: -1") || result.includes('"passed":false')) process.exitCode = 1;
  }
} finally {
  if(remote)run(adb,["-s",device,"shell","rm","-rf",remote]);
  await fs.rm(out, {recursive: true, force: true});
}
