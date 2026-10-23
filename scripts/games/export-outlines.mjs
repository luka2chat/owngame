import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
import { validatePublicOutline, publicOutlineGuidance, publicOutlineReadme } from './outline-policy.mjs';
const hash = bytes => createHash('sha256').update(bytes).digest('hex');
const json = value => JSON.stringify(value,null,2)+'\n';
export async function exportOutlines(root, destination, only) {
  const specs=JSON.parse(await fs.readFile(path.join(root,'scripts/games/projects.json'),'utf8'));
  const indexFile=path.join(destination,'games.json'),index=JSON.parse(await fs.readFile(indexFile,'utf8'));
  const wanted=only ? new Set(only.split(',')) : new Set(index.games.map(g=>g.id));
  if ([...wanted].some(id=>!index.games.some(g=>g.id===id))) throw Error('Unknown outline export ID');
  const planned=[];
  // Review and validate every input before writing any public files; never fall back to the private board.
  for(const game of index.games.filter(g=>wanted.has(g.id))) {
    const spec=specs[game.id];
    if(spec?.outline!=='game-outline.public.json')throw Error('Explicit reviewed outline required: '+game.id);
    const source=path.join(root,spec.project,spec.outline);
    if(!(await fs.lstat(source)).isFile())throw Error('Reviewed outline must be a regular file');
    const bytes=await fs.readFile(source);validatePublicOutline(JSON.parse(bytes));
    if(game.path!==`examples/${game.id}` || !/^[a-z0-9-]+$/.test(game.id))throw Error('Invalid game path');
    const folder=path.join(destination,game.path),manifestPath=path.join(folder,'SOURCE_MANIFEST.json');
    const manifest=JSON.parse(await fs.readFile(manifestPath,'utf8'));
    let readme=await fs.readFile(path.join(folder,'README.md'),'utf8');
    if(!readme.includes('## Game design board'))readme+=publicOutlineReadme;
    // Preserve any existing project guidance outside the managed block.
    let agents='';try{agents=await fs.readFile(path.join(folder,'AGENTS.md'),'utf8');}catch(e){if(e.code!=='ENOENT')throw e;}
    const block='<!-- owngame:public-outline -->\n'+publicOutlineGuidance+'<!-- /owngame:public-outline -->\n';
    agents=agents.includes('<!-- owngame:public-outline -->')?agents.replace(/<!-- owngame:public-outline -->[\s\S]*?<!-- \/owngame:public-outline -->\n?/,block):agents+(agents?'\n':'')+block;
    const files=new Map([['game-outline.json',bytes],['AGENTS.md',Buffer.from(agents)],['README.md',Buffer.from(readme)]]);
    for(const [name,content] of files){const prior=manifest.files.find(f=>f.path===name);const entry={...prior,path:name,bytes:content.length,sha256:hash(content),...(game.kind==='unity'&&!prior?{license:'MIT'}:{})};manifest.files=manifest.files.filter(f=>f.path!==name);manifest.files.push(entry);}
    manifest.files.sort((a,b)=>a.path.localeCompare(b.path));
    files.set('SOURCE_MANIFEST.json',Buffer.from(json(manifest)));
    planned.push({game,folder,files});
  }
  for(const {game,folder,files} of planned){for(const [name,bytes] of files)await fs.writeFile(path.join(folder,name),bytes);game.source_manifest_sha256=hash(files.get('SOURCE_MANIFEST.json'));}
  await fs.writeFile(indexFile,json(index));
  return {games:planned.length,private_boards_copied:false};
}
if(process.argv[1]===fileURLToPath(import.meta.url)){
  const args=process.argv.slice(2);let destination,only;
  for(let i=0;i<args.length;i++){if(args[i]==='--repository-dir')destination=args[++i];else if(args[i]==='--only')only=args[++i];else throw Error('Usage: export-outlines --repository-dir <reviewed checkout> [--only ids]');}
  if(!destination)throw Error('Missing --repository-dir');
  console.log(JSON.stringify(await exportOutlines(path.resolve(import.meta.dirname,'../..'),path.resolve(destination),only)));
}
