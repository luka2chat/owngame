import fs from 'node:fs/promises';
import path from 'node:path';
import {execFileSync} from 'node:child_process';
import {readGameEntries} from '../web/catalog.mjs';
import {validateCoverage} from './source-policy.mjs';
import {preflightSource} from './preflight.mjs';
const root=path.resolve(import.meta.dirname,'../..');
const args=process.argv.slice(2);
const retainGames=args[2]==='--retain-game-sources';
if((args.length!==2 && !(args.length===3 && retainGames)) || args[0]!=='--repository-dir') throw Error('Usage: node scripts/games/sync.mjs --repository-dir <clean public repository checkout> [--retain-game-sources]');
const repo=path.resolve(args[1]);
const libraryRoot=process.env.OWNGAME_LIBRARY_ROOT ? path.resolve(process.env.OWNGAME_LIBRARY_ROOT) : path.join(root,'.owngame/library');
const git=(...args)=>execFileSync('git',args,{cwd:repo,encoding:'utf8'}).trim();
if(repo===root || git('remote','get-url','origin').replace(/\.git$/,'').replace('git@github.com:','https://github.com/')!=='https://github.com/luka2chat/owngame') throw Error('Use a separate checkout of luka2chat/owngame');
if(git('status','--porcelain')) throw Error('Public checkout has local changes; preserve/commit them before publishing');
if(repo.startsWith('/Volumes/')) {
  const mounts=execFileSync('/sbin/mount',{encoding:'utf8'});
  const mountPoint=repo.split('/').slice(0,3).join('/');
  if(!mounts.includes(' on '+mountPoint+' (smbfs')) throw Error('SMB share is not mounted');
  await fs.access(repo,fs.constants.W_OK);
}
git('fetch','origin','main');git('switch','--detach','origin/main');
const branch='release/game-source-'+new Date().toISOString().replace(/[^0-9]/g,'');
git('switch','-c',branch);
const entries=await readGameEntries(root);
const catalog=await Promise.all(entries.map(async e=>({...e,version:JSON.parse(await fs.readFile(path.join(libraryRoot,e.id,'current.json'))).build_sha256})));
const selected=(process.env.OWNGAME_SOURCE_IDS||'').split(',').filter(Boolean);
if(selected.length || retainGames) {
  if(new Set(selected).size!==selected.length || selected.some(id=>!catalog.some(game=>game.id===id))) throw Error('OWNGAME_SOURCE_IDS must name distinct selected catalog games');
  // Keep other games at their reviewed public sources. Their local work may belong to another task.
  const retained=JSON.parse(await fs.readFile(path.join(repo,'games.json')));
  validateCoverage(retained,catalog.filter(game=>retainGames || !selected.includes(game.id)));
}
const evidence=path.join(root,'artifacts/open-source');await fs.mkdir(evidence,{recursive:true});
const plan=path.join(evidence,'planned-catalog.json');await fs.writeFile(plan,JSON.stringify(catalog,null,2)+'\n');
if(!retainGames)execFileSync('python3',[path.join(root,'scripts/games/export.py'),'--catalog',plan,'--out',repo,'--library',libraryRoot,...(selected.length?['--only',selected.join(',')]:[])],{cwd:root,stdio:'inherit'});
const copy=async relative=>{const src=path.join(root,relative),dest=path.join(repo,relative);await fs.mkdir(path.dirname(dest),{recursive:true});await fs.cp(src,dest,{recursive:true,filter:p=>!p.includes('__pycache__')});};
for(const relative of ['scripts/games','tests/games','tests/web','scripts/web/catalog.mjs','scripts/web/build.mjs','scripts/web/publish.mjs',
  'scripts/web/verify-deployment.mjs','scripts/web/verify-i18n.mjs','scripts/web/link-sources.mjs','scripts/web/usage.mjs','scripts/web/footer.mjs','scripts/web/image-delivery.mjs','scripts/lib/codex-browser-preflight.mjs','.github/workflows/games.yml',
  'docs/open-source-games.md','docs/game-publishing.md','apps/web/public','apps/web/footer.html','apps/web/README.md','apps/web/wrangler.jsonc']) await copy(relative);
const catalogModule=await fs.readFile(path.join(root,'scripts/web/catalog.mjs'),'utf8');
const catalogFiles=[...catalogModule.matchAll(/"(scripts\/[^"\n]+\/catalog\.json)"/g)].map(match=>match[1]);
for(const file of catalogFiles) await copy(file);
const index=JSON.parse(await fs.readFile(path.join(repo,'games.json')));
const packagePath=path.join(repo,'package.json');
const publicPackage=JSON.parse(await fs.readFile(packagePath));
Object.assign(publicPackage.scripts,{'web:build':'node scripts/web/build.mjs','web:publish':'node scripts/web/publish.mjs'});
await fs.writeFile(packagePath,JSON.stringify(publicPackage,null,2)+'\n');
for(const game of index.games.filter(g=>!retainGames && g.kind!=='unity')) {
  execFileSync('npm',['install','--package-lock-only','--ignore-scripts','--no-audit','--no-fund'],{cwd:path.join(repo,game.path),stdio:'inherit'});
}
execFileSync(process.execPath,[path.join(root,'scripts/games/refresh-manifests.mjs'),repo],{stdio:'inherit'});
execFileSync(process.execPath,[path.join(root,'scripts/games/verify.mjs'),repo],{stdio:'inherit'});
// Fail before a commit or push if copied tests reference missing modules or untranslated page copy.
await preflightSource(repo);
git('add',...catalogFiles,'examples','games.json','scripts/games','tests/games','tests/web','scripts/web','scripts/lib/codex-browser-preflight.mjs',
  '.github/workflows/games.yml','docs/open-source-games.md','docs/game-publishing.md','apps/web','package.json','README.md');
execFileSync(process.execPath,[path.join(root,'scripts/games/refresh-root-manifest.mjs'),repo],{stdio:'inherit'});
git('add','SOURCE_MANIFEST.json');
if(git('diff','--cached','--name-only')) git('commit','-m','games: synchronize source for selected website releases');
const commit=git('rev-parse','HEAD');git('push','origin','HEAD:refs/heads/'+branch);
// CI checks clean npm installs and rebuilds every game before production can advance.
let run;
for(let attempt=0;attempt<12;attempt++) {
  const runs=JSON.parse(execFileSync('gh',['run','list','--repo','luka2chat/owngame','--commit',commit,
    '--workflow','games.yml','--json','databaseId'],{encoding:'utf8'}));
  if(runs.length){run=runs[0].databaseId;break;}
  await new Promise(resolve=>setTimeout(resolve,5000));
}
if(!run) throw Error('Game source CI did not start; source branch retained, website not deployed');
execFileSync('gh',['run','watch',String(run),'--repo','luka2chat/owngame','--exit-status','--interval','10'],{stdio:'inherit'});
// Push is fast-forward only. A concurrent main update stops publication for a reviewed merge.
git('push','origin','HEAD:refs/heads/main');
const receipt={commit,branch,ci_run:run,games:index.games.map(g=>({id:g.id,version:g.online_build_sha256})),verified_at:new Date().toISOString()};
await fs.writeFile(path.join(evidence,'current.json'),JSON.stringify(receipt,null,2)+'\n');
console.log(JSON.stringify({status:'source_published',commit,games:index.games.length}));
