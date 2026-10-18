import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { spawnSync } from 'node:child_process';
import { Core } from '../../dist/packages/core/index.js';
import { setup, doctor } from '../../dist/packages/cli/setup.js';
const root = path.resolve(import.meta.dirname, '../..');
async function fixture(t) {
  const workspace = await fs.mkdtemp(path.join(os.tmpdir(), 'owngame-release-'));
  t.after(() => fs.rm(workspace,{recursive:true,force:true}));
  const core = new Core({root,workspace}); await core.initialize();
  return {workspace,core};
}
test('public cases carry intact scoped sources; snapshots never become live playtests',async t=>{
  const {core,workspace}=await fixture(t);
  assert.equal((await core.call('knowledge.validate')).status,'succeeded');
  for(const query of ['美术','容量','数值']){
    const r=await core.call('research.prepare',{query});assert.equal(r.status,'succeeded');
    assert(r.data.records.every(x=>x.claim_kind==='reported'&&x.unknowns.length));
    const snapshot=await core.call('research.prepare',{query,mode:'snapshot'});assert.equal(snapshot.status,'unknown');
  }
  assert.equal((await core.call('research.prepare',{query:'this-case-does-not-exist'})).status,'unknown');
  assert.deepEqual(await fs.readdir(workspace),[]);
});
test('Web project is independently buildable, preserves source, and has distinct save identity',async t=>{
  const {core,workspace}=await fixture(t);
  for(const directory of ['one','two']){
    const r=await core.call('project.create',{directory,name:'moonlit-lines'});assert.equal(r.status,'succeeded');assert.equal(r.data.template,'web-canvas');
    for(const args of [['--test','rules.test.mjs'],['scripts/build.mjs']]){
      const result=spawnSync(process.execPath,args,{cwd:path.join(workspace,directory),encoding:'utf8'});assert.equal(result.status,0,result.stdout+result.stderr);
    }
    const inspect=await core.call('web.inspect',{directory:directory+'/dist'});assert.equal(inspect.status,'succeeded');assert.equal(inspect.data.runtime,'not_run');
  }
  assert.notEqual(await fs.readFile(path.join(workspace,'one/src/project.js'),'utf8'),await fs.readFile(path.join(workspace,'two/src/project.js'),'utf8'));
  assert.equal((await core.call('project.create',{directory:'one',name:'one'})).diagnostics[0].code,'PROJECT_EXISTS');
  assert.equal((await core.call('project.create',{directory:'../escape',name:'x'})).diagnostics[0].code,'WORKSPACE_ESCAPE');
  await fs.symlink(os.tmpdir(),path.join(workspace,'link'));
  assert.equal((await core.call('project.create',{directory:'link/escape',name:'x'})).diagnostics[0].code,'WORKSPACE_ESCAPE');
  await core.call('project.create',{directory:'guarded',name:'guarded'});
  const guarded=path.join(workspace,'guarded');await fs.mkdir(path.join(guarded,'dist'));await fs.writeFile(path.join(guarded,'dist/keep.txt'),'mine');
  assert.notEqual(spawnSync(process.execPath,['scripts/build.mjs'],{cwd:guarded}).status,0);
  assert.equal(await fs.readFile(path.join(guarded,'dist/keep.txt'),'utf8'),'mine');
});
test('setup preview is read-only; apply is idempotent and retains other MCP settings',async t=>{
  const {workspace}=await fixture(t);
  const preview=await setup(root,workspace,['--agent','cursor']);assert.equal(preview.applied,false);assert.deepEqual(await fs.readdir(workspace),[]);
  await fs.mkdir(path.join(workspace,'.cursor'));
  const original=JSON.stringify({mcpServers:{other:{command:'other'}},custom:true});
  await fs.writeFile(path.join(workspace,'.cursor/mcp.json'),original);
  const applied=await setup(root,workspace,['--agent','cursor','--apply']);assert.equal(applied.applied,true);
  assert(applied.backups);assert.equal(await fs.readFile(path.join(workspace,applied.backups,'.cursor/mcp.json'),'utf8'),original);
  const config=JSON.parse(await fs.readFile(path.join(workspace,'.cursor/mcp.json')));assert.equal(config.custom,true);assert.equal(config.mcpServers.other.command,'other');assert.equal(config.mcpServers.owngame.args[0],path.join(root,'dist/packages/mcp/index.js'));
  assert.deepEqual((await setup(root,workspace,['--agent','cursor','--apply'])).changes,[]);
  const d=await doctor(root,workspace);assert.equal(d.mcp_connection,'not_checked');assert.equal(d.configurations[0].version_matches,true);
  await fs.appendFile(path.join(workspace,'.cursor/skills/owngame/SKILL.md'),'\nUser customization\n');
  await assert.rejects(setup(root,workspace,['--agent','cursor','--apply']),/local changes/);
  assert.equal(JSON.parse(await fs.readFile(path.join(workspace,'.cursor/mcp.json'))).custom,true);
  assert.equal((await doctor(root,workspace)).configurations[0].edited_or_missing_skills.length,1);
});
test('Codex managed block preserves unrelated settings and refuses conflicting edits',async t=>{
  const {workspace}=await fixture(t);await fs.mkdir(path.join(workspace,'.codex'));await fs.writeFile(path.join(workspace,'.codex/config.toml'),'model = "user-choice"\n[mcp_servers.other]\ncommand = "other"\n');
  await setup(root,workspace,['--apply']);
  let config=await fs.readFile(path.join(workspace,'.codex/config.toml'),'utf8');assert(config.includes('model = "user-choice"'));assert(config.includes('[mcp_servers.other]'));
  await fs.writeFile(path.join(workspace,'.codex/config.toml'),config+'\n# unrelated note\n');
  assert.deepEqual((await setup(root,workspace,['--apply'])).changes,[]);
  config=(await fs.readFile(path.join(workspace,'.codex/config.toml'),'utf8')).replace('tool_timeout_sec = 660','tool_timeout_sec = 999');await fs.writeFile(path.join(workspace,'.codex/config.toml'),config);
  await assert.rejects(setup(root,workspace,['--apply']),/was edited/);
});
test('setup refuses symlink paths and unmanaged owngame configuration before mutation',async t=>{
  const {workspace}=await fixture(t);const outside=await fs.mkdtemp(path.join(os.tmpdir(),'owngame-outside-'));t.after(()=>fs.rm(outside,{recursive:true,force:true}));
  await fs.symlink(outside,path.join(workspace,'.agents'));
  await assert.rejects(setup(root,workspace,['--apply']),/Symlink/);assert.deepEqual(await fs.readdir(outside),[]);
  await fs.unlink(path.join(workspace,'.agents'));await fs.mkdir(path.join(workspace,'.codex'));await fs.writeFile(path.join(workspace,'.codex/config.toml'),'[mcp_servers.owngame]\ncommand="custom"\n');
  await assert.rejects(setup(root,workspace,['--apply']),/not managed/);assert.deepEqual((await fs.readdir(workspace)).sort(),['.codex']);
});
