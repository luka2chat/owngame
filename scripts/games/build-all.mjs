import fs from 'node:fs/promises';
import path from 'node:path';
import {spawn} from 'node:child_process';
const root=path.resolve(process.argv[2] || '.');
const index=JSON.parse(await fs.readFile(path.join(root,'games.json')));
const queue=index.games.filter(g=>g.kind!=='unity');
const run=(args,cwd)=>new Promise((resolve,reject)=>{
  const child=spawn('npm',args,{cwd,stdio:'inherit'});
  child.on('error',reject);child.on('exit',code=>code===0?resolve():reject(Error('npm '+args.join(' ')+' failed in '+cwd)));
});
await Promise.all(Array.from({length:2},async()=>{while(queue.length){const game=queue.shift(),cwd=path.join(root,game.path);
  await run(['ci','--no-audit','--no-fund'],cwd);await run(['run','build'],cwd);
}}));
