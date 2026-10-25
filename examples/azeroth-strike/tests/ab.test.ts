import { describe, expect, it } from 'vitest'
import { AB, AbMatch } from '../src/game/rules/ab'
import type { Combatant, Team } from '../src/game/teams'

const NODES = ['stables', 'blacksmith', 'farm', 'mine', 'lumber'].map((id, i) => ({ id, pos: { x: i * 100, y: 0, z: 0 } }))
const at = (id: number, team: Team, node: number): Combatant => ({ id, team, pos: { x: node * 100, y: 0, z: 0 }, alive: true })

function assault(m: AbMatch, who: Combatant, node: string) {
  expect(m.startChannel(who, node)).toBe(true)
  m.update(AB.channel + 0.01, [who])
}

describe('Arathi Basin rules', () => {
  it('needs a 6 s uninterrupted channel to assault, then 60 s to capture', () => {
    const m = new AbMatch(NODES)
    const p = at(1, 'alliance', 0)
    m.startChannel(p, 'stables')
    m.update(3, [p])
    m.interrupt(1)
    m.update(4, [p])
    expect(m.node('stables').assaulter).toBe(null)
    assault(m, p, 'stables')
    expect(m.node('stables').assaulter).toBe('alliance')
    expect(m.controlled('alliance')).toBe(0)
    m.update(AB.contest, [])
    expect(m.node('stables').owner).toBe('alliance')
    expect(m.controlled('alliance')).toBe(1)
  })

  it('leaving the banner breaks the channel', () => {
    const m = new AbMatch(NODES)
    m.startChannel(at(1, 'horde', 2), 'farm')
    m.update(AB.channel + 1, [at(1, 'horde', 3)])
    expect(m.node('farm').assaulter).toBe(null)
  })

  it('the previous owner retakes a contested node instantly', () => {
    const m = new AbMatch(NODES)
    assault(m, at(1, 'alliance', 1), 'blacksmith')
    m.update(AB.contest, [])
    assault(m, at(2, 'horde', 1), 'blacksmith')
    expect(m.node('blacksmith').assaulter).toBe('horde')
    expect(m.controlled('alliance')).toBe(0)
    assault(m, at(3, 'alliance', 1), 'blacksmith')
    expect(m.node('blacksmith').assaulter).toBe(null)
    expect(m.node('blacksmith').owner).toBe('alliance')
  })

  it('earns 2/3/4/7/60 resources per 2 s tick and wins at 1500', () => {
    const m = new AbMatch(NODES)
    const owned = (n: number) => {
      m.nodes.forEach((node, i) => {
        node.owner = i < n ? 'alliance' : null
        node.assaulter = null
      })
    }
    for (const [n, gain] of [[1, 2], [2, 3], [3, 4], [4, 7], [5, 60]]) {
      owned(n)
      const before = m.resources.alliance
      m.update(AB.tick, [])
      expect(m.resources.alliance - before).toBe(gain)
    }
    owned(5)
    for (let i = 0; i < 30 && !m.result; i++) m.update(AB.tick, [])
    expect(m.resources.alliance).toBe(AB.win)
    expect(m.result?.winner).toBe('alliance')
    expect(m.resources.horde).toBe(0)
  })
})
