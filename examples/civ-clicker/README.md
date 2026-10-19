# 小小文明

从一顶帐篷开始，安排居民生产，建设自己的城邦。

[在线试玩](https://owngame.dev/play?game=civ-clicker) · [授权与来源](THIRD_PARTY_NOTICES.md)

## 本地运行

需要 Node.js 22.18 或更新版本与 npm。在本目录执行：

```sh
npm ci
npm start
```

打开 http://127.0.0.1:5173 。也可分别运行 `npm run build` 和 `npm run serve`。构建输出位于 `dist/`；运行时素材在本地，不需要游戏运行时 CDN。

## 操作

先收获粮食获得毛皮，再伐木搭帐篷。招募农夫保障食物，再发展伐木、采矿、建筑、科技和贸易。切到后台自动暂停；支持独立存档和导入导出。

## 线上版本与源码

对应线上交付：`441e2c1e2b5fd8de0f896aa1b410e8b0b149eaf873bf4fb8d57323ae644b2c4c`。`ONLINE_BUILD.json` 记录原交付文件指纹，`SOURCE_MANIFEST.json` 记录这里的可编辑源码、构建脚本与素材。依赖通过 npm 恢复，构建脚本已移除开发机和 NAS 路径。打包路径、源码诊断标记或压缩器可能改变输出字节；重建结果和原交付的逐文件比较另见仓库检查结果。

代码许可：**GPL-3.0-or-later**。字体、引擎与上游素材依照各自声明；见 [授权与来源](THIRD_PARTY_NOTICES.md)。
