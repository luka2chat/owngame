# 人潮冲线

左右拖动，选对数字门，带着越来越热闹的队伍冲向终点。

[在线试玩](https://owngame.dev/play?game=crowd-runner) · [授权与来源](THIRD_PARTY_NOTICES.md)

## 本地运行

需要 Node.js 22.18 或更新版本与 npm。在本目录执行：

```sh
npm ci
npm start
```

打开 http://127.0.0.1:5173 。也可分别运行 `npm run build` 和 `npm run serve`。构建输出位于 `dist/`；运行时素材在本地，不需要游戏运行时 CDN。

## 操作

按住跑道左右拖动，或使用方向键／A、D，选择加法、乘法门壮大队伍；减法和除法门要看清当前人数。避开旋转障碍，带足伙伴战胜终点对手。支持暂停、8 关选关和独立存档续玩。

## 线上版本与源码

对应线上交付：`567aaff7a80158d89ad0eece2d91bcbb45aac79729e7288af003bd5fddedbf3c`。`ONLINE_BUILD.json` 记录原交付文件指纹，`SOURCE_MANIFEST.json` 记录这里的可编辑源码、构建脚本与素材。依赖通过 npm 恢复，构建脚本已移除开发机和 NAS 路径。打包路径、源码诊断标记或压缩器可能改变输出字节；重建结果和原交付的逐文件比较另见仓库检查结果。

代码许可：**MIT**。字体、引擎与上游素材依照各自声明；见 [授权与来源](THIRD_PARTY_NOTICES.md)。

本版本的 src/game.js 与 src/rules.js 为线上交付使用的完整、未压缩 ES modules，包含原注释与全部玩法逻辑；TypeScript 类型已在发布时移除。工作区内尚未上线的后续改版不混入这个版本。
