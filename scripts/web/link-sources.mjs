// Add public source metadata to an existing accepted release without selecting
// in-progress gameplay candidates from the production library.
import fs from 'node:fs/promises';
import path from 'node:path';
import {loadPublishedSources,sha256} from '../games/source-policy.mjs';
const [baselineArg,outArg,commit]=process.argv.slice(2);
if(!baselineArg || !outArg || !commit)throw Error('Usage: node scripts/web/link-sources.mjs <accepted-release> <new-web-output> <public-commit>');
const baseline=path.resolve(baselineArg),out=path.resolve(outArg),root=path.resolve(import.meta.dirname,'../..');
if(!path.basename(out).startsWith('web-') || out===baseline || out.startsWith(baseline+path.sep))throw Error('Use a separate new web- output');
if(await fs.access(out).then(()=>true,()=>false))throw Error('Output already exists');
const catalog=JSON.parse(await fs.readFile(path.join(baseline,'catalog.json')));
const sources=await loadPublishedSources(commit,catalog);
for(const game of catalog) {
  const files=JSON.parse(await fs.readFile(path.join(baseline,game.manifest)));
  for(const f of files) {
    const bytes=await fs.readFile(path.join(baseline,f.url));
    if(bytes.length!==f.bytes || sha256(bytes)!==f.sha256)throw Error('Accepted game asset mismatch: '+f.url);
  }
}
await fs.cp(baseline,out,{recursive:true});
for(const game of catalog) {
  const source=sources.get(game.id);
  Object.assign(game,{sourceUrl:source.sourceUrl,sourceCommit:commit,sourceManifest:source.source_manifest_sha256,sourceLicense:source.license});
  const file=path.join(out,'remix',game.id+'.json'),brief=JSON.parse(await fs.readFile(file));
  Object.assign(brief,{source_url:game.sourceUrl,source_commit:commit,source_manifest_sha256:game.sourceManifest,source_license:game.sourceLicense});
  brief.toolkit.package='@owngame/cli@latest';
  brief.reference_scope='The matching editable game source is available at source_url. Follow its LICENSE and THIRD_PARTY_NOTICES.md; the npm toolkit provides separate starters.';
  await fs.writeFile(file,JSON.stringify(brief,null,2)+'\n');
}
await fs.writeFile(path.join(out,'catalog.json'),JSON.stringify(catalog,null,2)+'\n');
await fs.copyFile(path.join(root,'apps/web/public/remix.js'),path.join(out,'remix.js'));
const walk=async dir=>(await Promise.all((await fs.readdir(dir,{withFileTypes:true})).map(async e=>{
  const p=path.join(dir,e.name);return e.isDirectory()?await walk(p):[p];
}))).flat();
const core=(await walk(out)).filter(p=>!p.includes('/games/')&&!['sw.js','_headers'].includes(path.basename(p)))
  .map(p=>'/'+path.relative(out,p).split(path.sep).join('/')).concat(catalog.map(g=>g.manifest));
const sw=await fs.readFile(path.join(root,'apps/web/public/sw.js'),'utf8');
const digest=sha256(Buffer.concat([Buffer.from(sw),...(await Promise.all(core.map(p=>fs.readFile(path.join(out,p)))))]));
await fs.writeFile(path.join(out,'sw.js'),sw.replace('__BUILD__',digest.slice(0,12)).replace('__CORE_FILES__',JSON.stringify(core)));
console.log(JSON.stringify({status:'source_links_built',games:catalog.length,source_commit:commit,build:digest.slice(0,12),out}));
