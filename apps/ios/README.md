# owngame iPhone / iPad 客户端

**0.2.0 开发预览工程，最低 iOS / iPadOS 16。本次容器更新提供本地 USB 游戏开发同步，沿用现有 TestFlight 分发渠道；Apple 处理、测试组开放和外测审核分别确认。其他开发者可使用自己的 Apple Team 签名测试。**

与 Android 使用同一个 `https://owngame.dev/catalog.json`，无需账号或电脑配对服务。游戏库直接复用 Android 的字标、吉祥物、美术与卡片界面；原生容器使用 UIKit 和 WKWebView，没有第三方运行依赖。

源码按目录的 `platforms` 声明只展示、下载和打开支持 `mobile` 的游戏；PC 专属作品不进入手机库，已有下载和存档保留。旧版无平台字段的目录与安装记录保持兼容。此规则需随新的客户端构建交付；每款游戏只需验收其声明支持的平台。

已实现目录刷新、逐文件 SHA-256 校验、断点续传、下载成功后原子切换版本、离线读取、恢复上一版、收藏、最近游玩、本机评价及 App 图标快速操作。App 启动时刷新失败仍保留已下载游戏。游戏下架不删除本机版本。评价不上传。

App 界面和原生菜单支持简体中文、英语，跟随系统或系统中的 App 语言；其他语言使用英语。共享文案位于 `scripts/mobile/localization.json`，构建时生成两端代码。游戏库的标题和简介同步翻译，搜索兼容原中文名；游戏内部文字及封面原图保持原语言。语言切换不改变游戏 ID、收藏、下载或存档。

iPhone 使用与 Android 一致的沉浸式游戏容器：画面铺满窗口，右上角半透明胶囊左侧「···」打开底部菜单，右侧圈点关闭游戏并返回首页。菜单的继续游戏保留当前实例，重新打开需确认；浮动胶囊避开刘海，游戏仍可使用 Web 安全区保护内部控件。横屏出现非阻断的竖屏建议，回到竖屏自动隐藏。本轮只验收 iPhone，不安排 iPad 适配。

## 本机检查与构建

需要 macOS、Node.js 22+ 和 Swift 6 工具链。完整 App 构建还需安装包含 iOS SDK 的 Xcode 16 或更新版本，并在 Xcode Settings → Locations 中选择对应 Command Line Tools。仅安装命令行工具无法编译 UIKit，也无法运行 iOS 模拟器。

```sh
npm run ios:check
npm run test:ios
npm run ios:prepare
npm run ios:build
```

`ios:check` 检查公开文件清单、隐私边界和工程同步。`test:ios` 在 macOS 上执行真实 Swift 下载仓库和本机 HTTP 协议测试，不代表 iOS WebKit 或真机通过。可用 `OWNGAME_IOS_LIVE=1 npm run test:ios` 额外校验当前公网目录及所有清单；不会下载完整游戏。

`ios:prepare` 从 Android 的审核清单生成 `Resources/Shell` 和现有吉祥物 App 图标，不复制生产私有数据。首次打开 Xcode 工程前必须运行一次。两端界面与素材更新后重新运行即可同步。

`ios:build` 默认产出未签名的模拟器 App；可用 `--sdk iphoneos` 检查设备架构编译。输出默认放系统临时目录，可用 `--out BUILD_DIRECTORY` 或 `OWNGAME_IOS_BUILD_DIR` 指定；大量构建缓存优先使用可写 NAS。Swift 测试缓存可用 `OWNGAME_IOS_TEST_DIR` 指定。

真机签名构建可同时传入 `--sdk iphoneos --team TEAM_ID --device DEVICE_ID`。这会允许 Xcode 使用已登录的开发者账号创建或更新开发签名，并登记指定设备；团队和设备标识仅作为本次构建参数，不写入公开工程。设备必须已信任电脑并开启开发者模式，Xcode 版本还必须支持该设备的系统版本。可通过 `DEVELOPER_DIR` 为单次命令选择兼容的 Xcode，不必更改全局工具版本。

签名构建把最终 App 放在本机临时目录 `owngame-ios-signed-products`，避免 SMB 附带的 Finder 元数据导致签名失败；中间缓存仍由 `--out` 指定。可用 `OWNGAME_IOS_PRODUCT_DIR` 指定其他本地产物目录。脚本会打印最终 App 路径。

## 安装到自己的 iPhone / iPad

1. 运行 `npm run ios:prepare`，在 Xcode 打开 `apps/ios/Owngame.xcodeproj`。
2. 在 Signing & Capabilities 选择自己的 Apple Team；必要时修改 Bundle Identifier。仓库没有账号、证书或描述文件。
3. 连接并明确选择自己的测试设备，按 Xcode 指引配置 Developer Mode，然后 Run。
4. TestFlight 需要自己的 Apple Developer Program 账号、App Store Connect 记录、签名归档及苹果处理/审核；本工程不会自动创建账号或发布。

