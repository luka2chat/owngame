import fs from 'node:fs/promises';
import path from 'node:path';

export async function writeSharedFooters(root,out) {
  const footer=await fs.readFile(path.join(root,'apps/web/footer.html'),'utf8');
  const marker='<!-- OWNGAME_SITE_FOOTER -->';
  async function walk(dir) {
    for(const entry of await fs.readdir(dir,{withFileTypes:true})) {
      const file=path.join(dir,entry.name);
      if(entry.isDirectory()) { if(entry.name!=='games')await walk(file); }
      else if(entry.name.endsWith('.html')) {
        const html=await fs.readFile(file,'utf8');
        if(html.split(marker).length!==2)throw Error('Site page must include one shared footer: '+path.relative(out,file));
        await fs.writeFile(file,html.replace(marker,footer));
      }
    }
  }
  await walk(out);
}
