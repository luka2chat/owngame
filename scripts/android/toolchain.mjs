import { execFileSync } from "node:child_process";
import { accessSync, constants } from "node:fs";
import os from "node:os";
import path from "node:path";

export function toolchain(env = process.env, platformName = process.platform) {
  if (platformName === "win32") {
    throw Error("Use Linux or macOS (or WSL with Linux SDK tools) to build this client.");
  }
  const sdk = env.ANDROID_SDK_ROOT || env.ANDROID_HOME ||
    path.join(os.homedir(), platformName === "darwin" ? "Library/Android/sdk" : "Android/Sdk");
  let java = env.OWNGAME_JAVA_HOME || env.JAVA_HOME;
  if (!java && platformName === "darwin") {
    try { java = execFileSync("/usr/libexec/java_home", ["-v", "17"], {encoding: "utf8", stdio: ["ignore", "pipe", "pipe"]}).trim(); }
    catch { /* Report the required environment variable below. */ }
  }
  if (!java) throw Error("Set JAVA_HOME (or OWNGAME_JAVA_HOME) to a JDK 17 installation.");
  const tools = path.join(sdk, "build-tools/34.0.0");
  const platform = path.join(sdk, "platforms/android-34/android.jar");
  for (const file of [platform, ...["javac", "jar", "keytool"].map(name => path.join(java, "bin", name)),
    ...["aapt2", "d8", "zipalign", "apksigner"].map(name => path.join(tools, name))]) {
    try { accessSync(file, constants.R_OK); }
    catch { throw Error("Install JDK 17, Android SDK platform 34 and build-tools 34.0.0; check JAVA_HOME and ANDROID_SDK_ROOT."); }
  }
  return {sdk, java, tools, platform};
}
