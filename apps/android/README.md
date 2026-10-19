# owngame Android 客户端

面向玩家的 Android Alpha 客户端：从公开目录下载游戏、校验更新、离线游玩、恢复上一版、收藏和添加桌面快捷方式。创作仍由现有 AI 助手配合 CLI / MCP 完成。

当前源码版本 **0.4.11-alpha（16）**，最低 Android 8.0（API 26），目标 API 34。客户端直接读取 `https://owngame.dev/catalog.json`，无需账号、配对令牌或电脑上的服务。源码已公开；[GitHub Alpha 测试包](https://github.com/luka2chat/owngame/releases/tag/android-v0.4.11-alpha) 已提供下载，沿用内部测试签名。商店正式发行与 App 自身自动升级流程仍待完善。

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
```

最后一条会安装独立的测试 APK，并在应用缓存的临时目录执行目录校验、下载损坏、路径穿越、更新中断、断点续传及离线回滚测试；需要先安装使用本次本地测试密钥构建的客户端。测试不会自动选择设备，不读取真实游戏目录或提交评价。`android:test:compile` 只编译测试，不连接设备。

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
