# Midnight Beacon · 午夜灯塔

An endless portrait survival game for phones. Drag to move and fire automatically. Each stage lasts 45 seconds before its guardian appears. Defeat the guardian, collect its chest and choose a relic to enter the next stage with 20% health recovery. There is no final stage.

Four recurring locations change the palette and encounter pressure. Later stages introduce ranged jellyfish and telegraphed charging eels. Coral stages strengthen enemy health, while abyss stages speed enemies up. Guardian health and damage grow with the stage.

Twelve repeatable upgrade families support damage, extra lanterns, speed, pickup range, health, armor, regeneration, lightning, a burning halo, stronger flares and improved drops. Upgrades that reach a practical fire-rate, speed, range or target limit grant a useful alternative bonus. Potions restore health and rune shields grant temporary protection. Upgrade ranks apply to the current voyage, and the best stage is saved locally. Stage entry saves a checkpoint with the current build. Continue resumes that stage after closing the game. Defeat clears the checkpoint. New Voyage explicitly starts a fresh build.

Monster, projectile and pickup counts are bounded for long sessions. Crystal values merge when the pickup limit is reached, preserving their experience value.

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

The local development delivery path was exercised on an Android Moto g84 5G. The Godot Web export was inventoried with `owngame web.inspect`, synced over USB with `owngame device sync`, and loaded in the app's WebView with WebGL 2. The original build reached level 3 and triggered the flare on real-device input. The endless revision also has headless stage-transition, stage-100 scaling and population-bound checks. With no default network, reopening the app after a process stop and launching from Recently Played reached the title screen again. Android reported an active audio stream while the device's media volume was muted. Audible mix, iPhone behavior and player feedback still need evaluation.

The owngame 0.12.0 design-board and Web delivery tools worked with this source and build. Its `project.inspect` expects a Node project, so use Godot for source import and export.

## Game design board

The editable [game-outline.json](./game-outline.json) lives beside the game source. From this directory run `owngame outline` (or `npx @owngame/cli@latest outline .`). The command opens the local canvas; Ctrl+C stops it. Read the design before development and write design changes and actual validation back afterward. JSON and other project file references are relative to this directory. The published snapshot has been reviewed to remove private content.
