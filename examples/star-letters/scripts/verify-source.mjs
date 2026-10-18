import fs from 'node:fs/promises';
import path from 'node:path';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
const root=path.resolve(import.meta.dirname,'..');
const manifest=JSON.parse(await fs.readFile(path.join(root,'SOURCE_MANIFEST.json')));
let index=0;
await Promise.all(Array.from({length:8},async()=>{while(index<manifest.files.length){
 const file=manifest.files[index++];assert.ok(!file.path.split('/').some(s=>!s||s==='..'||s==='.'),'Unsafe path');
 const p=path.join(root,file.path);assert.ok(!(await fs.lstat(p)).isSymbolicLink(),'Source must be self-contained');
 const bytes=await fs.readFile(p);assert.equal(bytes.length,file.bytes,file.path);assert.equal(createHash('sha256').update(bytes).digest('hex'),file.sha256,file.path);
 assert.ok(!/(?:\/Users\/|\/Volumes\/|192\.168\.\d+\.\d+|gh[pousr]_[A-Za-z0-9]{30,}|-----BEGIN (?:RSA |OPENSSH )?PRIVATE KEY)/.test(bytes.toString('latin1')),`Private pattern: ${file.path}`);
}}));
console.log(JSON.stringify({verifiedFiles:manifest.files.length,bytes:manifest.files.reduce((n,f)=>n+f.bytes,0)}));
