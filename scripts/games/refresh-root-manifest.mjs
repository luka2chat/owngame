import fs from 'node:fs/promises';
import path from 'node:path';
import {execFileSync} from 'node:child_process';
import {sha256} from './source-policy.mjs';
const root=await fs.realpath(path.resolve(process.argv[2]||'.'));
const manifest=JSON.parse(await fs.readFile(path.join(root,'SOURCE_MANIFEST.json')));
const files=execFileSync('git',['ls-files','-z'],{cwd:root,encoding:'utf8'}).split('\0').filter(p=>p && p!=='SOURCE_MANIFEST.json');
manifest.scope='Reviewed public toolkit, portable website game sources and their separate licenses; private production files and caches excluded';
manifest.files=[];
const queue=[...files];
await Promise.all(Array.from({length:16},async()=>{while(queue.length) {
  const p=queue.shift();
  if((await fs.lstat(path.join(root,p))).isSymbolicLink()) {
    // These nine already-reviewed projects share the same tracked Godot module.
    const approved = /^examples\/mobile-remakes\/(arc-street|candle-walker|cloud-ascent|ember-recipe|frost-bastion|orbital-singularity|rockwild|rune-vanguard|sky-cores)\/shared$/;
    const target = await fs.readlink(path.join(root,p));
    const shared = path.join(root,'examples/mobile-remakes/shared');
    if(!approved.test(p) || target!=='../shared' || await fs.realpath(path.join(root,p))!==shared || !files.some(f=>f.startsWith('examples/mobile-remakes/shared/'))) throw Error('Unreviewed source symlink: '+p);
    const b=Buffer.from(target);
    manifest.files.push({path:p,type:'symlink',target,bytes:b.length,sha256:sha256(b)});
    continue;
  }
  const b=await fs.readFile(path.join(root,p));manifest.files.push({path:p,bytes:b.length,sha256:sha256(b)});
}}));
manifest.files.sort((a,b)=>a.path.localeCompare(b.path,'en'));
await fs.writeFile(path.join(root,'SOURCE_MANIFEST.json'),JSON.stringify(manifest,null,2)+'\n');
