import test from 'node:test';
import assert from 'node:assert/strict';
import { Scene, Vector3 } from 'three';
import { createQuest, advanceQuest } from '../src/quest.js';
import { RADIUS, normalAt, stepOnSphere, tangent } from '../src/math.js';
import { createWorld } from '../src/world.js';
import { createPlayer } from '../src/player.js';

test('story cannot skip collection, repeat rewards, or finish before the rose',()=>{
  const q=createQuest();
  advanceQuest(q,'beacon');advanceQuest(q,'rose');assert.equal(q.stage,'collect');
  advanceQuest(q,'collect',0);advanceQuest(q,'collect',0);advanceQuest(q,'collect',99);assert.equal(q.collected.size,1);
  advanceQuest(q,'collect',1);advanceQuest(q,'collect',2);assert.equal(q.stage,'rose');
  advanceQuest(q,'beacon');assert.equal(q.completed,false);
  advanceQuest(q,'rose');assert.equal(q.stage,'beacon');
  advanceQuest(q,'beacon');assert.equal(q.completed,true);assert.equal(q.stage,'complete');
  advanceQuest(q,'collect',0);advanceQuest(q,'rose');assert.equal(q.stage,'complete');
});
test('sphere movement preserves radius and travels a frame-independent arc',()=>{
  let fine=normalAt(0,0);const axis=new Vector3(1,0,0);
  for(let i=0;i<120;i++)fine=stepOnSphere(fine,new Vector3().crossVectors(axis,fine),2.25/120);
  const coarse=stepOnSphere(normalAt(0,0),new Vector3(0,0,1),2.25);
  assert.ok(Math.abs(fine.length()-1)<1e-12);
  assert.ok(fine.distanceTo(coarse)<1e-10);
  assert.ok(Math.abs(normalAt(0,0).angleTo(fine)*RADIUS-2.25)<1e-10);
});
test('movement is tangent to the local up, including across both poles',()=>{
  for(const n of [new Vector3(0,1,0),new Vector3(0,-1,0),normalAt(3,4)]){
    const t=tangent(new Vector3(1,.5,.7),n);assert.ok(Math.abs(t.dot(n))<1e-10);
    assert.ok(Math.abs(stepOnSphere(n,t,1).length()-1)<1e-10);
  }
  assert.ok(stepOnSphere(new Vector3(0,1,0),new Vector3(0,1,0),1).equals(new Vector3(0,1,0)));
});

test('all story destinations are reachable through the actual scene colliders',()=>{
  const scene=new Scene(),world=createWorld(scene),player=createPlayer(scene);
  const destinations=[...world.stars.map(s=>({normal:s.normal,threshold:.2})),{normal:world.landmarks.rose.normal,threshold:1.45},{normal:world.landmarks.beacon.normal,threshold:1.45}];
  const input=new Set(),camera={position:new Vector3(0,15,20)};
  let elapsed=0;
  for(const [index,destination] of destinations.entries()){
    player.goTo(destination.normal);
    let reached=false;
    for(let frame=0;frame<1800;frame++){
      elapsed+=1/60;player.update(1/60,elapsed,input,camera,world.objects,true);
      for(const object of world.objects){assert.ok(player.normal.angleTo(object.normal)*RADIUS>=object.radius+.22-1e-6,'player entered a prop collider');}
      if(player.normal.angleTo(destination.normal)*RADIUS<destination.threshold){reached=true;player.cancel();break;}
    }
    assert.ok(reached,`destination ${index+1} is unreachable`);
    assert.ok(Math.abs(player.normal.length()-1)<1e-10);
    assert.ok(player.root.position.toArray().every(Number.isFinite));
  }
});

test('jump returns to ground and paused play keeps the character in place',()=>{
  const player=createPlayer(new Scene()),camera={position:new Vector3(0,15,20)},input=new Set();
  const ground=player.root.position.length();player.jump();
  for(let i=0;i<15;i++)player.update(1/60,i/60,input,camera,[],true);
  assert.ok(player.root.position.length()>ground+.1);
  for(let i=0;i<120;i++)player.update(1/60,i/60,input,camera,[],true);
  assert.ok(Math.abs(player.root.position.length()-ground)<1e-10);
  const before=player.root.position.clone();input.add('KeyW');
  for(let i=0;i<60;i++)player.update(1/60,i/60,input,camera,[],false);
  assert.ok(player.root.position.distanceTo(before)<1e-10);
});
