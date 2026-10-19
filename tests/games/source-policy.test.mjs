import {test} from 'node:test';
import assert from 'node:assert/strict';
import {validateCoverage,loadPublishedSources,sha256} from '../../scripts/games/source-policy.mjs';
const version='a'.repeat(64), commit='b'.repeat(40);
const manifest=Buffer.from(JSON.stringify({files:[{path:'src/main.ts'}]}));
const game={id:'demo',path:'examples/demo',online_build_sha256:version,source_manifest_sha256:sha256(manifest)};
const index={schema:'owngame.open-games.v1',games:[game]},catalog=[{id:'demo',version}];
test('new games and new builds cannot pass with missing or stale source',()=>{
  assert.equal(validateCoverage(index,catalog).length,1);
  assert.throws(()=>validateCoverage(index,[{id:'new-game',version}]),/not published/);
  assert.throws(()=>validateCoverage(index,[{id:'demo',version:'c'.repeat(64)}]),/matching source/);
  assert.throws(()=>validateCoverage({...index,games:[game,game]},catalog),/duplicate/);
});
test('only an immutable public revision with intact manifests permits deployment',async()=>{
  await assert.rejects(loadPublishedSources('main',catalog),/synchronize/);
  const mock=async url=>new Response(url.endsWith('games.json')?JSON.stringify(index):manifest);
  const sources=await loadPublishedSources(commit,catalog,mock);
  assert(sources.get('demo').sourceUrl.includes('/'+commit+'/examples/demo'));
  await assert.rejects(loadPublishedSources(commit,catalog,async url=>new Response(url.endsWith('games.json')?JSON.stringify(index):'corrupt')),/mismatch/);
  await assert.rejects(loadPublishedSources(commit,catalog,async()=>new Response('missing',{status:404})),/unavailable/);
});
