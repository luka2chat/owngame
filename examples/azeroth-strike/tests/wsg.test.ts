import { describe, expect, it } from 'vitest'
import { WSG, WsgMatch } from '../src/game/rules/wsg'
import type { Combatant, Team } from '../src/game/teams'

const A = { x: 0, y: 0, z: 0 }
const H = { x: 100, y: 0, z: 0 }
const person = (id: number, team: Team, x: number, alive = true): Combatant => ({ id, team, pos: { x, y: 0, z: 0 }, alive })

function match() {
  return new WsgMatch({ alliance: A, horde: H })
}

describe('Warsong Gulch rules', () => {
  it('picks up the enemy flag by touching it, not your own', () => {
    const m = match()
    m.update(0.1, [person(1, 'alliance', 0), person(2, 'horde', 100)])
    expect(m.flags.alliance.status).toBe('base')
    expect(m.flags.horde.status).toBe('base')
    m.update(0.1, [person(1, 'alliance', 100)])
    expect(m.flags.horde.status).toBe('carried')
    expect(m.carrying(1)).toBe('horde')
  })

  it('captures only while your own flag is at home', () => {
    const m = match()
    m.update(0.1, [person(1, 'alliance', 100), person(2, 'horde', 0)])
    expect(m.flags.horde.status).toBe('carried')
    expect(m.flags.alliance.status).toBe('carried')
    // Alliance carrier home, but their flag is out: no capture.
    m.update(0.1, [person(1, 'alliance', 0), person(2, 'horde', 50)])
    expect(m.score.alliance).toBe(0)
    // Horde carrier dies: alliance flag dropped, a defender returns it, then the capture works.
    m.dropFrom(2, { x: 50, y: 0, z: 0 })
    m.update(0.1, [person(1, 'alliance', 20), person(3, 'alliance', 50)])
    expect(m.flags.alliance.status).toBe('base')
    expect(m.score.alliance).toBe(0)
    m.update(0.1, [person(1, 'alliance', 0)])
    expect(m.score.alliance).toBe(1)
    expect(m.lastCapture).toBe('alliance')
  })

  it('dropped flags can be re-taken (not by the dropper for 3 s) and return after 10 s', () => {
    const m = match()
    m.update(0.1, [person(1, 'alliance', 100)])
    m.dropFrom(1, { x: 60, y: 0, z: 0 })
    m.update(1, [person(1, 'alliance', 60)])
    expect(m.flags.horde.status).toBe('dropped')
    m.update(2.5, [person(1, 'alliance', 60)])
    expect(m.flags.horde.status).toBe('carried')
    m.dropFrom(1, { x: 60, y: 0, z: 0 })
    m.update(WSG.droppedReturn + 0.1, [])
    expect(m.flags.horde.status).toBe('base')
  })

  it('both flags respawn 20 s after a capture; 3 captures win', () => {
    const m = match()
    for (let cap = 1; cap <= 3; cap++) {
      m.update(0.1, [person(1, 'alliance', 100)])
      m.update(0.1, [person(1, 'alliance', 0)])
      expect(m.score.alliance).toBe(cap)
      if (cap < 3) {
        expect(m.flags.horde.status).toBe('respawning')
        m.update(WSG.respawnAfterCapture + 0.1, [])
        expect(m.flags.horde.status).toBe('base')
      }
    }
    expect(m.result?.winner).toBe('alliance')
  })

  it('times out after 20 minutes: more caps wins, tie goes to the last capture, 0-0 is a draw', () => {
    const draw = match()
    draw.update(WSG.timeLimit + 1, [])
    expect(draw.result).toEqual({ winner: null, reason: { key: 'result.wsgNone' } })

    const tie = match()
    tie.update(0.1, [person(1, 'alliance', 100)])
    tie.update(0.1, [person(1, 'alliance', 0)])
    tie.update(WSG.respawnAfterCapture + 1, [])
    tie.update(0.1, [person(2, 'horde', 0)])
    tie.update(0.1, [person(2, 'horde', 100)])
    expect(tie.score).toEqual({ alliance: 1, horde: 1 })
    tie.update(WSG.timeLimit, [])
    expect(tie.result?.winner).toBe('horde')
  })

  it('stacks Focused Assault on carriers once both flags are held for a minute', () => {
    const m = match()
    m.update(0.1, [person(1, 'alliance', 100), person(2, 'horde', 0)])
    expect(m.damageTakenMultiplier(1)).toBe(1)
    m.update(WSG.assaultDelay, [person(1, 'alliance', 90), person(2, 'horde', 10)])
    expect(m.assaultStacks).toBe(1)
    expect(m.damageTakenMultiplier(1)).toBeCloseTo(1.1)
    m.update(WSG.assaultInterval * 6, [person(1, 'alliance', 90), person(2, 'horde', 10)])
    expect(m.assaultStacks).toBe(7)
    expect(m.speedMultiplier(2)).toBeLessThan(1)
    expect(m.damageTakenMultiplier(3)).toBe(1)
  })
})
