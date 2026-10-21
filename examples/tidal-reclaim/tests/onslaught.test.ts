import { describe, expect, it } from 'vitest'
import {
  MAX_ALIVE,
  PERKS,
  RANKS,
  WAVES,
  awardStyle,
  decayStyle,
  hurtStyle,
  newStyle,
  offerPerks,
  perkEffects,
  spawnOrder,
  waveSize,
  type StyleState,
} from '../src/game/onslaught'

/** Deterministic PRNG so shuffles are reproducible. */
const seeded = (seed: number) => () => {
  seed = (seed * 1664525 + 1013904223) % 4294967296
  return seed / 4294967296
}

describe('style meter', () => {
  it('fills, ranks up, scores with the current multiplier and charges overdrive', () => {
    let s = newStyle()
    const g = awardStyle(s, 'kill')
    expect(g.points).toBeGreaterThan(0)
    expect(g.state.score).toBe(g.points) // rank D multiplier = 1
    expect(g.state.overdrive).toBeGreaterThan(0)
    expect(g.state.grace).toBeGreaterThan(0)
    s = g.state
    let ups = 0
    for (let i = 0; i < 60 && s.rank < 3; i += 1) {
      const r = awardStyle(s, 'headshot')
      if (r.rankedUp) ups += 1
      s = r.state
    }
    expect(s.rank).toBeGreaterThanOrEqual(3)
    expect(ups).toBeGreaterThan(0)
    expect(s.best).toBe(s.rank)
    expect(s.overdrive).toBeLessThanOrEqual(1)
  })

  it('never exceeds the top rank and clamps fill there', () => {
    let s: StyleState = { ...newStyle(), rank: RANKS.length - 1, fill: 95 }
    for (let i = 0; i < 10; i += 1) s = awardStyle(s, 'boss').state
    expect(s.rank).toBe(RANKS.length - 1)
    expect(s.fill).toBeLessThanOrEqual(100)
  })

  it('decays only after the grace period and drops a rank to partial fill when empty', () => {
    let s: StyleState = { ...newStyle(), rank: 2, fill: 3, grace: 0.5 }
    s = decayStyle(s, 0.3)
    expect(s.fill).toBe(3)
    expect(s.grace).toBeCloseTo(0.2)
    s = decayStyle({ ...s, grace: 0 }, 1)
    expect(s.rank).toBe(1)
    expect(s.fill).toBeGreaterThan(40)
    expect(decayStyle({ ...newStyle(), fill: 1 }, 5).fill).toBe(0)
  })

  it('taking a hit costs a rank, or meter at rank D', () => {
    expect(hurtStyle({ ...newStyle(), rank: 3, fill: 80 }).rank).toBe(2)
    expect(hurtStyle({ ...newStyle(), rank: 0, fill: 50 }).fill).toBe(15)
    expect(hurtStyle({ ...newStyle(), rank: 0, fill: 10 }).fill).toBe(0)
  })
})

describe('waves', () => {
  it('has three station defenses with progressively staged opponents', () => {
    expect(WAVES).toHaveLength(3)
    expect(WAVES[2].counts.juggernaut).toBe(1)
    for (let i = 1; i < WAVES.length; i += 1) expect(WAVES[i].stage).toBeGreaterThanOrEqual(WAVES[i - 1].stage)
    expect(WAVES[0].stage).toBe(1)
    expect(MAX_ALIVE).toBeGreaterThan(0)
  })

  it('spawn order contains exactly the planned enemies, boss first, Scrapper opener', () => {
    for (const [i, plan] of WAVES.entries()) {
      const order = spawnOrder(plan, seeded(i + 1))
      expect(order).toHaveLength(waveSize(plan))
      for (const [kind, n] of Object.entries(plan.counts)) expect(order.filter(k => k === kind)).toHaveLength(n ?? 0)
      if (plan.counts.titan) expect(order[0]).toBe('titan')
      else if ((plan.counts.scrapper ?? 0) >= 2) expect(order.slice(0, 2)).toEqual(['scrapper', 'scrapper'])
    }
  })

  it('does not open with a Juggernaut', () => {
    const plan = WAVES.find(w => w.counts.juggernaut && !w.counts.titan)!
    for (let seed = 1; seed < 20; seed += 1) expect(spawnOrder(plan, seeded(seed))[0]).not.toBe('juggernaut')
  })
})

describe('perks', () => {
  it('offers three distinct, non-maxed cards', () => {
    const offer = offerPerks({}, seeded(7))
    expect(offer).toHaveLength(3)
    expect(new Set(offer.map(p => p.id)).size).toBe(3)
    const maxed = Object.fromEntries(PERKS.slice(0, 6).map(p => [p.id, p.max]))
    const rest = offerPerks(maxed, seeded(3))
    expect(rest).toHaveLength(2)
    for (const p of rest) expect(maxed[p.id]).toBeUndefined()
  })

  it('computes stacked effects', () => {
    const base = perkEffects({})
    expect(base.rifleDamage).toBe(1)
    expect(base.grenades).toBe(2)
    expect(base.maxArmor).toBe(150)
    const e = perkEffects({ hollow: 2, plated: 1, demolitions: 2, vampire: 3, choke: 1 })
    expect(e.rifleDamage).toBeCloseTo(1.4)
    expect(e.maxArmor).toBe(200)
    expect(e.grenades).toBe(4)
    expect(e.blast).toBeCloseTo(1.5)
    expect(e.vampire).toBe(15)
    expect(e.shotgunSpread).toBeCloseTo(0.7)
  })
})
