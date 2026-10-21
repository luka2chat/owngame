# Android release notes

## 0.4.17-alpha

### 中文

App 界面和原生游戏菜单支持简体中文、英语，跟随系统或 App 语言；其他语言使用英语。游戏库标题、简介、分类、搜索、收藏、下载状态、更新提示和评价界面同步翻译，英文窄屏排版已调整。搜索也支持原中文游戏名。游戏内部文字、封面美术和存档格式保持不变。沿用既有签名，可覆盖安装保留下载与存档。

### English

The app interface and native game menus now support English and Simplified Chinese, following the system or app language. Other languages use English. Library titles, descriptions, categories, search, favorites, download status, update prompts, and reviews are localized, with layouts adjusted for narrow screens. Search also recognizes original Chinese game names. Individual games retain their original text, artwork, and save format. Install over the previous version to preserve downloads and saves.

## 0.4.16-alpha

### 中文

Android 0.4.16-alpha（21），最低 Android 8.0。

- 发现更新后可在 App 内选择「下载并更新」或「暂不更新」，无需跳转 GitHub。
- 显示下载进度，下载完成后核对大小、SHA-256、包名、版本和既有签名，再打开 Android 安装确认界面。
- 首次更新需要允许 owngame 安装应用；权限未允许或安装取消时保留已下载的安装包，可稍后继续。下载取消或失败可重试，现有游戏与存档不受影响。
- 更新提示中可阅读发布说明；所有现有 Android 发布已补充中英文说明。首屏继续推荐《霓虹突围》。

这是 Alpha 测试包，沿用既有签名。旧版仍使用原来的 GitHub 更新入口，需要先手动覆盖安装本版一次；以后可在 App 内完成下载并请求安装。Android 的最终安装确认仍由用户完成，不会静默或强制更新。不要先卸载或清除数据。

附 APK、SHA256SUMS 和 release-manifest.json；对应源码已公开。

### English

Android 0.4.16-alpha (21), requiring Android 8.0+.

- Choose **Download and update** or **Not now** inside the app when an update is available, without opening GitHub.
- See download progress. The app verifies APK size, SHA-256, package identity, version, and the existing signing identity before opening Android's installation confirmation.
- The first update requires permission for owngame to install apps. If permission is denied or installation is cancelled, the verified APK is retained for later. Downloads can be cancelled or retried without affecting installed games or saves.
- Update prompts include release notes. All existing Android releases now have Chinese and English descriptions. Neon Shooter remains the featured game on the home screen.

This Alpha keeps the existing signing key. Older clients still use their previous GitHub update flow: install this version over the existing app once to gain in-app downloads and installation requests. Android still requires the user's final installation confirmation; updates are optional and never silent. Do not uninstall or clear app data first.

The APK, SHA256SUMS, release-manifest.json, and matching public source are provided.


## 0.4.15-alpha

### 中文

Android 首屏推荐游戏改为《霓虹突围》，展示其现有封面与「太空射击 · 波次与首领」简介。

未下载时按钮下载《霓虹突围》，已下载时直接开玩。保留上一版的游戏启动、源码/授权链接和 GitHub 可选更新功能。

沿用既有 Alpha 测试签名，可直接覆盖安装以保留下载与存档。请勿先卸载或清除数据。

附 APK、SHA256SUMS 和 release-manifest.json；源码已同步公开。

### English

The Android home screen now features **Neon Shooter (霓虹突围)** with its existing cover and space-shooter description. The card downloads the game if needed, or opens it when installed. Game launch fixes, source/license links, and optional GitHub update checks from the previous release are retained.

This Alpha uses the existing testing signature. Install over the previous version to preserve downloaded games and saves; do not uninstall or clear app data. The APK, SHA256SUMS, release manifest, and matching public source are provided.


## 0.4.14-alpha

### 中文

修复 Android 内《星野来信》等模块游戏的启动与说明链接：

- 正确提供 `.mjs` 脚本类型，修复“拆开来信，出发！”按钮一直不可用的问题。
- 点击“查看源码”会打开系统浏览器；本地“授权说明”在 App 内阅读，关闭后保留游戏现场，支持新窗口链接。
- 保留离线资源隔离，阻止非用户点击的外跳、特殊协议及跨域资源加载。
- 包含上一版的 GitHub 可选更新提示和完整封面。

验证：Android 14 真机 9 项 WebView 检查通过（含实际《星野来信》发布包启动 Unity）、18 项下载/校验/回滚检查通过；公开源隐私与封面检查 6 项、更新策略检查 8 项通过。

《星野来信》仍推荐键鼠，本次没有添加完整触屏控制。不同手机的游戏表现仍需实测。

