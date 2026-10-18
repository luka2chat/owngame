import fs from 'node:fs/promises';
import path from 'node:path';
import {createHash,randomUUID} from 'node:crypto';
const root=path.resolve(import.meta.dirname,'../..');
const pkg=JSON.parse(await fs.readFile(path.join(root,'package.json')));
const args=process.argv.slice(2);let out=path.join(root,'release',`owngame-${pkg.version}`),repository;
for(let i=0;i<args.length;i++){
 if(args[i]==='--out'&&args[i+1])out=path.resolve(args[++i]);
 else if(args[i]==='--repository'&&/^https:\/\/github\.com\/[\w.-]+\/[\w.-]+$/.test(args[i+1]??''))repository=args[++i];
 else throw Error('Usage: release:prepare [--out new-directory] [--repository https://github.com/owner/repo]');
}
if(out===root||root.startsWith(out+path.sep))throw Error('Output cannot replace source');
if(['packages','starter-knowledge','skills','templates','scripts','tests','docs','.github'].some(p=>out===path.join(root,p)||out.startsWith(path.join(root,p)+path.sep)))throw Error('Output overlaps exported source');
try {await fs.lstat(out);throw Error('Output already exists');}catch(e){if(e.code!=='ENOENT')throw e;}
const destination=out;
await fs.mkdir(path.dirname(out),{recursive:true});
out=path.join(path.dirname(out),'.owngame-export-'+randomUUID());
await fs.mkdir(out);
try {
const entries=['packages','starter-knowledge','skills','templates','scripts/toolkit','scripts/lib/codex-browser-preflight.mjs','scripts/release','tests/release','.github','tsconfig.json','README.md','LICENSE','THIRD_PARTY_NOTICES.md','CONTRIBUTING.md','SECURITY.md','CHANGELOG.md','docs/install.md','docs/quickstart.md','docs/releasing.md','docs/style-recipes.json','docs/cases','docs/images'];
const manifest=[];
async function copy(relative){
 const file=path.join(root,relative),stat=await fs.lstat(file);
 if(stat.isSymbolicLink())throw Error('Public source cannot contain symlink: '+relative);
 if(stat.isDirectory()) {for(const name of (await fs.readdir(file)).sort())await copy(`${relative}/${name}`);return;}
 if(/(^|\/)(node_modules|\.env|\.local|\.owngame|\.DS_Store)(\/|$)/.test(relative))throw Error('Unexpected private path: '+relative);
 const bytes=await fs.readFile(file);
 if(/\.(ts|js|mjs|json|md|yml)$/.test(relative)&&/\/(?:Users|Volumes)\/[A-Za-z0-9_.-]+|\b192\.168\.\d+\.\d+\b/.test(bytes.toString()))throw Error('Machine-specific source: '+relative);
 await fs.mkdir(path.dirname(path.join(out,relative)),{recursive:true});await fs.writeFile(path.join(out,relative),bytes);
 manifest.push({path:relative,bytes:bytes.length,sha256:createHash('sha256').update(bytes).digest('hex')});
}
for(const entry of entries)await copy(entry);
pkg.scripts={build:'tsc -p tsconfig.json',test:'npm run test:release','test:release':pkg.scripts['test:release'],'verify:package':pkg.scripts['verify:package'],'release:prepare':pkg.scripts['release:prepare'],prepack:'npm run build'};
if(repository){pkg.repository={type:'git',url:repository+'.git'};pkg.bugs={url:repository+'/issues'};}
await fs.writeFile(path.join(out,'package.json'),JSON.stringify(pkg,null,2)+'\n');
const lock=JSON.parse(await fs.readFile(path.join(root,'package-lock.json')));lock.version=pkg.version;lock.packages[''].version=pkg.version;lock.packages[''].license=pkg.license;
await fs.writeFile(path.join(out,'package-lock.json'),JSON.stringify(lock,null,2)+'\n');
await fs.writeFile(path.join(out,'.gitignore'),'node_modules/\ndist/\n/artifacts/\n/release/\n.owngame/\n.codex/\n.cursor/\n.agents/\n.env\n.env.*\n.npmrc\n*.tgz\n.DS_Store\nmy-game/\n');
await fs.writeFile(path.join(out,'SOURCE_MANIFEST.json'),JSON.stringify({version:pkg.version,scope:'Explicit public toolkit export; production workspace excluded',files:manifest},null,2)+'\n');
await fs.rename(out,destination);
console.log(JSON.stringify({directory:destination,version:pkg.version,source_files:manifest.length,repository:repository??'not configured',next:'npm ci; npm test; npm run verify:package in the exported directory before publishing'}));

}catch(error){await fs.rm(out,{recursive:true,force:true});throw error;}
