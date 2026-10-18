# Unity Home · 家园探索模板

从《星野来信》的 **HomeArt 家园美术场景**提取的单场景 3D 起点：在小星球上散步、读信、照看花朵、寻找零件，最后点亮信标。适合改成探索解谜、收集任务或叙事互动游戏。

## 打开就能开始改

1. 安装 **Unity 6000.3.26f1**，在 Unity Hub 中添加本目录（含 `Assets`、`Packages`、`ProjectSettings` 的这一层）。
2. 等待 Unity Package Manager 安装锁定的 Input System 和 URP 依赖。
3. 打开 `Assets/Scenes/HomeArt.unity`，点击 **Play**。
4. 按画面目标依次完成：信箱 → 花朵 → 工具箱 → 信标。

操作：WASD / 方向键移动，Shift 跑步，E 互动，Enter / Esc 关闭对话；右键拖动镜头、滚轮缩放，V 切换远近视角，C 复位镜头，Q / R 水平转动，I / K 调整俯仰。点击“重新开始”重置任务。本模板使用键鼠，没有触屏操作或持久化存档。

## 通过 owngame 创建

从 **@owngame/cli 0.9.0** 起支持此模板。无需克隆仓库，在你的工作目录运行：

```sh
npx @owngame/cli@latest project.create '{"directory":"my-unity-game","name":"my-unity-game","template":"unity-home"}'
```

需要 Node.js 22+ 与 npm。将生成的 `my-unity-game` 目录添加到 Unity Hub，打开 `Assets/Scenes/HomeArt.unity`，点击 Play。使用 `@latest` 获取最新稳定版工具包；Unity 编辑器仍需单独安装。

仓库开发者也可以先执行 `npm ci`、`npm run build`，再用 `node dist/packages/cli/index.js project.create` 调用相同入口。

创建器会复制模板、设置项目名称并生成独立的 Unity 产品 GUID 和应用标识，不覆盖已有目录。也可以直接复制此目录后在 Player Settings 修改产品名称和标识。Unity 项目通过 Unity Editor 运行和构建，不使用 `npm run preview`。

## 从哪里修改

| 想改什么 | 入口 |
| --- | --- |
| 星球布局、互动位置、灯光 | `Assets/Scenes/HomeArt.unity` |
| 任务顺序与完成条件 | `Assets/Scripts/Story/HomeQuest.cs` |
| 对话、移动速度、镜头、任务界面 | `Assets/Scripts/Story/HomeAdventure.cs` |
| 互动类型与距离 | `Assets/Scripts/Story/HomeInteraction.cs` |
| 模型与美术 | `Assets/Models/Story/`、`Assets/Materials/Story/`、`Assets/Textures/Story/` |

保留了场景引用的原始 `.meta` GUID，模型与材质可继续在 Unity 编辑器内替换。中文界面使用随附的 Noto Sans SC 子集字体；增加原文没有的汉字时，应换成覆盖新文字、许可允许分发的字体。

## 验证与构建

打开场景后执行 **owngame → Validate Home Template**：编辑模式检查任务规则与场景引用；Play 模式额外检查四个互动点、距离限制、任务重置、角色行走路线及房屋碰撞。Play 模式检查会重置当前试玩状态。

自动检查可使用 Unity 的批处理入口（不要加 `-quit`，验证器会在进入 Play 模式并完成检查后退出）：

```sh
"<Unity executable>" -batchmode -nographics --burst-disable-compilation -projectPath "<absolute project directory>" -executeMethod UnityHomeValidation.RunBatch -logFile "<log file>"
```

上面的批处理检查会关闭本次进程的 Burst 优化，且不绘制画面；它不替代实际键鼠试玩、画面验收和目标平台构建。

在 **File → Build Profiles** 中安装并选择目标平台模块，场景列表已指向 HomeArt。Web 使用 Unity 内置 Default 模板。owngame 当前仅提供项目创建与场景内验证，尚无通用 Unity 构建适配器；平台构建与真机测试需单独完成。

## 与完整案例的关系

完整故事仍位于 [`examples/star-letters`](https://github.com/luka2chat/owngame/tree/main/examples/star-letters)。这里保留家园的可玩循环，移除了跨星球剧情控制器、完整旅程存档、其他星球和生产构建脚本。模型已经导出为 FBX，无需安装 Blender；不包含编辑器、引擎运行库、Library 缓存或原始 Blender 工作文件。

原创脚本与美术采用 MIT；字体、Unity 模板派生配置和引擎依赖的许可范围见 [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md)。
