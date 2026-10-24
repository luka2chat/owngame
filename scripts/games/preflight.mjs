import fs from 'node:fs/promises';
import path from 'node:path';
import {execFileSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';

// Run against the exported checkout: production-only modules must never hide an incomplete export.
export async function preflightSource(repository,{stdio='inherit'}={}) {
  const repo=path.resolve(repository),tests=[];
  for(const folder of ['tests/games','tests/web']) {
    const files=(await fs.readdir(path.join(repo,folder))).filter(name=>name.endsWith('.test.mjs')).sort();
    if(!files.length)throw Error('Exported source has no tests in '+folder);
    tests.push(...files.map(name=>path.join(repo,folder,name)));
  }
  const env={...process.env,PYTHONDONTWRITEBYTECODE:'1'};
  // Nested regression tests still need a fresh Node test runner, not the parent's worker protocol.
  delete env.NODE_TEST_CONTEXT;
  execFileSync(process.execPath,['--test',...tests],{cwd:repo,env,stdio,maxBuffer:8*1024*1024});
  return {files:tests.length};
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)) {
  if(process.argv.length!==3)throw Error('Usage: node scripts/games/preflight.mjs PUBLIC_CHECKOUT');
  await preflightSource(process.argv[2]);
}
