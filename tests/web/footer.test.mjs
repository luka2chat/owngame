import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {writeSharedFooters} from '../../scripts/web/footer.mjs';
import {messages} from '../../apps/web/public/locales/en.js';
const root=path.resolve(import.meta.dirname,'../..');

test('all site pages build with the same footer and usable non-JavaScript links',async t=>{
  const out=await fs.mkdtemp(path.join(os.tmpdir(),'owngame-footers-'));
  t.after(()=>fs.rm(out,{recursive:true,force:true}));
  const pages=[];
  async function copyHtml(dir='') {
    for(const entry of await fs.readdir(path.join(root,'apps/web/public',dir),{withFileTypes:true})) {
      const relative=path.join(dir,entry.name);
      if(entry.isDirectory())await copyHtml(relative);
      else if(entry.name.endsWith('.html')) {
        const html=await fs.readFile(path.join(root,'apps/web/public',relative),'utf8');
        assert.equal(html.split('<!-- OWNGAME_SITE_FOOTER -->').length,2,relative);
        await fs.mkdir(path.dirname(path.join(out,relative)),{recursive:true});
        await fs.writeFile(path.join(out,relative),html);pages.push(relative);
      }
    }
  }
  await copyHtml();await writeSharedFooters(root,out);
  const footers=[];
  for(const page of pages) {
    const html=await fs.readFile(path.join(out,page),'utf8');
    assert.equal((html.match(/<footer\b/g)||[]).length,1,page);
    assert.equal((html.match(/id="offline-info"/g)||[]).length,1,page);
    const footer=html.match(/<footer\b[\s\S]*?<\/footer>/)[0];footers.push(footer);
    assert(footer.includes('href="/privacy.html"'),page);
    assert(footer.includes('href="/usage.html"'),page);
    assert(footer.includes('href="/#about"'),page);
    assert(!html.includes('usage-entry'),page);
  }
  assert.equal(new Set(footers).size,1);
  const partial=await fs.readFile(path.join(root,'apps/web/footer.html'),'utf8');
  for(const match of partial.matchAll(/data-i18n(?:-aria-label)?="([^"]+)"/g))assert(Object.hasOwn(messages,match[1]),match[1]);
  assert((await fs.readFile(path.join(out,'cases/star-letters/index.html'),'utf8')).includes('Unity Technologies'));
});
