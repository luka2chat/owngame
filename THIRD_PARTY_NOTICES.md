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

## Reference cases and exclusions

The three starter cases are authored retrospective summaries, marked reported.
They are not a redistribution of the reference games, APKs, decompiled sources,
level datasets, production artwork, private conversations or raw device captures.
The public source export uses an explicit allowlist; the broader production
workspace and its imported games are outside this release's licensing scope.

REA inspired the packaging and workflow structure. No REA implementation code is
copied into this toolkit. See https://github.com/morluto/rea .
