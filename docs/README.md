# owngame documentation

[Project overview](../README.md) · [中文入门](zh-CN/quickstart.md)

Technical instructions for agents, developers and maintainers are maintained in English as the canonical text. The project README and the short Chinese getting-started guide provide Chinese entry points. Case studies and historical evidence retain their original language; they describe the stated project/version, not an evergreen guarantee.

## Start creating

- [Set up your AI assistant](agent-setup.md): the shared CLI path, existing-installation handling and explicit availability checks.
- [Installation and optional MCP](install.md): manual setup, updates, host configuration and recovery.
- [Create and revise your first game](quickstart.md): a playable starter, actual input and a visual revision that preserves saves.
- [Recreate a website game](remix.md): turn a reference brief into a task in your workspace.
- [Continue an imported Node game](../skills/owngame/references/importing.md): inspect existing commands, platform dependencies and scoped validation before editing.

For an agent, read setup first when integration is needed, then the installed [owngame Skill](../skills/owngame/SKILL.md). Follow only the task-relevant references for [Web](../skills/owngame/references/web.md), [Cocos](../skills/owngame/references/cocos.md), [art](../skills/owngame/references/art.md), [iteration](../skills/owngame/references/iteration.md) and [testing](../skills/owngame/references/testing.md). Use `capabilities` for the installed runtime's current operations and parameters.

## Source, delivery and maintenance

- [Website game source](https://github.com/luka2chat/owngame/blob/main/docs/open-source-games.md): run instructions, version binding and project-specific licensing.
- [Publish source and website together](https://github.com/luka2chat/owngame/blob/main/docs/game-publishing.md): source-first release checks, shell-only publication and recovery.
- [Release the toolkit](releasing.md): reviewed exports, package verification and publication boundaries.
- [Contribute](../CONTRIBUTING.md) · [Security](../SECURITY.md) · [Third-party notices](../THIRD_PARTY_NOTICES.md).

Game source examples and website publication tooling belong to the GitHub repository; they are not all included in the npm toolkit. See the [repository documentation](https://github.com/luka2chat/owngame/tree/main/docs) for those workflows.

## Cases and visual guidance

[Case studies](cases/) record implementation, art iteration and scoped evidence. [Style recipes](style-recipes.json) provide optional visual guidance. Keep project identifiers, command names, paths, JSON fields, UI labels and literal search keywords unchanged when translating prose. English documentation does not require the assistant to answer the user in English.

## Documentation maintenance

Maintain technical behavior in the canonical English document. Keep the Chinese guide short and link to it rather than duplicating every command and constraint in a second full manual. Update cross-references when headings change. Preserve existing inbound anchors where practical, especially licensing links from the README and website. Translation must not turn `unknown`, `not_checked`, `not_run` or pending human feedback into a successful validation claim.

- [Local game design board](../apps/outline/README.md): per-game JSON, canvas, CLI/MCP and development context.
