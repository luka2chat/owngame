import test from 'node:test';
import assert from 'node:assert/strict';
import { safeSearch, cleanParams, events } from '../../apps/web/public/analytics-schema.js';
test('search terms keep game intent and reject likely personal identifiers',()=>{
  for(const q of ['赛车','双人 合作','2048','NBA 2K','city-building']) assert.equal(safeSearch(q),q.toLowerCase());
  for(const q of ['me@example.com','138 1234 5678','https://example.com/?token=secret','我叫小明','身份证110101199001011234','password secret','a'.repeat(61)]) assert.equal(safeSearch(q),'');
  assert.equal(safeSearch('  ＮＢＡ   2K  '),'nba 2k');
});
test('unknown parameters never include arbitrary input, errors, URLs or clipboard',()=>{
  assert.deepEqual(cleanParams({search_term:'赛车',prompt:'private',error:'secret',url:'private',clipboard:'private',result_count:0,duration_ms:15.8}),{search_term:'赛车',result_count:0,duration_ms:16});
  assert.deepEqual(cleanParams({search_term:'test@example.com',duration_ms:NaN}),{});
});
test('events distinguish intent, frame loading, verified completion and gameplay',()=>{
  for(const name of ['game_select','player_frame_loaded','download_complete','remix_copy_error']) assert(events.has(name));
  assert(!events.has('level_start')); assert(!events.has('game_start'));
});
