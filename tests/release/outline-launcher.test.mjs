import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import http from 'node:http';
import { launchOutline, parseOutlineArgs } from '../../scripts/toolkit/outline-launcher.mjs';
import { OutlineWorkspace, readOutline, writeOutline } from '../../scripts/toolkit/outline-store.mjs';
const close=server=>new Promise(resolve=>server.close(resolve));

test('outline arguments reject ambiguous ports and extra directories',()=>{
 assert.deepEqual(parseOutlineArgs(['my game','--no-open','--port','3240']),{directory:'my game',port:3240,explicitPort:true,open:false});
 for(const args of [['--port'],['--port','2'],['--port','3e4'],['one','two'],['--unknown']])assert.throws(()=>parseOutlineArgs(args));
});
test('project shortcut opens its own board, uses a free port, and copied bindings stay local',async t=>{
 const base=await fs.mkdtemp(path.join(os.tmpdir(),'outline-portable-'));t.after(()=>fs.rm(base,{recursive:true,force:true}));
 const original=path.join(base,'original game');await fs.mkdir(original);let browserURL;
 const blocker=http.createServer();await new Promise((ok,fail)=>{blocker.once('error',e=>e.code==='EADDRINUSE'?ok():fail(e));blocker.listen(3228,'127.0.0.1',ok)});
 t.after(async()=>{if(blocker.listening)await close(blocker)});
 const active=await launchOutline(['original game'],{workspace:base,openBrowser:async url=>{browserURL=url},print:()=>{}});
 t.after(async()=>{if(active.server.listening)await close(active.server)});
 assert.equal(browserURL,active.url);assert.notEqual(new URL(active.url).port,'3228');
 const before=await readOutline(original),snapshot=await (await fetch(active.url+'/api/workspace')).json();
 assert.equal(snapshot.workspace.projects.length,1);assert.equal(snapshot.workspace.projects[0].id,before.project.id);
 assert.equal(JSON.parse(await fs.readFile(path.join(original,'.local/game-outline/project-files.json'))).bindings[0].directory,'.');
 await close(active.server);
 const copied=path.join(base,'copied game');await fs.cp(original,copied,{recursive:true});
 const publicGuidance='<!-- owngame:public-outline -->\nReviewed guidance\n<!-- /owngame:public-outline -->';await fs.writeFile(path.join(copied,'AGENTS.md'),publicGuidance);
 const reopened=await launchOutline(['copied game','--no-open'],{workspace:base,openBrowser:()=>assert.fail('no-open must not launch a browser'),print:()=>{}});
 t.after(async()=>{if(reopened.server.listening)await close(reopened.server)});
 const doc=await (await fetch(reopened.url+'/api/workspace')).json();assert.equal(doc.bindings[before.project.id].directory,await fs.realpath(copied));
 doc.workspace.projects[0].title='Moved project edit';
 const response=await fetch(reopened.url+'/api/workspace',{method:'PUT',headers:{'Content-Type':'application/json','X-Owngame-Outline':'1'},body:JSON.stringify(doc)});assert.equal(response.status,200);
 assert.equal(await fs.readFile(path.join(copied,'AGENTS.md'),'utf8'),publicGuidance);
 assert.equal((await readOutline(copied)).project.title,'Moved project edit');assert.equal((await readOutline(original)).project.title,before.project.title);
 assert(!JSON.stringify(JSON.parse(await fs.readFile(path.join(copied,'.local/game-outline/workspace.json')))).includes(base));
});
test('legacy absolute indexes migrate without changing the design; explicit occupied port fails',async t=>{
 const base=await fs.mkdtemp(path.join(os.tmpdir(),'outline-legacy-'));t.after(()=>fs.rm(base,{recursive:true,force:true}));
 const active=await launchOutline(['--no-open'],{workspace:base,print:()=>{}});t.after(async()=>{if(active.server.listening)await close(active.server)});
 const board=await readOutline(base),file=path.join(base,'.local/game-outline/project-files.json');let index=JSON.parse(await fs.readFile(file));index.bindings[0].directory=await fs.realpath(base);await fs.writeFile(file,JSON.stringify(index));
 await new OutlineWorkspace(base).initialize();assert.equal(JSON.parse(await fs.readFile(file)).bindings[0].directory,'.');assert.equal((await readOutline(base)).sha256,board.sha256);
 await assert.rejects(launchOutline(['--no-open','--port',new URL(active.url).port],{workspace:base,print:()=>{}}),{code:'EADDRINUSE'});
});
