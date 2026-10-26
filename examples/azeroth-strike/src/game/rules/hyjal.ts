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
export type HyjalMode = 'normal' | 'endless'
export function waveStage(wave:number):number { return ((Math.max(1,wave)-1)%HYJAL_WAVES.length)+1 }
export function waveOrders(wave:number,difficulty:DefenseDifficulty,endless=false):SpawnOrder[] {
  if(!Number.isSafeInteger(wave)||wave<1)return []
  const cycle=endless?Math.floor((wave-1)/HYJAL_WAVES.length):0
  const countScale=Math.min(2,1+cycle*.15)
  const stage=endless?waveStage(wave):wave
  const base=HYJAL_WAVES[stage-1]
  if(!base)return []
  const kinds:MonsterKind[]=[]
  // Keep each wave's composition at every difficulty, and never duplicate the final boss.
  for(const kind of [...new Set(base)])kinds.push(...group(kind,kind==='boss'?1:Math.max(1,Math.round(base.filter(x=>x===kind).length*DEFENSE_DIFFICULTY[difficulty].count*countScale))))
  // Interleave classes so flyers and heavy units don't all arrive after the small enemies die.
  const mixed:MonsterKind[]=[]
  while(kinds.length)for(const kind of [...new Set(kinds)]){const i=kinds.indexOf(kind);mixed.push(kinds.splice(i,1)[0])}
  return mixed.map((kind,i)=>({kind,lane:(i+wave-1)%3,elite:stage>=5&&kind==='guard'&&i%3===0,
    arrival:kind==='flyer'?'air':kind==='boss'||(stage>=7&&kind==='brute')?'meteor':stage>=3&&kind==='fiend'&&i%2===0?'burrow':'ground'}))
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
  constructor(readonly difficulty:DefenseDifficulty='normal',readonly mode:HyjalMode='normal') {}
  get endless():boolean { return this.mode==='endless' }
  get cycle():number { return Math.floor((Math.max(1,this.wave)-1)/HYJAL_WAVES.length) }
  get stage():number { return this.endless?waveStage(this.wave):this.wave }
  get totalLabel():number|string { return this.endless?'∞':this.total }
  get tuning() {
    const base=DEFENSE_DIFFICULTY[this.difficulty]
    if(!this.endless)return base
    // Bound simultaneous enemies and per-enemy strength for long-running sessions.
    return {...base,hp:base.hp*Math.min(4,1+this.cycle*.2),damage:base.damage*Math.min(2,1+this.cycle*.1),speed:base.speed*Math.min(1.2,1+this.cycle*.025)}
  }
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
      this.pending = waveOrders(this.wave,this.difficulty,this.endless)
      this.spawnTimer = 0
      this.state = 'wave'
      this.events.push({type:'start',wave:this.wave})
    }
    const born: SpawnOrder[] = []
    this.spawnTimer -= dt
    while (this.pending.length && this.spawnTimer <= 0) {
      born.push(this.pending.shift()!)
      this.alive++
      this.spawnTimer += this.tuning.spawn * (this.stage===6?.65:1)
    }
    if (!this.remaining) {
      if (!this.endless && this.wave === this.total) { this.state='won'; this.events.push({type:'won',wave:this.wave}) }
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
