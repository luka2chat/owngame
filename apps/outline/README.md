# owngame Game Outline

A lightweight local game design board. It runs alongside the owngame repository and does not ship in the player-facing website. No account, external APIs, or cloud storage are required. It is also bundled with the CLI.

```sh
npm run outline
```

Open **http://127.0.0.1:3228/**. Set `OWNGAME_OUTLINE_PORT` to select another port. Keep the local service running while using the page; stop it with Ctrl+C when finished.

## 使用

- 六个入口：总览、玩法规则、运行流程、世界叙事、关卡、资产。首次打开包含可编辑的虚构示例《雾港来信》，不是已实现的游戏项目。用「新项目」建立空白项目。
- 画布默认占据主区域；左侧窄栏切换区域，底部浮动工具提供连线、撤销和缩放。顶部「项目资料」展开项目介绍、范围、试玩、进度统计和 JSON 同步入口；关闭或按 Esc 返回画布，切换区域也会收起资料。
- 打开项目、切换区域或区域视图时自动适配全部卡片，并避开底部工具。适配状态随窗口尺寸更新；手动平移或缩放后保留你的操作，按 F 或「适合」重新总览。自动适配不改动卡片位置，也不会触发项目文件保存。
- 点击卡片编辑；拖动卡片顶部移动。双击空白处添加，拖动空白处平移。滚轮直接以鼠标位置为中心缩放，按住鼠标拖动空白处平移；手机单指拖动画布，双指缩放，松开一指可继续拖动。手机点卡片编辑、拖卡片顶部移动；双指手势不会误打开卡片。也可用底部缩放按钮。
- 按 C 后点两张卡片连线；点击连线名称编辑。卡片右侧可添加跨区域关联，再点击关联跳转。角色关系用角色视图，故事与任务共用剧情视图。
- 状态分构思中、进行中、已完成。角色数、任务进度、资产进度和待决策数直接汇总卡片。玩法卡区分通用规则与验证例子，具体参数放关卡；任务有发布者、地点、前置条件、目标、完成条件和世界状态变化。
- 「美术与资产」和「场景与关卡」优先用「预览源文件」直接引用项目相对路径（例如 `./src/art/menu.webp` 或 `./generated-assets/robot.glb`）。源图直接显示；GLB 卡片从实际模型渲染缩略图，点开可旋转、缩放。重新打开预览会读取当前源文件；缺失时明确显示错误，不用其他图片补位。来源、规格、关卡配置和验收条件保留在编辑器里。代码搭建的场景可引用工程实景截图，并在关卡记录里注明截图对应的源码与版本，不能把截图当作实时运行或玩法验收。
- 3D 预览复用该游戏已安装的 Three.js 与 Meshopt 解码器，不访问 CDN、不另存模型。支持自包含 GLB（32 MiB 以内）；其他模型格式可先用项目内已有的渲染图。图片支持 PNG、JPEG、WebP（15 MiB 以内）。只读取已关联资产卡片明确声明的文件；禁止绝对路径、隐藏文件、目录穿越及无关文件。项目外的链接必须通过项目的本机私有授权配置显式允许，大型原件保留原位；配置方式见下文。
- 原有「添加图片」仍可导入压缩预览副本（最长边 1400 px）；这类副本不会自动跟随源文件更新，界面会与项目源文件预览区分。普通「来源」说明仍是文字记录。
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

External asset symlinks are denied by default. To authorize a trusted local asset directory, create `.local/outline-asset-roots.json` in the game project with a `roots` array of absolute directory paths. This private configuration is never part of the board or public export. Authorize only directories you trust, ensure network storage is mounted before use, and keep board references relative to the project.

Run `npm run test:outline:gestures` for isolated browser wheel, mouse and touch checks. Set `OWNGAME_CHROME_PATH` to use an installed browser; otherwise install Playwright Chromium. Follow the macOS browser preflight guidance when running under a sandbox.
