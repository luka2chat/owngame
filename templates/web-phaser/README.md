# Optional Phaser scaffold

This scaffold contains a scene, layout and export pipeline, not a complete game.
Use the default web-canvas starter for the dependency-free playable tutorial.

Requires Node.js >=22. Run `npm install`, then `npm run build`. Each build creates
an immutable `build/<timestamp>` folder and a sibling `.build.json` file. To choose
another fresh destination, set `OWNGAME_GAME_OUT`. Existing output is never overwritten.
Serve the printed package_path with a static HTTP server. No CDN is required at runtime.

Implement rules, input and artwork in src/. The initial 720×1280 design frame is
only a starting point: adapt it to the final viewport and player rather than assuming
it fits all devices. Verify final touch target sizes, background coverage and saves.

Phaser 3.90.0 and eventemitter3 licenses are copied into builds. Generated and
third-party art needs its own provenance. No game artwork is bundled here.
