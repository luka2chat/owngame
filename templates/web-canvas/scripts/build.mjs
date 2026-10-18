import fs from 'node:fs/promises';
import path from 'node:path';
import { createHash, randomUUID } from 'node:crypto';
const root = path.resolve(import.meta.dirname, '..');
const out = path.join(root, 'dist');
const staging = path.join(root, `.build-${randomUUID()}`);
const sha = b => createHash('sha256').update(b).digest('hex');
const source = [];
async function copy(relative) {
  const file = path.join(root, relative), stat = await fs.lstat(file);
  if (stat.isSymbolicLink()) throw Error(`Symlink unsupported: ${relative}`);
  if (stat.isDirectory()) { for (const name of (await fs.readdir(file)).sort()) await copy(`${relative}/${name}`); return; }
  const data = await fs.readFile(file); source.push({path:relative,sha256:sha(data),bytes:data.length});
  await fs.mkdir(path.dirname(path.join(staging,relative)), {recursive:true});await fs.writeFile(path.join(staging,relative),data);
}
try {
  for (const relative of ['index.html','style.css','src','LICENSE']) await copy(relative);
  const source_sha256=sha(JSON.stringify(source));
  await fs.writeFile(path.join(staging,'build.json'),JSON.stringify({source_sha256,files:source,runtime:'not_run'},null,2)+'\n');
  try { const stat=await fs.lstat(out); if(stat.isSymbolicLink()||!stat.isDirectory())throw Error('dist must be a directory'); await fs.access(path.join(out,'.owngame-build')); } catch(e) { if(e.code!=='ENOENT')throw e; try {await fs.access(out);throw Error('Existing dist is not an owngame build; preserve it manually');}catch(x){if(x.code!=='ENOENT')throw x;} }
  await fs.writeFile(path.join(staging,'.owngame-build'),'1\n');
  // dist contains only generated output. Project source and saved browser data are untouched.
  await fs.rm(out,{recursive:true,force:true});await fs.rename(staging,out);
  console.log(JSON.stringify({status:'built',directory:out,source_sha256,runtime:'not_run'}));
} catch(e) { await fs.rm(staging,{recursive:true,force:true});throw e; }
