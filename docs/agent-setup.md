# Universal setup instructions for AI coding assistants

[Documentation](README.md) · [中文入门](zh-CN/quickstart.md)

When a user gives you this document, they want to use owngame in their current game project. Complete setup and verification, then continue their game task. If they have not specified what game to make, ask for their choice before creating one; “help me make a game” alone does not select the default template's gameplay. Use the shared CLI: the user does not need to choose an assistant type, and the host does not need MCP support. Communicate with the user in their preferred language; English documentation does not require English game content or replies.

<a id="1-检查项目与环境"></a>

## 1. Check the project and environment

- Run commands in the game project selected by the user. Do not create a game inside the toolkit installation. Preserve existing project rules and the user's chosen engine, style and scope.
- Check `node --version` and `npm --version`. Node.js 22 or newer is required. Report missing requirements accurately; follow the user's and host's authorization rules before installing system software.
- You need to read this document, read and write project files, and execute commands. A chat-only assistant cannot complete installation; do not claim that it has.
- If the project already has a working owngame installation, read its installed Skill and call `capabilities` first. Preserve its version unless the user asks to install or update. Do not repeat setup or replace an existing MCP connection unnecessarily.

<a id="2-安装当前发布版本"></a>

## 2. Install the published toolkit

Run in the game project directory:

```sh
npx --yes @owngame/cli@latest setup --agent generic --apply
```

This is the common command for all assistants. `generic` generates portable project files; it is not a request for the user to identify their assistant. `@latest` selects npm's currently published version. When launched from the temporary npx cache, setup installs that same version in the project's `.owngame/toolkit` so subsequent calls do not depend on the cache. An existing stable local installation keeps its installation location.

Parse `runtime` and `applied` from the successful output. Setup files have been written only when the process exits successfully and `applied` is `true`. Read `.agents/skills/owngame/SKILL.md`, then follow its `references/` links as needed for the task. Automatic Skill discovery by the host is not required.

Setup preserves unrelated configuration and backs up overwritten content. If it reports a local modification conflict, preserve the user's changes and identify the conflicting files. Do not delete configuration to force a retry. `.owngame/mcp.json` contains optional MCP connection information; this CLI workflow does not require importing it, restarting the assistant, or waiting for an MCP connection.

<a id="3-验证并使用-cli"></a>

## 3. Verify and use the CLI

Replace `<runtime>` with the actual `runtime` returned by setup. Keep the quotes to support paths containing spaces. Run in the same game project:

```sh
node "<runtime>/dist/packages/cli/index.js" capabilities
node "<runtime>/dist/packages/cli/index.js" doctor
```

Confirm that `capabilities` returns `succeeded`, and that `doctor` reports `node_supported: true` and `knowledge: succeeded`. A `not_checked` field for MCP, browsers or engines is neither a CLI installation failure nor evidence that those external capabilities work.

Use this stable entry point for subsequent operations. Discover operation names and parameters through `capabilities`. These read-only checks complete availability verification; creating a sample game is not part of setup.

<a id="4-开始创作"></a>

## 4. Continue the user's game task

Briefly report the installed version, CLI verification results and actual blockers. Check the conversation and any selected game reference for the user's intended gameplay. If it is still unspecified, including “help me make a game” or a theme alone, ask one short choice question in their language. Offer a few concrete directions and let them describe another idea. For example: “你想做哪类游戏？可以选轻松解谜、动作冒险、经营养成，也可以说自己的想法。” Wait for their choice before creating a project or writing game-specific code and art. Do not infer three-in-a-row, an AI opponent, or another game from the bundled example.

If the user has already specified a game or explicitly asked you to decide, proceed without repeating this question. For an existing game, continue the requested edits and preserve its rules and saves.

After the direction is agreed, choose a suitable starter. For complex JSON, write a temporary parameter file in the project and pass it with `@file` to avoid shell quoting differences. The following is only a command syntax example: the default `web-canvas` starter contains three-in-a-row gameplay and must be adapted or replaced for the agreed game. Verify that the destination does not exist, then save this as `create-game.json`:

```json
{"directory":"my-game","name":"my-game"}
```

```sh
node "<runtime>/dist/packages/cli/index.js" project.create @create-game.json
```

Follow the Skill: deliver a complete playable core loop early, inspect actual visuals and input, and preserve existing rules and saves. Use the host's available tools for image generation, browser playtesting and external engines; report each verification scope separately.

These checks establish CLI availability. They do not certify every assistant host, game behavior, visual quality or target device. MCP is an optional enhancement; configure it through [installation and integration](install.md) only when needed.

## Persistent game design context

When capabilities include `outline.get`, read the game's `game-outline.json` before implementation and update affected cards with actual evidence after changes. `project.create` initializes it automatically; use `outline.init` for existing game directories. `owngame outline` opens the local canvas, which shares these files with CLI/MCP. See the [outline workflow](../skills/owngame/references/outline.md). These capabilities require CLI 0.11.0 or later. Check the installed capabilities before using them.
