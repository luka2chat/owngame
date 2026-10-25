import { describe, it, expect } from 'vitest'
import { HyjalMatch, HYJAL_WAVES } from '../src/game/rules/hyjal'
describe('Hyjal defense', () => {
 it('does not clear while enemies are queued or alive, and wins only after the boss wave', () => {
  const m=new HyjalMatch()
  for(let wave=1;wave<=HYJAL_WAVES.length;wave++) {
   m.next();const first=m.update(.01);expect(first).toHaveLength(1);expect(m.wave).toBe(wave)
   m.killed();m.update(.01);expect(m.state).toBe('wave')
   for(let i=0;i<1000 && m.state==='wave';i++) { m.update(.7); while(m.alive)m.killed() }
   expect(m.state).toBe(wave===HYJAL_WAVES.length?'won':'break')
  }
  expect(m.kills).toBe(HYJAL_WAVES.flat().length)
 })
 it('core destruction takes priority over final clear; terminal results cannot change', () => {
  const m=new HyjalMatch(); m.next();m.update(30);m.hit(100000)
  expect(m.state).toBe('lost');expect(m.hp).toBe(0);expect(m.update(100)).toEqual([])
  m.killed();m.next();m.repair(100);expect(m.state).toBe('lost');expect(m.hp).toBe(0)
 })
 it('repair is limited to breaks and to the per-break budget', () => {
  const m=new HyjalMatch();m.hit(500);expect(m.repair(100)).toBe(300)
  expect(m.repair(100)).toBe(0);m.next();m.update(.1);expect(m.repair(100)).toBe(0)
 })
 it('uses only the time left after a preparation boundary for spawning', () => {
  const a=new HyjalMatch(),b=new HyjalMatch()
  const one=a.update(18).length
  let split=0;for(let i=0;i<18;i++)split+=b.update(1).length
  expect(one).toBe(split);expect(a.alive).toBe(b.alive)
 })
 it('spawning is independent of update size, and ignores invalid time and damage', () => {
  const a=new HyjalMatch(),b=new HyjalMatch();a.next();b.next()
  const one=a.update(3).length;let split=0;for(let i=0;i<30;i++)split+=b.update(.1).length
  expect(one).toBe(split);a.hit(-20);a.hit(NaN);a.update(NaN);expect(a.hp).toBe(a.maxHp)
 })
})
