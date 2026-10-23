import { readFile, realpath, stat } from 'node:fs/promises';
import { resolve, dirname, extname, relative, isAbsolute, sep } from 'node:path';
import { createRequire } from 'node:module';
import { readOutline } from '../../scripts/toolkit/outline-store.mjs';

const types = { '.png':'image/png', '.jpg':'image/jpeg', '.jpeg':'image/jpeg', '.webp':'image/webp', '.glb':'model/gltf-binary' };
const inside = (root, file) => { const r=relative(root,file); return !isAbsolute(r)&&r!=='..'&&!r.startsWith(`..${sep}`); };
const fail = message => { throw new Error(message); };

export async function serveProjectAsset(store, pathname, expectedFile=null) {
  const match=/^\/api\/(asset|three)\/([^/]+)\/(.+)$/.exec(pathname);
  if(!match)return null;
  const kind=match[1],projectId=decodeURIComponent(match[2]),tail=decodeURIComponent(match[3]);
  const binding=(await store.index()).bindings.find(b=>b.id===projectId);
  if(!binding)fail('项目未关联。');
  const projectRoot=await realpath(binding.directory);
  if(kind==='asset') {
    const { project }=await readOutline(projectRoot);
    const card=project.cards.find(c=>c.id===tail&&['assets','levels'].includes(c.section));
    const declared=card?.fields.file?.trim();
    if(expectedFile!==null&&expectedFile!==declared)fail('预览路径尚未保存，请等待同步。');
    const file=declared?.replace(/^\.\//,'');
    if(!file||file.includes('\\')||file.includes('\0')||file.split('/').some(p=>!p||p.startsWith('.'))||isAbsolute(file))fail('请填写项目内的图片或 GLB 相对路径。');
    const type=types[extname(file).toLowerCase()];
    if(!type)fail('预览支持 PNG、JPEG、WebP 和自包含 GLB。');
    const target=await realpath(resolve(projectRoot,file));
    if(!inside(projectRoot,target)) {
      // External symlinks require explicit machine-local authorization, never board data.
      let roots=[];
      try { roots=JSON.parse(await readFile(resolve(projectRoot,'.local/outline-asset-roots.json'),'utf8')).roots; }
      catch(error) { if(error.code!=='ENOENT')throw error; }
      if(!Array.isArray(roots)||!roots.every(root=>typeof root==='string'&&isAbsolute(root)))fail('本机素材授权配置无效。');
      let allowed=false;
      for(const root of roots) { try { if(inside(await realpath(root),target))allowed=true; } catch(error) { if(error.code!=='ENOENT')throw error; } }
      if(!allowed)fail('预览文件超出了项目与本机已授权素材目录。');
    }
    const info=await stat(target);
    if(!info.isFile()||info.size>(type==='model/gltf-binary'?32:15)*1024*1024)fail('文件不可用或超过预览大小限制。');
    return { type, contents:await readFile(target) };
  }
  // Use the game's own installed renderer. No CDN or copied third-party bundle.
  if(!/^(build|examples\/jsm)\/.+\.js$/.test(tail)||tail.split('/').some(p=>p.startsWith('.')))fail('不支持的模型预览模块。');
  const require=createRequire(resolve(projectRoot,'package.json'));
  const threeRoot=await realpath(resolve(dirname(require.resolve('three')),'..'));
  if(JSON.parse(await readFile(resolve(threeRoot,'package.json'),'utf8')).name!=='three')fail('项目未安装 Three.js。');
  const target=await realpath(resolve(threeRoot,tail));
  if(!inside(threeRoot,target))fail('模块超出预览范围。');
  const contents=(await readFile(target,'utf8')).replace(/from\s*(['"])three\1/g,`from '/api/three/${encodeURIComponent(projectId)}/build/three.module.js'`);
  return { type:'text/javascript; charset=utf-8', contents };
}
