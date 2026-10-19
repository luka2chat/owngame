# owngame PC Web

游戏发现与复刻入口：选游戏、试玩、收藏、最近玩过、下载离线包，也可以把具体游戏的改编任务复制给 AI。首页保留原来的街机俱乐部品牌、侧栏和卡片布局，仅在卡片操作区右侧加入复刻小按钮；游戏保留自己的画风。无账号、支付、广告或运行时创作后台。GA4 仅在访客允许后加载，详见 `../../docs/analytics.md`。

## 本地构建

```sh
npm run web:build
npm run test:web
npm run web:serve
```

打开 http://127.0.0.1:3216/ 。构建只读取 `public/` 和 `.owngame/library/` 中明确选定的冻结游戏版本；逐文件验证 SHA-256 后输出 `apps/web/dist/`。不会发布项目文档、配对信息、源码目录或本机路径。

游戏选择和介绍在 `scripts/web/catalog.mjs` 及其引用的目录中维护。增加游戏需先在工具包中登记可独立导出的成品，不把未完成占位卡当作可玩游戏。封面复用已批准素材，来源见 `../android/ART-PROVENANCE.md`。

## 免费 Cloudflare Pages

仅静态资源，不启用 Functions、Workers 计算、数据库、R2 或付费套餐。已上线 https://owngame.dev/ ，生产别名 https://owngame-web.pages.dev/ 。配置是 `wrangler.jsonc`；公共目录为 `dist/`。不把整个仓库拖入发布入口。

官方工具安装（已在本机执行）：

```sh
npm install --prefix .local/cloudflare-tools --no-audit --no-fund wrangler@4.151.1
codex mcp add cloudflare-docs --url https://docs.mcp.cloudflare.com/mcp
```

Cloudflare 文档 MCP 不需要账户权限。部署使用官方 Wrangler 的 OAuth，不在项目里保存 token。首次授权使用 Pages 最小范围：

```sh
.local/cloudflare-tools/node_modules/.bin/wrangler login --browser=false --scopes account:read user:read pages:write zone:read
.local/cloudflare-tools/node_modules/.bin/wrangler pages project create owngame-web --production-branch main
npm run web:publish -- --repository-dir <干净的公开仓库检出目录> --out <新的web-输出目录>
```

项目只需创建一次；更新时使用上述联合发布命令，先同步源码并通过 GitHub 检查，再部署网站。详见 [源码与网站联合发布](../../docs/game-publishing.md)。根域名通过 Pages 项目的 Custom domains 绑定，先检查已有 DNS 记录。回滚可使用 Pages 之前的生产部署；游戏文件使用内容 hash 路径。部署失败时不删除线上版本。

Free 限额以 Cloudflare 官方文档为准；当前构建远低于每站 20,000 文件、单文件 25 MiB。构建会拒绝超限文件，不自动开通付费资源。

## 离线与边界

首次联网打开会保存页面外壳。每款游戏需点击「下载离线包」，逐文件核验长度和 SHA-256，全部成功后才显示已下载；失败删除不完整缓存并允许重试。Service Worker 同时处理 Pages 的无 `.html` 地址和 `index.html` 到目录的重定向。

离线缓存与收藏只在当前浏览器中。浏览器清理网站数据后需要重新下载；浏览器缓存不是永久备份。Web 的新窗口是独立浏览器标签，不等同于 Android 的独立应用任务。PWA 安装入口由浏览器能力决定。

本轮验证和发布状态见 `../../docs/validation/m7-pc-web.md`。

游戏版本路径通过 `_headers` 发送 `Cache-Control: public, max-age=31536000, immutable, no-transform`。`no-transform` 防止 Cloudflare 自动插入 RUM 统计脚本而破坏文件大小与 SHA-256；不可通过放宽客户端完整性校验规避。`scripts/web/verify-deployment.mjs` 校验线上资源与 HTML 响应头；Android 原生网络探针可用 `node scripts/android/test-repository.mjs DEVICE_SERIAL --probe` 复验当前冻结螺帽入口。

## 复刻

首页与游戏详情共用 `public/remix.js`。点击复刻生成并尝试复制该游戏的具体任务，支持补充改编要求、编辑全文和复制失败后的手动选择。构建生成 `/remix/<id>.json`，记录当前上架版本、玩法、视觉方向、冻结可玩地址与工具安装入口。它包含对应游戏的公开源码链接和确切提交；源码按各游戏的许可使用，npm 工具包与完整游戏案例分别分发。
