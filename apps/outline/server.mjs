import http from 'node:http';
import { readFile, mkdir, realpath, lstat } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { resolve, dirname, extname, relative, sep } from 'node:path';
import { sampleWorkspace } from './model.mjs';
import { OutlineWorkspace, initOutline } from '../../scripts/toolkit/outline-store.mjs';
import { serveProjectAsset } from './project-assets.mjs';

const root = dirname(fileURLToPath(import.meta.url));
const repo = resolve(root, '../..');
const maxBytes = 25 * 1024 * 1024;
export async function createOutlineServer({ workspace = repo, dataDir = resolve(workspace, '.local/game-outline'), port = 3228 } = {}) {
  workspace = await realpath(workspace);
  const store = new OutlineWorkspace(workspace, dataDir);
  await store.initialize(sampleWorkspace);
  const file = store.indexFile;
  let saving = false;
  const publicFiles = new Set(['index.html', 'app.js', 'style.css', 'model.mjs', 'model-preview.js']);
  const brandFiles = new Set(['arcade-mascot.png', 'harbor-background.png', 'lighthouse.png']);
  const server = http.createServer(async (req, res) => {
    const reply = (code, data) => { res.writeHead(code, { 'Content-Type': 'application/json; charset=utf-8' }); res.end(JSON.stringify(data)); };
    res.setHeader('Cache-Control', 'no-store');
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Content-Security-Policy', "default-src 'self'; script-src 'self' 'wasm-unsafe-eval'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; connect-src 'self' blob:; object-src 'none'; base-uri 'none'; frame-ancestors 'none'");
    const origin = `http://127.0.0.1:${server.address().port}`;
    if (req.headers.host !== new URL(origin).host || (req.headers.origin && req.headers.origin !== origin) || req.headers['sec-fetch-site'] === 'cross-site') { reply(403, { error: '只接受本机页面请求。' }); return; }
    try {
      const path = new URL(req.url, origin).pathname;
      if (path === '/api/workspace' || path === '/api/projects') {
        if (req.method === 'GET' && path === '/api/workspace') { reply(200, await store.snapshot()); return; }
        if (!((path === '/api/workspace' && req.method === 'PUT') || (path === '/api/projects' && req.method === 'POST'))) { reply(405, { error: 'Method not allowed' }); return; }
        if (req.headers['x-owngame-outline'] !== '1') { reply(403, { error: 'Missing local header' }); return; }
        if (saving) { reply(409, { error: '另一个保存正在进行，请稍后重试。' }); return; }
        saving = true;
        try {
          const chunks = []; let bytes = 0;
          for await (const chunk of req) {
            bytes += chunk.length;
            if (bytes > maxBytes) { reply(413, { error: '构思板超过 25 MB，请减少图片或拆成不同备份。' }); return; }
            chunks.push(chunk);
          }
          const next = JSON.parse(Buffer.concat(chunks).toString('utf8'));
          if (path === '/api/projects') {
            if (typeof next.directory !== 'string' || !next.directory || next.directory.length > 1000 || next.directory.split(/[\\/]/).some(p => !p || p.startsWith('.')) || resolve(workspace,next.directory) === workspace) throw Error('请输入工作区下的游戏目录，如 my-game。');
            let directory = workspace;
            for (const part of next.directory.split(/[\\/]/)) {
              directory = resolve(directory, part);
              const rel = relative(workspace, directory); if (rel.startsWith('..') || rel.startsWith(sep)) throw Error('目录必须在当前工作区内。');
              try { if (!(await lstat(directory)).isDirectory()) throw Error('项目目录不能经过符号链接。'); } catch(e) { if(e.code !== 'ENOENT') throw e; await mkdir(directory); }
            }
            const result = await initOutline(directory, { project: next.project });
            await store.register(directory);
            reply(200, { ...await store.snapshot(), selectedProjectId: result.project.id, created: result.created });
          } else {
            const result = await store.save(next.revision, next.workspace);
            reply(200, { revision: result.revision, bindings: result.bindings, errors: result.errors });
          }
        } catch (error) { reply(['OUTLINE_CONFLICT','OUTLINE_BUSY'].includes(error.code) ? 409 : 400, { error: error.message, code: error.code }); }
        finally { saving = false; }
        return;
      }
      if (!['GET', 'HEAD'].includes(req.method)) { reply(405, { error: 'Method not allowed' }); return; }
      if(path.startsWith('/api/asset/')||path.startsWith('/api/three/')) {
        try { const asset=await serveProjectAsset(store,path,new URL(req.url,origin).searchParams.get('file'));if(!asset)throw Error('预览不存在。');res.writeHead(200,{'Content-Type':asset.type});res.end(req.method==='HEAD'?undefined:asset.contents); }
        catch { reply(404,{error:'源文件不可用，请检查项目路径、NAS 连接或项目的 Three.js 依赖。'}); }
        return;
      }
      const name = path === '/' ? 'index.html' : path.slice(1);
      let target;
      if (publicFiles.has(name)) target = resolve(root, name);
      else if (path.startsWith('/brand/') && brandFiles.has(path.slice(7))) target = resolve(root, 'brand', path.slice(7).replace('.png','.webp'));
      else { reply(404, { error: 'Not found' }); return; }
      const contents = await readFile(target);
      const type = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.mjs': 'text/javascript', '.css': 'text/css', '.webp': 'image/webp' }[extname(target)];
      res.writeHead(200, { 'Content-Type': type }); res.end(req.method === 'HEAD' ? undefined : contents);
    } catch { reply(500, { error: '读取失败，请重试。' }); }
  });
  server.requestTimeout = 15000;
  await new Promise((ok, fail) => { server.once('error', fail); server.listen(port, '127.0.0.1', ok); });
  return { server, url: `http://127.0.0.1:${server.address().port}`, file };
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const port = Number(process.env.OWNGAME_OUTLINE_PORT || 3228);
  if (!Number.isInteger(port) || port < 1024 || port > 65535) throw new Error('Invalid port');
  const { server, url, file } = await createOutlineServer({ port });
  console.log(`owngame 游戏构思板 · ${url}\n本地保存：${file}`);
  for (const signal of ['SIGINT', 'SIGTERM']) process.on(signal, () => server.close());
}
