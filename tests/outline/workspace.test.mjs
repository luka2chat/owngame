import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm, writeFile, realpath } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { once } from 'node:events';
import http from 'node:http';
import { createOutlineServer } from '../../apps/outline/server.mjs';
import { sampleWorkspace, validateWorkspace, stats, newCard } from '../../apps/outline/model.mjs';
import { readOutline, writeOutline, initOutline, OutlineWorkspace } from '../../scripts/toolkit/outline-store.mjs';

test('sample relations, structured fields and derived totals remain consistent', () => {
  const workspace=validateWorkspace(sampleWorkspace()),p=workspace.projects[0];
  assert.equal(stats(p).characters,1);assert.equal(stats(p).questsDone,0);
  p.cards.find(c=>c.type==='quest').status='done';assert.equal(stats(p).questsDone,1);
  p.cards.push(newCard('character'));assert.equal(stats(p).characters,2);
  assert.ok(p.cards.filter(c=>c.type==='rule').every(c=>c.fields.example));
  assert.deepEqual(Object.keys(p.cards.find(c=>c.type==='quest').fields),['giver','location','requires','objective','completion','changes']);
});
test('imports reject dangling relations, unsafe images, invalid coordinates and unknown types', () => {
  for (const mutate of [
    p=>p.edges[0].to='missing', p=>p.cards[0].image='https://external.example/tracker.png',
    p=>p.cards[0].image='data:image/svg+xml;base64,PHN2Zz4=',p=>p.cards[0].x=Infinity,
    p=>p.cards[0].type='__proto__',p=>p.cards[0].status='constructor',
    p=>p.cards[1].id=p.cards[0].id,p=>p.cards[0].section='assets',
  ]) { const doc=sampleWorkspace();mutate(doc.projects[0]);assert.throws(()=>validateWorkspace(doc)); }
  const text=sampleWorkspace();text.projects[0].cards[0].title='<img src=x onerror=alert(1)>';assert.equal(validateWorkspace(text),text);
});

test('local server persists, backs up previous data, refuses stale writes and survives restart', async t => {
  const dataDir=await mkdtemp(join(tmpdir(),'owngame-outline-'));
  let active=await createOutlineServer({ workspace:dataDir, dataDir:join(dataDir,'.local/outline'), port:0 });
  const stop=async()=>{const closing=once(active.server,'close');active.server.close();await closing;};
  t.after(async()=>{if(active.server.listening)await stop();await rm(dataDir,{recursive:true,force:true});});
  const load=()=>fetch(`${active.url}/api/workspace`).then(r=>r.json());
  const put=doc=>fetch(`${active.url}/api/workspace`,{method:'PUT',headers:{'Content-Type':'application/json','X-Owngame-Outline':'1',Origin:active.url},body:JSON.stringify(doc)});
  const original=await load(),next=structuredClone(original);next.workspace.projects[0].title='保留下来的项目';
  assert.equal((await put(next)).status,200);
  const saved=await load();assert.notEqual(saved.revision,original.revision);assert.equal(saved.workspace.projects[0].title,'保留下来的项目');
  const binding=saved.bindings[saved.workspace.projects[0].id];
  assert.equal(JSON.parse(await readFile(binding.file+'.bak','utf8')).project.title,original.workspace.projects[0].title);
  assert.equal((await put(original)).status,409);assert.equal((await load()).revision,saved.revision);
  const invalid=structuredClone(saved);invalid.workspace.projects[0].edges[0].from='missing';assert.equal((await put(invalid)).status,400);assert.equal((await load()).revision,saved.revision);
  assert.equal((await fetch(`${active.url}/api/workspace`,{method:'PUT',headers:{'Content-Type':'application/json'},body:JSON.stringify(saved)})).status,403);
  assert.equal((await fetch(`${active.url}/api/workspace`,{headers:{Origin:'https://example.com'}})).status,403);
  const badHostStatus=await new Promise((ok,fail)=>{http.get(`${active.url}/api/workspace`,{headers:{Host:'attacker.example'}},r=>{r.resume();ok(r.statusCode);}).on('error',fail);});
  assert.equal(badHostStatus,403);
  assert.equal((await fetch(`${active.url}/api/workspace`,{headers:{'Sec-Fetch-Site':'cross-site'}})).status,403);
  for(const path of ['/package.json','/.local/game-outline/workspace.json','/brand/../server.mjs'])assert.equal((await fetch(active.url+path)).status,404);
  assert.equal((await fetch(active.url)).status,200);
  assert.match((await fetch(active.url)).headers.get('content-security-policy'),/frame-ancestors 'none'/);
  await stop();active=await createOutlineServer({workspace:dataDir,dataDir:join(dataDir,'.local/outline'),port:0});assert.equal((await load()).workspace.projects[0].title,'保留下来的项目');
  const disk=await readOutline(binding.directory);disk.project.tagline='外部开发工具更新';await writeOutline(binding.directory,disk.sha256,disk.project);
  const refreshed=await load();assert.equal(refreshed.workspace.projects[0].tagline,'外部开发工具更新');assert.equal((await put(saved)).status,409);
  await writeFile(binding.file,'broken');const unavailable=await load();assert.equal(unavailable.bindings[disk.project.id].available,false);
  unavailable.workspace.projects[0].title='must not overwrite broken source';assert.equal((await put(unavailable)).status,400);
  assert.equal(await readFile(binding.file,'utf8'),'broken');
});

