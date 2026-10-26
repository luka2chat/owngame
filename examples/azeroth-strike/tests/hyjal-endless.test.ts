import { beforeAll, describe, expect, it } from 'vitest'
import { HyjalMatch, waveOrders } from '../src/game/rules/hyjal'
import { Agent } from '../src/game/agent'
import { Game } from '../src/game/game'
import { initPhysics, Physics } from '../src/engine/physics'

beforeAll(initPhysics)
describe('Hyjal unlimited fire', () => {
  it('continues through 200 waves with a boss every ninth wave, then ends only on core loss', () => {
    const match = new HyjalMatch('normal', 'endless')
    for (let wave = 1; wave <= 200; wave++) {
      match.next()
      const orders = match.update(120)
      expect(orders.length).toBeGreaterThan(0)
      expect(orders.filter(o => o.kind === 'boss')).toHaveLength(wave % 9 === 0 ? 1 : 0)
      expect(match.wave).toBe(wave)
      while (match.alive) match.killed()
      match.update(.01)
      expect(match.state).toBe('break')
      expect(match.events.some(e => e.type === 'won')).toBe(false)
      match.events.splice(0)
    }
    expect(match.totalLabel).toBe('∞')
    match.hit(match.maxHp)
    expect(match.state).toBe('lost')
    expect(match.update(120)).toEqual([])
    expect(new HyjalMatch('normal', 'endless').wave).toBe(0)
  })
  it('escalates between rounds but bounds enemy count, health, speed and damage', () => {
    for (const difficulty of ['easy','normal','hard'] as const) {
      expect(waveOrders(10,difficulty,true).length).toBeGreaterThan(waveOrders(1,difficulty,true).length)
      expect(waveOrders(10,difficulty)).toEqual([])
      for (const wave of [10,18,19,999999]) {
        const orders=waveOrders(wave,difficulty,true)
        expect(orders.length).toBeLessThanOrEqual(60)
        expect(orders.every(o=>o.lane>=0&&o.lane<3)).toBe(true)
      }
      const m=new HyjalMatch(difficulty,'endless'),base=new HyjalMatch(difficulty)
      m.wave=100000
      expect(m.tuning.hp).toBeLessThanOrEqual(base.tuning.hp*4)
      expect(m.tuning.damage).toBeLessThanOrEqual(base.tuning.damage*2)
      expect(m.tuning.speed).toBeLessThanOrEqual(base.tuning.speed*1.2)
    }
  })
  it('keeps permanent ammo and damage after time, switching and respawn, without affecting a new normal player', () => {
    const physics=new Physics(),a=new Agent('alliance',()=>'',true,physics,null)
    try {
      a.powers.unlimitedFire=true
      for (const weapon of ['rifle','sniper','wand'] as const) {
        a.switchTo(weapon);a.updateWeapon(3);expect(a.weaponId).toBe(weapon);a.ammo=0
        for(let i=0;i<100;i++)a.consumeRound()
        a.startReload()
        expect(a.ammo).toBe(0);expect(a.canFire()).toBe(true);expect(a.reloading).toBe(false)
      }
      a.updateWeapon(36000)
      a.setAlive(false);a.setAlive(true);a.respawnLoadout()
      expect(a.powers.infiniteAmmo).toBe(true)
      expect(a.powers.damage).toBe(3)
      expect(a.powers.fireInterval).toBe(.5)
      a.grantPower('fury');a.powers.clear();expect(a.powers.damage).toBe(3)
      const normal=new Agent('alliance',()=>'',true,physics,null)
      normal.ammo=0;expect(normal.canFire()).toBe(false)
      expect(normal.powers.damage).toBe(1);expect(normal.powers.fireInterval).toBe(1)
      normal.dispose()
    } finally {a.dispose();physics.world.free()}
  })
  it('applies permanent triple damage through the actual combat adapter without multiplying fury again', () => {
    const physics=new Physics(),a=new Agent('alliance',()=>'',true,physics,null,1000),b=new Agent('horde',()=>'',false,physics,null,1000)
    try {
      const game={player:a,time:0,bots:new Map(),intels:{horde:{report(){}}},sounds:{hitConfirm(){},hurt(){}}} as unknown as Game
      a.powers.unlimitedFire=true;a.grantPower('fury')
      Game.prototype.damage.call(game,b,100,a)
      expect(b.hp).toBe(700)
    } finally {a.dispose();b.dispose();physics.world.free()}
  })
})
