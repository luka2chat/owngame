# owngame PC Web

游戏发现与复刻入口：选游戏、试玩、收藏、最近玩过、下载离线包，也可以把具体游戏的改编任务复制给 AI。首页保留原来的街机俱乐部品牌、侧栏和卡片布局，仅在卡片操作区右侧加入复刻小按钮；游戏保留自己的画风。无账号、支付、广告或运行时创作后台。GA4 仅在访客允许后加载，详见 `../../docs/analytics.md`。

## 中英文界面

网站支持中文与 English。顶部语言菜单可随时切换；手机游戏页可在「更多」菜单中切换。选择保存在当前浏览器，站内链接同时保留 `?lang=zh-CN` 或 `?lang=en`。明确的链接语言优先于保存的选择，其次使用浏览器语言；未匹配时使用英语。切换只更新网站界面，不重新加载游戏，也不改动收藏、游戏包或存档。

`public/i18n.js` 统一处理语言选择、文案和链接；`public/locales/en.js` 包含英文站点文案和每款游戏的名称、介绍与玩法。中文原文保留在页面和调用处。新增游戏时需要补齐英文介绍；`tests/web/i18n.test.mjs` 检查覆盖率、参数、语言回退和游戏身份。游戏内文字与已烘焙的封面属于各自游戏版本，需单独翻译和验收。

`npm run test:web` 运行文案与离线逻辑检查。对本地构建运行 `node scripts/web/verify-i18n.mjs <预览地址>`，验证桌面/手机排版、选择记忆、双语搜索、收藏、复刻、游戏不重载及断网切换。macOS 沙箱内会在启动浏览器前停止，按项目的浏览器安全规则运行独立验证。

## 本地构建与预览

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

复刻弹窗提供「简单复刻」与「复杂复刻」。简单复刻保留原流程；复杂复刻由 `remix-workflow.js` 和 `remix-workflow-model.js` 提供可编排画布，支持步骤细节、依赖、启停、确认点、排序、拖动、缩放、撤销与重做。草稿按游戏保存在当前浏览器，支持 JSON 导入导出及并发窗口冲突提示；方案复制给 AI 后，要求同步到项目 outline 并逐步执行。网站自身不执行工作流，不把草稿正文发给统计服务。操作与边界见 [复刻说明](../../docs/remix.md)。

「蓝图」与「复刻」并排，打开当前游戏的公开 outline 只读画布。六个区域、卡片字段与关联关系来自已有 outline 模型；支持全图搜索、关联跳转、缩放、完整详情和 JSON 下载。构建只读取 `scripts/games/projects.json` 显式登记的 `game-outline.public.json` 并执行公开内容校验，缺失或校验失败直接中止，不回退到私有设计板或本机服务。英文界面翻译操作与字段标签，设计内容保留作者原文。美术卡直接显示图片或模型缩略图，详情提供素材画廊、放大与可旋转缩放的 GLB 查看器。`scripts/web/blueprint-media.json` 显式登记 19 款游戏已公开的素材及 SHA-256；构建从确切公开 Git 提交读取并校验，输出同站点的内容哈希地址，避免浏览时依赖 GitHub 图片服务。GLB 必须内嵌全部依赖；Three.js 0.186.1 / Meshopt 的本地查看模块保留许可。图库不会发布私有板或扫描工作目录。复杂复刻使用同一画廊，旧草稿仅补充匹配原卡片的显示元数据，不重写草稿内容。预览资源按需加载并缓存；模型展示不代表游戏运行验收。
## PC discovery on mobile

The default catalog leads with Tidal Reclaim and Star Letters. Phone/tablet visitors still see PC game covers, with a computer-play notice before the action link. Their detail pages offer a copyable link, local favorites and mobile-game recommendations without loading the unsupported game or downloading its offline package. Device detection is independent of viewport width and the catalog filter, so narrow desktop windows keep working. Clipboard denial exposes a selectable URL. Keep Chinese and English copy aligned and retain the immutable game packages and saves. Verify with `node scripts/web/verify-pc-handoff.mjs` (set `OWNGAME_PC_BASE` for production).

Public source export includes a validated `scripts/web/blueprint-snapshots.json` bundle and the shared outline metadata so website tests do not depend on private production project paths. Missing or invalid bundled snapshots fail closed. Production continues to read only registered `game-outline.public.json` files.

复杂复刻通过 `remix-blueprint.js` 载入同一份 `/blueprints/<id>.json` 和共享字段元数据，把原设计卡片分配到工作流步骤。新方案自动带入；旧草稿显式补入并保留已有步骤调整。每张卡片保留原内容用于比较，允许编辑字段、添加调整说明和取消采用；关联关系独立于执行依赖。导出与本地草稿包含快照及对应源码/游戏版本，复制给 AI 包含调整后的选中内容。蓝图加载失败时阻止空白的新方案交付，提供重试。

「场景与关卡」复用素材画廊，显示从已发布冻结游戏采集的实景图，可点击放大；复杂复刻也显示同一组预览。`scripts/web/blueprint-scenes.json` 记录 19 款游戏、25 张关卡卡片对应的截图、构建版本和原卡片指纹。构建检查截图哈希、游戏版本和卡片内容；游戏或关卡设计变化后需重新采集审核，不用封面替代场景。潮汐回收站使用实际运行场景的观察视角，法恩探险按五章分别提供游戏画面与内置地图。旧草稿只补充匹配原设计、原游戏版本的显示信息。

蓝图连线使用 `blueprint-connections.js` 绕开卡片的正交路径，返回与双向关系保留独立路线；选中卡片的关联高亮，其余关系淡化。连线说明在有足够空隙时直接显示，完整关系仍可在详情中查看和跳转。画布浏览不更改设计板中的坐标、内容或关系。
