# 风铃回响

听一段风铃，再把旋律轻轻敲回来。三档挑战，自动保存，静音也能玩。

[在线试玩](https://owngame.dev/play?game=wind-chime-memory) · [授权与来源](THIRD_PARTY_NOTICES.md)

## 本地运行

需要 Node.js 22.18 或更新版本与 npm。在本目录执行：

```sh
npm ci
npm start
```

打开 http://127.0.0.1:5173 。也可分别运行 `npm run build` 和 `npm run serve`。构建输出位于 `dist/`；运行时素材在本地，不需要游戏运行时 CDN。

## 操作

听完旋律后按顺序轻触风铃；长音需要按住，合奏需要双指。支持难度选择、暂停、静音和自动续玩。

## 线上版本与源码

对应线上交付：`2d9d8bf4720b204bb70d1646c2fb6747b3446ca075cfad7cc49223b9fe7ae995`。`ONLINE_BUILD.json` 记录原交付文件指纹，`SOURCE_MANIFEST.json` 记录这里的可编辑源码、构建脚本与素材。依赖通过 npm 恢复，构建脚本已移除开发机和 NAS 路径。打包路径、源码诊断标记或压缩器可能改变输出字节；重建结果和原交付的逐文件比较另见仓库检查结果。

代码许可：**MIT**。字体、引擎与上游素材依照各自声明；见 [授权与来源](THIRD_PARTY_NOTICES.md)。
