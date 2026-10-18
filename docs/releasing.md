# Release a reviewed toolkit

The production workspace contains games and research that are not part of this
open-source release. `npm run release:prepare -- --out <new-directory>` exports
only the allowlisted toolkit source, public cases, templates, tests and docs.
Pass `--repository https://github.com/OWNER/REPO` with the real destination to set
package repository and issue URLs. The export refuses existing directories and
symlinks. SOURCE_MANIFEST.json records copied source identities. Do not upload the
production workspace wholesale.

## Local candidate

In the clean exported repository run `npm ci`, `npm test`, and
`npm run verify:package`. Install Playwright's Chromium first when needed.
`OWNGAME_CHROME_PATH` optionally selects an existing Chrome executable; the report
records its actual version. Verification uses a fresh temporary installation,
CLI/MCP parity, project creation/build, rules, real pointer/keyboard input,
save reload and a visual revision. Inspect the emitted screenshots manually.

Artifacts live under artifacts/release/<version> and are excluded from source.
The verified tarball is the release candidate. The workflow must publish those
same bytes, not rebuild a different archive. `--published` downloads the exact
version from npm, compares its hash with the candidate and repeats checks. It
writes a separate <version>-published report. A failure is recorded, not a pass.

## First public release

1. Create the intended public GitHub repository and push only this clean export.
   Confirm package repository/bugs metadata names that repository.
2. Configure an npm-release GitHub environment and an appropriately scoped npm
   publishing token as its NPM_TOKEN secret. Prefer environment review before
   publication. Do not place credentials in files, issues or conversation logs.
3. CI must pass for the exact revision selected for the release. Review the
   tarball contents, licenses, screenshots and stated untested scope. Keep
   changelog/README/install instructions accurate about candidate vs published.
4. Run Publish reviewed toolkit with the exact version and revision. It repeats
   checks, publishes the tested archive and verifies the registry installation.
5. After registry verification succeeds, create a matching v<version> Git tag
   and GitHub Release with release notes, known limitations and the tested
   archive. Point the tag at the workflow revision; do not tag a later change.
   Update public installation instructions only after that outcome is known.

Preparing files alone does not establish GitHub or npm publication, a host
connection, or user art approval. Check the actual release and registry outcomes.
The manual workflow is intentionally smaller than REA's mature release system.
MCP Registry submission and automatic release PRs can follow after real users
validate installation. Neither is a prerequisite for using the stdio server.

## Recovery and versioning

Do not overwrite or unpublish an existing version as a repair. Inspect whether
npm publication happened before retrying a failed workflow. If the registry has
the same candidate bytes, rerun installed-package verification separately. If a
code fix is required, publish a new version and record migration notes. A tag,
local pack, successful upload and verified registry installation are separate
outcomes. Ordinary pushes and pull requests do not publish.

For this pre-1.0 toolkit, document behavior changes explicitly. 0.8.0 changes the
default template and public starter knowledge relative to internal 0.7.0; see
CHANGELOG.md. Keep skill and runtime versions matched through setup. Maintain
CLI/MCP contracts in the shared core and preserve existing game saves.
