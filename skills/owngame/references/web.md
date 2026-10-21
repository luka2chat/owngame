# Lightweight Web games

Use `project.create` after the user has chosen a game direction or explicitly asked you to choose. A generic “help me make a game” request needs a brief choice question first; do not select three-in-a-row just because it is the default starter. Adapt or replace the starter gameplay to serve the agreed game.

`project.create {"directory":"my-game","name":"my-game"}` copies the dependency-free `web-canvas` starter into a new directory under the selected workspace. Its parent must exist; existing directories are never overwritten. The starter is an original local two-player three-in-a-row game, with procedural artwork, undo, restart and validated saves. It is a teaching slice, not an AI opponent or a complete game-generation system.

Run `npm test`, `npm run build`, and `npm run preview` in the generated project. Preview uses localhost:3215; `node scripts/serve.mjs dist 3217` selects another port. Build output is `dist`; only previously marked generated output can be replaced. No package install is required for this starter. Modify theme.js for a first visible revision and keep project.js identity stable for existing saves.

Keep rules independent from rendering, and use visible controls for playtests. A read-only state probe can help explain observed input; direct state mutation is not a playtest. Test actual runtime output, not only source modules. Use `web.inspect {"directory":"my-game/dist"}` to bind evidence to a file inventory; it reports runtime and offline as not_run.

Choose `template:"web-phaser"` when the project needs Phaser. That scaffold requires npm install, has no finished gameplay, and uses its own build script. Choose `template:"cocos-minimal"` explicitly for Cocos. Preserve an existing engine unless changing it materially helps the authorized task.

The toolkit does not bundle browser automation, generated art, hosting, phone control or paid APIs. Use available host tools and report any unavailable verification accurately. Serve a build on HTTP; file:// is not the supported module-loading path.
