# Installation and agent integration

[Documentation](README.md) · [中文入门](zh-CN/quickstart.md)

Requires Node.js >=22 and npm. Use `@latest` for the currently published npm release. Unpublished development versions can be packed and installed from source.

<a id="推荐把接入交给助手"></a>

## Recommended: let your assistant handle setup

Open the game project in an AI coding assistant that can read and write files and run commands. Send:

```text
Follow https://raw.githubusercontent.com/luka2chat/owngame/main/docs/agent-setup.md
Set up owngame in this project, verify it works, then help me make a game.
```

The assistant follows the [universal setup instructions](agent-setup.md), reads the Skill and verifies the CLI. No assistant selection, MCP configuration or host reload is required for this path. The remaining sections cover manual installation and optional MCP integration.

<a id="从-npm-安装当前发布版本"></a>

## Install the published version manually

Run in the game project directory:

```sh
npx @owngame/cli@latest setup --agent generic
npx @owngame/cli@latest setup --agent generic --apply
```

The first command previews changes; `--apply` writes them. `generic` is the shared CLI path for any assistant with file and command access. Read the generated `.agents/skills/owngame/SKILL.md`, then use the returned `runtime` as described in [agent setup](agent-setup.md#3-verify-and-use-the-cli).

When launched from the temporary npx cache, apply installs the same version in `.owngame/toolkit` and registers its absolute entry point. This requires npm network access and disables dependency installation scripts. An existing stable local installation uses its current location. After moving or deleting that installation, run setup again.

To update when requested, rerun the `@latest` commands, previewing before applying. Projects do not update themselves in the background. Updating the toolkit does not migrate games that have already been created.

<a id="从本地安装包开始"></a>

## Install a local package

In the toolkit source directory, run `npm ci` and `npm pack`. Install the resulting tarball in a separate empty directory. Replace the path and `<version>` with the actual package location and version:

```sh
npm install "/absolute/path/owngame-cli-<version>.tgz"
npx owngame --version
npx owngame capabilities
npx owngame setup --agent generic
npx owngame setup --agent generic --apply
npx owngame doctor
```

Writes are scoped to the current project. `--workspace /absolute/path` selects another existing directory. Do not use the toolkit's extracted package directory as the game workspace.

## Optional: configure host-specific MCP

The CLI workflow above does not require this section. If the user wants MCP, select the matching setup adapter:

| Adapter | Project configuration | Skill location |
| --- | --- | --- |
| `codex` | owngame MCP table in `.codex/config.toml` | `.agents/skills/owngame` |
| `cursor` | owngame entry in `.cursor/mcp.json` | `.cursor/skills/owngame` |
| `generic` | `.owngame/mcp.json`, for manual host import | `.agents/skills/owngame`, for explicit reading |

For example, to preview and apply the Codex adapter:

```sh
npx @owngame/cli@latest setup --agent codex
npx @owngame/cli@latest setup --agent codex --apply
```

Setup preserves unrelated configuration and backs up overwritten content in `.owngame/setup-backups`. Locally edited owngame configuration and Skills cause conflicts; merge those changes first. Reapplying identical content does not create another backup. Setup does not modify global configuration or prove that the host is connected.

For MCP, reload the host, trust the project configuration and call `owngame_capabilities` to check the version. Codex loads project configuration only for trusted projects. Generated Cursor configuration has been tested; independent agent authoring in that host still needs separate validation.

Host references: [Codex MCP](https://learn.chatgpt.com/docs/extend/mcp?surface=cli), [Skills](https://learn.chatgpt.com/docs/build-skills), [Cursor MCP](https://cursor.com/docs/mcp).

<a id="skill-与-mcp-可分别使用"></a>

## Skill, CLI and MCP boundaries

Reading a Skill does not install MCP, a browser or an engine. The CLI can be used independently:

```sh
npx owngame research.prepare '{"query":"美术"}'
npx owngame project.create '{"directory":"my-game","name":"my-game"}'
npx owngame guidance.get '{"topic":"web"}'
```

The Chinese query `美术` is an intentional keyword matching the bundled case metadata; it is not a requirement to use Chinese instructions. Search is keyword-based. Use terms present in the case library rather than assuming automatic translation or semantic retrieval.

CLI and MCP share the same core: `knowledge.search` maps to `owngame_knowledge_search`. Exit codes are `0` for `succeeded`, `1` for `failed`, and `2` for `unknown`. Use `@file` or `-` for file/stdin JSON. `help`, `setup` and `doctor` are CLI-only helpers. Historical workflows are visible only with `--legacy`; they are not prerequisites for game creation.

The bundled library contains public historical case summaries. Snapshot mode remains `unknown`. A source fingerprint establishes summary-file integrity; it does not validate an upstream game or rerun a historical experiment. `--knowledge` selects a library with the same format. External source mappings may be stored in the project's `.owngame/local.json`; do not commit this machine-specific configuration.

<a id="运行边界与恢复"></a>

## Runtime requirements and recovery

The default Web starter has no external runtime dependencies. The Phaser scaffold requires `npm install`. Cocos requires a separately installed Creator 3.8.8; its build adapter has only been verified in a specific macOS environment. Image generation, browser input, phone access and publication are host capabilities. `doctor` does not download engines, test a physical phone or certify MCP connectivity.

Before uninstalling an MCP integration, stop the host connection. Remove only the managed owngame configuration block/entry and its Skill, preserving other servers. You may then remove the project's `.owngame/toolkit` and setup manifests. Do not delete game source, saves or the entire `.owngame` directory: it may contain user delivery records. There is no automatic uninstall command.

<a id="创建-unity-项目"></a>

## Create a Unity project

Use the latest published CLI with a separately installed Unity editor. The `unity-home` starter was introduced in CLI 0.9.0; its editor and package requirements are documented in the [template README](../templates/unity-home/README.md). Run in the intended workspace:

```sh
npx @owngame/cli@latest project.create '{"directory":"my-unity-game","name":"my-unity-game","template":"unity-home"}'
```

Add `my-unity-game` in Unity Hub, open `Assets/Scenes/HomeArt.unity` and press Play. Unity Package Manager retrieves project dependencies on first import. The template README covers gameplay, art and validation entry points.

If the project already uses setup and needs an update, preview and apply the same adapter used for its installation. Reload the host only if using its MCP connection. Updating the toolkit does not migrate existing game projects.
