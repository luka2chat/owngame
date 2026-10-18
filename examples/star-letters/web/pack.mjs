import fs from 'node:fs/promises';
import path from 'node:path';
import {gzipSync,gunzipSync} from 'node:zlib';
import {createHash} from 'node:crypto';
const [input,output,notices]=process.argv.slice(2);
if(!input||!output||!notices)throw Error('Usage: node pack.mjs UNITY_WEB_BUILD NEW_OUTPUT REVIEWED_SOURCE');
const sha=b=>createHash('sha256').update(b).digest('hex');
try{await fs.lstat(output);throw Error('Output exists; choose a new immutable directory');}catch(e){if(e.code!=='ENOENT')throw e;}
const html=await fs.readFile(path.join(input,'index.html'),'utf8');
const paths=Object.fromEntries(['dataUrl','frameworkUrl','codeUrl'].map(key=>{const m=html.match(new RegExp(key+":\\s*['\"]([^'\"]+)"));if(!m)throw Error('Missing '+key);return [key,m[1]];}));
const loader=html.match(/<script src="([^"]+loader\.js)"/)[1];
await fs.mkdir(path.join(output,'Build'),{recursive:true});
const assets={};
for(const [key,relative] of Object.entries(paths)){
 const raw=await fs.readFile(path.join(input,relative));
 const compressed=gzipSync(raw,{level:9});
 const chunks=[];
 for(let offset=0,index=0;offset<compressed.length;offset+=16*1024*1024,index++){
  const bytes=compressed.subarray(offset,offset+16*1024*1024),file=`Build/${key}-${index}.bin`;
  await fs.writeFile(path.join(output,file),bytes);chunks.push({path:file,bytes:bytes.length,sha256:sha(bytes)});
 }
 if(sha(gunzipSync(Buffer.concat(await Promise.all(chunks.map(c=>fs.readFile(path.join(output,c.path)))))))!==sha(raw))throw Error('Roundtrip mismatch');
 assets[key]={encoding:'gzip',bytes:raw.length,sha256:sha(raw),mime:key==='codeUrl'?'application/wasm':key==='frameworkUrl'?'text/javascript':'application/octet-stream',chunks};
}
await fs.copyFile(path.join(input,loader),path.join(output,'Build/loader.js'));
await fs.writeFile(path.join(output,'assets.json'),JSON.stringify({schema:'star-letters.web.v1',assets},null,2)+'\n');
for(const file of ['index.html','launch.js'])await fs.copyFile(path.join(import.meta.dirname,file),path.join(output,file));
await fs.mkdir(path.join(output,'licenses'));
for(const file of ['LICENSE','THIRD_PARTY_NOTICES.md'])await fs.copyFile(path.join(notices,file),path.join(output,'licenses',file+'.txt'));
for(const file of await fs.readdir(path.join(notices,'LICENSES')))await fs.copyFile(path.join(notices,'LICENSES',file),path.join(output,'licenses',file.replace(/\.md$/,'.txt')));
await fs.writeFile(path.join(output,'SOURCE.json'),JSON.stringify({title:'星野来信 · 迟到的春天',source:'https://github.com/luka2chat/owngame/tree/main/examples/star-letters',engine:'Unity 6000.3.26f1',license:'Authored source/assets: MIT; font: OFL-1.1; Unity-derived configuration: Unity Companion License; Unity Runtime: Unity Software Terms',packaging:'Lossless gzip chunks, SHA-256 checked before launch; engine files are unmodified after decompression'},null,2)+'\n');
console.log(JSON.stringify({output,uncompressedBytes:Object.values(assets).reduce((s,a)=>s+a.bytes,0),downloadBytes:Object.values(assets).reduce((s,a)=>s+a.chunks.reduce((n,c)=>n+c.bytes,0),0),chunks:Object.values(assets).flatMap(a=>a.chunks).length}));
