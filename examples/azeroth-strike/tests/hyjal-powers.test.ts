import {beforeAll, describe,expect,it} from 'vitest'
import {BattlePowers,PowerSchedule,POWERS,POWER_KINDS} from '../src/game/rules/hyjal-powers'
import {waveOrders,DEFENSE_DIFFICULTY,HyjalMatch} from '../src/game/rules/hyjal'
import {Agent} from '../src/game/agent'
import {initPhysics,Physics} from '../src/engine/physics'
import {Game} from '../src/game/game'

beforeAll(initPhysics)
describe('Hyjal escalation',()=>{
 it('keeps all four arrival types and a single final boss at every difficulty',()=>{
  for(const difficulty of ['easy','normal','hard'] as const) {
   const all=Array.from({length:9},(_,i)=>waveOrders(i+1,difficulty)).flat()
   expect(new Set(all.map(o=>o.arrival))).toEqual(new Set(['ground','burrow','air','meteor']))
   expect(new Set(all.map(o=>o.lane)).size).toBe(3)
   expect(all.filter(o=>o.kind==='boss')).toHaveLength(1)
   expect(all.some(o=>o.elite)).toBe(true)
   expect(waveOrders(1,difficulty).every(o=>o.arrival==='ground')).toBe(true)
   expect(waveOrders(4,difficulty).some(o=>o.kind==='flyer')).toBe(true)
  }
 })
 it('easy-mode clear repairs chip damage without removing the manual repair budget',()=>{
  const m=new HyjalMatch('easy');m.next();m.update(30);m.hit(500)
  while(m.alive)m.killed()
  m.update(.01);expect(m.state).toBe('break');expect(m.hp).toBe(1450)
  expect(m.repair(100)).toBe(300);expect(m.hp).toBe(1750)
 })
 it('changes enemy count, pacing, damage and supply cadence across difficulty',()=>{
  expect(waveOrders(8,'hard').length).toBeGreaterThan(waveOrders(8,'normal').length)
  expect(waveOrders(8,'normal').length).toBeGreaterThan(waveOrders(8,'easy').length)
  expect(DEFENSE_DIFFICULTY.hard.damage).toBeGreaterThan(DEFENSE_DIFFICULTY.normal.damage)
  expect(DEFENSE_DIFFICULTY.hard.power).toBeGreaterThan(DEFENSE_DIFFICULTY.easy.power)
  const easy=new HyjalMatch('easy'),hard=new HyjalMatch('hard');easy.next();hard.next()
  expect(hard.update(3).length).toBeGreaterThan(easy.update(3).length)
 })
})
describe('temporary power lifecycle',()=>{
 it('refreshes without increasing potency, combines different powers and expires exactly',()=>{
  const p=new BattlePowers();p.grant('ammo');p.grant('fury');p.update(5);p.grant('fury')
  expect(p.damage).toBe(3);expect(p.left.fury).toBe(15);expect(p.left.ammo).toBe(13)
  p.update(13);expect(p.infiniteAmmo).toBe(false);expect(p.damage).toBe(3)
  p.update(2);expect(p.damage).toBe(1)
  for(const kind of POWER_KINDS)p.grant(kind)
  p.update(NaN);p.update(-10);expect(p.left.ammo).toBe(POWERS.ammo.seconds)
  p.clear();expect(Object.values(p.left).every(v=>v===0)).toBe(true)
 })
 it('rotates drops across space and time; dead players cannot consume or steal them',()=>{
  const clock=new PowerSchedule(22,4)
  expect(clock.update(9)).toHaveLength(0)
  const drop=clock.update(1)[0];expect(drop.kind).toBe('ammo')
  expect(clock.take(drop.id,false)).toBe(null);expect(clock.drops).toHaveLength(1)
  expect(clock.take(drop.id,true)).toBe('ammo');expect(clock.take(drop.id,true)).toBe(null)
  expect(clock.update(22)[0]).toMatchObject({kind:'fury',slot:1})
  expect(clock.update(22)[0]).toMatchObject({kind:'ward',slot:2})
  expect(clock.update(22)[0]).toMatchObject({kind:'sprint',slot:3})
  expect(clock.update(22)[0]).toMatchObject({kind:'ammo',slot:0})
  expect(clock.drops.every(d=>d.expires>clock.time)).toBe(true)
 })
 it('does not revive expired drops after a long tick, or accumulate infinite drops',()=>{
  const clock=new PowerSchedule(22,4);clock.update(300)
  expect(clock.drops.length).toBeLessThanOrEqual(2)
  expect(clock.drops.every(d=>d.expires>300)).toBe(true)
  clock.clear();expect(clock.drops).toEqual([])
 })
 it('lets an empty gun fire without reloading or spending ammunition, across weapon changes',()=>{
  const physics=new Physics(),a=new Agent('alliance',()=>'',true,physics,null)
  a.ammo=0;a.startReload();a.grantPower('ammo')
  expect(a.reloading).toBe(false);expect(a.canFire()).toBe(true)
  for(let i=0;i<200;i++)a.consumeRound()
  expect(a.ammo).toBe(0);a.startReload();expect(a.reloading).toBe(false)
  a.switchTo('sniper');a.ammo=0;a.updateWeapon(2)
  expect(a.canFire()).toBe(true);a.consumeRound();expect(a.ammo).toBe(0)
  a.updateWeapon(16);expect(a.canFire()).toBe(false)
  a.startReload();expect(a.reloading).toBe(true)
  a.grantPower('fury');a.grantPower('ward');a.grantPower('sprint');a.setAlive(false)
  expect(Object.values(a.powers.left).every(v=>v===0)).toBe(true)
  a.setAlive(true);a.respawnLoadout();expect(a.powers.damage).toBe(1)
  a.dispose();physics.world.free()
 })
 it('applies triple damage and the 65% shield through the real combat damage adapter',()=>{
  const physics=new Physics(),a=new Agent('alliance',()=>'',true,physics,null,1000),b=new Agent('horde',()=>'',false,physics,null,1000)
  const game={player:a,time:0,bots:new Map(),intels:{horde:{report(){}}},sounds:{hitConfirm(){},hurt(){}}} as unknown as Game
  a.grantPower('fury');b.grantPower('ward')
  Game.prototype.damage.call(game,b,100,a)
  expect(b.hp).toBeCloseTo(895);expect(a.stats.damage).toBeCloseTo(105)
  a.powers.clear();b.powers.clear();Game.prototype.damage.call(game,b,100,a)
  expect(b.hp).toBeCloseTo(795)
  a.dispose();b.dispose();physics.world.free()
 })
})
