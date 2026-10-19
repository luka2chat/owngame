# 螺帽之间

转个念头，把每一种颜色放回它的位置。

[在线试玩](https://owngame.dev/play?game=unlock-bolts-mobile) · [授权与来源](THIRD_PARTY_NOTICES.md)

## 本地运行

需要 Node.js 22.18 或更新版本与 npm。在本目录执行：

```sh
npm ci
npm start
```

打开 http://127.0.0.1:5173 。也可分别运行 `npm run build` 和 `npm run serve`。构建输出位于 `dist/`；运行时素材在本地，不需要游戏运行时 CDN。

## 操作

先点一根螺栓，再点目标螺栓。同色叠放，空位周转。集齐一柱颜色可解锁备用位置；随时可以撤销或重来。

## 线上版本与源码

对应线上交付：`242ec04e83481095de6afa5c36bff48698e00ce9abe391a96e0c8719bbaa6a2b`。`ONLINE_BUILD.json` 记录原交付文件指纹，`SOURCE_MANIFEST.json` 记录这里的可编辑源码、构建脚本与素材。依赖通过 npm 恢复，构建脚本已移除开发机和 NAS 路径。打包路径、源码诊断标记或压缩器可能改变输出字节；重建结果和原交付的逐文件比较另见仓库检查结果。

代码许可：**MIT**。字体、引擎与上游素材依照各自声明；见 [授权与来源](THIRD_PARTY_NOTICES.md)。