test('migration preserves legacy boards; idempotent registration does not replace project data',async t=>{
  const dir=await mkdtemp(join(tmpdir(),'outline-migration-'));t.after(()=>rm(dir,{recursive:true,force:true}));
  const legacy=sampleWorkspace();legacy.projects[0].title='已有真实编辑';
  await writeFile(join(dir,'workspace.json'),JSON.stringify({revision:12,workspace:legacy}));
  const store=new OutlineWorkspace(dir,dir);await store.initialize();const before=await store.snapshot();
  const b=before.bindings[legacy.activeProjectId];assert.equal((await readOutline(b.directory)).project.title,'已有真实编辑');
  await store.initialize();const unchanged=await initOutline(b.directory,{title:'do not replace'});assert.equal(unchanged.created,false);assert.equal(unchanged.project.title,'已有真实编辑');
  await store.register(b.directory);assert.equal((await store.snapshot()).workspace.projects.length,1);
  assert.equal((await readFile(join(b.directory,'AGENTS.md'),'utf8')).split('<!-- owngame:outline -->').length,2);
});

test('canvas creates a directory-bound project and reopening it preserves the existing design',async t=>{
  const directory=await mkdtemp(join(tmpdir(),'outline-bind-'));let active;
  t.after(async()=>{if(active)await new Promise(r=>active.server.close(r));await rm(directory,{recursive:true,force:true});});
  active=await createOutlineServer({workspace:directory,port:0});
  const post=value=>fetch(active.url+'/api/projects',{method:'POST',headers:{'Content-Type':'application/json','X-Owngame-Outline':'1'},body:JSON.stringify(value)});
  const project=sampleWorkspace().projects[0];project.title='Bound game';
  const created=await post({directory:'games/one',project});assert.equal(created.status,200);
  const result=await created.json();assert.equal(result.created,true);assert.equal(result.bindings[project.id].file,join(await realpath(directory),'games/one/game-outline.json'));
  const reopened=await (await post({directory:'games/one',project:{...project,title:'Do not replace'}})).json();assert.equal(reopened.created,false);assert.equal(reopened.workspace.projects.find(p=>p.id===project.id).title,'Bound game');
  for(const bad of ['../outside','/absolute','games/../../escape','.local/secret'])assert.equal((await post({directory:bad,project})).status,400);
});
