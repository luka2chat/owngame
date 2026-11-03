# Midnight Beacon · 午夜灯塔

A three-minute portrait survival game for phones. Drag anywhere in the arena to move. The keeper automatically throws lantern fire. Collect crystals to level up and to charge a radial flare. Choose one of three upgrades when the action pauses. Watch for an elite from the fog at 45, 90 and 135 seconds.

Built with Godot 4.4.1 and GDScript. The Web preset uses the Compatibility renderer and a single-threaded WebAssembly export so it can run in the owngame mobile container without cross-origin isolation. It needs Godot's matching standard export templates.

## Build and try on a phone

From this directory, run the following with Godot 4.4.1 on your PATH. Override `GODOT_BIN` if the executable is named differently.

```sh
sh build-web.sh
owngame device sync ./build/mobile-web --platform android --id midnight-beacon --title "Midnight Beacon"
```

Use `--platform ios` for a paired iPhone with a development-enabled owngame container. A device receipt confirms transfer and entry loading. Play a round to verify input, rendering and sound on that device.

Open `project.godot` in the Godot editor to edit the game. For a headless rules and asset check, run the following.

```sh
godot --headless --path . --import
godot --headless --path . --quit-after 120 --script res://tests/smoke.gd
```

The second command must print `SMOKE PASS`. See [asset provenance](THIRD_PARTY_NOTICES.md) for the two generated art assets and the sound implementation.

## owngame verification

The local development delivery path was exercised on an Android Moto g84 5G. The Godot Web export was inventoried with `owngame web.inspect`, synced over USB with `owngame device sync`, and loaded in the app's WebView with WebGL 2. Real-device input reached level 3 and triggered the flare. With no default network, reopening the app after a process stop and launching from Recently Played reached the title screen again. Android reported an active audio stream while the device's media volume was muted. Audible mix, iPhone behavior and player feedback still need evaluation.

The owngame 0.12.0 design-board and Web delivery tools worked with this source and build. Its `project.inspect` expects a Node project, so use Godot for source import and export.

## Game design board

The editable [game-outline.json](./game-outline.json) lives beside the game source. From this directory run `owngame outline` (or `npx @owngame/cli@latest outline .`). The command opens the local canvas; Ctrl+C stops it. Read the design before development and write design changes and actual validation back afterward. JSON and other project file references are relative to this directory. The published snapshot has been reviewed to remove private content.
