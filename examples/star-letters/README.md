# 星野来信 · 迟到的春天

一段发生在三颗小星球上的 3D 童话冒险：收信出发、拜访朋友、解开风向与灌溉谜题，再邀请朋友来到巨人的花园，让冬天迎来春天。支持自动保存与结局后的继续旅行。

[在线试玩](https://owngame.dev/play?game=star-letters) · [制作案例](../../docs/cases/star-letters.md) · [授权与素材来源](THIRD_PARTY_NOTICES.md)

## Unity 正式故事版

使用 Unity **6000.3.26f1**，安装 Web Build Support，打开 `unity/LittleOrbit`。Unity Package Manager 会按锁文件恢复依赖。打开 `Assets/Scenes/StoryAdventure.unity` 并点击 Play。

电脑使用 WASD／方向键移动，Shift 跑步，E 互动，右键环视，滚轮缩放，Q／R 转向，V 全景，C 恢复镜头。网页打包版支持手机触屏：左侧摇杆行走、空白处拖动环视，「互动」「继续」「收起」操作对话与菜单，「翻面」查看信件或合影。支持边走边看；横屏视野更开阔。触摸适配层位于 `web/touch.js`，随 `web/pack.mjs` 打包；编辑器内仍使用键鼠。

从信箱开始，照看花朵、找到零件、修亮信标，随后旅行到邻星与巨人花园。进度保存在当前浏览器；本机预览、线上站点和不同浏览器的存档互不共享。

构建菜单：`Star Letters > Build Full Story Web`。默认输出为 Unity 工程内 `Builds/WebStory`；可通过启动 Unity 前设置 `STAR_LETTERS_BUILD_OUTPUT` 指定外部磁盘目录。输出未压缩，可用：

```sh
python3 scripts/serve-unity-web.py --directory unity/LittleOrbit/Builds/WebStory --port 5177
```

然后打开 <http://127.0.0.1:5177/>。用于静态托管的压缩、分块工具在 `web/pack.mjs`，用法见 `web/README.md`。

## Three.js 教学原型

早期原型与正式故事版是两个独立入口。需要 Node.js 22.12+：

```sh
npm ci
npm test
npm run dev
```

`npm run build` 只构建 Three.js 原型，不构建 Unity 游戏。其进度只保存在内存；刷新可重玩。`src/` 展示球面行走、程序化模型、镜头与交互规则。

## 美术与源码

`unity/LittleOrbit/Assets` 包含正式场景、模型、贴图、材质、着色器和游戏逻辑，以及 `.meta` 引用信息。`scripts/` 保留 Blender 模型、地形、草地和纹理生成器；运行生成器会写入对应美术与 Unity 资源，修改前请自行保留备份。`Assets/Editor` 保留故事状态、真实角色路径、镜头与季节变化检查入口。需要额外安装 Blender；字体重建工具另需 fontTools 和原始 Noto Sans SC 字体。

本案例按明确清单从制作工程导出。未包含 Unity 编辑器或 PackageCache、Library、Temp、构建缓存、机器配置、历史验收截图、概念图、原始 `.blend` 文件及个人制作日志。模型已以 FBX 与 Unity 资产提供，生成脚本可继续编辑。

原创源码及原创程序化素材采用 MIT；中文字体保留 OFL 1.1；Unity 模板衍生配置保留 Unity Companion License，Unity 引擎由使用者另行安装。这不是整个目录统一采用 MIT 的项目，详见第三方说明与逐文件 `SOURCE_MANIFEST.json`。

## 已知范围

故事流程已在制作阶段完成；美术、声音听感、冷启动和不同硬件表现仍需继续打磨。公开版本保留现有玩法，移除了机器专属路径；历史规则与路径验证不等于在所有设备完成试玩，也未对公开副本重新做完整 Unity 导入和构建。

## Game design board

The editable [game-outline.json](./game-outline.json) lives beside the game source. From this directory run `owngame outline` (or `npx @owngame/cli@latest outline .`). The command opens the local canvas; Ctrl+C stops it. Read the design before development and write design changes and actual validation back afterward. JSON and other project file references are relative to this directory. The published snapshot has been reviewed to remove private content.
