# 静态网页交付

先构建 Unity Web 正式故事版，再运行：

```sh
node web/pack.mjs unity/LittleOrbit/Builds/WebStory web-release .
python3 -m http.server 5177 --directory web-release --bind 127.0.0.1
```

输出目录必须不存在。打包器读取 Unity HTML 的资源路径，将 data、wasm 和 framework 原样 gzip 压缩，再按最多 16 MiB 分块；每块与解压后的完整文件均保留 SHA-256。浏览器验证后通过 Blob URL 交给原 Unity loader。没有修改引擎二进制，也不依赖付费对象存储或跨域服务。

托管时按普通二进制提供 `.bin` 文件，**不要**设置 `Content-Encoding: gzip`，解压在浏览器完成。给版本目录设置 `Cache-Control: public, max-age=31536000, immutable, no-transform`。现代浏览器需支持 WebGL 2、WebAssembly、Web Crypto 和 DecompressionStream；远程站点必须使用 HTTPS。

点击开始后才下载大资源。字体与第三方声明随包发布。不要把源码工作区、Unity 缓存和原构建报告一并上传到网站。
