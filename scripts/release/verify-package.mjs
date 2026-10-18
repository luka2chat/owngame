import "../lib/codex-browser-preflight.mjs";
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import assert from 'node:assert/strict';
import {spawn,spawnSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import {Client} from '@modelcontextprotocol/sdk/client/index.js';
import {StdioClientTransport} from '@modelcontextprotocol/sdk/client/stdio.js';
import {chromium} from 'playwright';
const root=path.resolve(import.meta.dirname,'../..');
const pkg=JSON.parse(await fs.readFile(path.join(root,'package.json')));
const published=process.argv.includes('--published');
const reportDir=path.join(root,'artifacts/release',pkg.version+(published?'-published':''));await fs.mkdir(reportDir,{recursive:true});
const workspace=await fs.mkdtemp(path.join(os.tmpdir(),'owngame-package-'));
const npm=process.platform==='win32'?'npm.cmd':'npm';
function run(command,args,cwd=root,allowed=[0]){
 const r=spawnSync(command,args,{cwd,encoding:'utf8',maxBuffer:8*1024*1024,timeout:120000,shell:process.platform==='win32'&&command===npm});
 if(r.error||!allowed.includes(r.status))throw Error(`${command} ${args[0]}: ${r.error?.message??''}\n${r.stdout}\n${r.stderr}`);
 return r.stdout;
}
let browser,server,client;
await fs.writeFile(path.join(reportDir,'verification.json'),JSON.stringify({status:'running',version:pkg.version})+'\n');
try{
 const info=JSON.parse(run(npm,['pack',...(published?[pkg.name+'@'+pkg.version]:[]),'--json','--pack-destination',reportDir]))[0];
 const files=info.files.map(f=>f.path);
 const allowed=/^(dist\/packages\/|starter-knowledge\/|skills\/|templates\/|scripts\/toolkit\/|docs\/(cases|images)\/|docs\/(install|quickstart|releasing)\.md$|docs\/style-recipes\.json$|package\.json$|README\.md$|LICENSE$|THIRD_PARTY_NOTICES\.md$|CHANGELOG\.md$|CONTRIBUTING\.md$|SECURITY\.md$)/;
 for(const file of files){assert(allowed.test(file),`Unexpected packaged path: ${file}`);assert(!/(^|\/)(node_modules|\.env|\.git|\.local|\.owngame|\.DS_Store)(\/|$)/.test(file));}
 for(const needed of ['skills/owngame/SKILL.md','templates/web-canvas/LICENSE','templates/web-canvas/src/main.js','starter-knowledge/sources.json','docs/cases/star-triad.md'])assert(files.includes(needed),needed);
 const tar=path.join(reportDir,info.filename);
 if(published){const prior=JSON.parse(await fs.readFile(path.join(root,'artifacts/release',pkg.version,'verification.json')));assert.equal(prior.status,'succeeded');assert.equal(createHash('sha256').update(await fs.readFile(tar)).digest('hex'),prior.sha256,'Registry archive differs from verified candidate');}
 await fs.writeFile(path.join(workspace,'package.json'),'{"private":true,"type":"module"}\n');
 run(npm,['install','--ignore-scripts','--no-audit','--no-fund',...(process.argv.includes('--offline')?['--offline']:[]),tar],workspace);
 const installed=path.join(workspace,'node_modules/@owngame/cli');
 // Exercise npm's default executable inference, not only an explicit bin name.
 const npxHelp=run(npm,['exec','--yes',...(process.argv.includes('--offline')?['--offline']:[]),tar,'--','--help'],workspace);
 assert(npxHelp.includes('setup [--agent'),'npx package entry is not discoverable');
 for(const file of files){const b=await fs.readFile(path.join(installed,file));if(b.length<1024*1024&&/\.(json|js|ts|mjs|md|map)$/.test(file))assert(!/\/(?:Users|Volumes)\/[A-Za-z0-9_.-]+|\b192\.168\.\d+\.\d+\b/.test(b.toString()),`Machine-specific material: ${file}`);}
 const cli=(op,input)=>JSON.parse(run(process.execPath,[path.join(installed,'dist/packages/cli/index.js'),op,...(input===undefined?[]:[JSON.stringify(input)]),'--workspace',workspace],workspace,[0,1,2]));
 assert.equal(run(process.execPath,[path.join(installed,'dist/packages/cli/index.js'),'--version'],workspace).trim(),pkg.version);
 client=new Client({name:'owngame-release-check',version:'1'});
 await client.connect(new StdioClientTransport({command:process.execPath,args:[path.join(installed,'dist/packages/cli/index.js'),'mcp','--workspace',workspace],cwd:workspace,stderr:'pipe'}));
 const tools=await client.listTools();assert.equal(tools.tools.length,20);assert(!tools.tools.some(t=>/owngame_(run|task)_/.test(t.name)));
 const normalized=x=>JSON.parse(JSON.stringify(x,(k,v)=>k==='operation_id'?'operation':v));
 for(const [op,input] of [['capabilities',{}],['research.prepare',{query:'美术'}],['research.prepare',{query:'容量',mode:'snapshot'}],['style.list',{}],['guidance.get',{topic:'web'}]]){
  const c=cli(op,input),m=await client.callTool({name:'owngame_'+op.replaceAll('.','_'),arguments:input});assert.deepEqual(normalized(c),normalized(m.structuredContent));
 }
 const create=await client.callTool({name:'owngame_project_create',arguments:{directory:'my-game',name:'my-game'}});assert.equal(create.structuredContent.status,'succeeded');
 const game=path.join(workspace,'my-game');
 run(process.execPath,['--test','rules.test.mjs'],game);run(process.execPath,['scripts/build.mjs'],game);
 const before=cli('web.inspect',{directory:'my-game/dist'});assert.equal(before.status,'succeeded');assert.equal(before.data.runtime,'not_run');
 const setup=JSON.parse(run(process.execPath,[path.join(installed,'dist/packages/cli/index.js'),'setup','--agent','codex','--apply','--workspace',workspace],workspace));assert.equal(setup.applied,true);
 const doc=cli('doctor');assert.equal(doc.knowledge,'succeeded');assert.equal(doc.mcp_connection,'not_checked');
 // Serve on an available port, without a fixed delay or another user's server.
 server=spawn(process.execPath,[path.join(game,'scripts/serve.mjs'),path.join(game,'dist'),'0'],{cwd:game,stdio:['ignore','pipe','pipe']});
 const url=await new Promise((resolve,reject)=>{let output='';const timer=setTimeout(()=>reject(Error('Preview startup timed out')),10000);server.on('error',e=>{clearTimeout(timer);reject(e)});server.on('exit',code=>{clearTimeout(timer);reject(Error('Preview exited: '+code))});server.stdout.on('data',b=>{output+=b;const line=output.split('\n')[0];try{const x=JSON.parse(line);if(x.url){clearTimeout(timer);resolve(x.url)}}catch{}})});
 const launch={headless:true};if(process.env.OWNGAME_CHROME_PATH)launch.executablePath=process.env.OWNGAME_CHROME_PATH;
 browser=await chromium.launch(launch);const context=await browser.newContext({viewport:{width:1280,height:900}});const page=await context.newPage();
 const shot=async name=>{await page.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));await page.screenshot({path:path.join(reportDir,name+'.png'),animations:'disabled'});};
 const errors=[],external=[];page.on('pageerror',e=>errors.push(String(e)));page.on('request',r=>{if(!r.url().startsWith(url))external.push(r.url())});
 await page.goto(url);await page.locator('#board button').first().waitFor();await shot('starter');
 const click=cell=>page.locator(`[data-cell="${cell}"]`).click();
 for(const cell of [0,3,1,4,2])await click(cell);
 assert.match(await page.locator('#status').textContent(),/星旅人.*获胜/);assert.equal(await page.locator('#board button:enabled').count(),0);
 await page.locator('#undo').click();assert.equal(await page.locator('#board button:enabled').count(),5);await click(2);
 await shot('desktop');await page.locator('#restart').click();
 for(const cell of [0,4])await click(cell);await page.reload();assert.equal(await page.locator('#board button.filled').count(),2);
 await page.locator('[data-cell="1"]').focus();await page.keyboard.press('Enter');assert.equal(await page.locator('#board button.filled').count(),3);
 await page.setViewportSize({width:360,height:640});
 const bounds=await page.locator('#board button').evaluateAll(bs=>bs.map(b=>{const r=b.getBoundingClientRect();return {w:r.width,h:r.height}}));assert(bounds.every(r=>r.w>=44&&r.h>=44));
 const bottom=await page.locator('#restart').evaluate(e=>e.getBoundingClientRect().bottom);assert(bottom<=640,'Small-screen controls clipped');
 await shot('mobile');
 const themePath=path.join(game,'src/theme.js');await fs.writeFile(themePath,(await fs.readFile(themePath,'utf8')).replace('月下连星','青玉星河').replace('#e8bb77','#8dd7c0'));
 run(process.execPath,['scripts/build.mjs'],game);await page.reload();assert.equal(await page.title(),'青玉星河');assert.equal(await page.locator('#board button.filled').count(),3);
 assert.equal((await page.locator('html').evaluate(e=>getComputedStyle(e).getPropertyValue('--accent'))).trim(),'#8dd7c0');
 const after=cli('web.inspect',{directory:'my-game/dist'});assert.notEqual(before.data.build_sha256,after.data.build_sha256);
 await shot('revision');assert.deepEqual(errors,[]);assert.deepEqual(external,[]);
 await page.setViewportSize({width:390,height:844});await shot('tall');
 // Actual input draw after the art revision, with normal restart confirmation.
 page.on('dialog',d=>d.accept());await page.locator('#restart').click();for(const cell of [0,1,2,4,3,5,7,6,8])await click(cell);assert.match(await page.locator('#status').textContent(),/平手/);
 const report={status:'succeeded',version:pkg.version,tarball:info.filename,sha256:createHash('sha256').update(await fs.readFile(tar)).digest('hex'),bytes:info.size,files:files.length,operations:tools.tools.length,npx_default_entry:true,cli_mcp_parity:true,installed_creation:true,rules_positions:5478,real_input:['win','terminal-input-disabled','undo','restart','draw','keyboard','save-reload'],viewports:['1280x900','360x640','390x844'],art_revision_preserves_save:true,build_changed:before.data.build_sha256!==after.data.build_sha256,browser:await browser.version(),page_errors:errors,external_requests:external,physical_phone:'not_run',offline_cold_start:'not_run',human_art_and_feel:'not_evaluated',public_npm:published?'verified_registry_install':'not_published',github_ci:'not_run'};
 await fs.writeFile(path.join(reportDir,'verification.json'),JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify(report,null,2));
}catch(error){
 await fs.writeFile(path.join(reportDir,'verification.json'),JSON.stringify({status:'failed',version:pkg.version,error:String(error)},null,2)+'\n');throw error;
}finally{
 await client?.close();await browser?.close();if(server){server.kill();await new Promise(r=>server.exitCode!==null?r():server.once('exit',r));}
 await fs.rm(workspace,{recursive:true,force:true});
}
