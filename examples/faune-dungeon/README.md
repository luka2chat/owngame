# 法恩探险

穿过地牢，找到三只宝箱，再带着宝藏回到出发点。

[在线试玩](https://owngame.dev/play?game=faune-dungeon) · [授权与来源](THIRD_PARTY_NOTICES.md)

## 本地运行

需要 Node.js 22.18 或更新版本与 npm。在本目录执行：

```sh
npm ci
npm start
```

打开 http://127.0.0.1:5173 。也可分别运行 `npm run build` 和 `npm run serve`。构建输出位于 `dist/`；运行时素材在本地，不需要游戏运行时 CDN。

## 操作

拖动角色上下左右移动，或使用方向键 / WASD；松手停下，Esc 暂停或继续。沿面朝方向自动投出飞刀，靠近宝箱自动打开。收集三只宝箱后回到出发点撤离，留意蜥蜴。支持存档续玩。

## 线上版本与源码

对应线上交付：`2b8068ef189c1b5b24c1c27a5216aa32a8beeb8d0276a9f9c6b86b1543bc8ba0`。`ONLINE_BUILD.json` 记录原交付文件指纹，`SOURCE_MANIFEST.json` 记录这里的可编辑源码、构建脚本与素材。依赖通过 npm 恢复，构建脚本已移除开发机和 NAS 路径。打包路径、源码诊断标记或压缩器可能改变输出字节；重建结果和原交付的逐文件比较另见仓库检查结果。

代码许可：**MIT**。字体、引擎与上游素材依照各自声明；见 [授权与来源](THIRD_PARTY_NOTICES.md)。
