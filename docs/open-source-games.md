# 网站游戏源码

owngame.dev 上架游戏的可编辑源码按游戏 ID 放在 `examples/<game-id>/`。
完整清单、线上版本和源码指纹见根目录 [`games.json`](../games.json)。
每款游戏的 `ONLINE_BUILD.json` 记录对应线上不可变交付文件的 SHA-256；
`SOURCE_MANIFEST.json` 记录公开源码与素材，便于核对版本。

## 游玩与修改

先克隆仓库，在目标游戏目录运行：

```sh
npm ci
npm start
```

需要 Node.js 22.18 或更新版本与 npm。打开 http://127.0.0.1:5173 。
`npm run build` 生成 `dist/`；`npm run serve` 启动本地预览。
例如：

```sh
git clone https://github.com/luka2chat/owngame.git
cd owngame/examples/crowd-runner
npm ci
npm start
```

《星野来信》为 Unity 完整故事项目，也附有 Three.js 原型；打开方法见其 README。
Unity 编辑器和目标平台模块需单独安装。`unity-home` 则是可通过 CLI 创建的独立家园模板。

## 授权

每个目录的 LICENSE 与 THIRD_PARTY_NOTICES.md 共同说明授权范围。
《小小文明》的改编代码沿用 **GPL-3.0-or-later**；字体、图标及库保留各自许可。
其他游戏的自有代码采用 MIT，但第三方引擎、字体、素材和 Unity 衍生配置仍按原声明分发。
根目录 MIT 不替代子项目或第三方许可。

源码包含运行所需的已发布素材与构建说明；依赖由 npm 或 Unity 包管理器恢复。
缓存、私人记录、账号配置和本机工具路径不属于源码交付。
游戏案例存放在 GitHub，npm 工具包继续分发创作工具与模板。

## 更新

新增或更新游戏通过[源码与网站联合发布流程](game-publishing.md)发布。
网站目录的源码链接指向与交付对应的 Git 提交，便于查看旧版本和复现问题。
自动检查覆盖源码清单、依赖安装、轻量 Web 游戏重建与浏览器加载/输入；
Unity 编辑器、真机、离线冷启动及完整玩法验收按各游戏的交付记录另行执行。
