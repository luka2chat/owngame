import fs from 'node:fs/promises';
import path from 'node:path';
import {spawn} from 'node:child_process';
import {loadPublishedSources} from '../games/source-policy.mjs';
const root=path.resolve(import.meta.dirname,'../..');
const args=process.argv.slice(2);
let repo,out,shellOnly=false,prepared=false;
for(let i=0;i<args.length;i++) {
  if(args[i]==='--repository-dir')repo=args[++i];
  else if(args[i]==='--out')out=args[++i];
  else if(args[i]==='--shell-only')shellOnly=true;
  else if(args[i]==='--prepared')prepared=true;
  else throw Error('Usage: npm run web:publish -- --repository-dir <clean checkout> --out <new web-output>');
}
if((!repo && !shellOnly) || !out || !path.basename(out).startsWith('web-') || (prepared && !shellOnly))throw Error('Specify a public checkout and a fresh web- output directory; --shell-only --prepared can publish a verified UI-only build');
out=path.resolve(out);
if(!prepared && await fs.access(out).then(()=>true,()=>false))throw Error('Use a new web- output directory');
const run=(command,args,env=process.env)=>new Promise((resolve,reject)=>{
  const child=spawn(command,args,{cwd:root,env,stdio:'inherit'});
  child.on('error',reject);child.on('exit',code=>code===0?resolve():reject(Error(command+' failed ('+code+'); later release steps were not run')));
});
const readLiveCatalog=async()=>{
  const response=await fetch('https://owngame.dev/catalog.json',{cache:'no-store',signal:AbortSignal.timeout(30000)});
  if(!response.ok)throw Error('Cannot confirm production catalog');
  return response.json();
};
let unchangedCatalog;
if(shellOnly) {
  if(!process.env.OWNGAME_WEB_PREVIOUS_OUT)throw Error('UI-only publishing requires the previous accepted output');
  const previous=JSON.parse(await fs.readFile(path.join(process.env.OWNGAME_WEB_PREVIOUS_OUT,'catalog.json'),'utf8'));
  unchangedCatalog=JSON.stringify(previous);
  if(JSON.stringify(await readLiveCatalog())!==unchangedCatalog)throw Error('Production changed; use its current accepted output');
} else await run(process.execPath,['scripts/games/sync.mjs','--repository-dir',repo]);
if(!prepared)await run(process.execPath,['scripts/web/build.mjs'],{...process.env,OWNGAME_WEB_OUT:out});
if(shellOnly) {
  const catalog=JSON.parse(await fs.readFile(path.join(out,'catalog.json'),'utf8'));
  if(JSON.stringify(catalog)!==unchangedCatalog)throw Error('UI-only build changed game metadata; use the joint game/source release workflow');
  const commits=[...new Set(catalog.map(game=>game.sourceCommit))];
  if(commits.length!==1)throw Error('UI-only build must use one reviewed source revision');
  const sources=await loadPublishedSources(commits[0],catalog);
  for(const game of catalog)if(sources.get(game.id).sourceUrl!==game.sourceUrl || sources.get(game.id).source_manifest_sha256!==game.sourceManifest)
    throw Error('Published game source binding changed: '+game.id);
}
// Preserve older immutable URLs still held by browser bookmarks and offline manifests.
const oldOutputs=[path.join(root,'apps/web/dist')];
// Production may be built on the NAS without replacing the local dist directory.
// Preserve that accepted release too, including immutable URLs held by old clients.
if(process.env.OWNGAME_WEB_PREVIOUS_OUT)oldOutputs.push(path.resolve(process.env.OWNGAME_WEB_PREVIOUS_OUT));
for(const previous of new Set(oldOutputs)) {
if(previous===out)throw Error('Previous release must differ from the fresh output');
const old=path.join(previous,'games');
const copies=[];
if(await fs.access(old).then(()=>true,()=>false))for(const id of await fs.readdir(old))for(const version of await fs.readdir(path.join(old,id))) {
  const dest=path.join(out,'games',id,version);
  if(!await fs.access(dest).then(()=>true,()=>false))copies.push([path.join(old,id,version),dest]);
}
await Promise.all(Array.from({length:8},async()=>{while(copies.length){const [from,to]=copies.shift();await fs.cp(from,to,{recursive:true});}}));
}
if(shellOnly && JSON.stringify(await readLiveCatalog())!==unchangedCatalog)throw Error('Production changed during preparation; website not deployed');
await run(path.join(root,'.local/cloudflare-tools/node_modules/.bin/wrangler'),['pages','deploy',out,'--project-name','owngame-web','--branch','main']);
await run(process.execPath,['scripts/web/verify-deployment.mjs','https://owngame.dev',path.join(root,'artifacts/open-source/deployment.json')],{...process.env,OWNGAME_WEB_OUT:out});
console.log(JSON.stringify({status:'published_source_and_website',output:out}));
