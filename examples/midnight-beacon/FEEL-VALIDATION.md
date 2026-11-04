# Movement, pickups and equipment rewards — 2026-11-04

The player's feedback identified sluggish control, unclear equipment acquisition and unreachable drops near screen edges. This revision preserves the six-slot equipment model, generated pixel atlases, endless stages and existing save format.

- Touch motion uses a floating 24-pixel stick base, a 2-pixel dead zone and a quicker response curve. A light 8-pixel drag moves on the next simulation frame; release stops immediately. Input accumulation is disabled for this real-time touch game.
- New and existing uncollected drops are kept in the reachable area below the HUD and above the bottom controls. Crystal attraction considers the keeper's movement segment, remains latched once acquired and travels faster than the maximum keeper speed. Potions, shields and chests also attract nearby. Movement toward the keeper uses a clamped step, avoiding oscillation or overshoot.
- The title, combat objective and inventory explain that guardians appear after 45 seconds and guarantee an equipment chest. Chests have a light beam, label and guiding line.
- A chest opens a dedicated paused reveal before the gift selection: quality, item icon, score comparison, main attribute, dust and equip/keep choices. Immediate taps are debounced. Full-backpack recycling is explained. Existing ImageGen equipment artwork is retained, with code-driven reveal animation and five original synthesized reward/equip sounds.

## Verification

Godot 4.4.1 import, existing combat/endless smoke, 106 equipment checks and the focused feel/pickup suite pass. The focused suite covers independent pointer release, light drag response, floating-stick reversal, immediate stopping, four outside corners at 30/120 Hz, potion/crystal recovery, maximum-speed attraction, modal combat freeze, reveal debounce, actual touch equip/gift progression, next-stage checkpoint contents and reward PCM headroom. Native 360 × 640 reward rendering was inspected.

The delivered Web package fingerprint is `2256539a3679e6fe92b85bfd7275b5b59db106d5e0a70db5b9ce07f15d750fc7`. The same-ID Android update loaded normally and retained the player's Continue Stage 7 entry.

A separate Android QA package changed only its application name and two save filenames to isolate the player's voyage. It used the same gameplay source and normal single-pointer ADB touch/drag input: equipment entry/return, movement, gift choices, a natural guardian defeat, chest reveal, equip, gift and Stage 2. The run reached Stage 2 with 71 HP after 61.43 simulation seconds, with five inventory items and no recorded runtime errors. No health, enemy, inventory or reward fixtures were injected into the phone run. The production package's Stage 7 save was not used for the battle test.

The phone reward screen and Stage 2 capture were inspected. This is automated physical input, not human approval of feel or audible mix. Native rendering uses an explicit reward fixture. iOS, this revision's offline cold start and long-session balance have not been verified. Source publication is separate from website catalogue deployment.
