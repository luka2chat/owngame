# 山城来信

滑动一枚枚纸片，拼回落日里的山城。

[在线试玩](https://owngame.dev/play?game=postcard-slide) · [授权与来源](THIRD_PARTY_NOTICES.md)

## 本地运行

需要 Node.js 22.18 或更新版本与 npm。在本目录执行：

```sh
npm ci
npm start
```

打开 http://127.0.0.1:5173 。也可分别运行 `npm run build` 和 `npm run serve`。构建输出位于 `dist/`；运行时素材在本地，不需要游戏运行时 CDN。

## 操作

点击空位同行或同列的拼片，整排向空位移动。按数字从左到右、从上到下还原图片，空位留在右下角。支持 3×3、4×4、5×5、看原图、撤销和自动保存。

## 线上版本与源码

对应线上交付：`cddb2e10800326d0740e543b9a749c0983b4202ea5de9a7b78fbe3943bb2f63a`。`ONLINE_BUILD.json` 记录原交付文件指纹，`SOURCE_MANIFEST.json` 记录这里的可编辑源码、构建脚本与素材。依赖通过 npm 恢复，构建脚本已移除开发机和 NAS 路径。打包路径、源码诊断标记或压缩器可能改变输出字节；重建结果和原交付的逐文件比较另见仓库检查结果。

代码许可：**MIT**。字体、引擎与上游素材依照各自声明；见 [授权与来源](THIRD_PARTY_NOTICES.md)。

## Game design board

The editable [game-outline.json](./game-outline.json) lives beside the game source. From this directory run `owngame outline` (or `npx @owngame/cli@latest outline .`). The command opens the local canvas; Ctrl+C stops it. Read the design before development and write design changes and actual validation back afterward. JSON and other project file references are relative to this directory. The published snapshot has been reviewed to remove private content.
