# 给 AI 助手的通用接入说明

用户将本文交给你，是希望在当前游戏项目使用 owngame。你负责完成下面的接入和检查，然后继续用户的游戏任务。采用统一 CLI，无需用户选择助手类型，也不要求宿主支持 MCP。

## 1. 检查项目与环境

- 在用户指定的游戏项目目录执行命令，不在工具包目录创建游戏。沿用项目现有规则和用户已经选定的引擎、风格与范围。
- 检查 `node --version` 与 `npm --version`，需要 Node.js 22 或以上。缺失时明确报告环境问题；安装系统软件应遵循用户和宿主的授权规则。
- 需要读取本文、读写项目文件和执行命令的能力。只能聊天的助手无法直接完成安装；不要声称已经安装。
- 如果当前项目已有可用的 owngame，先读取已安装的 Skill 并调用 `capabilities`；保留项目已有版本，除非用户要求安装或更新。无需重复接入或更换已有 MCP 连接。

## 2. 安装当前发布版本

在项目目录执行：

```sh
npx --yes @owngame/cli@latest setup --agent generic --apply
```

这是所有助手共用的命令。`generic` 表示生成通用项目文件，不是让用户判断自己的助手类型。`@latest` 选择 npm 当前发布版本，setup 会把同一版本保存在项目 `.owngame/toolkit`，避免依赖临时 npx 缓存。已有稳定本地安装会继续使用其安装位置。

解析成功输出中的 `runtime` 与 `applied`。只有进程成功退出且 `applied` 为 `true` 才表示接入文件已写入。读取 `.agents/skills/owngame/SKILL.md`，按任务需要继续读取它链接的 `references/` 文件；无需宿主自动发现 Skill。

安装保留其他配置，对覆盖内容建立备份。遇到本地修改冲突时保留用户内容，说明冲突文件，不删除配置后重试。`.owngame/mcp.json` 是可选 MCP 连接信息；本流程使用 CLI，无需导入它、重启助手或等待 MCP 连接。

## 3. 验证并使用 CLI

将 `<runtime>` 替换为 setup 返回的实际 `runtime` 路径，保留引号以兼容空格路径。在同一个游戏项目目录执行：

```sh
node "<runtime>/dist/packages/cli/index.js" capabilities
node "<runtime>/dist/packages/cli/index.js" doctor
```

确认 `capabilities` 结果为 `succeeded`，`doctor` 的 `node_supported` 为 `true`、`knowledge` 为 `succeeded`。`doctor` 中 MCP、浏览器、引擎等 `not_checked` 字段不代表 CLI 安装失败，也不证明这些能力已经可用。

后续用这个稳定入口调用操作。操作名与参数以 `capabilities` 为准；复杂 JSON 写入项目临时参数文件，再以 `@文件路径` 传入，避免不同终端的引号差异。例如新建游戏时，先检查目标目录不存在，再将下面内容保存为参数文件：

```json
{"directory":"my-game","name":"my-game"}
```

```sh
node "<runtime>/dist/packages/cli/index.js" project.create @参数文件路径
```

只有用户希望新建游戏时才创建项目；已有游戏直接按任务修改。不要为验证安装而改动已有游戏或覆盖同名目录。

## 4. 开始创作

简短说明安装版本、CLI 检查结果和实际阻碍，然后继续用户任务；没有游戏需求时，请用户描述想做的游戏。遵循 Skill：尽早交付完整可玩的核心循环，检查实际画面与输入，保留已有规则和存档。图片生成、浏览器试玩与外部引擎使用助手已有的工具，分别报告验证范围。

这里验证的是 CLI 可用，不是所有助手宿主的适配认证，也不是游戏玩法、视觉或设备验收。MCP 属于可选增强，只有用户需要时才按[安装与接入](install.md)配置。
