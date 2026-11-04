# Mobile interaction revision — 2026-11-04

Final candidate: **v08**, Godot **4.4.1**, single-thread compatibility Web export. Nine independent projects share editable GDScript and original generated atlases. Each export is about 51.0 MB. Exact Android package hashes are recorded in `batch.json`.

| Check | Result | Scope |
| --- | --- | --- |
| Imports and exports | 9/9 | Godot 4.4.1; all nine Web outputs generated |
| Rule smoke | 9/9 | Start, pause/resume, mode rules, invalid actions, victory/defeat, retry, next stage and bounded particles |
| Focused input regressions | 9/9 | Synthetic viewport touches: independent movement/action fingers; short jump, edge grace and landing buffer; relative drag without teleporting; no pointer stealing; held table-half flippers; preview/build/upgrade/cancel; card confirmation and turn lock; auto edge hop; held gathering; camp-only crafting; modal input blocking |
| First-stage bots | 9/9 cleared | Ordinary movement/actions, no altered health, teleporting, or goal skips. Tower bot explicitly confirms purchases; card bot waits for turn resolution |
| Physical Android | 9/9 interaction scenarios | Moto g84 in the owngame container. ADB touch/hold/drag and pause; input receipts assert changed game state, not only successful page load. No recorded runtime errors |
| Visual review | Native fixtures and Android captures | Native staged control states and Android play/pause captures reviewed: generated icons, circular skill layout, thumb wings, contextual actions and cooldowns. Toasts sit below the header; the environment continues beneath the translucent controls |
| Audio | 26 runtime cues exercised | Nonempty PCM and per-sample headroom checked. Runtime samples also rendered to a listening montage. No human speaker/headphone listening acceptance claimed |
| iOS | Not run | No iOS compatibility claim |
| Long-term feel and balance | Awaiting play feedback | First-stage bots do not establish human enjoyment or high-stage balance |

## Latest thumb-control pass

- Removed keyboard-style arrows and the bottom row of rectangular text buttons. Side/platform games now use a floating horizontal thumbstick; island/hunting controls use a floating two-axis stick. The base follows thumb travel and movement releases independently of skill touches.
- Large primary skill icons sit at the lower-right thumb position, with smaller secondary icons diagonally above. New original ImageGen icons, press compression/rebound, expanding touch rings, radial cooldowns and ready flashes communicate state. Circular hit geometry matches the controls, targets have at least 48 logical pixels in diameter, and targets do not overlap.
- Shooter/climber steering works across unused bottom space. Dragging over a skill does not activate it or steal the steering pointer. Pinball has broad animated left/right thumb wings as well as held table halves.
- Tower controls change between elemental purchases, upgrade/cancel and wave start; the non-actionable BUILD button and duplicate wave button were removed. Cards show play/cancel only after selecting a card, with the mana cost visible.
- Tower/card actions confirm on release. Dragging outside cancels before spending. Focused tests verify this along with touch geometry, floating-stick reversal, two-finger ownership and existing rule scenarios.
- All nine v08 Web exports passed the physical Android input scenarios and pause checks with no recorded runtime errors. Physical scenarios are single-pointer ADB sequences; multi-touch and slide-away cancellation are synthetic viewport checks.

## Retained gameplay and feedback

- Genre-specific relative dragging, held flippers and contextual selection retain the gameplay behavior from the previous pass; the latest control geometry is described above.
- Platform games now distinguish short hops from held jumps, accept slightly early/late jump inputs, recover at the last supported position and retain dash momentum. The scrolling camera eases toward its look-ahead position.
- Shooting no longer teleports on touchdown. Pointer capture survives a second finger; pause clears it. Shields and bursts have independent cooldowns; runes magnetize and grow firepower.
- Tower selection previews range before spending. Building, upgrading, merging and starting waves are explicit. Matching merge targets are highlighted.
- Cards select before payment, permit target selection, and resolve attacks in timed steps. Repeated touches cannot advance a resolving turn. Card flight, damage and refill feedback show the order of events.
- Hunting selects the nearest valid target and repeats the context action while held. Resource pips, target rings, stamina, weapon arcs and charge lanes make state visible.
- Added character squash/stretch, dash/ball trails, impact rings, reward numbers, camera shake, short hit pauses, bumper pulses, turret recoil, flipper motion and pressed/cooldown button feedback. Effects have bounded lifetimes and counts.
- Expanded synthesis to 26 material/action cues with different transients, filtered noise, harmonic decays and arpeggios. Six prioritized voices, cue throttling and quieter gunfire reduce masking and preserve headroom. No reference-game audio is reused.

## Evidence boundaries

The device scenarios exercise short concrete interactions, not full human playthroughs. Multi-touch ownership is covered by synthetic viewport events; the ADB scenarios use one pointer at a time. Offline cold start was verified for the earlier v03 Sky Cores package and was **not rerun for v08**. Current English in-game text, iOS compatibility, accessibility options and long-session balance remain follow-up areas.

The nine games are compact original 2D interpretations of the inspected reference mechanics. They do not reproduce every original campaign, 3D presentation or multiplayer service. Source publication is independent of a production catalogue release or standalone signed APK/IPA distribution.

## Container limitation retained

Keeping many Godot games alive in separate Android document tasks previously exceeded the WebGL context limit. Each test game is closed through the container capsule before opening the next. No app data, installed packages or saves are cleared. Concurrent background Godot residency still needs a separate container fix.
