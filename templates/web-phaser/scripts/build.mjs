import fs from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {createHash} from 'node:crypto';
import {build} from 'esbuild';
const root=path.resolve(import.meta.dirname,'..');
const out=path.resolve(process.env.OWNGAME_GAME_OUT ?? path.join(root,'build',new Date().toISOString().replace(/[:.]/g,'-')));
if(out===root||root.startsWith(out+path.sep)||['src','assets','scripts'].some(d=>out===path.join(root,d)||out.startsWith(path.join(root,d)+path.sep)))throw Error('Output must not replace source');
try{await fs.access(out);throw Error('Output exists; select a new version directory');}catch(e){if(e.code!=='ENOENT')throw e;}
const sha=b=>createHash('sha256').update(b).digest('hex');
async function inventory(dir){
  const rows=[];
  async function walk(folder){for(const entry of await fs.readdir(folder,{withFileTypes:true})){
    const p=path.join(folder,entry.name);
    if(entry.isSymbolicLink())throw Error('Do not package symlinks');
    if(entry.isDirectory())await walk(p);else if(entry.isFile()){
      const b=await fs.readFile(p);rows.push({bytes:b.length,path:path.relative(dir,p).split(path.sep).join('/'),sha256:sha(b)});
    }
  }}
  await walk(dir);return rows.sort((a,b)=>a.path.localeCompare(b.path,'en'));
}
const sourceFiles=[];
for(const name of ['index.html','style.css','package.json','tsconfig.json','scripts/build.mjs']){
 const b=await fs.readFile(path.join(root,name));sourceFiles.push({bytes:b.length,path:name,sha256:sha(b)});
}
for(const folder of ['src','assets']){
 try{for(const f of await inventory(path.join(root,folder)))sourceFiles.push({...f,path:folder+'/'+f.path});}catch(e){if(folder!=='assets'||e.code!=='ENOENT')throw e;}
}
sourceFiles.sort((a,b)=>a.path.localeCompare(b.path,'en'));const source_sha256=sha(JSON.stringify(sourceFiles));
await fs.mkdir(out,{recursive:true});
await build({entryPoints:[root+'/src/main.ts'],bundle:true,format:'iife',platform:'browser',target:'es2022',minify:true,legalComments:'external',outfile:out+'/game.js',define:{__SOURCE_SHA__:JSON.stringify(source_sha256)}});
for(const name of ['index.html','style.css'])await fs.copyFile(root+'/'+name,out+'/'+name);
try{await fs.cp(root+'/assets',out+'/assets',{recursive:true});}catch(e){if(e.code!=='ENOENT')throw e;}
await fs.mkdir(out+'/licenses');
for(const name of ['phaser','eventemitter3']){
 const packageRoot=path.dirname(fileURLToPath(import.meta.resolve(name+'/package.json')));
 const names=await fs.readdir(packageRoot);const license=names.find(n=>/^license(?:\.txt|\.md)?$/i.test(n));
 if(!license)throw Error('Missing dependency license: '+name);
 await fs.copyFile(packageRoot+'/'+license,out+'/licenses/'+name+'.txt');
}
const files=await inventory(out);
if(files.length>4096||files.some(f=>f.bytes>25*1024*1024)||files.reduce((n,f)=>n+f.bytes,0)>128*1024*1024)throw Error('Delivery size limit');
const report={status:'built',package_path:out,entrypoint:'index.html',source_sha256,build_sha256:sha(JSON.stringify(files)),files,bytes:files.reduce((n,f)=>n+f.bytes,0)};
await fs.writeFile(out+'.build.json',JSON.stringify(report,null,2)+'\n');
console.log(JSON.stringify({...report,files:files.length}));
