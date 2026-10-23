import fs from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {sha256, validateCoverage} from './source-policy.mjs';
import {validatePublicOutline} from './outline-policy.mjs';
import {readGameEntries} from '../web/catalog.mjs';
export async function verify(root) {
  const index = JSON.parse(await fs.readFile(path.join(root, 'games.json')));
  validateCoverage(index, index.games.map(g => ({id:g.id, version:g.online_build_sha256})));
  const catalog=await readGameEntries(root);
  validateCoverage(index,catalog.map(g=>({id:g.id,version:index.games.find(s=>s.id===g.id)?.online_build_sha256})));
  let count=0, bytes=0;
  for (const game of index.games) {
    const folder = path.join(root, game.path);
    const manifestBytes = await fs.readFile(path.join(folder, 'SOURCE_MANIFEST.json'));
    if (sha256(manifestBytes) !== game.source_manifest_sha256) throw Error('Source index hash mismatch: '+game.id);
    const manifest = JSON.parse(manifestBytes.toString());
    const online = JSON.parse(await fs.readFile(path.join(folder, 'ONLINE_BUILD.json')));
    if (online.build_sha256 !== game.online_build_sha256 || sha256(JSON.stringify(online.files)) !== online.build_sha256) throw Error('Delivery binding mismatch: '+game.id);
    const names = new Set();
    const queue=[...manifest.files];
    await Promise.all(Array.from({length:12},async()=>{while(queue.length) {
      const f=queue.shift();
      if (names.has(f.path) || path.isAbsolute(f.path) || f.path.split('/').some(s => !s || s === '..') ||
          /(^|\/)(node_modules|Library|Temp|\.git|\.env|\.npmrc|\.DS_Store)(\/|$)/.test(f.path)) throw Error('Unsafe source path: '+f.path);
      names.add(f.path);
      const target = path.join(folder, f.path);
      if ((await fs.lstat(target)).isSymbolicLink()) throw Error('Source symlink: '+target);
      const b=await fs.readFile(target);
      if (b.length !== f.bytes || sha256(b) !== f.sha256) throw Error('Source file hash mismatch: '+game.id+'/'+f.path);
      if (/\.(?:ts|js|mjs|json|md|html|css)$/.test(f.path) && /\/Users\/|\/Volumes\/|192\.168\.\d+\.\d+|gh[pousr]_[A-Za-z0-9]{30,}|-----BEGIN (?:RSA |OPENSSH )?PRIVATE KEY/.test(b.toString())) throw Error('Private data in public source: '+game.id+'/'+f.path);
      count++; bytes+=b.length;
    }}));
    if (!names.has('game-outline.json') || !names.has('AGENTS.md')) throw Error('Missing project-local design board: '+game.id);
    validatePublicOutline(JSON.parse(await fs.readFile(path.join(folder,'game-outline.json'),'utf8')));
    for (const name of ['README.md','LICENSE','THIRD_PARTY_NOTICES.md','package.json']) if (!names.has(name)) throw Error('Missing public documentation: '+game.id+'/'+name);
    if (game.kind !== 'unity') {
      for (const name of ['game.json','build.mjs','serve.mjs','package-lock.json']) if (!names.has(name)) throw Error('Missing portable build: '+game.id+'/'+name);
      if (game.kind !== 'static' && ![...names].some(n => n.startsWith('src/'))) throw Error('Editable source missing: '+game.id);
    }
  }
  return {status:'succeeded', games:index.games.length, source_files:count, bytes};
}
if (process.argv[1] === fileURLToPath(import.meta.url)) console.log(JSON.stringify(await verify(path.resolve(process.argv[2] || '.')), null, 2));
