import { describe, expect, it } from 'vitest'
import { applyDamage, createMatch, formatClock, placement, registerKill, splashDamage, tick, PLAYER_ID } from '../src/game/rules'

const bots = ['VIPER', 'HAVOC', 'WRAITH']

describe('deathmatch rules', () => {
  it('counts frags, deaths and first blood', () => {
    const s = createMatch(bots, 360, 20)
    const r = registerKill(s, { killer: PLAYER_ID, victim: 1 })
    expect(r.medals).toContain('first')
    expect(r.state.combatants[0].kills).toBe(1)
    expect(r.state.combatants[1].deaths).toBe(1)
    const r2 = registerKill(r.state, { killer: 2, victim: 3 })
    expect(r2.medals).toEqual([])
  })

  it('awards double kills inside the multi-kill window and resets after it', () => {
    let s = createMatch(bots, 360, 20)
    s = registerKill(s, { killer: PLAYER_ID, victim: 1 }).state
    const r = registerKill(s, { killer: PLAYER_ID, victim: 2 })
    expect(r.medals).toContain('double')
    const later = tick(r.state, 5)
    expect(registerKill(later, { killer: PLAYER_ID, victim: 3 }).medals).not.toContain('triple')
  })

  it('suicide removes a frag without going negative', () => {
    let s = createMatch(bots, 360, 20)
    s = registerKill(s, { killer: PLAYER_ID, victim: PLAYER_ID }).state
    expect(s.combatants[0].kills).toBe(0)
    expect(s.combatants[0].deaths).toBe(1)
  })

  it('awards revenge on the last bot that killed the player', () => {
    let s = createMatch(bots, 360, 20)
    s = registerKill(s, { killer: 2, victim: PLAYER_ID }).state
    expect(registerKill(s, { killer: PLAYER_ID, victim: 2 }).medals).toContain('revenge')
  })

  it('ends on the frag limit and on time with the correct outcome', () => {
    let s = createMatch(bots, 360, 2)
    s = registerKill(s, { killer: PLAYER_ID, victim: 1 }).state
    s = registerKill(s, { killer: PLAYER_ID, victim: 2 }).state
    expect(s.phase).toBe('won')
    expect(s.endReason).toBe('frags')
    expect(s.score).toBeGreaterThan(0)

    let t = createMatch(bots, 10, 20)
    t = registerKill(t, { killer: 1, victim: PLAYER_ID }).state
    t = tick(t, 11)
    expect(t.phase).toBe('lost')
    expect(t.endReason).toBe('time')
    expect(placement(t)).toBeGreaterThan(1)
    // Finished matches ignore further events.
    expect(registerKill(t, { killer: PLAYER_ID, victim: 1 }).state).toBe(t)
  })

  it('player wins ties on placement', () => {
    let s = createMatch(bots, 360, 20)
    s = registerKill(s, { killer: PLAYER_ID, victim: 1 }).state
    s = registerKill(s, { killer: 2, victim: 3 }).state
    expect(placement(s)).toBe(1)
  })

  it('armor absorbs part of the damage until depleted', () => {
    expect(applyDamage(100, 0, 30, 0.6)).toEqual({ health: 70, armor: 0 })
    const a = applyDamage(100, 50, 30, 0.6)
    expect(a.armor).toBeCloseTo(32)
    expect(a.health).toBeCloseTo(88)
    const b = applyDamage(100, 5, 30, 0.6)
    expect(b.armor).toBe(0)
    expect(b.health).toBeCloseTo(75)
  })

  it('splash damage falls off and is zero outside the radius', () => {
    expect(splashDamage(100, 6, 0)).toBeCloseTo(100)
    expect(splashDamage(100, 6, 3)).toBeLessThan(100)
    expect(splashDamage(100, 6, 3)).toBeGreaterThan(25)
    expect(splashDamage(100, 6, 6)).toBe(0)
  })

  it('formats the match clock', () => {
    expect(formatClock(360)).toBe('6:00')
    expect(formatClock(59.2)).toBe('1:00')
    expect(formatClock(-3)).toBe('0:00')
  })
})
