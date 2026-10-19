import fs from 'node:fs/promises';
import path from 'node:path';
import {spawn} from 'node:child_process';
const root=path.resolve(import.meta.dirname,'../..');
const args=process.argv.slice(2);
let repo,out;
for(let i=0;i<args.length;i++) {
  if(args[i]==='--repository-dir')repo=args[++i];
  else if(args[i]==='--out')out=args[++i];
  else throw Error('Usage: npm run web:publish -- --repository-dir <clean checkout> --out <new web-output>');
}
if(!repo || !out || !path.basename(out).startsWith('web-'))throw Error('Specify a public checkout and a fresh web- output directory (use the NAS for large outputs)');
out=path.resolve(out);
if(await fs.access(out).then(()=>true,()=>false))throw Error('Use a new web- output directory');
const run=(command,args,env=process.env)=>new Promise((resolve,reject)=>{
  const child=spawn(command,args,{cwd:root,env,stdio:'inherit'});
  child.on('error',reject);child.on('exit',code=>code===0?resolve():reject(Error(command+' failed ('+code+'); later release steps were not run')));
});
await run(process.execPath,['scripts/games/sync.mjs','--repository-dir',repo]);
await run(process.execPath,['scripts/web/build.mjs'],{...process.env,OWNGAME_WEB_OUT:out});
// Preserve older immutable URLs still held by browser bookmarks and offline manifests.
const oldOutputs=[path.join(root,'apps/web/dist')];
// Production may be built on the NAS without replacing the local dist directory.
// Preserve that accepted release too, including immutable URLs held by old clients.
if(process.env.OWNGAME_WEB_PREVIOUS_OUT)oldOutputs.push(path.resolve(process.env.OWNGAME_WEB_PREVIOUS_OUT));
for(const previous of new Set(oldOutputs)) {
if(previous===out)throw Error('Previous release must differ from the fresh output');
const old=path.join(previous,'games');
if(await fs.access(old).then(()=>true,()=>false))for(const id of await fs.readdir(old))for(const version of await fs.readdir(path.join(old,id))) {
  const dest=path.join(out,'games',id,version);
  if(!await fs.access(dest).then(()=>true,()=>false))await fs.cp(path.join(old,id,version),dest,{recursive:true});
}
}
await run(path.join(root,'.local/cloudflare-tools/node_modules/.bin/wrangler'),['pages','deploy',out,'--project-name','owngame-web','--branch','main']);
await run(process.execPath,['scripts/web/verify-deployment.mjs','https://owngame.dev',path.join(root,'artifacts/open-source/deployment.json')],{...process.env,OWNGAME_WEB_OUT:out});
console.log(JSON.stringify({status:'published_source_and_website',output:out}));
