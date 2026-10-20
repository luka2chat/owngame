# owngame Android 客户端

面向玩家的 Android Alpha 客户端：从公开目录下载游戏、校验更新、离线游玩、恢复上一版、收藏和添加桌面快捷方式。创作仍由现有 AI 助手配合 CLI / MCP 完成。

当前源码版本 **0.4.16-alpha（21）**，最低 Android 8.0（API 26），目标 API 34。客户端直接读取 `https://owngame.dev/catalog.json`，无需账号、配对令牌或电脑上的服务。源码已公开；[GitHub Alpha 测试包](https://github.com/luka2chat/owngame/releases/tag/android-v0.4.16-alpha) 已提供下载，沿用内部测试签名。支持启动时检查 GitHub Android 新版本，由玩家选择是否更新；商店正式发行仍待完善。

## 从源码构建

需要 macOS 或 Linux、Node.js 22+、JDK 17、Android SDK platform 34 和 build-tools 34.0.0，以及 `zip`。Windows 可使用 WSL，并在 WSL 内安装 Linux 版工具。

1. 安装 JDK 与 Android SDK；可用 Android Studio 的 SDK Manager 安装 platform 34 / build-tools 34.0.0，或执行 `sdkmanager "platforms;android-34" "build-tools;34.0.0" "platform-tools"`。
2. 将 `JAVA_HOME` 指向 JDK 安装目录，将 `ANDROID_SDK_ROOT` 指向 Android SDK 目录。也支持 `OWNGAME_JAVA_HOME` 和 `ANDROID_HOME`。macOS 会尝试系统 JDK 17 检测；SDK 默认使用当前用户的标准安装目录。
3. 在仓库根目录执行：

```sh
npm run android:check
npm run android:build
```

Android 构建脚本只依赖 Node 内置模块，无需先安装 npm 依赖。输出为 `artifacts/android/owngame.apk`；可用 `npm run android:build -- NEW_OUTPUT_DIRECTORY` 指定输出目录。

首次构建会在 `.local/owngame-android-debug.jks` 创建开发者自己的测试密钥，后续构建继续使用该密钥；密码为 Android 通用测试密码 `android`，不用于正式发行。仓库不包含维护者的私钥、签名证书、SDK、缓存或 APK。自行构建的 APK 无法覆盖由其他密钥签名的已安装版本；请使用测试设备或模拟器，避免卸载造成已有下载和存档丢失。

`OWNGAME_ANDROID_TEMP` 可指定临时构建目录的父目录。每次构建使用独立子目录并在结束后清理。构建日志只保留在忽略的 `artifacts/` 下。

## 安装与验证

安装需要 Android SDK platform-tools。明确选择自己的测试设备：

```sh
adb -s DEVICE_SERIAL install -r artifacts/android/owngame.apk
adb -s DEVICE_SERIAL shell am start -n dev.owngame.app/.MainActivity
npm run android:test:compile
npm run test:android -- DEVICE_SERIAL
npm run test:android -- DEVICE_SERIAL --webview
```

仓库测试会安装独立的测试 APK，并在应用缓存的临时目录执行目录校验、下载损坏、路径穿越、更新中断、断点续传及离线回滚测试；需要先安装使用本次本地测试密钥构建的客户端。测试不会自动选择设备，不读取真实游戏目录或提交评价。`--webview` 使用隔离的临时游戏验证真实 WebView 的 ES 模块、触屏点击、新窗口源码链接、离线授权说明及外链拦截，不读取现有游戏或存档。若已有《星野来信》发布包的 `files` 目录，可追加 `--star-letters-dir GAME_FILES` 验证实际 Unity 启动；它只复制到测试专用临时目录并在结束后清理。`android:test:compile` 只编译测试，不连接设备。

CI 检查公开文件清单、隐私防护测试、客户端 APK 构建及测试代码编译。CI 构建使用临时测试密钥，不发布 APK，也不代表真机、美术或操作手感验收。历史实测环境为 Android 14；其他系统版本仍需验证。

## 使用与数据

- 首次进入刷新公开游戏目录；下载完成后可离线冷启动。
- 更新先下载并逐文件校验，完整成功后才切换版本；失败保留旧版，支持续传和恢复上一版。
- 目录刷新失败或作品下架不会删除已下载游戏。游戏和评价保存在手机本地；当前没有公网评价上传接口。
- 游戏使用独立 WebView，菜单提供收藏、快捷方式、重新打开和本机评价。快捷方式仍依赖客户端安装。
- 清除应用数据或卸载会删除下载和本地数据。不同游戏版本的存档兼容性由游戏本身决定。

## 结构与限制

`src/dev/owngame/app/GameRepository.java` 负责 HTTPS 目录、清单及 SHA-256 校验、原子版本切换和离线回滚；`MainActivity.java` 负责游戏库、下载状态和快捷方式，`GameActivity.java` 承载游戏。应用禁用明文网络、备份、调试和 WebView 调试；游戏页面不共享游戏库的原生接口。

信任基础为 HTTPS 和本站发布权限，暂未提供独立签名清单或防降级序列。下载没有前台服务，进程被系统回收后需重新点击继续；旧版本尚不自动清理。封面随客户端内置，新游戏可显示通用封面。

## 许可与公开范围

客户端自有 Java、网页界面和构建/测试脚本采用仓库根目录的 [MIT 许可证](../../LICENSE)。封面与第三方素材保留各自许可，详见 [素材来源](ART-PROVENANCE.md) 和 [随包声明](assets/THIRD_PARTY_NOTICES.md)；根目录 MIT 不覆盖第三方或 GPL 素材。

公开导出只读取 `scripts/android/public-files.json` 中逐项审核的文件，拒绝私钥、设备配置、符号链接、个人路径和内网地址。PNG 公开副本移除文字、EXIF 和嵌入式来源元数据，保持图像像素及渲染块不变；原始生产素材仍在本地。历史本机服务、配对/同步脚本、原始验收日志、设备截图及个人记录均不公开。

## App 版本更新

每次打开 App 回到前台时，后台读取本仓库的 GitHub Releases，只检查 `android-v…` 的公开 Android 发布（包括 Alpha），不使用 CLI 的 Latest 版本。按版本排序后核对随发布附带的 `release-manifest.json`，仅提示版本号更高且支持当前 Android 系统的安装包。

发现新版时可以选择「下载并更新」或「暂不更新」，并在提示中阅读发布说明。选择更新后，App 内显示下载进度，并在私有缓存中核对大小、SHA-256、包名、版本和既有签名，再请求 Android 系统安装。取消下载会删除未完成文件，失败可重试；已下载的游戏不受影响。

首次更新需按系统提示允许 owngame 安装应用；权限未允许或安装取消时保留已校验的 APK，下次可点「检查 App 更新」继续。Android 最后的安装确认仍由用户完成，没有静默安装或强制更新。已下载的更新在重启后可恢复提示，安装成功后清理旧更新缓存。游戏库和游戏网页都无法传入任意安装链接或文件路径。

更新 APK 通过非导出、只读的 ContentProvider 临时授权给系统安装程序，只暴露单个更新文件。新增 `REQUEST_INSTALL_PACKAGES` 权限，仅供用户选择的 App 自身更新。离线、超时或 GitHub 限流时，自动检查安静失败；游戏库底部可手动重试。

后续 Android 发布应继续附带同名 APK 与 `release-manifest.json`（版本、递增的 versionCode、最低 SDK、包名及 APK 校验信息），保持既有签名。检查代码只读取公开 GitHub 信息，不需要账号或令牌。

运行 `npm run android:test:updates` 可执行本机版本筛选、错误元数据、网络失败及可信来源测试；加 `-- --live` 可连接真实公开 Releases 检查元数据。测试使用固定版本且校验 SHA-256 的 JSON-java 测试库，下载在忽略的 `.local/`，不会进入 APK。0.4.13–0.4.15 的客户端仍会打开 GitHub，需要先手动覆盖安装 0.4.16-alpha 一次，之后即可使用 App 内更新。

## 0.4.14-alpha 修复

为 `.mjs` 返回 JavaScript MIME 类型，修复模块游戏启动按钮始终禁用的问题。用户点击的 HTTPS 源码链接由系统浏览器打开，本地 `.txt` / `.md` 授权说明在可关闭的文本窗口阅读，保留游戏页面。支持 `target="_blank"`，同时继续阻止跨域资源、非用户点击的外跳和特殊协议。此修复不添加游戏的触屏操控；《星野来信》仍以键鼠为推荐操作。

0.4.15-alpha 将 Android 首页的首屏推荐游戏改为《霓虹突围》，沿用其现有封面与下载/开玩入口。

## 发布说明

每个 Android GitHub 发布都要同时包含中文和英文说明，维护在 [RELEASE_NOTES.md](RELEASE_NOTES.md)。发布前执行 `node scripts/android/release-notes.mjs VERSION` 输出对应正文；缺少任一语言时命令会失败。中英文必须描述相同变更和已完成的验证，保留 Alpha、签名与覆盖安装说明。

`npm run android:test:updates` 同时运行更新策略与流式下载校验测试；追加 `-- --live --live-download` 可下载真实公开 APK 验证，须先将 `OWNGAME_UPDATE_TEST_OUTPUT` 设置到适合大文件的私有测试目录。`npm run test:android -- DEVICE_SERIAL --updates APK RELEASE_MANIFEST` 验证真实 APK 解析、签名和只读安装提供者，需要设备现有版本低于测试 APK；不会安装更新或修改游戏/存档。
