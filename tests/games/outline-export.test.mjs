import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { newProject } from '../../apps/outline/model.mjs';
import { exportOutlines } from '../../scripts/games/export-outlines.mjs';
import { validatePublicOutline } from '../../scripts/games/outline-policy.mjs';
const doc=()=>({schema:'owngame-outline',version:1,revision:1,project:newProject('Public game')});
test('public outline policy accepts project-relative files and rejects private references',()=>{
 const d=doc();d.project.scope='See ./game-outline.json and ./SOURCE_MANIFEST.json';validatePublicOutline(d);
 for(const bad of ['../other/game.json','/etc/config.json','http://localhost:3228/','file:///secret','data:image/png;base64,aA==']){d.project.scope=bad;assert.throws(()=>validatePublicOutline(d));}
});
test('reviewed export never falls back to private JSON and updates project manifests idempotently',async t=>{
 const root=await fs.mkdtemp(path.join(os.tmpdir(),'public-outline-'));t.after(()=>fs.rm(root,{recursive:true,force:true}));
 const put=async(p,s)=>{const file=path.join(root,p);await fs.mkdir(path.dirname(file),{recursive:true});await fs.writeFile(file,s)};
 await put('scripts/games/projects.json',JSON.stringify({demo:{project:'source',outline:'game-outline.public.json'}}));
 const privateDoc=doc();privateDoc.project.scope='Private design must not be copied';await put('source/game-outline.json',JSON.stringify(privateDoc));
 await put('out/games.json',JSON.stringify({games:[{id:'demo',path:'examples/demo',kind:'canvas',online_build_sha256:'a'.repeat(64)}]}));
 await put('out/examples/demo/SOURCE_MANIFEST.json',JSON.stringify({files:[]}));await put('out/examples/demo/README.md','# Demo');await put('out/examples/demo/AGENTS.md','Keep prior project guidance.\n');
 await assert.rejects(exportOutlines(root,path.join(root,'out')),{code:'ENOENT'});
 const publicDoc=doc();await put('source/game-outline.public.json',JSON.stringify(publicDoc));
 assert.equal((await exportOutlines(root,path.join(root,'out'))).games,1);
 const output=await fs.readFile(path.join(root,'out/examples/demo/game-outline.json'),'utf8');assert.equal(JSON.parse(output).project.id,publicDoc.project.id);assert(!output.includes('Private design'));
 const first=await fs.readFile(path.join(root,'out/games.json'),'utf8');await exportOutlines(root,path.join(root,'out'));assert.equal(await fs.readFile(path.join(root,'out/games.json'),'utf8'),first);
 const agents=await fs.readFile(path.join(root,'out/examples/demo/AGENTS.md'),'utf8');assert(agents.startsWith('Keep prior project guidance.'));assert.equal(agents.split('<!-- owngame:public-outline -->').length,2);
});