这是 Alpha 测试包，沿用既有测试签名，可覆盖安装保留数据。请勿先卸载；卸载或清除数据会删除手机上的下载和存档。0.4.13-alpha 起可在游戏库底部检查 App 更新，也可直接下载本页 APK。APK 校验信息见 SHA256SUMS，源码版本见 release-manifest.json。

### English

Fixes module-based game startup, including the disabled start button in **Star Letters (星野来信)**, by serving `.mjs` files with a JavaScript MIME type. Source links open the system browser; local license notices open inside the app without replacing the game. New-window links are supported, while cross-origin resources, special schemes, and unprompted external navigation remain blocked.

Validation: 9 Android 14 WebView checks, including startup of the actual Star Letters Unity build; 18 repository/download/rollback checks; 6 public-source/privacy/cover checks; and 8 update-policy checks passed. Star Letters still recommends keyboard and mouse; full touch controls were not added.

This Alpha preserves the existing testing signature and can update an existing installation without uninstalling. Version 0.4.13-alpha and later can check for app updates from the library footer. See SHA256SUMS and release-manifest.json for APK verification and source revision.


## 0.4.13-alpha

### 中文

新增以本仓库 GitHub Android Releases 为准的版本检查。版本 **0.4.13-alpha（18）**，Android **8.0+**。

### 更新提示

- 打开 App 进入游戏库、或 App 从后台返回游戏库时，后台检查 `android-v…` 发布，包含 Alpha；不会误用 CLI 的 Latest 版本。
- 有兼容的新版本时，弹窗可选「去 GitHub 更新」或「暂不更新」。选择更新会打开对应发布页，玩家自行下载 APK，并由 Android 系统确认安装。
- 不会自动下载 APK、静默安装或强制更新；离线、超时或 GitHub 限流时不打扰已下载游戏。从游戏返回游戏库不会在同一轮使用中反复弹窗。
- 游戏库底部新增「检查 App 更新」，可以随时手动重试。

### 首次安装

旧版尚不具备版本检查功能，请先下载本页 APK **覆盖安装一次**。本包与 0.4.12-alpha 包名、签名相同且 versionCode 递增，无需卸载或清除数据。此后打开 App 即可检查后续 GitHub Android 版本；玩家始终可以选择暂不更新。

### 验证与源码

