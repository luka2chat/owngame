# owngame

### 做属于自己的游戏。

**不充钱、不看广告、离线爽玩。**

还记得打开游戏机，只管开心的那一刻吗？

我们想把这种快乐找回来。你可以在 [owngame.dev](https://owngame.dev) 挑一款喜欢的游戏，打开就玩；也可以点 **Remix**，把它交给 AI，换一种画风、改一条规则，做成自己的版本。

**玩你喜欢的，做属于你的。**

[去玩游戏 ↗](https://owngame.dev) · [开始 Remix](#从一款喜欢的游戏开始) · [安装工具](#让你的-ai-用上-owngame) · [English](#make-games-your-own)

<table>
<tr>
<td width="33%"><a href="https://owngame.dev/play?game=signal-harbor"><img src="https://owngame.dev/art/rollout/signal-harbor.png" alt="潮光归位：安静夜港里的灯塔归位谜题" /></a><br /><b>潮光归位</b><br />借一处泊位，让灯光慢慢归航。<br /><a href="https://owngame.dev/play?game=signal-harbor">开玩 / Remix ↗</a></td>
<td width="33%"><a href="https://owngame.dev/play?game=kiln-merge"><img src="https://owngame.dev/art/rollout/kiln-merge.png" alt="窑火相融：陶坊主题的合并游戏" /></a><br /><b>窑火相融</b><br />把熟悉的合并玩法，放进一间陶坊。<br /><a href="https://owngame.dev/play?game=kiln-merge">开玩 / Remix ↗</a></td>
<td width="33%"><a href="https://owngame.dev/play?game=moss-reversi"><img src="https://owngame.dev/art/rollout/moss-reversi.png" alt="苔庭翻面：墨石与白瓷的棋盘" /></a><br /><b>苔庭翻面</b><br />墨石与白瓷，在纸上苔庭里翻转局势。<br /><a href="https://owngame.dev/play?game=moss-reversi">开玩 / Remix ↗</a></td>
</tr>
</table>

## 从一款喜欢的游戏开始

1. **先玩。** 在 [owngame.dev](https://owngame.dev) 找到喜欢的画面和玩法。
2. **点 Remix。** 复制一段给 AI 的话，里面带着这款游戏的链接、玩法、视觉方向和 owngame 的接入说明。还可以补上“我想怎么改”。
3. **交给你的 AI。** 粘贴到 Codex、Cursor 或支持 MCP 的助手，让它用 owngame 做出一个可玩的版本，边玩边改。

例如，你可以从《潮光归位》开始说：

> 用 owngame 参考这款游戏，为我做一个雨天咖啡馆版本。保留分类和周转的乐趣，把灯塔变成杯架，灯光变成不同口味的咖啡。先让我看到实际可玩的画面，再一起调整规则和关卡。

Remix 复制的是**具体的创作任务**。AI 读取游戏参考，再用工具逐步实现；它不会把网站上的完整游戏源码一键复制到你的目录。

[Remix 怎么工作](https://github.com/luka2chat/owngame/blob/main/docs/remix.md)

## 也可以从一句想法开始

不必先写一份完整的游戏设计文档。告诉 AI 你想要的感觉：

> 我想做一个晚上睡前玩的小游戏。安静一点，有一点解谜，画面像一本发光的童话书。

也可以继续打磨已有的游戏：

> 玩法和存档都保留，把画面改成手绘陶坊。先看实际运行效果。

> 这关灯塔装满后挡住塔顶了，保留现在的风格，把这个状态修好。

owngame 把我们真实制作游戏时用过的方法交给 AI：找合适的参考，让美术尽早进入实际画面，做出能玩的核心，再把规则、反馈、内容和交付一点点补齐。新作、换风格和局部修复，各走适合自己的流程。

## 让你的 AI 用上 owngame

owngame 是开源工具包，可以接入你已有的 AI 助手。需要 **Node.js 22 或以上**。

在你的游戏项目目录执行：

```sh
npx @owngame/cli@0.8.0 setup --agent codex --apply
```

使用 Cursor 时，把 `codex` 换成 `cursor`；其他 MCP 助手使用 `generic`。去掉 `--apply` 可以先预览配置。接入后的重载与连接检查见 [安装说明](docs/install.md)。

然后告诉 AI：

> 用 owngame 做一个夜空主题的双人小游戏，先让我看到可以玩的画面。

想直接跑一个起点？看 [第一个游戏教程](docs/quickstart.md)：创建“月下连星”，玩一局，换一次画风，再确认进度还在。

## 这个仓库里有什么

| 组成 | 用来做什么 |
| --- | --- |
| **Skill** | 帮助 AI 根据任务选择研究、美术、实现、试玩和迭代的步骤 |
| **参考案例** | 星图三连、潮光归位、窑火相融的公开复盘；保留决定和踩过的坑 |
| **可玩起点** | 默认 Web 小游戏，带规则、悔棋、重开和续玩；另有 Phaser / Cocos 脚手架 |
| **CLI / MCP** | 共用 20 个操作，把参考研究、风格配方、创建和交付检查连起来 |
| **接入与验证** | 项目配置、备份与冲突检查，以及安装、规则和浏览器操作验证 |

现在的参考检索按关键词匹配，公开包包含三个历史案例摘要；网站的每款游戏另有自己的 Remix 参考说明。完整游戏实现、图片生成和浏览器操作由 AI 及其可用工具完成。模板、可玩的参考游戏和历史复盘，各有不同用途。

[星图三连的制作过程](docs/cases/star-triad.md) · [潮光归位的迭代](docs/cases/signal-harbor.md) · [窑火相融的参考取舍](docs/cases/kiln-merge.md)

## 一起做更多自己的游戏

欢迎贡献玩法模板、制作案例、风格配方，或修复一个让游戏更好玩的小问题。

```sh
npm ci
npm run test:release
npx playwright install chromium
npm run verify:package
```

[贡献指南](CONTRIBUTING.md) · [发布流程](docs/releasing.md) · [变更记录](CHANGELOG.md) · [安全边界](SECURITY.md)

工具自有代码与文档采用 [MIT](LICENSE)。网站展示游戏及素材保留各自许可，见 [第三方声明](THIRD_PARTY_NOTICES.md)。项目的安装、工具与案例组织方式参考 [REA](https://github.com/morluto/rea)。

## Make games your own

Play a game you love on [owngame.dev](https://owngame.dev), click **Remix**, and give the resulting prompt to your AI assistant. Change the art, reshape the rules, and keep playing until it feels like yours.

owngame is an open-source toolkit for that process: an art-first Skill, shared CLI/MCP operations, real project lessons, and playable Web starters. It works with your existing agent. A remix prompt carries the game's rules, visual direction, playable reference, and installation guide; your agent builds the new version with you.
