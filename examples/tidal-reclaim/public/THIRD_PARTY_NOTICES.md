# Tidal Reclaim: source and asset notices

## Origin and adaptations

Tidal Reclaim (潮汐回收站) is a second-stage adaptation of the user's Manus-generated **Riftstrike / Iron Rift: Onslaught (裂隙突击)** project. The project owner confirmed use of their paid Manus account on 2026-10-22 and requested public source publication. Preserve this origin notice. Manus and the asset providers do not endorse this game.

The original project supplied the Three.js/Rapier shooter framework, weapon systems, asset pipeline and generated audiovisual material. Owngame's adaptation adds the offshore reclamation environment, three purification objectives and timed extraction, encounter changes, new paid Tripo robot/purifier assets, illustrated menus and responsive title composition. Project code and the owner's generated artwork/models/audio are distributed under the accompanying MIT license to the extent the owner holds rights. Third-party content retains its own terms; this statement does not relicense it.

Manus states that users own generated outputs and may use them personally or commercially, subject to third-party rights: https://help.manus.im/en/articles/13125514-do-i-own-the-assets-websites-images-videos-slides-generated-via-manus (checked 2026-10-22). The upstream README identifies its music, sound effects, HUD/effects images and reconstructed models as generated for this project. This attribution is the retained origin evidence, not a claim that every underlying provider receipt was available.

## Excluded Mixamo content

The original README identifies Mixamo X Bot rigs and animations. Original humanoid character GLBs and their animation data are **excluded** from both the source export and runtime delivery. All humanoids, including the player's shadow body, now use the separately generated paid Tripo rig and idle/walk/run animation clips. The model's Mixamo-compatible bone naming convention does not mean it contains downloaded Adobe animation clips.

Adobe distribution guidance: https://community.adobe.com/questions-696/mixamo-faq-licensing-royalties-ownership-eula-and-tos-589400?lang=en

## Paid Tripo outputs

`generated-assets/patrol-robot.glb` and `generated-assets/purifier.glb` were generated using the owner's purchased Tripo CN API credits. The robot rig and three clips were generated through that service, not downloaded from Mixamo. See `tripo-assets.provenance.json` and `tripo-asset-plan.json` for exact file hashes, processing and prompts. Paid-output rights are described in section 5.2.2 of https://developers.tripo3d.com/zh/terms (checked 2026-10-22). Account details, billing records, keys and signed download URLs are excluded.

## Poly Haven assets: CC0

HDRI: The Sky Is On Fire. Textures: Concrete Floor 03, Concrete Floor Worn 001, Concrete Wall 008, Rusty Metal 02, Corrugated Iron 02, Metal Plate. Models: Barrel 03, Old Military Crate, Wooden Military Crate, Medical Box, Ammo Box, Propane Tank, Utility Box 02, Security Light. Converted WebP/GLB runtime files are listed with hashes in `public-assets.json`. Original attribution comes from the supplied fetch/build scripts and README. Poly Haven permits modification and redistribution under CC0: https://polyhaven.com/license .

## Fonts

Chakra Petch and Figtree: SIL Open Font License 1.1; retain `public/fonts/ChakraPetch-OFL.txt` and `Figtree-OFL.txt`. The upstream ManusCJK subset is identified as ManusCC0 Sans CJK SC and carries `public/fonts/ManusCC0-LICENSE.txt` (CC0). It is not part of the MIT artwork grant.

## Interface artwork

The robot portrait, offshore platform scene and transparent title lettering were generated using built-in OpenAI imagegen for this adaptation. Full prompts, references and hashes are in `interface-art.provenance.json`. Runtime files are under `src/art`; the game-card cover is derived from the same menu artwork. AI-assisted provenance does not imply exclusivity or guaranteed copyright protection.

## Runtime libraries

- Three.js: MIT, https://github.com/mrdoob/three.js/blob/dev/LICENSE
- Rapier / @dimforge/rapier3d-compat: Apache-2.0, https://github.com/dimforge/rapier.js/blob/master/LICENSE
- meshoptimizer decoder included by Three.js: MIT, https://github.com/zeux/meshoptimizer/blob/master/LICENSE.md

Retain the full bundled notices under `licenses/`. Build dependencies retain their npm package licenses. No online API, login, remote model endpoint or runtime CDN is required by the game.
