# owngame Game Outline

A lightweight local game design board. It runs alongside the owngame repository and does not ship in the player-facing website. No account, external APIs, or cloud storage are required. It is also bundled with the CLI.

```sh
npm run outline
```

Open **http://127.0.0.1:3228/**. Set `OWNGAME_OUTLINE_PORT` to select another port. Keep the local service running while using the page; stop it with Ctrl+C when finished.

## 使用

- 六个入口：总览、玩法规则、运行流程、世界叙事、关卡、资产。首次打开包含可编辑的虚构示例《雾港来信》，不是已实现的游戏项目。用「新项目」建立空白项目。
- 点击卡片编辑；拖动卡片顶部移动。双击空白处添加，拖动空白处平移。触控板滚动平移，⌘/Ctrl + 滚轮缩放，也可用底部按钮。
- 按 C 后点两张卡片连线；点击连线名称编辑。卡片右侧可添加跨区域关联，再点击关联跳转。角色关系用角色视图，故事与任务共用剧情视图。
- 状态分构思中、进行中、已完成。角色数、任务进度、资产进度和待决策数直接汇总卡片。玩法卡区分通用规则与验证例子，具体参数放关卡；任务有发布者、地点、前置条件、目标、完成条件和世界状态变化。
- 图片支持 PNG、JPEG、WebP，最长边自动缩至 1400 px，存入本地数据。卡片里的文件位置是文字记录，不读取任意本机或 NAS 文件。大型原素材仍应放在已验证挂载的 NAS。
- ⌘/Ctrl Z 撤销，⌘/Ctrl Shift Z 重做；F 适合画布，V 选择，/ 搜索整个项目。方向键移动选中卡片，Shift 加速。没有选中卡片时方向键平移画布。

## Storage and recovery

The server binds to `127.0.0.1` only. Each linked game source directory owns **`game-outline.json`**, the authoritative design document shared by the canvas and CLI/MCP. It includes goals, cards, relationships, embedded previews and view positions. Saves replace the file atomically and retain the previous version as `game-outline.json.bak`. Keep the JSON in the game's local version history; reviewed public exports must explicitly decide whether its private planning material belongs in the release.

The ignored `.local/game-outline/project-files.json` maps projects to directories. `.local/game-outline/workspace.json` is only a recovery cache. Older central-only boards migrate automatically into individual files under `.local/game-outline/projects/`; existing game directories can be registered with `outline.init`. The new-project dialog accepts a directory relative to the workspace, or leaves an unbound idea in the local projects directory.

```sh
# CLI 0.11.0 or later:
owngame outline.init '{"directory":"my-game","title":"My game"}'
owngame outline.get '{"directory":"my-game"}'
owngame outline.list
owngame outline --workspace .
```

New `project.create` projects receive the JSON and an `AGENTS.md` reminder automatically. See [the development workflow](../../skills/owngame/references/outline.md) for guarded `outline.update` operations. These commands require CLI 0.11.0 or later.

The canvas checks for outside changes every three seconds while idle. Writes compare the version last read: concurrent edits stop with a conflict instead of silently overwriting a newer file. Export unsaved edits before reloading and reconciling. A missing/corrupt project file or disconnected NAS makes that board read-only; other boards remain available. Restore the original file or its backup after closing writers. Undo/redo retains 35 card-edit steps in the current session; creating or importing persistent projects clears this history.

Use **导出备份** for a portable workspace JSON containing every project. **导入** adds copies without replacing existing projects. Exports are distinct from the per-game file envelope. Treat both as private project material. Text renders as text; images accept raster data URLs and allowlisted sample images only.

Limits: 50 projects, 1500 cards and 5000 relations per project, 25 MiB total save/import payload. Images allow 15 MiB input and about 1.6 MiB encoded output per card. Use file references for large assets. A board guides development through the skill and project instructions; it does not autonomously generate or change game code.

The sample moodboard reuses existing owngame `harbor-background.png` as a labeled internal reference; it does not claim to be finished artwork for the fictional example. Branding reuses the established wordmark, mascot, paper palette, and type stack.

## Validation

```sh
npm run test:outline
```

Tests cover persistence across restarts, backup recovery data, stale-write protection, import validation and local HTTP boundaries. Browser verification uses the supported in-app browser; never launch Chromium inside macOS Seatbelt.

## Open a project design board

From any game directory, run `owngame outline` (or `npx @owngame/cli@latest outline .`). From a parent directory, run `owngame outline path/to/game`. The browser opens the project's own `./game-outline.json`; a missing file is initialized. Use `--no-open` to only print the URL, and `--port 3230` to select a port. The default port falls back to a free one if occupied. Stop with Ctrl+C.

Keep JSON/document/asset references relative to the game directory. The ignored workspace index stores relative paths and accepts older absolute bindings during migration. A cloned public game includes its reviewed design JSON and needs no private workspace registry.
