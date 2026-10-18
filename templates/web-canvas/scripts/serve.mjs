import http from 'node:http';
import { createReadStream, statSync, realpathSync } from 'node:fs';
import { resolve, extname, sep } from 'node:path';

// An isolated static server for an exported build, never the repository root.
const root = realpathSync(resolve(process.argv[2] ?? 'build/web-desktop'));
const port = Number(process.argv[3] ?? 3211);
if (!Number.isInteger(port) || (port !== 0 && port < 1024) || port > 65535) throw new Error('Invalid port');
const types = { '.html': 'text/html', '.js': 'text/javascript', '.json': 'application/json', '.css': 'text/css', '.wasm': 'application/wasm', '.png': 'image/png', '.jpg': 'image/jpeg', '.svg': 'image/svg+xml', '.ttf': 'font/ttf' };
const server = http.createServer((request, response) => {
  if (!['GET', 'HEAD'].includes(request.method)) { response.writeHead(405).end(); return; }
  try {
    const pathname = decodeURIComponent(new URL(request.url, 'http://localhost').pathname);
    let file = resolve(root, `.${pathname}`);
    if (file !== root && !file.startsWith(root + sep)) throw new Error('Outside root');
    if (statSync(file).isDirectory()) file = resolve(file, 'index.html');
    file = realpathSync(file);
    if (!file.startsWith(root + sep) || !statSync(file).isFile()) throw new Error('Outside root');
    response.writeHead(200, { 'content-type': types[extname(file)] ?? 'application/octet-stream', 'cache-control': 'no-store' });
    if (request.method === 'HEAD') response.end();
    else createReadStream(file).on('error', () => response.destroy()).pipe(response);
  } catch { response.writeHead(404).end('Not found'); }
});
server.listen(port, '127.0.0.1', () => console.log(JSON.stringify({ root, url: `http://127.0.0.1:${server.address().port}`, pid: process.pid })));
for (const signal of ['SIGINT', 'SIGTERM']) process.on(signal, () => server.close());
