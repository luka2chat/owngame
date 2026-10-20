# 静态网页交付

先构建 Unity Web 正式故事版，再运行：

```sh
node web/pack.mjs unity/LittleOrbit/Builds/WebStory web-release .
python3 -m http.server 5177 --directory web-release --bind 127.0.0.1
```

输出目录必须不存在。打包器读取 Unity HTML 的资源路径，将 data、wasm 和 framework 原样 gzip 压缩，再按最多 1 MiB 分块；每块与解压后的完整文件均保留 SHA-256。浏览器验证后通过 Blob URL 交给原 Unity loader。没有修改引擎二进制，也不依赖付费对象存储或跨域服务。

托管时按普通二进制提供 `.bin` 文件，**不要**设置 `Content-Encoding: gzip`，解压在浏览器完成。给版本目录设置 `Cache-Control: public, max-age=31536000, immutable, no-transform`。现代浏览器需支持 WebGL 2、WebAssembly、Web Crypto 和 DecompressionStream；远程站点必须使用 HTTPS。

点击开始后才下载大资源。字体与第三方声明随包发布。不要把源码工作区、Unity 缓存和原构建报告一并上传到网站。

## 首次加载与断线恢复

每次最多并行下载三个分块。请求超过 12 秒没有收到新数据，或单次请求超过 45 秒，会取消并重试（每块最多四次）。只有长度和 SHA-256 都正确的完整分块才会保存；刷新或点击“继续接收”可复用这些分块。缓存不可用时仍可下载游玩，失败内容不会伪装成离线下载完成。

运行 `node --test web/download.test.mjs` 检查下载超时、断流、损坏内容、缓存恢复和并发上限。

站点外壳应避免首开时预下载其他游戏的大图。在部分 Chrome 网络路径上观察到 HTTP/3 大文件停滞，而相同资源通过 HTTPS / HTTP/2 正常。2026-10-19 已在 owngame.dev 的 Cloudflare 域名设置中关闭 HTTP/3，保持 HTTP/2 和 HTTPS；Pages 的 `_headers` 未能覆盖边缘生成的 `Alt-Svc`，不能用它代替域名设置。参见 [Cloudflare 协议排障说明](https://developers.cloudflare.com/speed/optimization/protocol/troubleshooting/protocol-troubleshooting/)。

调整后，默认 Chrome（未禁用 QUIC、每轮新进程与新缓存）连续三次冷启动通过，覆盖游戏直达和首页进入：游戏资源下载与 Unity 初始化分别为 5.516、5.365、5.631 秒，均使用 HTTP/2，无重试或脚本错误。测试额外等待启动画面结束，再检查真实 3D 场景与键盘操作。数据来自当前测试网络，不代表所有地区、设备或弱网速度；该记录只覆盖当时的电脑加载测试；触屏适配另见下文。

## 手机触屏

网页适配层通过 Unity 已有的浏览器输入通道传递操作，不改变引擎文件和存档格式。左侧摇杆行走，画面空白处拖动环视；两个手指可同时移动和看四周。「互动」对应 E，「继续」对应 Enter，「收起」对应 Escape；「翻面」「全景」「复位」对应 F、V、C。读信、行囊、旅行和重新开始仍使用游戏内按钮。触摸按钮至少 44 CSS px，避开屏幕安全区；取消触摸、失焦、切后台和旋转屏幕会释放按键，避免持续行走。电脑保留键鼠操作，支持精细鼠标的设备默认隐藏触摸层；首次触摸后也可显示。

手机横屏视野更开阔。触屏输入支持与手机硬件性能分别验收；浏览器模拟不能替代真机。
