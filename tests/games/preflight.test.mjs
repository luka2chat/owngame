import {test} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {preflightSource} from '../../scripts/games/preflight.mjs';

async function fixture(t){
  const repo=await fs.mkdtemp(path.join(os.tmpdir(),'owngame-export-preflight-'));
  t.after(()=>fs.rm(repo,{recursive:true,force:true}));
  for(const folder of ['tests/games','tests/web'])await fs.mkdir(path.join(repo,folder),{recursive:true});
  await fs.writeFile(path.join(repo,'tests/games/basic.test.mjs'),"import {test} from 'node:test';test('exported game',()=>{});\n");
  return repo;
}
test('exported tests cannot use a module present only in the production workspace',async t=>{
  const repo=await fixture(t);
  await fs.writeFile(path.join(repo,'tests/web/images.test.mjs'),"import {ready} from '../../scripts/web/image-delivery.mjs';import assert from 'node:assert/strict';assert(ready);\n");
  await assert.rejects(preflightSource(repo,{stdio:'pipe'}),error=>error.status!==0&&String(error.stdout).includes('ERR_MODULE_NOT_FOUND'));
  await fs.mkdir(path.join(repo,'scripts/web'),{recursive:true});
  await fs.writeFile(path.join(repo,'scripts/web/image-delivery.mjs'),'export const ready=true;\n');
  assert.deepEqual(await preflightSource(repo,{stdio:'pipe'}),{files:2});
});
test('a failing exported page test blocks publication even when game tests pass',async t=>{
  const repo=await fixture(t);
  await fs.writeFile(path.join(repo,'tests/web/copy.test.mjs'),"import assert from 'node:assert/strict';assert.fail('Missing English copy');\n");
  await assert.rejects(preflightSource(repo,{stdio:'pipe'}),error=>error.status!==0&&String(error.stdout).includes('Missing English copy'));
});
test('missing or empty exported test directories cannot silently pass',async t=>{
  const repo=await fixture(t);
  await assert.rejects(preflightSource(repo,{stdio:'pipe'}),/no tests in tests\/web/);
  await fs.rm(path.join(repo,'tests/web'),{recursive:true});
  await assert.rejects(preflightSource(repo,{stdio:'pipe'}),{code:'ENOENT'});
});
