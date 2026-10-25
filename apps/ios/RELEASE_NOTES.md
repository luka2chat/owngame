# iOS TestFlight release notes

## 0.2.0 (5)

### 中文

新增本地游戏 USB 开发同步，与 CLI 0.12.0 配合使用。构建游戏后运行 `owngame device sync ./dist --platform ios --id my-game --watch`，后续重新构建即可更新手机里的游戏，并通过命令读取运行错误日志。开发游戏与正式游戏隔离，同一 ID 更新保留存档，损坏包校验失败时保留旧版。

保留既有的中英文游戏库、离线下载和游戏菜单。已在 iPhone 11 / iOS 16.1.1 的签名开发容器验证触摸落子、更新、重启存档、运行错误日志和损坏包拒绝。TestFlight 分发构建的安装和同步需单独验证；其他系统、引擎和设备尚需实测。

需要已信任的 USB 连接、开发者模式、兼容 Xcode 和 Python 的 pymobiledevice3 连接工具。开发同步不需要每次重新构建或重装容器。请更新现有 App，避免卸载造成下载与存档丢失。

### English

Adds USB delivery for local game development with CLI 0.12.0. Build a self-contained Web game and run `owngame device sync ./dist --platform ios --id my-game --watch`; subsequent builds update the game inside the existing container. Read runtime errors with `owngame device logs --platform ios`. Development games are isolated from official games; updates of the same ID preserve saves, and invalid packages retain the working version.

Retains the bilingual library, offline downloads and game menus. Physical iPhone 11 / iOS 16.1.1 checks with a signed development container covered touch input, updates, restart/save retention, runtime-error logs and corrupt-package rejection. Installation and delivery through the TestFlight distribution build require separate validation. Other engines, devices and system versions still need testing.

Requires trusted USB pairing, Developer Mode, compatible Xcode support and pymobiledevice3 in Python. Game updates do not require rebuilding or reinstalling the container. Update the existing app in place to preserve downloads and saves.
