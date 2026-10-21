import http from 'node:http';
import fs from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
const root = path.join(path.dirname(fileURLToPath(import.meta.url)), 'dist');
const port = Number(process.env.PORT || 5173);
const mime = {'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8',
  '.css':'text/css; charset=utf-8','.json':'application/json','.png':'image/png',
  '.jpg':'image/jpeg','.jpeg':'image/jpeg','.svg':'image/svg+xml','.ttf':'font/ttf',
  '.woff':'font/woff','.woff2':'font/woff2','.wasm':'application/wasm','.glb':'model/gltf-binary'};
http.createServer(async (req, res) => {
  try {
    const pathname = decodeURIComponent(new URL(req.url, 'http://localhost').pathname);
    let file = path.resolve(root, '.'+pathname);
    if (!file.startsWith(root+path.sep) && file !== root) throw Error('Forbidden');
    if ((await fs.stat(file)).isDirectory()) file = path.join(file, 'index.html');
    const bytes = await fs.readFile(file);
    res.writeHead(200, {'Content-Type':mime[path.extname(file)] || 'application/octet-stream'});
    res.end(bytes);
  } catch {res.writeHead(404); res.end('Not found');}
}).listen(port, '127.0.0.1', () => console.log('http://127.0.0.1:'+port));
