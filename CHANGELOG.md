# Changelog

## 0.12.0 — 2026-10-25

- Add USB device discovery, local Web game sync, build-output watch, and runtime receipts/logs through `owngame device`.
- Extend the existing Android/iOS containers with verified local-development packages, isolated identities/storage, immutable updates and rollback. Official games, downloads and saves are preserved.
- Stabilize snapshots from SMB/NAS build outputs, while rejecting real in-progress writes and replaced files.
- Keep local packages and device/signing state private; this does not publish games or implement consumer file-picker import.

## 0.11.2 — 2026-10-23

- Zoom the canvas with the wheel and pan while holding the mouse; use one-finger pan and two-finger pinch on touch screens, with stable transitions and cancellation.
- Fit cards when opening boards and show project-local image, GLB and level previews. External asset symlinks require a private local allowlist; no machine-specific network paths are bundled.
- Organize 19 public Web game boards into design and scoped historical-validation cards. Keep unverified work and unpublished candidates explicit, use project-relative references, and exclude private reports and embedded images.
- Verify gesture input, package installation and project JSON synchronization; physical-phone gesture acceptance remains separate.

## 0.11.1 — 2026-10-23

- Open a game-local board with `owngame outline [directory]`; initialize missing project JSON, open the browser, and choose a free port if the default is occupied. Use `--no-open` for headless workflows.
- Store workspace bindings as relative paths and migrate legacy absolute bindings without changing game designs. Copying a project preserves its board.
- Publish reviewed, sanitized game design snapshots beside each public game source, with relative JSON references and development guidance. Private originals, backups and caches remain excluded from npm and public exports.

## 0.11.0 — 2026-10-23

- Add the local infinite game-design canvas with six planning areas, structured
  cards, relationships, derived progress, previews, and import/export.
- Share each game's `game-outline.json` between the canvas and CLI/MCP through
  `outline.init`, `outline.list`, `outline.get`, and guarded `outline.update`.
  `owngame outline` starts the loopback-only page; external edits refresh while
  idle, stale writes are rejected, and unavailable files remain read-only.
- Initialize design files and project guidance with `project.create`. Teach the
  skill to read current design before development and record changes and actual
  validation afterward. `project.inspect` exposes bounded existing-project
  metadata and the linked outline context without running project scripts.
- Package the canvas and its existing owngame brand assets. Exclude private
  project designs, directory bindings, backups and local caches from distribution.
- Migration: older central canvas data is preserved in individual local project
  files. Existing source directories opt in with `outline.init`; no game code or
  saves are migrated. Review project JSON before choosing to share it yourself.

## 0.10.0 — 2026-10-22

- Add shared CLI/MCP `resource.sources`, `resource.search` and `resource.get` for
  live model, texture, HDRI and image metadata from Poly Haven, ambientCG and Openverse.
- Return previews, source licenses, download sizes, format/resolution choices and
  model dependencies without downloading asset files. Preserve partial search
  results and report unavailable providers as unknown.
- Ask users to choose a game direction when their request is unspecified; finish
  setup checks without treating the bundled sample as their chosen game.
  Proceed directly when a direction is known or the user delegates the choice.

## 0.9.0 — 2026-10-19

- Add `unity-home`, a standalone HomeArt exploration starter with character movement,
  camera controls, a four-step quest, bundled art and Chinese UI font.
- Expose the Unity template through the shared CLI/MCP `project.create` operation;
  generate independent product and application identities and ignore Unity caches.
- Verify Unity scene/resource integrity from the packed and published npm package,
  including creation through the `@latest` command in a fresh consumer directory.
- Keep the default Web starter and existing project files unchanged. Unity Editor
  6000.3.26f1 is installed separately; a general Unity build adapter, touch controls,
  and platform builds are outside this release's validated scope.

## 0.8.0 — 2026-10-18

First complete public toolkit candidate after the npm 0.0.1 scope smoke test.

- Project-scoped setup preview/apply with matching Skill and MCP runtime,
  config backups, local-edit conflict detection and read-only doctor.
- Dependency-free playable Web starter, responsive original procedural art,
  undo/restart, validated saves and independent rules tests.
- Three curated historical cases, task-specific Skill routing and tutorial.
- Explicit source export, package verification, CI and release workflow.

### Migration from the internal 0.7.0 workspace

project.create now defaults to web-canvas. Pass template:"cocos-minimal" for the
previous counter scaffold; web-phaser is an optional scaffold. Default knowledge
is now starter-knowledge (three public cases). Pass --knowledge with an explicit
external directory to use a different schema-compatible collection. No private
research data is published. Existing project files and saves are not migrated.

CLI help/setup/doctor are CLI-only; core operations still share CLI/MCP contracts.
Existing legacy operations remain opt-in with --legacy and are not recommended
for new integrations. The old structured creation-request contract describes the
historical Cocos experiment, not every Web project; concise project docs are valid.