`owngame` scheme 包含 `owngameUITests` 真机/模拟器 UI 测试目标。`SmokeTests.testDownloadAndOpen` 会通过真实界面下载并打开《潮光归位》，保留已有 App 数据，不提交评价。需要测试机已解锁、已信任开发签名并允许 App 联网；不能把仅构建测试运行器当作测试通过。

`SmokeTests.testBilingualLibraryAndMenus` 使用系统的 App 语言启动参数分别验证英文和中文游戏库、分类、收藏入口、真实下载及游戏菜单，并保留截图。它不重置游戏存档，也不提交评价。

`SmokeTests.testInstalledMoveAndRelaunch` 在已下载的首关移动一步，再结束进程重开并核对步数与两座灯塔状态；已有其他进度时跳过，不重置存档。离线验证需先在真实设备施加断网条件，再给测试运行器设置 `OWNGAME_EXPECT_OFFLINE=1`。该标记只增加远程刷新失败断言，不修改 App 的网络实现；结束后恢复设备原先网络状态。跳过用例不计作通过。

`SmokeTests.testFullscreenCapsuleAndOrientation` 以已安装且保留一步进度的《潮光归位》核对 WebView 上下贴边、胶囊菜单继续不丢进度、横屏提示、旋转回竖屏、圈点返回首页和重新进入后的存档。

旧版设备缺少部分 Xcode 26 测试依赖时，可在 `build-for-testing` 后运行 `node scripts/ios/prepare-test-runner.mjs --app UITEST_RUNNER_APP --identity SIGNING_IDENTITY`。该脚本仅为 `.xctrunner` 运行器复制当前 iPhoneOS SDK 的测试依赖、重新签名并验证，不修改正式 App、手机系统或安全策略。测试执行仍需兼容该设备的 Xcode 或独立设备测试服务。

源码检查与 GitHub CI 不能替代设备验收。签名安装、首次下载、断网杀进程重开、存档跨版本兼容、横竖屏、iPad 分屏、音频/WebGL/Unity Web、后台恢复、VoiceOver 和人对美术/手感的反馈都需单独实测。正式发行前还需按 [Apple 4.7](https://developer.apple.com/app-store/review/guidelines/#mini-apps-mini-games-streaming-games-chatbots-plug-ins-and-game-emulators) 核实游戏目录、分级、内容举报与其他适用要求。

## 数据与运行方式

- 下载位于 App 自有 Application Support，排除系统备份。卸载或清除 App 数据会丢失下载、评价和存档。
- 每个游戏使用独立且持久的本机端口作为 Web 存储来源；版本更新复用来源，保留 localStorage / IndexedDB。端口冲突时明确报错，不自动换地址导致存档看似丢失。游戏自己的跨版本存档兼容性仍由游戏负责。
- 本机服务只绑定 loopback IPv4，只读取当前游戏清单内的文件，检查 Host、Origin、路径和符号链接，支持 GET / HEAD / Range、WebAssembly MIME 和隔离响应头。
- 游戏 WebView 没有原生消息接口；内容规则与 CSP 阻止外部资源请求。只有 App 内置游戏库能发送下载、收藏等消息；原生端再次核对主框架与精确的内置文件地址。
- 保持 HTTPS / ATS，仅允许本机网络用于离线资源；不配置全局任意网络例外。无账号、广告、分析 SDK、评价上传或游戏内原生 API 桥。
- 与 Android 的桌面快捷方式不同，苹果端提供长按 App 图标的快速操作，最多四款；没有为每款游戏创建独立桌面图标。
- 下载由前台任务完成。系统挂起或终止 App 后，重新打开并点击下载继续；旧版与已写入分段保留。尚无后台下载、App 自更新、独立签名游戏清单或自动清理旧包。

## 源码与许可

自有 Swift 和构建脚本采用根目录 MIT。共享外观、游戏、第三方字体和素材保留原许可，含 CivClicker 的 GPL；`ios:prepare` 同步第三方声明与完整许可，游戏菜单可查看这些文件。素材来源见 [Android 素材说明](../android/ART-PROVENANCE.md)。

`scripts/ios/public-files.json` 是逐项公开清单。公开交付排除生成资源、构建缓存、签名材料、开发者设置与本机路径。`node scripts/ios/export-source.mjs --out NEW_DIRECTORY` 可导出可复现的客户端源码（含共享 Android 界面输入与许可）。工具包的 `release:prepare` 也包含此清单；游戏源码和网站仍遵循现有发布流程。

## USB development games

This source includes development protocol 1. Update the signed container in place, preserving its bundle identifier, team and data. The CLI transfers packages into the app's Documents/DevelopmentInbox over the trusted USB connection. The foreground container validates the ready marker and complete file hashes, installs atomically and returns a load receipt; watch updates reopen the development game using its persistent isolated origin. `UIFileSharingEnabled` exposes only Documents; official downloads remain in Application Support. No game-script/native bridge or LAN listener is added. See [local device development](../../docs/device-development.md) for the Python/Xcode prerequisites, commands and runtime logs.
