import { beforeAll, describe, expect, it } from 'vitest'
import { initPhysics, Physics } from '../src/engine/physics'
import { Agent, BODY, HASTE, PLAYER_HP } from '../src/game/agent'
import { WEAPONS } from '../src/game/weapons'

let physics: Physics
beforeAll(async () => {
  await initPhysics()
  physics = new Physics()
})

const make = (isPlayer = true) => new Agent('alliance', () => 'test', isPlayer, physics, null)
const run = (a: Agent, seconds: number) => {
  for (let i = 0; i < Math.round(seconds * 60); i++) a.updateWeapon(1 / 60)
}

describe('weapon switching', () => {
  it('holsters the old weapon, then draws the new one, and only then allows firing', () => {
    const a = make()
    expect(a.weaponId).toBe('rifle')
    expect(a.switchTo('sniper')).toBe(true)
    const holster = WEAPONS.rifle.holster
    const draw = WEAPONS.sniper.draw
    expect(a.switchTimer).toBeCloseTo(holster + draw)
    expect(a.canFire()).toBe(false)
    run(a, holster / 2)
    expect(a.switchPhase().holster).toBeGreaterThan(0.3)
    expect(a.switchPhase().draw).toBe(0)
    run(a, holster / 2 + draw / 2)
    expect(a.switchPhase().holster).toBe(1)
    expect(a.switchPhase().draw).toBeGreaterThan(0.3)
    expect(a.canFire()).toBe(false)
    run(a, draw)
    expect(a.switchTimer).toBe(0)
    expect(a.canFire()).toBe(true)
    expect(a.lastWeapon).toBe('rifle')
  })

  it('redirecting a switch puts away whatever is actually in the hands', () => {
    const midHolster = make()
    midHolster.switchTo('sniper')
    run(midHolster, WEAPONS.rifle.holster / 2)
    midHolster.switchTo('wand')
    expect(midHolster.switchFrom).toBe('rifle')

    const midDraw = make()
    midDraw.switchTo('sniper')
    run(midDraw, WEAPONS.rifle.holster + 0.1)
    midDraw.switchTo('wand')
    expect(midDraw.switchFrom).toBe('sniper')
    expect(midDraw.lastWeapon).toBe('sniper')
  })

  it('cycles through the loadout in slot order and wraps around', () => {
    const a = make()
    a.cycleWeapon(-1)
    expect(a.weaponId).toBe('dagger')
    a.cycleWeapon(1)
    expect(a.weaponId).toBe('rifle')
    a.cycleWeapon(1)
    expect(a.weaponId).toBe('sniper')
  })

  it('moves faster with the knife than with the sniper rifle', () => {
    const a = make()
    a.switchTo('dagger')
    expect(a.speed()).toBeGreaterThan(BODY.runSpeed)
    a.switchTo('sniper')
    expect(a.speed()).toBeLessThan(BODY.runSpeed)
  })

  it('the speed rune hastes until it wears off or we die', () => {
    const a = make()
    const base = a.speed()
    a.haste = HASTE.seconds
    expect(a.speed()).toBeCloseTo(base * HASTE.multiplier)
    a.setAlive(false)
    expect(a.haste).toBe(0)
  })

  it('player health defaults to 1000', () => {
    expect(PLAYER_HP.default).toBe(1000)
  })
})

describe('ammo and reloads', () => {
  it('keeps a separate magazine per weapon and reloads a magazine in one go', () => {
    const a = make()
    a.ammo = 3
    a.switchTo('wand')
    run(a, 1)
    expect(a.ammo).toBe(WEAPONS.wand.magazine)
    a.switchTo('rifle')
    run(a, 1)
    expect(a.ammo).toBe(3)
    a.startReload()
    expect(a.canFire()).toBe(false)
    run(a, WEAPONS.rifle.reload + 0.05)
    expect(a.ammo).toBe(WEAPONS.rifle.magazine)
    expect(a.reserve).toBe(WEAPONS.rifle.reserve - 27)
  })

  it('reloads the sniper rifle in one go and cannot fire mid-reload', () => {
    const a = make()
    a.switchTo('sniper')
    run(a, 2)
    a.ammo = 1
    a.startReload()
    run(a, WEAPONS.sniper.reload / 2)
    expect(a.canFire()).toBe(false)
    run(a, WEAPONS.sniper.reload / 2 + 0.05)
    expect(a.ammo).toBe(WEAPONS.sniper.magazine)
    expect(a.reloading).toBe(false)
    expect(a.reserve).toBe(WEAPONS.sniper.reserve - 4)
  })

  it('the sniper rifle is only accurate through the scope', () => {
    const a = make()
    a.switchTo('sniper')
    run(a, 2)
    a.grounded = true
    const hip = a.spread()
    a.aiming = true
    expect(a.spread()).toBeLessThan(hip / 20)
  })

  it('switching cancels a reload, and the knife never reloads', () => {
    const a = make()
    a.ammo = 10
    a.startReload()
    a.switchTo('dagger')
    expect(a.reloading).toBe(false)
    run(a, 1)
    a.startReload()
    expect(a.reloading).toBe(false)
    expect(a.canFire()).toBe(true)
    a.switchTo('rifle')
    run(a, 1)
    expect(a.ammo).toBe(10)
  })

  it('bots reload from a bottomless reserve; kills refill every gun', () => {
    const bot = make(false)
    bot.ammo = 0
    bot.startReload()
    run(bot, WEAPONS.rifle.reload + 0.05)
    expect(bot.ammo).toBe(WEAPONS.rifle.magazine)
    expect(bot.reserve).toBe(WEAPONS.rifle.reserve)

    const a = make()
    a.refill()
    expect(a.ammoFor('rifle').reserve).toBe(WEAPONS.rifle.reserve + WEAPONS.rifle.magazine)
    expect(a.ammoFor('sniper').reserve).toBe(WEAPONS.sniper.reserve + WEAPONS.sniper.magazine)
    for (let i = 0; i < 20; i++) a.refill()
    expect(a.ammoFor('wand').reserve).toBe(WEAPONS.wand.reserve * 2)
  })
})
