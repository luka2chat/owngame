import {test} from 'node:test';
import assert from 'node:assert/strict';
import {sha256,fetchBytes,fetchChunk,downloadChunks} from './download.mjs';
const baseUrl='https://example.test/game/index.html';
const bytes=new TextEncoder().encode('a verified game chunk');
const chunk={path:'Build/test.bin',bytes:bytes.length,sha256:await sha256(bytes)};
function memoryCache(){const entries=new Map();return {match:async key=>entries.get(key)?.clone(),put:async(key,value)=>entries.set(key,value.clone()),delete:async key=>entries.delete(key),entries};}
test('stalled headers time out instead of waiting forever',async()=>{
 await assert.rejects(fetchBytes(baseUrl,{fetchImpl:()=>new Promise(()=>{}),idleMs:20,attemptMs:200}),/连接太慢/);
});
test('stalled body retries; only the complete verified result is cached',async()=>{
 let attempts=0,cancelled=false;const cache=memoryCache();
 const result=await fetchChunk(chunk,{baseUrl,cache,idleMs:25,attemptMs:200,retryDelayMs:0,fetchImpl:async()=>++attempts===1?new Response(new ReadableStream({start(c){c.enqueue(bytes.slice(0,2));},cancel(){cancelled=true;}})):new Response(bytes)});
 assert.deepEqual(result,bytes);assert.equal(attempts,2);assert.ok(cancelled);assert.equal(cache.entries.size,1);
});
test('a trickling connection has an overall deadline',async()=>{
 let tick;
 await assert.rejects(fetchBytes(baseUrl,{idleMs:100,attemptMs:30,maxBytes:10000,fetchImpl:async()=>new Response(new ReadableStream({start(c){tick=setInterval(()=>c.enqueue(new Uint8Array([1])),3);},cancel(){clearInterval(tick);}}))}),/连接太慢/);
});
test('corrupt cached and downloaded bytes are never accepted',async()=>{
 const cache=memoryCache(),key=new URL('/__star-letters-chunks/'+chunk.sha256,baseUrl).href;await cache.put(key,new Response(new Uint8Array(bytes.length)));
 let attempts=0;const result=await fetchChunk(chunk,{baseUrl,cache,retryDelayMs:0,fetchImpl:async()=>new Response(++attempts===1?new Uint8Array(bytes.length):bytes)});
 assert.deepEqual(result,bytes);assert.equal(attempts,2);assert.deepEqual(new Uint8Array(await(await cache.match(key)).arrayBuffer()),bytes);
});
test('retry after interruption reuses completed chunks without downloading them again',async()=>{
 const other=new TextEncoder().encode('second chunk'),second={path:'Build/second.bin',bytes:other.length,sha256:await sha256(other)},cache=memoryCache();let firstCalls=0,fail=true;
 const fetchImpl=async url=>{if(url.endsWith('test.bin')){firstCalls++;return new Response(bytes);}return fail?new Response('unavailable',{status:503}):new Response(other);};
 await assert.rejects(downloadChunks([chunk,second],{baseUrl,cache,fetchImpl,concurrency:1,attempts:1}),/继续接收/);
 fail=false;const result=await downloadChunks([chunk,second],{baseUrl,cache,fetchImpl,concurrency:1});
 assert.equal(firstCalls,1);assert.deepEqual(result,[bytes,other]);
});
test('unavailable storage does not prevent verified play',async()=>{
 const cache={match:async()=>{throw Error('private mode');},put:async()=>{throw Error('quota');}};
 assert.deepEqual(await fetchChunk(chunk,{baseUrl,cache,fetchImpl:async()=>new Response(bytes)}),bytes);
});
test('parallel downloads preserve manifest order and stay within the connection limit',async()=>{
 let active=0,max=0;const chunks=await Promise.all([1,2,3,4,5].map(async i=>{const b=new Uint8Array([i]);return {path:`Build/${i}.bin`,bytes:1,sha256:await sha256(b)};}));
 const results=await downloadChunks(chunks,{baseUrl,concurrency:3,fetchImpl:async url=>{active++;max=Math.max(max,active);await new Promise(r=>setTimeout(r,5));active--;return new Response(new Uint8Array([Number(url.match(/(\d)\.bin$/)[1])]));}});
 assert.equal(max,3);assert.deepEqual(results.map(b=>b[0]),[1,2,3,4,5]);
});
test('a failed chunk cancels sibling stalled downloads',async()=>{
 const broken={...chunk,path:'Build/broken.bin'};
 await assert.rejects(downloadChunks([broken,chunk],{baseUrl,attempts:1,fetchImpl:async url=>url.includes('broken')?new Response('no',{status:503}):new Promise(()=>{})}),/继续接收/);
});
