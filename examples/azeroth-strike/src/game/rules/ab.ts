import { type Combatant, type MatchResult, type Team, type Vec3, dist } from '../teams'

/**
 * Arathi Basin rules, as on retail:
 * - five resource nodes; standing at a node's banner and channelling for 6 s (interrupted by
 *   damage or leaving) assaults it; an assaulted node is contested for 60 s and then belongs to the
 *   assaulting team; the previous owner can retake a contested node instantly by channelling it;
 * - a node earns nothing while contested;
 * - every 2 s each team gains 2/3/4/7/60 resources for 1/2/3/4/5 controlled nodes;
 * - first team to 1500 resources wins.
 */
export const AB = {
  win: 1500,
  tick: 2,
  perTick: [0, 2, 3, 4, 7, 60],
  channel: 6,
  contest: 60,
  radius: 4.5,
} as const

export type NodeState = {
  id: string
  pos: Vec3
  /** Team currently earning from it (only while not contested). */
  owner: Team | null
  /** Team whose assault is in progress, null when not contested. */
  assaulter: Team | null
  timer: number
}

export type AbEvent =
  | { type: 'assault'; node: string; team: Team; by: number }
  | { type: 'defend'; node: string; team: Team; by: number }
  | { type: 'capture'; node: string; team: Team }
  | { type: 'end'; result: MatchResult }

export type Channel = { node: string; t: number }

export class AbMatch {
  readonly nodes: NodeState[]
  readonly resources: Record<Team, number> = { alliance: 0, horde: 0 }
  readonly channels = new Map<number, Channel>()
  result: MatchResult | null = null
  elapsed = 0
  private tickTimer: number = AB.tick
  readonly events: AbEvent[] = []

  constructor(nodes: { id: string; pos: Vec3 }[]) {
    this.nodes = nodes.map(n => ({ ...n, pos: { ...n.pos }, owner: null, assaulter: null, timer: 0 }))
  }

  node(id: string): NodeState {
    return this.nodes.find(n => n.id === id)!
  }

  controlled(team: Team): number {
    return this.nodes.filter(n => n.owner === team && n.assaulter === null).length
  }

  /** True when `team` channelling this node would change it. */
  canAssault(node: NodeState, team: Team): boolean {
    if (node.assaulter !== null) return node.assaulter !== team
    return node.owner !== team
  }

  /** Begin channelling (player pressed interact / bot decided). Returns false if not allowed. */
  startChannel(person: Combatant, nodeId: string): boolean {
    const node = this.node(nodeId)
    if (!person.alive || this.result || !this.canAssault(node, person.team) || dist(person.pos, node.pos) > AB.radius) return false
    if (!this.channels.has(person.id)) this.channels.set(person.id, { node: nodeId, t: 0 })
    return true
  }

  interrupt(id: number): void {
    this.channels.delete(id)
  }

  update(dt: number, people: readonly Combatant[]): void {
    if (this.result) return
    this.elapsed += dt
    const byId = new Map(people.map(p => [p.id, p]))

    for (const [id, ch] of this.channels) {
      const p = byId.get(id)
      const node = this.node(ch.node)
      if (!p || !p.alive || dist(p.pos, node.pos) > AB.radius || !this.canAssault(node, p.team)) {
        this.channels.delete(id)
        continue
      }
      ch.t += dt
      if (ch.t < AB.channel) continue
      this.channels.delete(id)
      if (node.assaulter !== null && node.owner === p.team) {
        node.assaulter = null
        node.timer = 0
        this.events.push({ type: 'defend', node: node.id, team: p.team, by: id })
      } else {
        node.assaulter = p.team
        node.timer = AB.contest
        this.events.push({ type: 'assault', node: node.id, team: p.team, by: id })
      }
      // Anyone else channelling this node now targets a different state; restart them.
      for (const [other, c] of this.channels) if (c.node === node.id) this.channels.delete(other)
    }

    for (const node of this.nodes) {
      if (node.assaulter === null) continue
      node.timer -= dt
      if (node.timer <= 0) {
        node.owner = node.assaulter
        node.assaulter = null
        node.timer = 0
        this.events.push({ type: 'capture', node: node.id, team: node.owner })
      }
    }

    this.tickTimer -= dt
    while (this.tickTimer <= 0) {
      this.tickTimer += AB.tick
      for (const team of ['alliance', 'horde'] as const) {
        this.resources[team] = Math.min(AB.win, this.resources[team] + AB.perTick[this.controlled(team)])
      }
      const a = this.resources.alliance >= AB.win
      const h = this.resources.horde >= AB.win
      if (a || h) {
        const winner: Team | null = a && h ? null : a ? 'alliance' : 'horde'
        this.result = { winner, reason: winner ? { key: 'result.abWin', params: { team: winner, n: AB.win } } : { key: 'result.abDraw' } }
        this.events.push({ type: 'end', result: this.result })
        break
      }
    }
  }
}
