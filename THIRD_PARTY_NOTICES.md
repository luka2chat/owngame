# Third-party materials

The owngame-authored toolkit source, documentation and bundled authored templates
are licensed under LICENSE (MIT). This notice does not relicense third-party code,
external engines, artwork or reference games.

## npm runtime

The package depends on @modelcontextprotocol/sdk (MIT) and zod (MIT).
Their transitive dependencies remain under their own licenses. npm installs these
packages separately with their notices. package-lock.json pins the source release's
dependency graph. Review each dependency's distributed LICENSE before redistributing
modified or bundled copies; the root MIT license does not replace those notices.

## Templates

- web-canvas: authored code, CSS and procedural Canvas graphics; no third-party
  images, fonts, audio or runtime libraries. Includes its own MIT LICENSE.
- web-phaser: authored scaffold; npm install obtains Phaser 3.90.0 (MIT),
  eventemitter3 (MIT, transitive) and esbuild 0.25.12 (MIT, build tool).
  Its builder copies Phaser and eventemitter3 licenses into the game output and
  retains external legal comments. No reference game's assets are included.
- cocos-minimal: authored scene and script scaffold. Cocos Creator is separately
  installed under its vendor terms; the editor and engine binaries are not bundled.

- unity-home: authored HomeArt exploration scene and scripts extracted from the
  Star Letters example. Includes a Noto Sans SC subset (OFL-1.1), Unity
  template-derived settings (Unity Companion License), and retained vendor
  notices. Unity packages and Editor are installed separately. See
  templates/unity-home/THIRD_PARTY_NOTICES.md and LICENSES.

## Reference cases and exclusions

The three starter cases are authored retrospective summaries, marked reported.
They are not a redistribution of the reference games, APKs, decompiled sources,
level datasets, production artwork, private conversations or raw device captures.
The public source export uses an explicit allowlist. The broader production
workspace remains excluded. Reviewed website game exports are separately described below.

REA inspired the packaging and workflow structure. No REA implementation code is
copied into this toolkit. See https://github.com/morluto/rea .

## Star Letters example

The public repository additionally includes the reviewed game source under
`examples/star-letters`; the npm toolkit does not bundle this game. Its authored
code and procedural assets are MIT, its Noto Sans SC font subset remains OFL-1.1,
and Unity template-derived configuration retains the Unity Companion License.
Unity editor and runtime are not relicensed under MIT. See the example's
THIRD_PARTY_NOTICES.md, LICENSES and SOURCE_MANIFEST.json for scope and provenance.
Caches, private production records, concept art and original Blender working
files are excluded from the public source. The hosted compiled game includes
Unity Runtime under Unity Software Terms and carries its attribution notices.

## Website game examples

All currently hosted games are indexed in games.json with matching source and online delivery manifests. Each examples/<id> directory retains its own LICENSE and THIRD_PARTY_NOTICES.md. The root MIT license does not relicense these projects. In particular, examples/civ-clicker code is GPL-3.0-or-later, with CC BY icons, OFL fonts and separately licensed dependencies. Adapted games preserve upstream commit provenance and notices. Original ImageGen artwork is identified in the game notices. The npm toolkit does not bundle these full games.

## Android client

The public source also includes the Android client and its build/test scripts
under apps/android, scripts/android and tests/android. Authored client code is
MIT. Bundled covers retain per-game licenses (including CivClicker GPL-3.0-or-later,
CC BY 3.0 icons and CC0 Faune assets). See apps/android/ART-PROVENANCE.md and
apps/android/assets/THIRD_PARTY_NOTICES.md; full license texts travel with the APK.
The Android client, APK and signing material are not included in the npm package.

## Android updater host tests


`scripts/android/test-updates.mjs` uses a SHA-256-pinned JSON-java 20240303
JAR from Maven Central for host-only tests. It is stored in ignored `.local/`
and is never bundled in the APK or npm package. Android runtime uses the
platform's org.json classes. Upstream source and license:
https://github.com/stleary/JSON-java/tree/20240303
