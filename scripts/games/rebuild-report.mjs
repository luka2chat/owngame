import fs from 'node:fs/promises';
import path from 'node:path';
import {sha256} from './source-policy.mjs';
const root=path.resolve(process.argv[2] || '.');
const index=JSON.parse(await fs.readFile(path.join(root,'games.json'))),results=[];
for(const game of index.games.filter(g=>g.kind!=='unity')) {
  const folder=path.join(root,game.path),binding=JSON.parse(await fs.readFile(path.join(folder,'ONLINE_BUILD.json')));
  const same=[],different=[],omitted=[];
  for(const f of binding.files) {
    const bytes=await fs.readFile(path.join(folder,'dist',f.path)).catch(e=>{if(e.code==='ENOENT')return null;throw e;});
    if(bytes===null)omitted.push(f.path);
    else if(sha256(bytes)===f.sha256)same.push(f.path);
    else different.push(f.path);
  }
  results.push({id:game.id,byte_identical:same,changed:different,not_in_portable_output:omitted});
}
const output=path.resolve(process.env.OWNGAME_GAME_EVIDENCE || path.join(root,'artifacts/game-source'));
await fs.mkdir(output,{recursive:true});
await fs.writeFile(path.join(output,'rebuild.json'),JSON.stringify({games:results},null,2)+'\n');
console.log(JSON.stringify(results.map(r=>({id:r.id,identical_files:r.byte_identical.length,changed:r.changed,omitted:r.not_in_portable_output})),null,2));
