# 星野来信 3D 童话冒险案例

《星野来信 · 迟到的春天》发生在家园、邻星和巨人花园。玩家收信出发，解开风向与灌溉谜题，再帮助巨人邀请朋友，让花园迎来春天。剧情支持自动保存、回访和结局后的继续旅行。

[在线试玩](https://owngame.dev/play?game=star-letters) · [案例页面](https://owngame.dev/cases/star-letters/) · [公开源码](https://github.com/luka2chat/owngame/tree/main/examples/star-letters)

## 从布局到可玩的美术

先用可行走的布局固定任务点和碰撞，再逐步替换角色、建筑、植被与材质。美术迭代保留任务引用和存档身份；花园的季节材质独立处理，冬春变化不会污染其他星球。旧合影由游戏自己的角色渲染，声音由代码合成。

可复用：将故事状态、真实角色路径、镜头避障及浏览器输入分别检查。静态画面与规则测试不能替代完整试玩。

## 两个独立入口

正式故事版使用 Unity 6000.3.26f1，场景为 `unity/LittleOrbit/Assets/Scenes/StoryAdventure.unity`。推荐电脑键鼠；WASD 行走，E 互动，右键环视。公开源码包含场景、模型、贴图、材质、生成脚本与项目配置，依赖由 Unity Package Manager 恢复。

早期 Three.js 教学原型保留在 `src/`，展示球面行走、程序化角色和镜头。其 `npm test`、`npm run build` 只覆盖教学原型。正式 Unity 游戏需要独立构建。

## 开源范围

原创游戏代码、对白与程序化素材采用 MIT。Noto Sans SC 字体子集保留 OFL 1.1；Unity 模板衍生配置保留 Unity Companion License。Unity 引擎和在线包中的运行时遵循 Unity 自有条款，不能称为 MIT 开源引擎。完整说明与逐文件清单位于公开源码的 `THIRD_PARTY_NOTICES.md`、`LICENSES/` 与 `SOURCE_MANIFEST.json`。

公开副本排除 Library、PackageCache、构建缓存、个人制作日志、本机路径、概念图及原始 Blender 工作文件。现有 FBX、Unity 资产和生成脚本可继续编辑。原始制作目录不能整包重新标成 MIT；字体和模板配置的许可也不因本项目开源而改变。

授权审查依据：生成代码与素材记录、随附字体授权、Unity 模板包声明，以及 [Unity Companion License](https://unity.com/legal/licenses/unity-companion-license)、[Unity Software Terms](https://unity.com/legal/editor-terms-of-service/software) 和 [OFL FAQ](https://openfontlicense.org/ofl-faq/)。审查日期：2026-10-19。

## 网页交付与当前范围

原始 Unity 包约 106 MB，其中两个文件超过静态托管的单文件限制。公开交付使用无损 gzip 压缩和不超过 1 MiB 的分块，每块及解压后的内容都校验 SHA-256；下载约 54 MB，在浏览器还原后交给 Unity loader。源码与第三方声明随包提供，原引擎文件解压后保持一致。

制作记录报告了完整故事通关、36 个角色任务点、11,496 组镜头姿态与实际帧融雪过渡。这些是历史范围，公开副本未重新完成 Unity 全量导入和构建。整体概念图精细度、声音听感、低配置设备和手机触屏体验仍需继续验证。

2026-10-19 加载修复：资源按 1 MiB 分块、限制并发、校验后缓存，支持超时重试和继续接收；站点关闭已复现下载停滞的 HTTP/3 路径。默认 Chrome 三次全新缓存验收均进入实际 3D 场景，覆盖首页入口和直达链接，无重试或脚本错误。完整断线恢复和离线重开另已通过本地浏览器测试；结论限于当前测试环境。
