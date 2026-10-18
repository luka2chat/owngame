import test from 'node:test';
import assert from 'node:assert/strict';
import {initial,position,play,undo,restore,serialize} from './src/rules.js';
test('all reachable positions stop on win and round-trip through saves',()=>{
  const seen=new Set();
  function visit(state){const p=position(state),id=JSON.stringify(p.board);if(seen.has(id))return;seen.add(id);assert.deepEqual(restore(serialize(state)),state);
    for(let i=0;i<9;i++){const next=play(state,i);if(p.board[i]||p.winner||p.draw)assert.equal(next,state);else{assert.notEqual(next,state);assert.deepEqual(undo(next),state);visit(next);}}
  }
  visit(initial());assert.equal(seen.size,5478);
});
test('invalid histories never become valid saves',()=>{
  for(const moves of [[0,0],[-1],[9],['1'],[0,3,1,4,2,8]]) assert.throws(()=>restore(JSON.stringify({schema:1,moves})));
  assert.throws(()=>restore('{'));assert.throws(()=>restore('{"schema":2,"moves":[]}'));
});
