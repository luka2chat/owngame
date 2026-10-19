import fs from 'node:fs/promises';
import path from 'node:path';
import {execFileSync} from 'node:child_process';
import {sha256} from './source-policy.mjs';
const root=path.resolve(process.argv[2]||'.');
const manifest=JSON.parse(await fs.readFile(path.join(root,'SOURCE_MANIFEST.json')));
const files=execFileSync('git',['ls-files','-z'],{cwd:root,encoding:'utf8'}).split('\0').filter(p=>p && p!=='SOURCE_MANIFEST.json');
manifest.scope='Reviewed public toolkit, portable website game sources and their separate licenses; private production files and caches excluded';
manifest.files=[];
const queue=[...files];
await Promise.all(Array.from({length:16},async()=>{while(queue.length) {
  const p=queue.shift();
  if((await fs.lstat(path.join(root,p))).isSymbolicLink())throw Error('Unreviewed source symlink: '+p);
  const b=await fs.readFile(path.join(root,p));manifest.files.push({path:p,bytes:b.length,sha256:sha256(b)});
}}));
manifest.files.sort((a,b)=>a.path.localeCompare(b.path,'en'));
await fs.writeFile(path.join(root,'SOURCE_MANIFEST.json'),JSON.stringify(manifest,null,2)+'\n');
