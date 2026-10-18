# Changelog

## 0.8.0 — release candidate, not yet published

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
