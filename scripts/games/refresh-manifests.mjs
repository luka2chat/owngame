import fs from 'node:fs/promises';
import path from 'node:path';
import {sha256} from './source-policy.mjs';
const root=path.resolve(process.argv[2] || '.');
const index=JSON.parse(await fs.readFile(path.join(root,'games.json')));
for (const game of index.games) {
  const folder=path.join(root,game.path), file=path.join(folder,'SOURCE_MANIFEST.json');
  const manifest=JSON.parse(await fs.readFile(file));
  if (game.kind !== 'unity') {
    manifest.files=[];
    const walk=async dir=>{await Promise.all((await fs.readdir(dir,{withFileTypes:true})).map(async e=> {
      if (['node_modules','dist','.git'].includes(e.name)) return;

      const p=path.join(dir,e.name), relative=path.relative(folder,p).split(path.sep).join('/');
      if(e.isSymbolicLink()) throw Error('Unexpected exported symlink: '+relative);
      if(e.isDirectory()) await walk(p);
      else if(relative!=='SOURCE_MANIFEST.json') {const b=await fs.readFile(p);manifest.files.push({path:relative,bytes:b.length,sha256:sha256(b)});}
    }));};
    await walk(folder);
    manifest.files.sort((a,b)=>a.path.localeCompare(b.path,'en'));
    await fs.writeFile(file,JSON.stringify(manifest,null,2)+'\n');
  }
  game.source_manifest_sha256=sha256(await fs.readFile(file));
}
await fs.writeFile(path.join(root,'games.json'),JSON.stringify(index,null,2)+'\n');
