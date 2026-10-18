# 安装与 Agent 接入

需要 Node.js >=22。日常安装使用 `@latest` 获取 npm 当前发布版本；未发布的开发版本可从源码打包安装。

## 从本地安装包开始

源码目录执行 `npm ci` 和 `npm pack`。在另一个空目录安装输出的 tarball，将下方路径和 `<version>` 替换为实际生成的安装包路径与版本：

```sh
npm install "/absolute/path/owngame-cli-<version>.tgz"
npx owngame --version
npx owngame capabilities
npx owngame setup --agent codex
npx owngame setup --agent codex --apply
npx owngame doctor
```

setup 默认只预览，--apply 才写入。所有写入限定当前项目，也可用 `--workspace /absolute/path` 选择已有目录。不要把安装包解压目录当作游戏工作目录。

| 接入方式 | 项目配置 | Skill |
| --- | --- | --- |
| codex | .codex/config.toml 中 owngame MCP 表 | .agents/skills/owngame |
| cursor | .cursor/mcp.json 中 owngame 条目 | .cursor/skills/owngame |
| generic | .owngame/mcp.json，供宿主手动导入 | .agents/skills/owngame，供手动读取 |

已有其他配置保留；覆盖的配置备份到 .owngame/setup-backups；已编辑的 owngame 配置和 Skill 会报冲突，需先合并自己的修改。重复应用相同内容不写新备份。安装不会修改全局配置或证明宿主已连接。重启宿主、信任项目配置并调用 owngame_capabilities 核对版本。Codex 只在受信任项目加载项目配置。Cursor 生成配置已测试；独立 Agent 创作体验仍需另行验证。

依据：[Codex MCP](https://learn.chatgpt.com/docs/extend/mcp?surface=cli)、[Skill](https://learn.chatgpt.com/docs/build-skills)、[Cursor MCP](https://cursor.com/docs/mcp)。

## 从 npm 安装当前发布版本

以下命令使用 npm 的 `latest` 发布标签，避免文档中的固定版本过期：

```sh
npx @owngame/cli@latest setup --agent codex
npx @owngame/cli@latest setup --agent codex --apply
```

从 npx 临时缓存启动时，apply 会把同一版本安装到项目 .owngame/toolkit，再注册其绝对入口，以免缓存清理后连接失效。该步骤需要 npm 网络访问，并禁用依赖安装脚本。已有稳定本地安装直接使用安装位置；移动或删除安装目录后需重新 setup。更新时重新运行上述 `@latest` 命令，先预览再应用。已有项目不会在后台自动更新。

## Skill 与 MCP 可分别使用

只读 Skill 不会安装 MCP、浏览器或引擎。CLI 可独立使用：

```sh
npx owngame research.prepare '{"query":"美术"}'
npx owngame project.create '{"directory":"my-game","name":"my-game"}'
npx owngame guidance.get '{"topic":"web"}'
```

CLI/MCP 共用核心，CLI 的 knowledge.search 对应 owngame_knowledge_search。退出码 0 succeeded、1 failed、2 unknown；@file 或 - 支持文件/stdin 参数。help/setup/doctor 是 CLI-only。旧工作流仅 --legacy 可见，不是创建游戏的前提。

默认库仅三个公开历史案例。检索是关键词匹配；snapshot 模式仍为 unknown。当前来源指纹只证明摘要文件完整，不等于验证原作或重跑历史实验。使用 --knowledge 指向自己的同格式库；外部来源映射可放项目 .owngame/local.json。不要提交这个机器配置。

## 运行边界与恢复

默认 Web 起点无需运行库。Phaser 模板需 npm install；Cocos 需外部 Creator 3.8.8，构建适配器只验证过特定 macOS 路径。图片生成、浏览器输入、手机和发布由宿主提供。doctor 不下载外部引擎、不测试物理手机，也不宣称 MCP 已连接。

卸载前停止宿主连接。手动删除配置中的 owngame 管理块/条目与对应 Skill；保留其他服务器。然后可以删除项目 .owngame/toolkit 与 setup 清单。不要为卸载工具删除游戏源码、存档或整个 .owngame：其中可能包含用户的交付清单。当前没有自动卸载命令。
