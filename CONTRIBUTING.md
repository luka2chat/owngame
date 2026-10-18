# Contributing

Useful contributions include reproducible bug fixes, portable templates, scoped
case studies, art recipes and clearer authoring guidance. Keep improvements tied
to observed user tasks; do not add a universal mandatory stage for one game's issue.

Use Node.js >=22, then `npm ci`, `npm run test:release` and
`npm run verify:package`. The package verifier installs into a clean temporary
workspace, exercises CLI and actual stdio MCP, creates/builds/changes a game,
and uses Chromium for real-input checks. Install the browser once with
`npx playwright install chromium` if your environment lacks it. Large browser
caches should use your environment's configured storage location.

AI-assisted contributions are welcome. The contributor owns the result: report
what actually ran, any untested environments and asset/code provenance. Do not
claim human approval from a test result. Include a small reproduction, expected
behavior, installed version and relevant evidence rather than full chat logs.

Keep CLI and MCP behavior in packages/core, install integration in packages/cli,
and project-specific content inside templates. Browser and image tools remain
host capabilities. Code and text contributions must be yours to contribute under
MIT; third-party materials retain their own licenses and notices.

Release maintainers: follow docs/releasing.md. A tag or successful local build
alone does not establish that npm publication and installed-package checks passed.
