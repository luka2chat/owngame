import { describe, expect, it } from 'vitest'
import { falloff } from '../src/game/combat'
import { LOADOUT, WEAPONS } from '../src/game/weapons'

describe('weapons', () => {
  it('has one weapon per slot 1-4 with distinct roles', () => {
    expect(LOADOUT.map(id => WEAPONS[id].slot)).toEqual([1, 2, 3, 4])
    expect(new Set(LOADOUT.map(id => WEAPONS[id].mode)).size).toBe(4)
    for (const id of LOADOUT) {
      const w = WEAPONS[id]
      expect(w.draw).toBeGreaterThan(0)
      expect(w.holster).toBeGreaterThan(0)
      expect(w.view.hip).toHaveLength(3)
    }
  })

  it('sniper headshots kill a bot at any range but body shots do not; rifle keeps damage at range', () => {
    const sn = WEAPONS.sniper
    const rifle = WEAPONS.rifle
    expect(sn.damage * sn.headMultiplier * falloff(sn.range, sn)).toBeGreaterThanOrEqual(100)
    expect(sn.damage * falloff(5, sn)).toBeLessThan(100)
    expect(falloff(300, sn)).toBe(1)
    expect(sn.magazine).toBeLessThan(rifle.magazine / 4)
    const zoom = sn.view.zoomFovs!
    expect(zoom[0]).toBe(sn.view.adsFov)
    expect([...zoom].sort((a, b) => b - a)).toEqual(zoom)
    expect(falloff(60, rifle)).toBe(1)
    expect(falloff(rifle.range, rifle)).toBeCloseTo(rifle.minFactor)
  })

  it('dagger heavy stab and backstab kill from behind', () => {
    const d = WEAPONS.dagger
    expect(d.heavy!.damage * d.backstab!).toBeGreaterThanOrEqual(100)
    expect(d.damage).toBeLessThan(100)
  })
})
