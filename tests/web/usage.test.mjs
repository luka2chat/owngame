import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {usageSection, usageHtml} from '../../scripts/web/usage.mjs';

test('the licensing page renders the README section and resolves its repository links',async()=>{
  const readme=await fs.readFile(new URL('../../README.md',import.meta.url),'utf8');
  const section=usageSection(readme),html=usageHtml(readme);
  assert(section.includes('商用和再分发按具体项目及素材许可执行'));
  assert.equal((html.match(/<li>/g)||[]).length,3);
  assert(html.includes('https://github.com/luka2chat/owngame/blob/main/docs/open-source-games.md#%E6%8E%88%E6%9D%83'));
  assert(!html.includes('小小文明'));
  assert(!html.includes('## 许可与致谢'));
});
test('missing or unsupported licensing content blocks publication',()=>{
  assert.throws(()=>usageHtml('No licensing section'),/missing/);
  assert.throws(()=>usageHtml('## 使用与授权\n\n'),/empty/);
  assert.throws(()=>usageHtml('## 使用与授权\n\n```html\n<script>\n```'),/Unsupported/);
});
test('README prose cannot insert HTML or executable licensing links',()=>{
  assert.equal(usageHtml('## 使用与授权\n\n<script>alert(1)</script>'),'<p>&lt;script&gt;alert(1)&lt;/script&gt;</p>');
  assert.throws(()=>usageHtml('## 使用与授权\n\n[bad](javascript:alert)'),/Unsupported/);
});
