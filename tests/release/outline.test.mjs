import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { Core } from '../../dist/packages/core/index.js';
import { readOutline, writeOutline, OutlineWorkspace } from '../../scripts/toolkit/outline-store.mjs';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
const root=path.resolve(import.meta.dirname,'../..');

test('project creation and CLI updates share canonical JSON and reject outdated edits',async t=>{
  const workspace=await fs.mkdtemp(path.join(os.tmpdir(),'outline-cli-'));t.after(()=>fs.rm(workspace,{recursive:true,force:true}));
  const core=new Core({root,workspace});await core.initialize();
  const created=await core.call('project.create',{directory:'game',name:'game'});assert.equal(created.status,'succeeded');assert.match(created.data.outline.file,/game-outline.json$/);
  const cli=(op,input)=>{const result=spawnSync(process.execPath,[path.join(root,'dist/packages/cli/index.js'),op,JSON.stringify(input),'--workspace',workspace],{encoding:'utf8'});return JSON.parse(result.stdout);};
  let current=cli('outline.get',{directory:'game'});assert.equal(current.status,'succeeded');assert.equal(current.data.project.title,'game');
  const updated=cli('outline.update',{directory:'game',expected_sha256:current.data.sha256,changes:{cards:[{type:'rule',title:'Collision rule',fields:{behavior:'Reject occupied targets',example:'Move into an occupied target: state stays unchanged.'}}]}});
  assert.equal(updated.status,'succeeded');assert.equal(updated.data.cards.length,1);assert.equal(updated.data.cards[0].status,'idea');
  assert.equal(cli('outline.update',{directory:'game',expected_sha256:current.data.sha256,changes:{project:{title:'stale'}}}).diagnostics[0].code,'OUTLINE_CONFLICT');
  const store=new OutlineWorkspace(workspace);const snapshot=await store.snapshot();assert.equal(snapshot.workspace.projects[0].cards[0].title,'Collision rule');
  snapshot.workspace.projects[0].cards[0].body='Changed in canvas';await store.save(snapshot.revision,snapshot.workspace);
  current=cli('outline.get',{directory:'game',view:'full'});assert.equal(current.data.project.cards[0].body,'Changed in canvas');
  const before=await readOutline(path.join(workspace,'game'));const raw=JSON.parse(before.raw);raw.project.scope='Direct editor change';await fs.writeFile(before.file,JSON.stringify(raw));
  await assert.rejects(writeOutline(before.directory,before.sha256,before.project),{code:'OUTLINE_CONFLICT'});
  assert.equal((await core.call('outline.get',{directory:'..'})).diagnostics[0].code,'WORKSPACE_ESCAPE');
  const all=await core.call('outline.list',{});assert.equal(all.data.items.length,1);
  const again=await core.call('outline.init',{directory:'game',title:'Never replace'});assert.equal(again.data.created,false);assert.equal(again.data.project.title,'game');
  const agents=await fs.readFile(path.join(workspace,'game/AGENTS.md'),'utf8');assert.equal(agents.split('<!-- owngame:outline -->').length,2);
  const inspection=await core.call('project.inspect',{directory:'game'});assert.equal(inspection.data.outline.project.scope,'Direct editor change');
});

test('MCP exposes the same outline reads and guarded writes with correct annotations',async t=>{
  const workspace=await fs.mkdtemp(path.join(os.tmpdir(),'outline-mcp-'));t.after(()=>fs.rm(workspace,{recursive:true,force:true}));
  await fs.mkdir(path.join(workspace,'game'));
  const client=new Client({name:'outline-test',version:'1'});t.after(()=>client.close());
  await client.connect(new StdioClientTransport({command:process.execPath,args:[path.join(root,'dist/packages/cli/index.js'),'mcp','--workspace',workspace],stderr:'pipe'}));
  const {tools}=await client.listTools();for(const name of ['init','update'])assert.equal(tools.find(t=>t.name===`owngame_outline_${name}`).annotations.readOnlyHint,false);
  assert.equal(tools.find(t=>t.name==='owngame_outline_get').annotations.readOnlyHint,true);
  const init=await client.callTool({name:'owngame_outline_init',arguments:{directory:'game',title:'Test'}});assert.equal(init.structuredContent.status,'succeeded');
  const read=await client.callTool({name:'owngame_outline_get',arguments:{directory:'game'}});
  const update=await client.callTool({name:'owngame_outline_update',arguments:{directory:'game',expected_sha256:read.structuredContent.data.sha256,changes:{project:{scope:'One playable loop'}}}});assert.equal(update.structuredContent.status,'succeeded');
  assert.equal((await readOutline(path.join(workspace,'game'))).project.scope,'One playable loop');
});
