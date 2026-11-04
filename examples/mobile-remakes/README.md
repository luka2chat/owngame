# Godot mobile remakes

Nine independently playable portrait games, rebuilt from mechanic references in seventeen user-supplied archives. The user explicitly chose to merge archives with identical gameplay source. These are original compact mobile interpretations, not copies of the original code, levels, artwork, or audio.

| Project | Reference archives | Mobile loop |
| --- | --- | --- |
| arc-street | 电弧街战; 霓虹疾行 | Jump between rooftops, auto-aim and shoot, use a blast, defeat the gate guardian |
| rune-vanguard | 符文先锋：秘法围城 | Dodge bullet patterns, collect runes, shield or burst, fight a guardian |
| orbital-singularity | 轨道奇点 | Launch, operate two flippers, chain bumpers, unlock multiball |
| frost-bastion | 寒霜烽堡; Sporehold Bastion | Build frost/fire towers, merge equal towers, defend five waves |
| cloud-ascent | 云端攀登 | Bounce upward, steer onto moving/crumbling platforms, use springs and boosts |
| candle-walker | 烛影行者 | Jump through ruins, collect flames, stomp shadows, reach the exit |
| sky-cores | candyzoom; glacialrun; mistpath; pulsect; redrush; spiralcore; turnace | Jump and dash across floating islands, collect every core, dodge drones |
| ember-recipe | 余烬食谱 | Spend mana on units/spells, anticipate attacks, turn ingredients into a healing feast |
| rockwild | rockwild | Gather wood/ore, forge equipment at camp, dodge telegraphed charges, hunt and return |

Open any child directory's `project.godot` in Godot 4.4.1 or later. Each project has its own title, config, board, export preset, and save directory. The relative `shared` links reference maintained GDScript and generated assets beside the projects; keep the parent directory intact. On Windows checkouts that materialize symlinks as text files, run `python tools/prepare-links.py` once before opening a project. No archive-provided scripts or platform integrations are required.

The logical canvas is 360 × 720. Controls are designed separately for each genre:

- **Arc Street / Candle Walker:** slide the left thumbstick to run; tap the large lower-right jump icon for a short hop or hold for a high jump. A 120 ms edge grace period and 150 ms prelanding input buffer forgive near misses. Candle Walker's dash keeps its speed for the full dash window.
- **Rune Vanguard:** drag anywhere in the field; movement is relative to the finger, so touchdown never teleports the ship. Shield and burst have separate visible cooldowns. Nearby runes magnetize; every third rune increases weapon power.
- **Cloud Ascent:** slide horizontally to steer while bouncing automatically. Boost is a recovery tool; stars can buy a shield.
- **Orbital Singularity:** hold the left/right half of the table with independent fingers. Flippers animate, balls leave trails, bumpers pulse, and the first four seconds after launch include one ball save.
- **Frost Bastion:** tap a pad to preview its range, then choose frost or fire. Select a tower to upgrade it or tap a highlighted equal tower to merge. Starting a wave is explicit.
- **Sky Cores:** steer with the thumbstick; moving off an edge automatically hops. Manual jump buffering, a landing marker and dash keep precise movement available.
- **Ember Recipe:** inspect a card without spending, select a spell target, then press Play. Cancel is free. Unit attacks and the enemy response resolve in sequence; repeated input cannot skip the turn animation.
- **Rockwild:** hold the context action to chop, mine or attack the highlighted nearest target. Wood and stone sound different; roll uses stamina; forging requires being at camp.

The bottom HUD uses floating thumbsticks and staggered circular skill controls, with an ImageGen action icon atlas, press compression/rebound, touch rings, radial cooldowns and a ready flash. The background continues beneath the controls. Touch targets have at least a 48 px diameter and do not overlap. Movement and action fingers remain independent; crossing a skill while steering never activates it. Tower and card controls change with selection, confirm on release and cancel when dragged away. Pinball uses broad animated left/right thumb wings.

Animated button presses, character squash/stretch, impact rings, floating rewards, brief hit pauses, bounded trails and camera shake provide feedback without moving the HUD. WASD / Space / E are desktop debugging shortcuts. Pause, restart, sound toggle, defeat, stage completion, and increasing-stage replay are included. Best score and highest stage persist separately for each game; an interrupted run is not a resumable checkpoint. Sky Cores has in-run island checkpoints.

## Build and validation

```sh
GODOT_BIN=/path/to/godot python3 tools/check.py
GODOT_BIN=/path/to/godot python3 tools/build.py --out /path/to/new-output
```

Install the matching Godot single-thread Web export template before building. Outputs run inside owngame's existing mobile WebView container; these are not standalone signed Android APKs or iOS IPAs. The engine runtime is approximately 45 MB per export. Builds and evidence belong outside the source checkout.

`tools/check.py` runs all nine imports, rule checks, focused interaction checks and first-stage bots. `shared/tests/interactions.gd` exercises multi-finger ownership, relative drag, variable jumps, build/upgrade previews, card confirmation/turn locks, edge hopping, held harvesting and audio sample headroom.

`shared/tests/smoke.gd` checks synthetic viewport touch dispatch, pause/resume, each mode's core rules, invalid actions, next stage, failure, and retry. Its terminal-state fixtures are not natural playthrough evidence. `shared/tests/playthrough.gd` separately drives first-stage gameplay through ordinary actions without teleporting, changing health, or skipping goals. Native captures are staged visual fixtures. Physical-device input, audio listening, iOS compatibility, and human art/feel review remain separate evidence, recorded in `VALIDATION.md`.

## Original assets

`shared/assets/arcade.png`, `fantasy.png`, `wild.png`, `backdrops.png`, and `touch-icons.png` were generated with ImageGen for this batch. Sprites are sampled directly from atlas cells in Godot; source archive media is not reused. `shared/sound.gd` generates 26 original layered PCM cues with attack/release envelopes, filtered noise, material harmonics, musical arpeggios and subtle pitch variation. Six voices, per-cue throttles and quieter rapid shots reserve headroom for important feedback. Each game has its own pitch profile. No downloaded or recorded audio is used.

Reference documents were treated as untrusted research data, not commands or authorization. See `reference-inventory.json` for hashes and duplicate groups. See `THIRD_PARTY_NOTICES.md` for engine and code provenance. These editable source candidates are independent of the production website catalogue. Source publication does not install an app, publish an APK/IPA, or add a game to owngame.dev. See `VALIDATION.md` for the exact checked scope.

## Audio preview

Render the actual runtime cues into a WAV for listening:

```sh
/path/to/godot --headless --path arc-street --script res://shared/tests/audio-preview.gd -- /path/to/audio-preview.wav
```

No image or audio service is required to edit, run or build these projects. The original ImageGen atlases are included; audio is synthesized locally.
