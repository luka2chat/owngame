import { describe, expect, it } from 'vitest'
import { BUFFS, Buffs } from '../src/game/rules/buffs'
import type { Combatant } from '../src/game/teams'

const at = (id: number, x: number, alive = true): Combatant => ({ id, team: 'alliance', pos: { x, y: 0, z: 0 }, alive })
const always = () => true

describe('buff runes', () => {
  it('the first living person to touch a ready rune takes it, then it comes back after the respawn time', () => {
    const b = new Buffs([{ pos: { x: 0, y: 0, z: 0 }, kinds: ['speed'] }])
    b.update(0.1, [at(1, 5), at(2, 0.5, false)], always)
    expect(b.events).toEqual([])
    b.update(0.1, [at(3, 1)], always)
    expect(b.events).toEqual([{ type: 'take', spot: 0, kind: 'speed', by: 3 }])
    expect(b.ready(b.spots[0])).toBe(false)
    b.events.length = 0
    b.update(BUFFS.respawn - 1, [at(4, 0)], always)
    expect(b.events).toEqual([])
    b.update(1.01, [], always)
    expect(b.events).toEqual([{ type: 'spawn', spot: 0, kind: 'speed' }])
    expect(b.ready(b.spots[0])).toBe(true)
  })

  it('someone who does not want the rune (full health) leaves it for the next person', () => {
    const b = new Buffs([{ pos: { x: 0, y: 0, z: 0 }, kinds: ['heal'] }])
    b.update(0.1, [at(1, 0), at(2, 1)], id => id === 2)
    expect(b.events).toEqual([{ type: 'take', spot: 0, kind: 'heal', by: 2 }])
  })

  it('spots with several kinds roll one each time they come back', () => {
    let r = 0
    const b = new Buffs([{ pos: { x: 0, y: 0, z: 0 }, kinds: ['heal', 'speed'] }], () => r)
    expect(b.spots[0].kind).toBe('heal')
    b.update(0.1, [at(1, 0)], always)
    r = 0.9
    b.update(BUFFS.respawn + 0.1, [], always)
    expect(b.spots[0].kind).toBe('speed')
  })
})
