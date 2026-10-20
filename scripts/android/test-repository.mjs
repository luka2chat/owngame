import { execFileSync } from "node:child_process";
import { promises as fs } from "node:fs";
import path from "node:path";
import { toolchain } from "./toolchain.mjs";

const root = path.resolve(import.meta.dirname, "../..");
const device = process.argv[2];
const compileOnly = device === "--compile-only";
const updates=process.argv[3]==="--updates";
const webview=process.argv[3]==="--webview";
const gameDir=process.argv[4]==="--star-letters-dir"&&process.argv[5]?path.resolve(process.argv[5]):null;
if (!device || (!compileOnly&&device.startsWith("-")) ||
  (compileOnly&&process.argv.length!==3) || (!compileOnly&&process.argv.length!==3&&
  !(webview&&(process.argv.length===4||(gameDir&&process.argv.length===6)))&&!(updates&&process.argv.length===6))) {
  throw Error("Usage: node scripts/android/test-repository.mjs DEVICE_SERIAL [--webview [--star-letters-dir GAME_FILES] | --updates APK RELEASE_MANIFEST] | --compile-only");
}
const {java, tools, platform, sdk} = toolchain();
const local = path.join(root, ".local");
await fs.mkdir(local, {recursive: true});
const remote=gameDir||updates?"/data/local/tmp/owngame-webview-"+crypto.randomUUID():null;
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
    path.join(root, "tests/android/RepositoryTests.java"),path.join(root,"tests/android/WebViewTests.java"),path.join(root,"tests/android/UpdateInstallTests.java")]);
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
    let installArgs=[];
    if(updates){
      const metadata=JSON.parse(await fs.readFile(process.argv[5],"utf8"));
      if(!/^[0-9A-Za-z.-]+$/.test(metadata.version)||!Number.isSafeInteger(metadata.version_code))throw Error("Invalid test APK metadata");
      await fs.writeFile(path.join(out,"fixture.xml"),'<manifest xmlns:android="http://schemas.android.com/apk/res/android" package="dev.owngame.app"><uses-sdk android:minSdkVersion="26"/><application android:label="Wrong signer fixture"/></manifest>');
      run(path.join(tools,"aapt2"),["link","-o",path.join(out,"wrong-base.apk"),"-I",platform,"--manifest",path.join(out,"fixture.xml"),"--version-code",String(metadata.version_code),"--version-name",metadata.version]);
      run(path.join(java,"bin/keytool"),["-genkeypair","-keystore",path.join(out,"fixture.jks"),"-storepass","android","-keypass","android","-alias","fixture","-dname","CN=Updater wrong signer test","-keyalg","RSA","-keysize","2048","-validity","1"]);
      run(path.join(tools,"apksigner"),["sign","--ks",path.join(out,"fixture.jks"),"--ks-pass","pass:android","--out",path.join(out,"wrong.apk"),path.join(out,"wrong-base.apk")]);
      run(adb,["-s",device,"shell","mkdir","-p",remote]);run(adb,["-s",device,"push",path.resolve(process.argv[4]),remote+"/update.apk"]);run(adb,["-s",device,"push",path.join(out,"wrong.apk"),remote+"/wrong.apk"]);
      installArgs=["-e","apk",remote+"/update.apk","-e","wrongSigner",remote+"/wrong.apk","-e","version",metadata.version,"-e","code",String(metadata.version_code)];
    }
    const result = run(adb, ["-s", device, "shell", "am", "instrument", "-w",...(gameDir?["-e","gameFixture",remote]:[]),...installArgs,
      "dev.owngame.tests/dev.owngame.tests."+(updates?"UpdateInstallTests":webview?"WebViewTests":"RepositoryTests")]);
    const artifacts = path.join(root, "artifacts/android-tests");
    await fs.mkdir(artifacts, {recursive: true});
    await fs.writeFile(path.join(artifacts, updates?"update-install-tests.txt":webview?"webview-tests.txt":"repository-tests.txt"), result);
    console.log(result);
    if (!result.includes("INSTRUMENTATION_CODE: -1") || result.includes('"passed":false')) process.exitCode = 1;
  }
} finally {
  if(remote)run(adb,["-s",device,"shell","rm","-rf",remote]);
  await fs.rm(out, {recursive: true, force: true});
}
