# Local game development on Android and iOS

The existing owngame clients are the game containers; local development games do not require an official catalog release or an app rebuild for each game update.

## Delivery contract

- `owngame device list` discovers USB-connected Android/iOS devices. Select a platform/device explicitly when several are connected.
- `owngame device sync <built-web-directory> --platform android|ios` snapshots a self-contained Web build, transfers it through the trusted device connection, starts the container and waits for its installation/load receipt.
- `--watch` repeats delivery when build outputs change, with one update at a time and no delivery of partially copied files. The command does not run an arbitrary project build automatically.
- `owngame device logs --platform android|ios` reads the last development game's bounded runtime log/receipt.

The transfer format is `owngame.device-package.v1`: a request UUID, a game descriptor, a sorted list of relative file names, sizes and SHA-256 hashes, and the corresponding files. The game version is the SHA-256 of the canonical file list. A ready marker is transferred last. No HTTP listener, public upload, account, or native game-script bridge is required for USB delivery.

Development IDs use a reserved `dev-` namespace. Official catalog imports cannot occupy it. Versions are immutable; the installed pointer changes only after every file is validated. Development storage retains the current and previous package; completed/failed transfer copies are removed while receipts remain available. Failed imports retain the previous working version, and repeated imports preserve the previous-version link. Native clients keep development games in their normal library with a local-development label, isolated from the official game's identity and Web storage origin. Saves persist across development updates of the same ID. Neither the CLI nor the clients reset data during sync.

A successful transfer receipt is not gameplay acceptance. Installation, entry loading, runtime errors, actual input, offline restart and save retention need separate evidence. This feature is a developer USB workflow; it does not claim to implement the roadmap's consumer file-picker import.

## Acceptance checklist

Both existing clients must receive and run a locally created game using the command on physical devices. Verify a second build replaces the running development game, saves survive, malformed/partial updates retain the previous version, official games remain unchanged, watch mode reloads changed output, and logs distinguish install/load/runtime failures. Build/signing tools and device-specific prerequisites must be documented, with unavailable devices reported explicitly rather than replaced by simulator claims.

## Install and update

Install the released toolkit with `npm install -g @owngame/cli@0.12.0`, or use `npx @owngame/cli@0.12.0 device ...`. Update existing mobile containers in place. See the [Android releases](https://github.com/luka2chat/owngame/releases) and [iOS installation instructions](../apps/ios/README.md).

## Commands and prerequisites

Use a client built with development protocol 1. Update/install the existing app in place; do not uninstall it or clear app data. Protocol 1 is included in Android 0.4.18-alpha and iOS 0.2.0, paired with CLI 0.12.0. Obtain the Android APK from the GitHub releases page; iOS availability depends on the build being enabled for your TestFlight group or on your own signed build.

Android needs the Android SDK's `adb`, a trusted USB connection and USB debugging. Set `ANDROID_SDK_ROOT`/`ANDROID_HOME` or `OWNGAME_ADB` if `adb` is not in the usual location. USB transfer uses ordinary shell/adb permissions; root is not required.

iOS needs a paired/unlocked device, Developer Mode, a signed owngame container, and Python with `pymobiledevice3` 11.39 or newer. Set `OWNGAME_IOS_PYTHON` to that environment's Python executable. Xcode/device support is required for developer launch; modern iOS uses `xcrun devicectl`, while older iOS uses its mounted developer support. On legacy iOS the initial sync restarts the container to bring it to the foreground. Watch updates are received by the running container without reinstalling it.

```sh
owngame device list
npm run build
owngame device sync ./dist --platform android --id my-game --title "My game"
owngame device sync ./dist --platform ios --id my-game --watch
owngame device logs --platform ios
owngame device status --platform android
```

`--device ID` selects a particular device from `device list`. The ID is stable across builds; use the same `--id` to preserve saves. `--entry` selects another HTML entry point. `--timeout` bounds the wait for the phone's result (5–600 seconds). With `--watch`, finish each normal game build and the changed output is delivered after it settles. Stop with Ctrl+C; the installed game remains playable.

The input must be a self-contained Web output directory, not a native APK/IPA or an engine's project/cache directory. Canvas, bundled Phaser/Three.js, Cocos Web and Unity Web builds can use this path when they fit the container's format and runtime limits. Importing a game does not create missing touch controls or prove engine compatibility on every device. All relative resources must be included; remote dependencies remain subject to the container's offline/network restrictions. Development packages allow up to 4096 files, 128 MiB per file and 512 MiB total; public catalog limits remain unchanged. Hidden/private metadata and dependency folders are excluded; symlinks, unsafe paths and signing/key files are rejected.

`logs` and `status` use the last completed sync recorded in the current workspace's ignored `.owngame/device/` directory. They return the native load receipt and bounded console/error records, not a gameplay verdict. Android development WebViews also support `chrome://inspect` over the trusted USB connection. On iOS 16.4+ development game WebViews are inspectable in Safari; the library and official games do not enable this switch.

For a reusable per-user iOS connection environment, the CLI also detects the following standard location (an explicit `OWNGAME_IOS_PYTHON` takes precedence):

```sh
python3 -m venv "$HOME/.local/share/owngame/device-tools/python"
"$HOME/.local/share/owngame/device-tools/python/bin/python" -m pip install 'pymobiledevice3>=11.39'
```
