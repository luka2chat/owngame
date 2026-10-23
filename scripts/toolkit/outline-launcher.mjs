import fs from 'node:fs/promises';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { createOutlineServer } from '../../apps/outline/server.mjs';
import { initOutline, OUTLINE_FILE } from './outline-store.mjs';

export function parseOutlineArgs(args) {
  const result = { port: 3228, explicitPort: false, open: true };
  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg === '--no-open') result.open = false;
    else if (arg === '--port') {
      if (result.explicitPort || !/^\d+$/.test(args[i + 1] ?? '')) throw Error('Expected --port 1024..65535');
      result.port = Number(args[++i]); result.explicitPort = true;
      if (result.port < 1024 || result.port > 65535) throw Error('Invalid outline port');
    } else if (arg.startsWith('-') || result.directory !== undefined) {
      throw Error('Usage: owngame outline [directory] [--no-open] [--port 3228] [--workspace path]');
    } else result.directory = arg;
  }
  return result;
}
export function openOutlineBrowser(url) {
  const command = process.platform === 'darwin' ? 'open' : process.platform === 'win32' ? 'cmd' : 'xdg-open';
  const args = process.platform === 'win32' ? ['/c', 'start', '', url] : [url];
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { stdio: 'ignore' });
    child.once('error', reject);
    child.once('exit', code => code === 0 ? resolve() : reject(Error(`Browser opener exited with ${code}`)));
  });
}
export async function launchOutline(args, { workspace = process.cwd(), openBrowser = openOutlineBrowser, print = console.log } = {}) {
  const options = parseOutlineArgs(args);
  const directory = await fs.realpath(path.resolve(workspace, options.directory ?? '.'));
  if (!(await fs.stat(directory)).isDirectory()) throw Error('Outline expects a game directory');
  // Preserve an existing multi-project workspace. A fresh project starts with its own JSON, never the fictional demo.
  let indexed = false;
  try { indexed = JSON.parse(await fs.readFile(path.join(directory, '.local/game-outline/project-files.json'), 'utf8')).bindings?.length > 0; }
  catch (error) { if (error.code !== 'ENOENT') throw error; }
  if (options.directory !== undefined || !indexed) await initOutline(directory);
  let active;
  try { active = await createOutlineServer({ workspace: directory, port: options.port }); }
  catch (error) {
    if (error.code !== 'EADDRINUSE' || options.explicitPort) throw error;
    active = await createOutlineServer({ workspace: directory, port: 0 });
  }
  print(JSON.stringify({ url: active.url, workspace: directory, file: `./${OUTLINE_FILE}`, storage: 'Each linked game owns game-outline.json; file references are project-relative.', stop: 'Ctrl+C' }));
  if (options.open) {
    try { await openBrowser(active.url); }
    catch { print(JSON.stringify({ warning: 'Could not open a browser automatically. Open the printed local URL.' })); }
  }
  return active;
}
