# Publish game source and website together

[Documentation](README.md) · [Source catalogue](open-source-games.md)

**Publish matching editable source whenever a game goes live.** This applies to new games, gameplay changes and asset updates. Website builds require a public source commit and stop if sources are missing, versions differ or fingerprints are invalid. A playable build alone is not a complete publication.

<a id="一次性接入"></a>

## Register a game

Keep the production workspace, which contains internal projects and selected immutable deliveries in `.owngame/library`, separate from the public repository checkout. Register the completed delivery with the existing project builder, then maintain the game catalogues referenced by `scripts/web/catalog.mjs`.

For each game ID, register its source directory, build type and licensing in `scripts/games/projects.json`. The exporter supports Phaser, Canvas, plain JavaScript/TypeScript, static sites, Vite and reviewed Unity source allowlists. Add an editable export and an independent build path before supporting another type. Empty directories and minified scripts are not substitutes for editable source.

Preserve upstream revisions, licenses and notices for third-party projects, fonts, images and models. Record the provenance of new assets before publication.

## Choose supported platforms

Every catalogue game must explicitly declare `["mobile"]`, `["pc"]` or `["mobile", "pc"]` in `scripts/games/platforms.json`. Missing, empty, duplicate or unknown targets stop catalogue generation. A game only needs to support its declared targets: PC games do not require touch controls, and mobile games do not require keyboard/mouse support. A responsive layout alone does not establish input or device compatibility.

The website defaults to all platforms. Compact All platforms / Mobile / PC filters sit beside the library heading; an explicit URL filter remains shareable, while old device-based preferences do not override the default. Mobile-category games remain playable and downloadable in desktop browsers with their original presentation. PC-only games use the wide, responsive player presentation established by Star Letters. Website classification does not block browser play. Android and iOS expose only games declaring `mobile`; PC-only games cannot be downloaded or opened through old shortcuts in updated clients. Earlier catalogues and installed records without this field retain their historical dual-platform interpretation. Keep installed files and saves when a listing changes; a platform declaration is not an uninstall request.

A PC game that needs mouse capture may explicitly declare `pointerLock: true` in its catalogue entry; the player grants `allow-pointer-lock` only to an opted-in game declaring PC support. Verify capture, release and resume inside the actual player iframe.

Validate actual gameplay, input, performance, saves and offline cold starts on each declared target. Add another target only after that target's acceptance; do not expand all games to every platform by default. Sharing an ID across supported targets preserves saves and update identity. Separate target-specific builds, when needed, require an explicit package/version design rather than an engine or aspect-ratio guess.

Of the 19 catalogue games, Star Letters (`star-letters`) and Tidal Reclaim (`tidal-reclaim`) are classified as PC and the other 17 as mobile. Their game packages and controls are unchanged. For the incoming source candidates, start mobile-focused validation with Space Pinball, Vertical Platformer, Space Dogfighter and Yarn Platformer; start PC-only validation with Rockwild, Riftstrike and Operation: Dust Fang. These are candidate choices, not published games or verified new support claims. Tower defense and single-player card battles can be assessed separately; card multiplayer needs its own service.

For catalogue-only changes such as platform declarations, add `--catalog-only` to `web:publish`. This retains the reviewed game source exports, verifies every game ID/version against the public source index, publishes the updated catalogue/site source through the same CI gates, then builds and deploys. New games and changed game versions must use the normal source export path. This does not bypass source verification or CI.

<a id="正式发布"></a>

## Publish a release

Run in the production workspace. Select a clean public repository checkout and a new website output directory. Use a verified writable storage mount for large outputs and follow the user's storage preferences.

```sh
npm run web:publish -- --repository-dir <clean-public-checkout> --out <new-web-output>
```

For a scoped game update, set `OWNGAME_SOURCE_IDS=<game-id>` (comma-separated for multiple IDs). Only selected sources are refreshed. Other games must already have public sources matching their frozen deliveries and retain their reviewed exports. This prevents unrelated, unaccepted local changes from entering the release. Coverage checks and full source CI still run.

The workflow performs these steps:

1. Export `examples/<id>`, run instructions, assets/licenses, lockfiles and source fingerprints from the frozen deliveries and reviewed source.
2. Check coverage, online-version bindings, file fingerprints and exclusions for caches/private paths. Run `tests/games` and `tests/web` in the exported public checkout. Missing modules, missing translations or test failures stop the process before committing or pushing, without creating a failed remote release record.
3. Push a source release branch. GitHub's `Game source checks` installs dependencies in a clean environment, rebuilds lightweight Web games and checks loading, resources and actual input.
4. After checks pass, fast-forward the public main branch and record the exact source commit. Stop on a concurrent-update rejection and preserve the branch for merging.
5. Read the source index and manifests from that public commit when building the website. Fail if any selected game lacks matching public source.
6. Generate the website catalogue, source links and Recreate briefs, deploy to the existing Cloudflare Pages project and verify online files.

`artifacts/open-source/current.json` is a local release receipt without credentials. A standalone `npm run web:build` also checks the public commit referenced by this receipt. A receipt is not a substitute for source that actually exists on GitHub. Candidate gameplay can still be validated with each game's independent builder before publication.

<a id="失败与恢复"></a>

## Failures and recovery

If source export, dependency installation, CI or version checks fail, website deployment does not run. If GitHub publication succeeds but Pages deployment fails, keep the public source. Fix the cause, then rebuild/deploy using the verified source commit. Do not delete sources or force-overwrite main. The website retains its last successful production deployment. Do not bypass the joint workflow with a raw upload command.

For site-shell or documentation changes that do not replace games, first generate a new output with `web:build`, inspect that interface, then publish the prepared candidate:

```sh
OWNGAME_WEB_PREVIOUS_OUT=<accepted-web-output> npm run web:publish -- --shell-only --prepared --out <reviewed-web-output>
```

This path requires a game catalogue identical to the current live site, rechecks public GitHub source/version fingerprints, and checks for concurrent changes again before deployment. Game version or metadata changes require the full joint workflow.

`scripts/web/usage.mjs` generates the website's usage/licensing body from the README section named `使用与授权`. Keep that heading and the shared content intact. Rebuild and publish the website to synchronize changes to that section.

Repository checks establish only their stated scope. Validate the Unity editor, complete gameplay, human art/feel feedback, phones and offline behavior in the corresponding game delivery. Source synchronization does not automatically mark those checks as passed.

## Reviewed project design boards

Each public example includes `./game-outline.json`. In the production source project, keep private work in `game-outline.json` and prepare an explicitly reviewed `game-outline.public.json` beside it. Register `outline: "game-outline.public.json"` in the game's source entry. The exporter validates and copies only this reviewed snapshot to the public project, adds relative-path usage guidance, and refreshes source-manifest identities. It never falls back to the private file. `node scripts/games/export-outlines.mjs --repository-dir <public-checkout>` updates only reviewed design files and guidance; it does not publish game builds or change online delivery identities.

Keep publicly shared references inside the game directory (for example `./README.md`, `./SOURCE_MANIFEST.json`). Remove local paths, private evidence, embedded previews that have not been reviewed, and personal plans. Record candidate-only verification as candidate-only when the public game still runs an older build. Backups, directory registries and recovery caches stay ignored. The package excludes game designs; public game source contains the reviewed copies.
