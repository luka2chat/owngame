# Publish game source and website together

[Documentation](README.md) · [Source catalogue](open-source-games.md)

**Publish matching editable source whenever a game goes live.** This applies to new games, gameplay changes and asset updates. Website builds require a public source commit and stop if sources are missing, versions differ or fingerprints are invalid. A playable build alone is not a complete publication.

<a id="一次性接入"></a>

## Register a game

Keep the production workspace, which contains internal projects and selected immutable deliveries in `.owngame/library`, separate from the public repository checkout. Register the completed delivery with the existing project builder, then maintain the game catalogues referenced by `scripts/web/catalog.mjs`.

For each game ID, register its source directory, build type and licensing in `scripts/games/projects.json`. The exporter supports Phaser, Canvas, plain JavaScript/TypeScript, static sites, Vite and reviewed Unity source allowlists. Add an editable export and an independent build path before supporting another type. Empty directories and minified scripts are not substitutes for editable source.

Preserve upstream revisions, licenses and notices for third-party projects, fonts, images and models. Record the provenance of new assets before publication.

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
