/** Pure defense rules: no rendering, browser state or frame-rate dependence. */
export type MonsterKind = 'fiend' | 'guard' | 'brute' | 'boss' | 'flyer'
export const MONSTERS = {
  fiend: { hp: 90, speed: 6.4, damage: 18, interval: 1.3, height: 1.8, reward: 1 },
  guard: { hp: 160, speed: 5.4, damage: 28, interval: 1.5, height: 2.3, reward: 1 },
  brute: { hp: 420, speed: 3.7, damage: 65, interval: 2, height: 3.2, reward: 2 },
  flyer: { hp: 140, speed: 7.2, damage: 24, interval: 2, height: 2.2, reward: 2 },
  boss: { hp: 3000, speed: 3.2, damage: 110, interval: 2, height: 5, reward: 8 },
} as const
export type Arrival = 'ground' | 'burrow' | 'air' | 'meteor'
export type SpawnOrder = {kind:MonsterKind; arrival:Arrival; lane:number; elite:boolean}
export type DefenseDifficulty = 'easy'|'normal'|'hard'
export const DEFENSE_DIFFICULTY = {
  easy: { hp:.8, damage:.75, speed:.95, count:.8, spawn:.85, rest:22, power:22, warning:4, clearHeal:150 },
  normal: { hp:1, damage:1, speed:1, count:1, spawn:.7, rest:18, power:28, warning:3, clearHeal:0 },
  hard: { hp:1.3, damage:1.25, speed:1.1, count:1.2, spawn:.5, rest:13, power:34, warning:2.5, clearHeal:0 },
} as const
export const WAVE_NAMES = ['scout','pincer','burrow','sky','siege','rush','rain','eclipse','lord'] as const
const group = (kind:MonsterKind,n:number):MonsterKind[] => Array(n).fill(kind)
export const HYJAL_WAVES: readonly (readonly MonsterKind[])[] = [
  group('fiend',8),
  [...group('fiend',8),...group('guard',3)],
  [...group('fiend',10),...group('guard',4)],
  [...group('fiend',8),...group('flyer',4),...group('guard',2)],
  [...group('brute',3),...group('guard',6),...group('fiend',6)],
  [...group('fiend',15),...group('flyer',4),...group('guard',4)],
  [...group('brute',4),...group('flyer',5),...group('fiend',8)],
  [...group('guard',8),...group('flyer',6),...group('fiend',8),...group('brute',3)],
  ['boss',...group('fiend',8),...group('guard',4),...group('flyer',4),...group('brute',2)],
]
export function waveOrders(wave:number,difficulty:DefenseDifficulty):SpawnOrder[] {
  const base=HYJAL_WAVES[wave-1]
  if(!base)return []
  const kinds:MonsterKind[]=[]
  // Keep each wave's composition at every difficulty, and never duplicate the final boss.
  for(const kind of [...new Set(base)])kinds.push(...group(kind,kind==='boss'?1:Math.max(1,Math.round(base.filter(x=>x===kind).length*DEFENSE_DIFFICULTY[difficulty].count))))
  // Interleave classes so flyers and heavy units don't all arrive after the small enemies die.
  const mixed:MonsterKind[]=[]
  while(kinds.length)for(const kind of [...new Set(kinds)]){const i=kinds.indexOf(kind);mixed.push(kinds.splice(i,1)[0])}
  return mixed.map((kind,i)=>({kind,lane:(i+wave-1)%3,elite:wave>=5&&kind==='guard'&&i%3===0,
    arrival:kind==='flyer'?'air':kind==='boss'||(wave>=7&&kind==='brute')?'meteor':wave>=3&&kind==='fiend'&&i%2===0?'burrow':'ground'}))
}
export class HyjalMatch {
  readonly maxHp = 1800
  hp = this.maxHp
  wave = 0
  state: 'break' | 'wave' | 'won' | 'lost' = 'break'
  countdown = 15
  alive = 0
  repairLeft = 300
  kills = 0
  private pending: SpawnOrder[] = []
  private spawnTimer = 0
  readonly events: Array<{type: 'start' | 'clear' | 'won' | 'lost'; wave: number}> = []
  constructor(readonly difficulty:DefenseDifficulty='normal') {}
  get tuning() { return DEFENSE_DIFFICULTY[this.difficulty] }
  get remaining(): number { return this.alive + this.pending.length }
  get total(): number { return HYJAL_WAVES.length }
  get terminal(): boolean { return this.state === 'won' || this.state === 'lost' }
  update(dt: number): SpawnOrder[] {
    if (this.terminal || dt <= 0 || !Number.isFinite(dt)) return []
    if (this.hp <= 0) { this.lose(); return [] }
    if (this.state === 'break') {
      const waiting = this.countdown
      this.countdown = Math.max(0, this.countdown - dt)
      if (this.countdown > 0) return []
      dt = Math.max(0, dt - waiting)
      this.wave++
      this.pending = waveOrders(this.wave,this.difficulty)
      this.spawnTimer = 0
      this.state = 'wave'
      this.events.push({type:'start',wave:this.wave})
    }
    const born: SpawnOrder[] = []
    this.spawnTimer -= dt
    while (this.pending.length && this.spawnTimer <= 0) {
      born.push(this.pending.shift()!)
      this.alive++
      this.spawnTimer += this.tuning.spawn * (this.wave===6?.65:1)
    }
    if (!this.remaining) {
      if (this.wave === this.total) { this.state='won'; this.events.push({type:'won',wave:this.wave}) }
      else { this.hp=Math.min(this.maxHp,this.hp+this.tuning.clearHeal); this.state='break'; this.countdown=this.tuning.rest; this.repairLeft=300; this.events.push({type:'clear',wave:this.wave}) }
    }
    return born
  }
  killed(): void { if (!this.terminal && this.alive > 0) { this.alive--; this.kills++ } }
  hit(amount: number): void {
    if (this.terminal || !Number.isFinite(amount) || amount <= 0) return
    this.hp = Math.max(0,this.hp-amount)
    if (!this.hp) this.lose()
  }
  repair(dt: number): number {
    if (this.state !== 'break' || !Number.isFinite(dt) || dt <= 0) return 0
    const amount = Math.min(this.maxHp-this.hp,this.repairLeft,dt*90)
    this.hp+=amount;this.repairLeft-=amount
    return amount
  }
  next(): void { if (this.state === 'break') this.countdown=0 }
  private lose(): void { this.state='lost'; this.events.push({type:'lost',wave:this.wave}) }
}
