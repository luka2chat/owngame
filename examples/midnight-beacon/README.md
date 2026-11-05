# Midnight Beacon · 午夜灯塔

An endless portrait survival game for phones. Drag to move with a responsive floating thumbstick and fire automatically. Each stage lasts 45 seconds before its guardian appears. Defeat the guardian, collect its chest, inspect/equip the revealed gear and choose a relic to enter the next stage with 20% health recovery. There is no final stage.

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

For an online delivery, run `node web/pack.mjs build/mobile-web dist` after export (the output directory must be new). It losslessly compresses and verifies the standard runtime, keeping every file below the hosting limit. The browser verifies and decompresses it before starting Godot. Use a modern browser with WebGL 2 and DecompressionStream. The downloadable package uses the same loader.

[Play online](https://owngame.dev/play?game=midnight-beacon). Source CI checks native game rules and packaging integrity; the Web export and browser run are validated separately.

The second command must print `SMOKE PASS`. See [asset provenance](THIRD_PARTY_NOTICES.md) for the two generated art assets and the sound implementation.

## owngame verification

The local development delivery path was exercised on an Android Moto g84 5G. The Godot Web export was inventoried with `owngame web.inspect`, synced over USB with `owngame device sync`, and loaded in the app's WebView with WebGL 2. The original build reached level 3 and triggered the flare on real-device input. The endless revision also has headless stage-transition, stage-100 scaling and population-bound checks. With no default network, reopening the app after a process stop and launching from Recently Played reached the title screen again. Android reported an active audio stream while the device's media volume was muted. Audible mix, iPhone behavior and player feedback still need evaluation.

The owngame 0.12.0 design-board and Web delivery tools worked with this source and build. Its `project.inspect` expects a Node project, so use Godot for source import and export.

## Keeper equipment

The Equipment button on the title screen and GEAR in combat open a paused, portrait inventory. Six slots (lantern, hat, coat, boots, ring, charm) surround the keeper. Tap an item to inspect its quality, level, score comparison, base attribute and bonus affixes, then equip or remove it. Common, uncommon, rare and legendary items have zero to three bonus affixes. Legendary Soul Light restores 1 health per kill per equipped legendary item.

Guardian chests guarantee one item and upgrade dust. A paused reveal shows its quality, score comparison and main attribute; choose Equip or Keep in Bag before the usual gift choice. The title, combat objective and inventory explain this path. Higher stages increase item level (capped at 100) and the legendary chance (capped at 20%). Upgrade items to +5 with dust; each step adds 15% of their unenhanced attributes. Salvaging a spare item requires a second tap; equipped items cannot be salvaged. At the 24-item limit, the weakest spare or incoming item is recycled automatically, never equipped items.

Gear modifies actual damage, critical chance, attack speed, armor, health capacity, movement, pickup radius and regeneration. Critical lantern hits deal 1.75x damage; critical chance is capped at 60%. Gear is calculated separately from gift upgrades so repeated equipping cannot accumulate bonuses. Raising health capacity does not heal the keeper. Switching away from health gear clamps current health to the new maximum.

Equipment belongs to the current voyage, not a permanent account. The initial voyage and each stage entry save a checkpoint; subsequent gear changes update its inventory without advancing its combat snapshot. Existing checkpoints without equipment receive starter gear, preserving their stage and gifts. New Voyage and defeat retain the existing fresh-run behavior. The title loadout is kept when starting or continuing a voyage.

Tests: `godot --headless --path . --script res://tests/equipment_test.gd` covers 106 inventory, combat and migration checks. `tests/equipment_capture.gd` runs engine touch-event and rendering checks in a separate window; images default to `/tmp/midnight-equipment-evidence`. These checks are separate from WebView, physical-phone and offline acceptance. See [equipment validation](EQUIPMENT-VALIDATION.md).

## Movement and pickup revision

Light thumb movements respond quickly; dragging farther moves the stick base with the finger. Lifting the finger stops movement immediately. Drops from enemies killed outside the arena return to the reachable area, and attracted crystals keep chasing even at maximum movement speed. Chests show a guiding light and a dedicated reward reveal with original synthesized quality/equip cues.

Run `GODOT_BIN=/path/to/godot python3 tools/check.py` for imports, rules, equipment and focused input/pickup tests. See [current validation](FEEL-VALIDATION.md) for the exact package and isolated Android first-stage run. Earlier evidence in EQUIPMENT-VALIDATION.md remains historical. The existing phone's Stage 7 continue entry was preserved; iOS and human feel/audio acceptance remain open.

## Game design board

The editable [game-outline.json](./game-outline.json) lives beside the game source. From this directory run `owngame outline` (or `npx @owngame/cli@latest outline .`). The command opens the local canvas; Ctrl+C stops it. Read the design before development and write design changes and actual validation back afterward. JSON and other project file references are relative to this directory. The published snapshot has been reviewed to remove private content.