- 六项公开源码、隐私与封面检查通过，八项更新策略测试通过，并连接真实公开 Releases 验证了元数据读取。
- 检查发布版本、安装包与元数据一致性；只访问公开 GitHub HTTPS 信息，不需要账号或令牌。没有新增自动安装权限。
- 已构建 APK、验签，核对新增类、按钮文案和资源；本轮未操作用户手机验证原生弹窗和系统安装确认。
- [对应源码](https://github.com/luka2chat/owngame/tree/acd350cc6ef29c475edf277032ab1d6dfedc5254/apps/android)。附 `SHA256SUMS` 与 `release-manifest.json`。

仍为 Alpha 测试版，沿用内部测试签名。私钥、SDK 配置、本机日志和设备记录均不上传。

### English

Adds optional app update checks against this repository's public **Android Releases**, including Alpha releases, independently of the CLI's Latest release. Version **0.4.13-alpha (18)** requires **Android 8.0+**.

On app launch or return to the foreground, a compatible newer version offers “Update on GitHub” or “Not now.” In this version, choosing to update opens GitHub, where the user downloads the APK and confirms installation in Android. The app does not download or silently install updates. Offline requests, timeouts, and rate limits do not interrupt installed games. Returning from a game does not repeatedly prompt during the same foreground session. The library footer provides a manual check.

Older versions need this APK installed over the existing app once to gain update checks. The package and signature match 0.4.12-alpha, and versionCode increases; uninstalling is unnecessary and would remove local data.

Validation: 6 source/privacy/cover checks, 8 update-policy checks, and a live public-release metadata check passed. APK contents and signature were inspected. Native dialogs and system installation were not retested on a physical phone in that release. No installation permission was added. Public source matches commit acd350cc6ef29c475edf277032ab1d6dfedc5254. Testing keys, machine settings, logs, and device records are excluded.


## 0.4.12-alpha

### 中文

修复 0.4.11-alpha 遗漏三款游戏图片封面的问题。版本 **0.4.12-alpha（17）**，Android **8.0+**。

### 修复

- 补齐《星野来信》《人潮冲线》《箭径出逃》的本地图片封面，沿用网站现有素材。
- 三款游戏不再回退为黄色手柄默认图标；封面随 APK 安装，断网也能显示。
- 检查覆盖全部 18 款已发布游戏；游戏目录变化时，CI 会核对 Android 美术配置及图片、样式资源是否进入公开导出范围。

### 安装

下载 `owngame-android-0.4.12-alpha.apk`，直接覆盖安装上一版，无需卸载或清除数据。包名和签名与 0.4.11-alpha 相同，版本号递增；已有下载与应用数据可保留。仅刷新旧 App 的游戏库不会补齐这些内置封面，需要更新 APK。

仍为 Alpha 测试版，沿用内部测试签名，未作为商店正式发行。游戏内容和存档逻辑未变。

### 验证与源码

- 六项源码、隐私和封面回归测试通过；三张图片在浏览器预览中均成功解码显示。
- 已从 APK 中核对三张封面和界面脚本，确认与对应公开源码一致；签名与上一版一致，关闭应用调试和明文网络。
- 测试代码已编译；本轮未操作用户手机或重跑真机/人工手感验收。
- [对应源码](https://github.com/luka2chat/owngame/tree/49c0ed6b6f7cff4d306863b4d32c9edcdbe75612/apps/android)。附 `SHA256SUMS` 与 `release-manifest.json`。

仅上传 APK 和公开校验信息，不含私钥、本机配置、设备记录或用户提供的截图。

### English

Fixes missing bundled image covers for **Star Letters (星野来信), Crowd Runner (人潮冲线), and Arrow Escape (箭径出逃)** using the existing website artwork. Version **0.4.12-alpha (17)** requires **Android 8.0+**. The covers are included in the APK and work offline; refreshing the old app's catalogue alone will not add them.

Install over 0.4.11-alpha without uninstalling or clearing data. Package identity and signing key match the previous release, with a higher versionCode. Gameplay and save logic are unchanged. This remains an Alpha testing build, not a store production release.

Validation: 6 source/privacy/cover checks passed; all three images decoded in a browser preview, and the packaged assets matched the public source. The existing signature, disabled debugging, and cleartext-network restrictions were verified. Instrumentation compiled; physical-device/art/feel acceptance was not repeated for that release. Source revision: 49c0ed6b6f7cff4d306863b4d32c9edcdbe75612. Only the APK and public verification files were uploaded.


## 0.4.11-alpha

### 中文

首个公开的 owngame Android Alpha 测试包，版本 **0.4.11-alpha（16）**。需要 **Android 8.0+**。

### 下载与使用

下载下方 `owngame-android-0.4.11-alpha.apk` 安装。客户端直接访问公开游戏库，可按游戏下载、校验更新、离线游玩、恢复上一版，以及收藏和添加桌面快捷方式。无需账号、电脑配对或本地服务；游戏内容首次下载需要联网。

本包沿用现有内部测试签名，关闭应用调试和明文网络。它是 Alpha 测试版，尚非商店正式发行包。自行构建或其他签名的 APK 不能直接覆盖；卸载或清除数据会删除已有下载和本机存档。客户端暂不支持自身自动更新。

### 源码与校验

- 对应源码：[6de93bfe](https://github.com/luka2chat/owngame/tree/6de93bfed707613bb5d87c30eda13e8705e290ac/apps/android)。第三方素材许可随 APK 一并保留。
- `SHA256SUMS` 提供 APK 校验值；`release-manifest.json` 提供源提交、版本、包名、签名证书指纹与构建检查结果。
- 已核对公开源码清单，完成隐私防护测试、APK 构建/验签及测试代码编译。本次未重跑真机和人工美术、手感验收；Android 其他版本兼容性仍待更多反馈。

仅发布 APK 与公开校验信息；不包含私钥、SDK 配置、配对令牌、设备记录或本机构建日志。

### English

First public **owngame Android Alpha**, version **0.4.11-alpha (16)**, requiring **Android 8.0+**.

Install the attached APK to browse the public catalogue, download individual games, verify updates, play offline, roll back game versions, favorite games, and add home-screen shortcuts. No account, computer pairing, or local service is required. Initial game downloads require internet access. This version has no app self-update feature.

The APK uses the existing internal testing signature, with debugging and cleartext traffic disabled. Builds signed with other keys cannot replace this installation. Uninstalling or clearing data deletes local downloads and saves.

Matching source: 6de93bfed707613bb5d87c30eda13e8705e290ac. Third-party licenses are included. SHA256SUMS verifies the APK; release-manifest.json records source revision, version, package, certificate fingerprint, and build checks. Source/privacy checks, APK build/signature verification, and instrumentation compilation were completed. Physical-device and human art/feel acceptance were not repeated for that release; wider Android compatibility needs feedback. Private keys, SDK configuration, pairing tokens, device records, and local build logs are excluded.

