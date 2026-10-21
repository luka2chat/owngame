import { CHARGE_SECONDS, EXTRACTION, EXTRACTION_SECONDS, MISSION_LIMIT, STATIONS } from '../game/tidal-mission'
import type { Audio } from '../engine/audio'
import { displayName, type I18n } from '../engine/i18n'
import { insertScore, type Quality, type SaveData, type SaveStore } from '../engine/save'
import type { GameEvents, GameMode, HudState, KillFeedEntry, RunSummary, ShardKind, StylePop, WaveBanner } from '../game/game'
import { RANK_COLOR, type Perk } from '../game/onslaught'
import { accuracy, formatClock, type Combatant, type MatchState, type Medal } from '../game/rules'
import type { HitKind } from '../game/weapons'
import { Sparks } from './sparks'

export type Screen = 'boot' | 'title' | 'hud' | 'pause' | 'settings' | 'controls' | 'results'

export type UiActions = {
  play(mode: GameMode): void
  resume(): void
  restart(): void
  quit(): void
  settings(patch: Partial<SaveData>): void
  pickPerk(i: number): void
}

const el = <K extends keyof HTMLElementTagNameMap>(tag: K, cls = '', html = ''): HTMLElementTagNameMap[K] => {
  const e = document.createElement(tag)
  if (cls) e.className = cls
  if (html) e.innerHTML = html
  return e
}
const icon = (name: string, cls = '') => `<i class="ico ${cls}" style="--ico:url(${new URL(`assets/ui/icon_${name}.webp`,document.baseURI).href})"></i>`

const CONTROLS: [string, string][] = [
  ['W A S D', 'ctl.move'],
  ['key.mouse', 'ctl.look'],
  ['key.leftClick', 'ctl.fire'],
  ['key.rightClick', 'ctl.ads'],
  ['R', 'ctl.reload'],
  ['E', 'ctl.interact'],
  ['Shift', 'ctl.sprint'],
  ['Space', 'ctl.jump'],
  ['C / Ctrl', 'ctl.crouch'],
  ['G', 'ctl.grenade'],
  ['F', 'ctl.overdrive'],
  ['1 / 2 / 3', 'ctl.weapons'],
  ['key.wheel · Q', 'ctl.cycle'],
  ['Tab key.hold', 'ctl.board'],
  ['Esc', 'ctl.pause'],
]
const RANK_LETTER = ['D', 'C', 'B', 'A', 'S', 'SS', 'SSS']
const TIP_COUNT = 7
const nm = (id: string) => displayName('name', id)
const SRC_ICON: Record<string, string> = { M4: 'rifle', M870: 'shotgun', 'RPG-X': 'rocket', FRAG: 'grenade' }
const SHARD_COL: Record<ShardKind, string> = { health: '#5cff8a', armor: '#58c8ff', ammo: '#ffc23f' }

export class Ui {
  screen: Screen = 'boot'
  private readonly root: HTMLElement
  private readonly screens = new Map<Screen, HTMLElement>()
  private stack: Screen[] = []
  private readonly E: Record<string, HTMLElement> = {}
  readonly sparks: Sparks
  private feed: HTMLElement[] = []
  private medalQueue: string[] = []
  private medalT = 0
  private hitT = 0
  private countdownEl!: HTMLElement
  private deathEl!: HTMLElement
  private board!: HTMLElement
  private boardRows = ''
  private lastKey = ''
  private armorRegenWas = false
  private armorWas = 0
  private regenSparkT = 0
  private lastRank = -1
  private lastReload = 0
  private lastOdReady = false
  private styleRows: HTMLElement[] = []
  private perkEls: HTMLElement[] = []
  private tipT = 0
  private tipI = 0
  mode: GameMode = 'onslaught'

  constructor(private readonly t: I18n, private readonly save: SaveStore, private readonly audio: Audio, private readonly actions: UiActions) {
    this.root = document.getElementById('ui')!
    this.buildBoot()
    this.buildTitle()
    this.buildHud()
    this.buildPause()
    this.buildSettings()
    this.buildControls()
    this.buildResults()
    this.sparks = new Sparks(this.root)
    window.addEventListener('keydown', e => {
      if (e.code === 'Escape' && (this.screen === 'settings' || this.screen === 'controls')) this.back()
    })
  }

  private add(screen: Screen, node: HTMLElement): HTMLElement {
    node.classList.add('screen', `screen-${screen}`)
    node.hidden = true
    this.root.appendChild(node)
    this.screens.set(screen, node)
    return node
  }

  private button(label: string, onClick: () => void, cls = '', sub = ''): HTMLButtonElement {
    const b = el('button', `btn ${cls}`, `<span>${label}</span>${sub ? `<small>${sub}</small>` : ''}`)
    b.addEventListener('click', () => {
      this.audio.unlock()
      this.audio.play('ui_confirm', { volume: 0.7, jitter: 0 })
      const r = b.getBoundingClientRect()
      this.sparks.burst(r.left + r.width * 0.5, r.top + r.height * 0.5, { count: 40, speed: 420, color: '#ffb040' })
      onClick()
    })
    b.addEventListener('mouseenter', () => {
      this.audio.play('ui_hover', { volume: 0.35, jitter: 0.05 })
      const r = b.getBoundingClientRect()
      this.sparks.burst(r.left + 6, r.top + r.height / 2, { count: 10, speed: 200, color: '#ff9a2e', angle: Math.PI, spread: 1.2, life: 0.4 })
      this.sparks.burst(r.right - 6, r.top + r.height / 2, { count: 10, speed: 200, color: '#ff9a2e', angle: 0, spread: 1.2, life: 0.4 })
    })
    return b
  }

  show(screen: Screen): void {
    this.stack = []
    this.swap(screen)
  }
  push(screen: Screen): void {
    this.stack.push(this.screen)
    this.swap(screen)
  }
  back(): void {
    const prev = this.stack.pop()
    this.audio.play('ui_hover', { volume: 0.5, rate: 0.8 })
    if (prev) this.swap(prev)
  }

  private swap(screen: Screen): void {
    const overHud = screen === 'pause' || ((screen === 'settings' || screen === 'controls') && this.stack.includes('pause'))
    for (const [name, node] of this.screens) node.hidden = name !== screen && !(name === 'hud' && overHud)
    this.screen = screen
    document.body.dataset.screen = screen
    this.sparks.enabled = screen !== 'title' && screen !== 'boot'
    if (!this.sparks.enabled) this.sparks.clear()
    this.sparks.trickle(screen === 'results' ? 14 : 0)
    if (screen === 'title') this.refreshTitle()
  }

  /** Per-frame: animate the HUD spark layer (also on menus). */
  tick(dt: number): void {
    this.sparks.update(dt)
    if (this.screen === 'boot') {
      this.tipT -= dt
      if (this.tipT <= 0) {
        this.tipT = 4.5
        const tip = this.screens.get('boot')!.querySelector<HTMLElement>('.boot-tip')!
        tip.textContent = this.t.t(`tip.${(this.tipI++ % TIP_COUNT) + 1}`)
        tip.classList.remove('in')
        void tip.offsetWidth
        tip.classList.add('in')
      }
    }
  }

  // ─── boot / loading ──────────────────────────────────────────────────
  private buildBoot(): void {
    const n = el('div', '', `
      <div class="poster-frame">
      <div class="boot-art" aria-hidden="true"></div>
      <div class="poster-panel"><div class="poster-lettering" aria-hidden="true"></div>
      <div class="poster-copy"><h1>${this.t.t('game.title')}</h1><p>${this.t.t('game.subtitle')} · ${this.t.t('art.edition')} · ${this.t.t('art.posterMotto')}</p></div>
      <div class="boot-wrap">
        <div class="boot-progress" role="progressbar" aria-label="${this.t.t('art.progress')}" aria-valuemin="0" aria-valuemax="100" aria-valuenow="0"><div class="boot-bar"><i></i><b></b></div></div>
        <div class="boot-row"><span class="boot-label">${this.t.t('boot.init')}</span><span class="boot-pct">0%</span></div>
        <div class="boot-tip">${this.t.t('tip.1')}</div>
      </div>
      </div></div>`)
    this.add('boot', n)
  }

  setBootProgress(p: number, label?: string): void {
    const n = this.screens.get('boot')!
    const v = Math.max(0.02, Math.min(1, p))
    n.querySelector<HTMLElement>('.boot-bar i')!.style.transform = `scaleX(${v})`
    n.querySelector<HTMLElement>('.boot-bar b')!.style.left = `${v * 100}%`
    n.querySelector('.boot-pct')!.textContent = `${Math.round(v * 100)}%`
    n.querySelector('.boot-progress')!.setAttribute('aria-valuenow',String(Math.round(v * 100)))
    if (label) n.querySelector('.boot-label')!.textContent = label
    const bar = n.querySelector<HTMLElement>('.boot-bar')!.getBoundingClientRect()
    if (bar.width && Math.random() < 0.6) this.sparks.burst(bar.left + bar.width * v, bar.top + bar.height / 2, { count: 6, speed: 260, angle: -Math.PI / 2, spread: 2.2, life: 0.5 })
  }

  // ─── title ───────────────────────────────────────────────────────────
  private buildTitle(): void {
    const n = el('div', '', `
      <div class="poster-frame">
      <div class="title-art" aria-hidden="true"></div>
      <div class="poster-panel"><div class="poster-lettering" aria-hidden="true"></div>
      <div class="poster-copy"><h1>${this.t.t('game.title')}</h1><p>${this.t.t('game.subtitle')} · ${this.t.t('art.edition')} · ${this.t.t('art.posterMotto')}</p><p>${this.t.t('title.tagline')}</p></div>
      <div class="title-left">
        <div class="menu"></div>
        <div class="best"></div>
      </div>
      </div>
      <div class="title-foot">${this.t.t('title.foot')}</div>
      </div>`)
    n.querySelector('.menu')!.append(
      this.button(this.t.t('title.onslaught'), () => this.actions.play('onslaught'), 'primary', this.t.t('title.onslaughtSub')),
      this.button(this.t.t('menu.controls'), () => this.push('controls')),
      this.button(this.t.t('menu.settings'), () => this.push('settings')),
    )
    this.add('title', n)
  }

  private refreshTitle(): void {
    const n = this.screens.get('title')!
    const lb = this.save.data.leaderboard
    const o = lb.find(e => e.name === 'ONSLAUGHT')
    const d = lb.find(e => e.name !== 'ONSLAUGHT')
    const parts: string[] = []
    if (o) parts.push(`${this.t.t('title.bestOnslaught')} <b>${o.score.toLocaleString('en-US')}</b>`)
    if (d) parts.push(`${this.t.t('title.bestDeathmatch')} <b>${d.score.toLocaleString('en-US')}</b>`)
    n.querySelector('.best')!.innerHTML = parts.join(' &nbsp;·&nbsp; ')
  }

  setFragLimit(_n: number): void {}

  // ─── HUD ─────────────────────────────────────────────────────────────
  private buildHud(): void {
    const n = el('div', '', `
      <div class="mission-panel"><small>${this.t.t('mission.kicker')}</small><h2 data-k="objective"></h2><p data-k="objectiveHint"></p><div class="mission-meter"><i data-k="objectiveBar"></i></div><div class="station-list" data-k="stations"></div></div>
      <div class="tide-map"><svg viewBox="-44 -44 88 88" aria-label="${this.t.t('mission.map')}"><rect x="-40" y="-40" width="80" height="80" rx="2" fill="#193e42" stroke="#6eb7ab"/><rect x="-5.5" y="-2.5" width="11" height="7" fill="#bf6546"/>${STATIONS.map((p,i)=>`<circle id="map-${i}" cx="${p.x}" cy="${p.z}" r="3.7" fill="#e8ac52"/><text x="${p.x}" y="${p.z+1.3}" font-size="4" fill="#102e33" text-anchor="middle">${i+1}</text>`).join('')}<path d="M -3 -36 L 3 -36 L 3 -30 L -3 -30 Z" fill="#e8dba3"/><text x="0" y="-38" fill="#f4e5bf" font-size="3.5" text-anchor="middle">EXIT</text><circle data-k="mapTarget" r="5.5" fill="none" stroke="#fff" stroke-width=".7" stroke-dasharray="1.5 1"/><g data-k="mapThreats">${Array.from({length:10},()=>'<circle r="1.35" fill="#ff7354" stroke="#351e1a" stroke-width=".4" visibility="hidden"/>').join('')}</g><path data-k="mapPlayer" d="M 0 -2 L -1.6 2 L 1.6 2 Z" fill="white"/></svg><small>${this.t.t('mission.map')}</small></div><div class="od-frame"></div>
      <div class="lowhp"></div>
      <div class="xh-wrap">
        <svg class="od-ring" viewBox="0 0 100 100"><circle class="od-bg" cx="50" cy="50" r="44"/><circle class="od-fg" cx="50" cy="50" r="44"/></svg>
        <div class="od-lbl">${this.t.t('hud.overdrive')}</div>
        <div class="xhair"><i class="t"></i><i class="b"></i><i class="l"></i><i class="r"></i><b></b></div>
        <div class="hitmark"><i></i><i></i><i></i><i></i></div>
      </div>
      <div class="dmg-ring"></div>
      <div class="reload"><i></i></div>
      <div class="ammo-warn"></div>
      <div class="top-dm">
        <div class="score-me"><span class="lbl">${this.t.t('hud.you')}</span><span class="val" data-k="kills">0</span></div>
        <div class="clock"><span data-k="clock">6:00</span><small data-k="limit"></small></div>
        <div class="score-lead"><span class="lbl" data-k="leaderName">${this.t.t('hud.leader')}</span><span class="val" data-k="leaderKills">0</span></div>
      </div>
      <div class="place" data-k="place"></div>
      <div class="wave-info"><span class="wi-wave" data-k="wave">${this.t.t('hud.wave', { wave: 1, waves: 8 })}</span><span class="wi-sep"></span><span class="wi-left">${icon('skull')}<b data-k="left">0</b></span><span class="wi-sep"></span><span class="wi-time" data-k="rtime">0:00</span></div>
      <div class="bossbar">${icon('skull', 'boss-skull')}<div class="bb-name">${this.t.t('hud.warden')}</div>
        <div class="bb-segs"><div class="bb-seg"><i></i><small>${this.t.t('hud.phase', { n: 1 })}</small></div><div class="bb-seg"><i></i><small>${this.t.t('hud.phase', { n: 2 })}</small></div><div class="bb-seg"><i></i><small>${this.t.t('hud.phase', { n: 3 })}</small></div></div></div>
      <div class="banner"><div class="bn-in"><div class="bn-title"></div><div class="bn-sub"></div></div></div>
      <div class="feed"></div>
      <div class="style">
        <div class="st-rank"><span class="st-letter" data-k="rank">D</span></div>
        <div class="st-title" data-k="rtitle">${this.t.t('rank.0')}</div>
        <div class="st-mult" data-k="mult">x1.0</div>
        <div class="st-bar"><i data-k="rfill"></i></div>
        <div class="st-list"></div>
        <div class="st-score"><small>${this.t.t('hud.score')}</small><b data-k="score">0</b></div>
      </div>
      <div class="medal"></div>
      <div class="msg"></div>
      <div class="pickups"></div>
      <div class="loadtag">${this.t.t('hud.syncing')}</div>
      <div class="perks"><div class="pk-head">${this.t.t('hud.perkHead')} <small>${this.t.t('hud.perkHint')}</small></div><div class="pk-cards"></div></div>
      <div class="vitals panel-cut">
        <div class="vital ar">${icon('shield', 'v-ico')}<div class="v-num" data-k="ar">0</div><div class="v-bar"><i data-k="arBar"></i><b class="v-shine"></b><span class="v-seg"></span></div><div class="v-lbl"><small class="v-regen">${this.t.t('hud.recharging')}</small>${this.t.t('hud.armor')}</div></div>
        <div class="vital hp">${icon('plus', 'v-ico')}<div class="v-num" data-k="hp">100</div><div class="v-bar"><em data-k="hpGhost"></em><i data-k="hpBar"></i><span class="v-seg"></span></div><div class="v-lbl">${this.t.t('hud.health')}</div></div>
      </div>
      <div class="weapon panel-cut">
        <div class="w-icon" data-k="wicon"></div>
        <div class="w-ammo"><span data-k="mag">30</span><small>/ <span data-k="reserve">150</span></small></div>
        <div class="w-name" data-k="wname"></div>
        <div class="w-nades" data-k="nades"></div>
        <div class="w-slots">
          <div class="slot" data-slot="rifle"><em>1</em>${icon('rifle')}</div>
          <div class="slot" data-slot="shotgun"><em>2</em>${icon('shotgun')}</div>
          <div class="slot" data-slot="rocket"><em>3</em>${icon('rocket')}</div>
        </div>
      </div>
      <div class="protect">${this.t.t('hud.protect')}</div>
      <div class="countdown"></div>
      <div class="death"><div class="d-lbl">${this.t.t('hud.eliminated')}</div><div class="d-name"></div><div class="d-weap"></div><div class="d-timer"></div></div>
      <div class="board"><h3>${this.t.t('hud.scoreboard')}</h3><table><thead><tr><th>#</th><th>${this.t.t('board.name')}</th><th>${this.t.t('board.kills')}</th><th>${this.t.t('board.deaths')}</th></tr></thead><tbody></tbody></table></div>`)
    // Health/armor glyphs are CSS shapes (no icon files needed).
    n.querySelectorAll<HTMLElement>('.v-ico').forEach(e => e.removeAttribute('style'))
    n.querySelectorAll<HTMLElement>('[data-k]').forEach(e => (this.E[e.dataset.k!] = e))
    for (const c of ['xhair', 'hitmark', 'dmg-ring', 'reload', 'ammo-warn', 'feed', 'medal', 'msg', 'pickups', 'weapon', 'protect', 'lowhp', 'style', 'st-list', 'bossbar', 'banner', 'perks', 'pk-cards', 'od-ring', 'od-lbl', 'vitals', 'loadtag', 'wave-info', 'top-dm', 'st-rank', 'xh-wrap'])
      this.E[c] = n.querySelector(`.${c}`)!
    this.countdownEl = n.querySelector('.countdown')!
    this.deathEl = n.querySelector('.death')!
    this.board = n.querySelector('.board')!
    this.add('hud', n)
  }

  /** Armor recharge juice: shimmer + travelling sparks while charging, flash and burst when full or broken. */
  private armorFx(h: HudState, dt: number): void {
    const row = this.E.arBar.closest('.vital') as HTMLElement
    row.classList.toggle('regen', h.armorRegen)
    row.classList.toggle('broken', h.armor <= 0)
    row.style.setProperty('--wait', String(h.armorRegen || h.armor >= h.maxArmor ? 1 : h.armorWait))
    const bar = this.E.arBar.parentElement!.getBoundingClientRect()
    const edgeX = bar.left + bar.width * (h.armor / h.maxArmor), cy = bar.top + bar.height / 2
    if (h.armorRegen && !this.armorRegenWas) {
      { this.audio.cue('armorRegen', 0.5); this.audio.play('armor_recharge', { volume: 0.55 }) }
      this.sparks.burst(edgeX, cy, { count: 10, speed: 160, color: '#7fe3ff', life: 0.35, gravity: -40 })
    }
    if (h.armorRegen) {
      this.regenSparkT -= dt
      if (this.regenSparkT <= 0) {
        this.regenSparkT = 0.045
        this.sparks.burst(edgeX, cy + (Math.random() - 0.5) * bar.height, { count: 2, speed: 90, color: Math.random() < 0.5 ? '#b8f3ff' : '#3fc6ff', life: 0.3, gravity: -60 })
      }
    }
    if (this.armorWas < h.maxArmor && h.armor >= h.maxArmor && this.armorRegenWas) {
      this.audio.cue('armorFull', 0.8)
      this.sparks.burst(bar.left + bar.width / 2, cy, { count: 26, speed: 260, color: '#9eeaff', life: 0.45, gravity: 60 })
      this.flashClass(row, 'full', 450)
    }
    if (this.armorWas > 0 && h.armor <= 0) {
      this.sparks.burst(bar.left + 10, cy, { count: 22, speed: 340, color: '#5fd0ff', life: 0.5, gravity: 420 })
      this.flashClass(row, 'shatter', 500)
    }
    this.armorRegenWas = h.armorRegen
    this.armorWas = h.armor
  }
  private flashClass(e: HTMLElement, c: string, ms: number): void {
    e.classList.remove(c); void e.offsetWidth; e.classList.add(c)
    window.setTimeout(() => e.classList.remove(c), ms)
  }
  private center(e: HTMLElement): [number, number] {
    const r = e.getBoundingClientRect()
    return [r.left + r.width / 2, r.top + r.height / 2]
  }

  /** Per-frame HUD update. `pxPerRad` converts spread angles to screen pixels. */
  updateHud(h: HudState, board: Combatant[], showBoard: boolean, pxPerRad: number, dt: number): void {
    const E = this.E
    const set = (k: string, v: string) => {
      const e = E[k]
      if (e && e.textContent !== v) e.textContent = v
    }
    const ons = h.gameMode === 'onslaught'
    document.body.dataset.mode = h.gameMode
    // Deathmatch header.
    if (!ons) {
      set('kills', String(h.kills))
      set('clock', formatClock(h.timeLeft))
      set('limit', this.t.t('hud.limit', { n: h.fragLimit }))
      set('leaderName', h.leaderName === 'YOU' ? this.t.t('hud.leader') : nm(h.leaderName))
      set('leaderKills', String(h.leaderKills))
      set('place', this.t.t('hud.place', { place: h.place }))
      E.clock.parentElement?.classList.toggle('urgent', h.timeLeft < 30)
      E.place.classList.toggle('first', h.place === 1)
    } else {
      const m = h.mission
      const complete = m.progress.filter(p=>p>=CHARGE_SECONDS).length
      const nextIndex = m.active ?? STATIONS.map((p,i)=>({i,d:m.progress[i]>=CHARGE_SECONDS?Infinity:Math.hypot(h.playerX-p.x,h.playerZ-p.z)})).sort((a,b)=>a.d-b.d)[0].i
      const target = m.phase === 'extract' ? EXTRACTION : STATIONS[nextIndex]
      const distance = Math.round(Math.hypot(h.playerX-target.x,h.playerZ-target.z))
      set('wave', this.t.t('mission.count', {n:complete}))
      set('objective', m.phase==='extract'?this.t.t('mission.extract'):this.t.t(STATIONS[nextIndex].label))
      const hint = m.phase==='extract'?(m.blocked==='enemy'?'mission.contested':m.blocked==='away'?'mission.toExtract':'mission.board'):m.active===null?(distance<=3?'mission.press':'mission.travel'):m.blocked==='away'?'mission.return':m.blocked==='enemy'?'mission.contested':'mission.working'
      set('objectiveHint', this.t.t(hint,{d:distance,s:Math.max(0,Math.ceil(100-m.extractElapsed))}))
      E.objectiveBar.style.transform=`scaleX(${m.phase==='extract'?m.extraction/EXTRACTION_SECONDS:m.progress[nextIndex]/CHARGE_SECONDS})`
      set('stations', STATIONS.map((_,i)=>`${i+1} ${m.progress[i]>=CHARGE_SECONDS?'✓':Math.floor(m.progress[i]/CHARGE_SECONDS*100)+'%'}`).join('     ·     '))
      E.mapPlayer.setAttribute('transform',`translate(${h.playerX} ${h.playerZ}) rotate(${-h.playerYaw*180/Math.PI})`)
      STATIONS.forEach((_,i)=>document.getElementById(`map-${i}`)?.setAttribute('fill',m.progress[i]>=CHARGE_SECONDS?'#72f9c7':m.active===i?'#54dcf3':'#e8ac52'))
      E.mapTarget.setAttribute('cx',String(target.x))
      E.mapTarget.setAttribute('cy',String(target.z))
      Array.from(E.mapThreats.children).forEach((dot,i)=>{
        const p=h.nearbyThreats[i]
        dot.setAttribute('visibility',p?'visible':'hidden')
        if(p){dot.setAttribute('cx',String(p.x));dot.setAttribute('cy',String(p.z))}
      })
      set('left', this.t.t('mission.guards',{n:h.enemiesLeft}))
      set('rtime', formatClock(Math.max(0, MISSION_LIMIT-h.mission.elapsed)))
      // Style meter.
      if (h.rank !== this.lastRank) {
        const up = h.rank > this.lastRank && this.lastRank >= 0
        this.lastRank = h.rank
        set('rank', RANK_LETTER[h.rank])
        set('rtitle', this.t.t(`rank.${h.rank}`))
        E.style.style.setProperty('--rc', RANK_COLOR[h.rank])
        E.style.dataset.rank = String(h.rank)
        const r = E['st-rank']
        r.classList.remove('pop', 'drop')
        void r.offsetWidth
        r.classList.add(up ? 'pop' : 'drop')
        if (up) {
          const [x, y] = this.center(r)
          this.sparks.burst(x, y, { count: 70, speed: 520, color: RANK_COLOR[h.rank], life: 0.8 })
          this.sparks.burst(x, y, { count: 8, kind: 'glow', speed: 60, size: 10, color: RANK_COLOR[h.rank], life: 0.5, gravity: 0 })
        }
      }
      set('mult', `x${h.mult.toFixed(1)}`)
      E.rfill.style.transform = `scaleX(${h.rankFill})`
      set('score', h.score.toLocaleString('en-US'))
      // Overdrive ring around the crosshair.
      const C = 2 * Math.PI * 44
      const fg = E['od-ring'].querySelector<SVGCircleElement>('.od-fg')!
      const v = h.overdriveActive > 0 ? h.overdriveActive : h.overdrive
      fg.style.strokeDashoffset = String(C * (1 - v))
      const ready = h.overdrive >= 1 && h.overdriveActive <= 0
      E['xh-wrap'].classList.toggle('od-ready', ready)
      E['xh-wrap'].classList.toggle('od-on', h.overdriveActive > 0)
      document.body.classList.toggle('overdrive', h.overdriveActive > 0)
      if (ready && !this.lastOdReady) {
        const [x, y] = this.center(E['od-ring'])
        this.sparks.burst(x, y, { count: 50, speed: 380, color: '#ffb020', life: 0.7 })
      }
      this.lastOdReady = ready
      // Boss.
      E.bossbar.classList.toggle('on', !!h.boss)
      if (h.boss) {
        const segs = E.bossbar.querySelectorAll<HTMLElement>('.bb-seg i')
        segs.forEach((s, i) => {
          const f = Math.max(0, Math.min(1, (h.boss!.health - (2 - i) / 3) * 3))
          s.style.transform = `scaleX(${f})`
        })
      }
    }
    // Vitals.
    set('hp', String(h.health))
    set('ar', String(h.armor))
    E.hpBar.style.transform = `scaleX(${h.health / h.maxHealth})`
    E.arBar.style.transform = `scaleX(${h.armor / h.maxArmor})`
    this.armorFx(h, dt)
    const ghost = parseFloat(E.hpGhost.dataset.v ?? '1')
    const g = Math.max(h.health / h.maxHealth, ghost - dt * 0.5)
    E.hpGhost.dataset.v = String(g)
    E.hpGhost.style.transform = `scaleX(${g})`
    E.hp.parentElement!.classList.toggle('low', h.health <= 35)
    // Weapon.
    set('mag', String(h.mag))
    set('reserve', String(h.reserve))
    set('wname', h.weaponName)
    E.mag.classList.toggle('low', h.lowAmmo)
    const key = `${h.weapon}|${h.owned.rifle}${h.owned.shotgun}${h.owned.rocket}|${h.grenades}|${h.grenadesUnlocked}`
    if (key !== this.lastKey) {
      const prevW = this.lastKey.split('|')[0]
      this.lastKey = key
      E.weapon.querySelectorAll<HTMLElement>('.slot').forEach(s => {
        s.classList.toggle('active', s.dataset.slot === h.weapon)
        s.classList.toggle('locked', !h.owned[s.dataset.slot as 'rifle'])
      })
      E.wicon.innerHTML = icon(h.weapon)
      E.nades.innerHTML = h.grenadesUnlocked ? Array.from({ length: Math.max(h.grenades, 0) }, () => icon('grenade')).join('') + '<kbd>G</kbd>' : ''
      if (prevW && prevW !== h.weapon) {
        const [x, y] = this.center(E.wicon)
        this.sparks.burst(x, y, { count: 16, speed: 260, color: '#ffb040', life: 0.45 })
      }
    }
    // Crosshair gap follows the real spread cone.
    const gap = Math.max(4, Math.min(80, Math.tan(h.spread) * pxPerRad))
    E.xhair.style.setProperty('--gap', `${gap.toFixed(1)}px`)
    // Rifle (red dot) and shotgun (ghost ring) aim through their real sights: no HUD reticle at ADS.
    const sighted = h.weapon !== 'rocket'
    const adsHide = sighted ? Math.max(0, 1 - h.ads * 8) : Math.max(0, 1 - h.ads * 1.6)
    E.xhair.style.opacity = String(h.alive ? adsHide * (h.sprinting ? 0.35 : 1) : 0)
    E['od-ring'].style.opacity = ons && h.alive ? String(sighted ? adsHide : 0.35 + (1 - h.ads) * 0.65) : '0'
    E['od-lbl'].style.opacity = ons && h.alive && (h.overdrive >= 1 || h.overdriveActive > 0) ? '1' : '0'
    E.reload.style.opacity = h.reloading > 0 ? '1' : '0'
    ;(E.reload.firstElementChild as HTMLElement).style.transform = `scaleX(${h.reloading})`
    if (this.lastReload > 0 && h.reloading === 0) {
      const [x, y] = this.center(E.mag)
      this.sparks.burst(x, y, { count: 22, speed: 300, color: '#ffc23f', life: 0.5 })
    }
    this.lastReload = h.reloading
    const warn = h.reloading > 0 ? '' : h.mag === 0 && h.reserve === 0 ? this.t.t('hud.noAmmo') : h.lowAmmo ? this.t.t('hud.reload') : ''
    if (E['ammo-warn'].textContent !== warn) E['ammo-warn'].textContent = warn
    E.protect.style.opacity = h.protect > 0 && h.alive && !ons ? '1' : '0'
    E.lowhp.style.opacity = h.alive ? String(Math.max(0, 1 - h.health / 35) * 0.35) : '0'
    this.deathEl.classList.toggle('on', !h.alive && !ons)
    if (!h.alive && !ons) this.deathEl.querySelector('.d-timer')!.textContent = this.t.t('hud.respawn', { s: Math.ceil(h.respawnIn) })
    this.hitT = Math.max(0, this.hitT - dt)
    E.hitmark.style.opacity = String(Math.min(1, this.hitT * 5))
    this.medalT -= dt
    if (this.medalT <= 0 && this.medalQueue.length) {
      const text = this.medalQueue.shift()!
      const m = E.medal
      m.textContent = text
      m.classList.remove('pop')
      void m.offsetWidth
      m.classList.add('pop')
      this.medalT = 1.1
      const [x, y] = this.center(m)
      this.sparks.burst(x, y, { count: 30, speed: 360, color: '#ffc23f' })
    }
    this.board.classList.toggle('on', showBoard && !ons)
    if (showBoard && !ons) {
      const rows = board.map((c, i) => `<tr class="${c.isPlayer ? 'me' : ''}"><td>${i + 1}</td><td>${nm(c.name)}</td><td>${c.kills}</td><td>${c.deaths}</td></tr>`).join('')
      if (rows !== this.boardRows) {
        this.boardRows = rows
        this.board.querySelector('tbody')!.innerHTML = rows
      }
    }
  }

  private showPerks(offer: Perk[] | null): void {
    const box = this.E.perks
    const cards = this.E['pk-cards']
    if (!offer) {
      box.classList.remove('on')
      return
    }
    cards.innerHTML = ''
    this.perkEls = offer.map((p, i) => {
      const c = el('button', 'pk-card', `<div class="pk-name">${p.name}</div><div class="pk-art">${icon(p.id)}</div><div class="pk-desc">${p.desc}</div><kbd>${i + 1}</kbd>`)
      c.style.setProperty('--d', `${i * 0.09}s`)
      c.addEventListener('mouseenter', () => {
        this.audio.play('ui_hover', { volume: 0.4 })
        const r = c.getBoundingClientRect()
        this.sparks.streak(r.left, r.right, r.top, { count: 18, speed: 240, life: 0.5 })
      })
      c.addEventListener('click', () => this.actions.pickPerk(i))
      cards.appendChild(c)
      return c
    })
    box.classList.add('on')
    window.setTimeout(() => {
      for (const c of this.perkEls) {
        const r = c.getBoundingClientRect()
        this.sparks.streak(r.left, r.right, r.bottom, { count: 30, speed: 260, life: 0.6 })
      }
    }, 250)
  }

  /** Visual feedback when a perk is chosen (called before the game hides the cards). */
  perkChosen(i: number): void {
    const c = this.perkEls[i]
    if (!c) return
    c.classList.add('chosen')
    const [x, y] = this.center(c)
    this.sparks.burst(x, y, { count: 90, speed: 620, color: '#ffb020', life: 0.9 })
    this.sparks.burst(x, y, { count: 6, kind: 'glow', size: 16, speed: 40, gravity: 0, color: '#ff9a2e' })
  }

  readonly events: Omit<GameEvents, 'ended'> = {
    hitmarker: (kind: HitKind) => {
      if (kind === 'prop') return
      const m = this.E.hitmark
      m.className = `hitmark ${kind}`
      this.hitT = kind === 'kill' ? 0.45 : 0.22
      m.classList.remove('pulse')
      void m.offsetWidth
      m.classList.add('pulse')
      const cx = window.innerWidth / 2
      const cy = window.innerHeight / 2
      if (kind === 'kill') this.sparks.burst(cx, cy, { count: 34, speed: 520, color: '#ff4a2a', life: 0.45, gravity: 200 })
      else if (kind === 'head') this.sparks.burst(cx, cy, { count: 16, speed: 420, color: '#ffe38a', life: 0.35, gravity: 150 })
      else this.sparks.burst(cx, cy, { count: kind === 'armor' ? 5 : 7, speed: 300, color: kind === 'armor' ? '#58c8ff' : '#ffffff', life: 0.25, gravity: 100 })
      if (kind === 'body') this.audio.play('hitmarker', { volume: 0.55, jitter: 0.08 })
      else if (kind === 'armor') this.audio.cue('armorHit', 0.9)
      else if (kind === 'head') this.audio.play('headshot', { volume: 0.55 })
    },
    damage: (angle: number, amount: number) => {
      const ring = this.E['dmg-ring']
      const arc = el('i')
      arc.style.transform = `rotate(${(-angle * 180) / Math.PI}deg)`
      arc.style.setProperty('--a', String(Math.min(1, 0.45 + amount / 30)))
      ring.appendChild(arc)
      window.setTimeout(() => arc.remove(), 1300)
      while (ring.children.length > 6) ring.firstElementChild?.remove()
      const R = Math.min(window.innerWidth, window.innerHeight) * 0.22
      const x = window.innerWidth / 2 + Math.sin(-angle) * -R
      const y = window.innerHeight / 2 - Math.cos(-angle) * R
      this.sparks.burst(x, y, { count: Math.min(24, 6 + amount), speed: 260, color: '#ff3020', life: 0.5 })
      const v = this.E.vitals
      v.classList.remove('hurt')
      void v.offsetWidth
      v.classList.add('hurt')
    },
    killfeed: (e: KillFeedEntry) => {
      const row = el('div', `kf ${e.killerIsPlayer ? 'mine' : ''} ${e.victimIsPlayer ? 'me-dead' : ''}`)
      const same = e.killer === e.victim
      const w = SRC_ICON[e.weapon]
      const wHtml = w ? icon(w, 'kf-ico') : `<span class="w">${displayName('src', e.weapon)}</span>`
      row.innerHTML = same
        ? `<b style="color:${e.victimColor}">${nm(e.victim)}</b>${wHtml}<span class="self">${this.t.t('hud.selfKill')}</span>`
        : `<b style="color:${e.killerColor}">${nm(e.killer)}</b>${wHtml}${e.headshot ? '<span class="hs">◎</span>' : ''}<span class="v" style="color:${e.victimColor}">${nm(e.victim)}</span>`
      this.E.feed.prepend(row)
      this.feed.unshift(row)
      while (this.feed.length > 5) this.feed.pop()!.remove()
      window.setTimeout(() => {
        row.classList.add('out')
        window.setTimeout(() => row.remove(), 400)
      }, 5200)
    },
    medals: (list: Medal[]) => {
      for (const m of list) this.medalQueue.push(this.t.t(`medal.${m}`))
    },
    message: (text: string, tone = 'info') => {
      const m = this.E.msg
      m.textContent = text
      m.dataset.tone = tone
      m.classList.remove('pop')
      void m.offsetWidth
      m.classList.add('pop')
    },
    pickup: (label: string, color: string) => {
      const p = el('div', 'pk', label)
      p.style.setProperty('--c', color)
      this.E.pickups.appendChild(p)
      window.setTimeout(() => p.remove(), 1800)
      window.requestAnimationFrame(() => {
        const [x, y] = this.center(p)
        this.sparks.burst(x, y, { count: 20, speed: 280, color })
      })
    },
    died: (killer: string, weapon: string) => {
      this.deathEl.querySelector('.d-name')!.textContent = nm(killer)
      this.deathEl.querySelector('.d-weap')!.textContent = displayName('src', weapon)
    },
    respawned: () => {
      this.deathEl.classList.remove('on')
    },
    countdown: (n: number) => {
      const c = this.countdownEl
      c.textContent = n > 0 ? String(n) : this.t.t('hud.fight')
      c.className = `countdown on ${n === 0 ? 'go' : ''}`
      void c.offsetWidth
      c.classList.add('pop')
      this.sparks.burst(window.innerWidth / 2, window.innerHeight * 0.36, { count: n === 0 ? 80 : 24, speed: n === 0 ? 700 : 340, color: n === 0 ? '#ff9a2e' : '#ffd08a' })
      if (n === 0) window.setTimeout(() => (c.className = 'countdown'), 900)
    },
    style: (p: StylePop) => {
      const list = this.E['st-list']
      const row = el('div', 'st-row', `<span>+${p.label}</span><b>${p.points}</b>`)
      list.prepend(row)
      this.styleRows.unshift(row)
      while (this.styleRows.length > 4) this.styleRows.pop()!.remove()
      window.setTimeout(() => {
        row.classList.add('out')
        window.setTimeout(() => row.remove(), 400)
        this.styleRows = this.styleRows.filter(r => r !== row)
      }, 2600)
      const r = row.getBoundingClientRect()
      this.sparks.burst(r.left, r.top + r.height / 2, { count: 10, speed: 260, color: RANK_COLOR[p.rank], angle: Math.PI, spread: 1.4, life: 0.45 })
      const s = this.E.style
      s.classList.remove('bump')
      void s.offsetWidth
      s.classList.add('bump')
    },
    wave: (b: WaveBanner) => {
      const bn = this.E.banner
      bn.querySelector('.bn-title')!.textContent = b.title
      bn.querySelector('.bn-sub')!.textContent = b.subtitle
      bn.className = `banner on ${b.kind}`
      const hold = b.kind === 'victory' ? 4200 : b.kind === 'boss' ? 3600 : 2800
      window.setTimeout(() => {
        if (bn.querySelector('.bn-title')!.textContent === b.title) bn.classList.remove('on')
      }, hold)
      const burst = () => {
        const r = bn.querySelector('.bn-in')!.getBoundingClientRect()
        const col = b.kind === 'clear' || b.kind === 'victory' ? '#ffd35c' : b.kind === 'boss' || b.kind === 'phase' ? '#ff3a1a' : '#ff9a2e'
        this.sparks.burst(r.left, r.top + r.height / 2, { count: 60, speed: 620, angle: Math.PI, spread: 0.8, color: col, life: 0.8, gravity: 120 })
        this.sparks.burst(r.right, r.top + r.height / 2, { count: 60, speed: 620, angle: 0, spread: 0.8, color: col, life: 0.8, gravity: 120 })
        this.sparks.streak(r.left, r.right, r.bottom, { count: 40, speed: 200, color: col })
      }
      window.setTimeout(burst, 120)
      window.setTimeout(burst, 700)
    },
    perks: (offer: Perk[] | null) => this.showPerks(offer),
    overdrive: (on: boolean) => {
      const [x, y] = this.center(this.E['od-ring'])
      if (on) {
        this.sparks.burst(x, y, { count: 140, speed: 900, color: '#ffb020', life: 0.9, gravity: 0, drag: 2 })
        this.sparks.burst(x, y, { count: 10, kind: 'glow', size: 22, speed: 80, gravity: 0, color: '#ff8a1a' })
      } else this.sparks.burst(x, y, { count: 30, speed: 300, color: '#aa7a3a', life: 0.5 })
    },
    shard: (kind: ShardKind) => {
      const target = kind === 'ammo' ? this.E.mag : kind === 'health' ? this.E.hpBar : this.E.arBar
      const r = target.getBoundingClientRect()
      const x = kind === 'ammo' ? r.left + r.width / 2 : r.left + r.width
      this.sparks.burst(x, r.top + r.height / 2, { count: 9, speed: 200, color: SHARD_COL[kind], life: 0.4 })
      const host = kind === 'ammo' ? this.E.weapon : this.E.vitals
      host.classList.remove(`gain-${kind}`)
      void host.offsetWidth
      host.classList.add(`gain-${kind}`)
    },
    loading: (text: string | null) => {
      this.E.loadtag.classList.toggle('on', !!text)
      if (text) this.E.loadtag.textContent = text
    },
  }

  resetHud(): void {
    this.E.feed.innerHTML = ''
    this.feed = []
    this.medalQueue = []
    this.E['dmg-ring'].innerHTML = ''
    this.E.pickups.innerHTML = ''
    this.E['st-list'].innerHTML = ''
    this.styleRows = []
    this.E.banner.className = 'banner'
    this.E.perks.classList.remove('on')
    this.E.loadtag.classList.remove('on')
    this.E.bossbar.classList.remove('on')
    this.deathEl.classList.remove('on')
    this.countdownEl.className = 'countdown'
    this.lastRank = -1
    this.lastKey = ''
    document.body.classList.remove('overdrive')
    this.sparks.clear()
  }

  // ─── pause ───────────────────────────────────────────────────────────
  private buildPause(): void {
    const n = el('div', 'panel-screen', `<div class="panel panel-cut"><h2>${this.t.t('menu.paused')}</h2><div class="menu"></div><div class="hint">${this.t.t('menu.pauseHint')}</div></div>`)
    n.querySelector('.menu')!.append(
      this.button(this.t.t('menu.resume'), () => this.actions.resume(), 'primary'),
      this.button(this.t.t('menu.restart'), () => this.actions.restart()),
      this.button(this.t.t('menu.controls'), () => this.push('controls')),
      this.button(this.t.t('menu.settings'), () => this.push('settings')),
      this.button(this.t.t('menu.quit'), () => this.actions.quit()),
    )
    this.add('pause', n)
  }

  // ─── settings ────────────────────────────────────────────────────────
  private buildSettings(): void {
    const n = el('div', 'panel-screen', `<div class="panel panel-cut wide"><h2>${this.t.t('settings.title')}</h2><div class="rows"></div><div class="menu row-end"></div></div>`)
    this.add('settings', n)
    this.refreshSettings()
    n.querySelector('.menu')!.append(this.button(this.t.t('menu.back'), () => this.back()))
  }

  refreshSettings(): void {
    const n = this.screens.get('settings')!
    const rows = n.querySelector('.rows')!
    rows.innerHTML = ''
    const d = this.save.data
    const slider = (label: string, value: number, min: number, max: number, step: number, fmt: (v: number) => string, on: (v: number) => void) => {
      const r = el('label', 'row', `<span>${label}</span><input type="range" min="${min}" max="${max}" step="${step}" value="${value}"/><output>${fmt(value)}</output>`)
      const input = r.querySelector('input')!
      input.addEventListener('input', () => {
        const v = parseFloat(input.value)
        r.querySelector('output')!.textContent = fmt(v)
        on(v)
      })
      rows.appendChild(r)
    }
    const toggle = (label: string, value: boolean, on: (v: boolean) => void) => {
      const r = el('label', 'row toggle', `<span>${label}</span><input type="checkbox" ${value ? 'checked' : ''}/><i></i>`)
      const input = r.querySelector('input')!
      input.addEventListener('change', () => {
        this.audio.play('ui_confirm', { volume: 0.5 })
        on(input.checked)
      })
      rows.appendChild(r)
    }
    slider(this.t.t('settings.sensitivity'), d.sensitivity, 0.2, 3, 0.05, v => v.toFixed(2), v => this.actions.settings({ sensitivity: v }))
    slider(this.t.t('settings.fov'), d.fov, 70, 120, 1, v => `${v}°`, v => this.actions.settings({ fov: v }))
    slider(this.t.t('settings.sfx'), d.sfxVolume, 0, 1, 0.05, v => `${Math.round(v * 100)}%`, v => this.actions.settings({ sfxVolume: v }))
    slider(this.t.t('settings.music'), d.musicVolume, 0, 1, 0.05, v => `${Math.round(v * 100)}%`, v => this.actions.settings({ musicVolume: v }))
    const q = el('div', 'row seg', `<span>${this.t.t('settings.quality')}</span><div class="segs"></div>`)
    for (const level of ['low', 'medium', 'high'] as Quality[]) {
      const b = el('button', `seg-btn ${d.quality === level ? 'on' : ''}`, this.t.t(`settings.quality.${level}`))
      b.addEventListener('click', () => {
        this.audio.play('ui_confirm', { volume: 0.5 })
        this.actions.settings({ quality: level })
        q.querySelectorAll('.seg-btn').forEach(x => x.classList.toggle('on', x === b))
      })
      q.querySelector('.segs')!.appendChild(b)
    }
    rows.appendChild(q)
    toggle(this.t.t('settings.invertY'), d.invertY, v => this.actions.settings({ invertY: v }))
    toggle(this.t.t('settings.reducedMotion'), d.reducedMotion, v => this.actions.settings({ reducedMotion: v }))
    toggle(this.t.t('settings.muted'), d.muted, v => this.actions.settings({ muted: v }))
  }

  // ─── controls ────────────────────────────────────────────────────────
  private buildControls(): void {
    const keyText = (k: string) => k.replace(/key\.\w+/g, m => this.t.t(m))
    const rows = CONTROLS.map(([k, a]) => `<div class="ctl"><kbd>${keyText(k)}</kbd><span>${this.t.t(a)}</span></div>`).join('')
    const n = el('div', 'panel-screen', `<div class="panel panel-cut wide"><h2>${this.t.t('controls.title')}</h2><div class="ctls">${rows}</div>
      <div class="tips"><b>${this.t.t('controls.tipsHead')}</b> ${this.t.t('controls.tips')}</div>
      <div class="menu row-end"></div></div>`)
    n.querySelector('.menu')!.append(this.button(this.t.t('menu.back'), () => this.back()))
    this.add('controls', n)
  }

  // ─── results ─────────────────────────────────────────────────────────
  private buildResults(): void {
    const n = el('div', 'panel-screen', `<div class="panel panel-cut results"><div class="r-head"></div><div class="r-sub"></div><div class="r-stats"></div><div class="r-board"></div><div class="menu"></div></div>`)
    n.querySelector('.menu')!.append(
      this.button(this.t.t('menu.again'), () => this.actions.restart(), 'primary'),
      this.button(this.t.t('menu.title'), () => this.actions.quit()),
    )
    this.add('results', n)
  }

  showResults(m: MatchState, board: Combatant[], s?: RunSummary): void {
    const n = this.screens.get('results')!
    const stat = (label: string, value: string, big = false) => `<div class="stat ${big ? 'big' : ''}"><small>${label}</small><b>${value}</b></div>`
    const head = n.querySelector<HTMLElement>('.r-head')!
    if (s) {
      let best = false
      if (!s.unranked) {
        const prev = this.save.data.leaderboard.find(e => e.name === 'ONSLAUGHT')?.score ?? 0
        const r = insertScore(this.save.data.leaderboard, { name: 'ONSLAUGHT', score: s.score, seconds: Math.round(s.time), at: Date.now() })
        this.save.update({ leaderboard: r.board })
        best = s.score > prev
      }
      head.textContent = this.t.t(s.won ? 'result.sealed' : 'result.overrun')
      head.className = `r-head ${s.won ? 'won' : 'lost'}`
      n.querySelector('.r-sub')!.textContent = s.won ? this.t.t('result.sealedSub', { waves: s.waves }) : this.t.t('result.overrunSub', { wave: s.wave, waves: s.waves })
      n.querySelector('.r-stats')!.innerHTML = [
        stat(this.t.t('result.wave'), `${s.wave}/${s.waves}`),
        stat(this.t.t('result.kills'), String(s.kills)),
        stat(this.t.t('result.headshots'), String(s.headshots)),
        stat(this.t.t('result.accuracy'), `${Math.round(s.accuracy * 100)}%`),
        stat(this.t.t('result.bestRank'), s.bestRank === 'RIFTBREAKER' ? 'SSS' : s.bestRank),
        stat(this.t.t('result.duration'), formatClock(s.time)),
        stat(this.t.t('result.score'), s.score.toLocaleString('en-US'), true),
      ].join('') + (best ? `<div class="r-best">${this.t.t('result.best')}</div>` : '') + (s.unranked ? `<div class="r-best dim">${this.t.t('result.unranked')}</div>` : '')
      n.querySelector('.r-board')!.innerHTML = ''
    } else {
      const won = m.phase === 'won'
      const me = m.combatants[0]
      const place = board.findIndex(c => c.isPlayer) + 1
      let best = false
      if (!m.unranked) {
        const prev = this.save.data.leaderboard.find(e => e.name !== 'ONSLAUGHT')?.score ?? 0
        const r = insertScore(this.save.data.leaderboard, { name: 'DEATHMATCH', score: m.score, seconds: Math.round(m.elapsed), at: Date.now() })
        this.save.update({ leaderboard: r.board })
        best = m.score > prev
      }
      head.textContent = this.t.t(won ? 'result.won' : 'result.lost')
      head.className = `r-head ${won ? 'won' : 'lost'}`
      n.querySelector('.r-sub')!.textContent = `${this.t.t(m.endReason === 'frags' ? 'result.frags' : 'result.time')} · ${this.t.t('result.place', { place, total: board.length })}`
      n.querySelector('.r-stats')!.innerHTML = [
        stat(this.t.t('result.kills'), String(me.kills)),
        stat(this.t.t('result.deaths'), String(me.deaths)),
        stat(this.t.t('result.accuracy'), `${Math.round(accuracy(m) * 100)}%`),
        stat(this.t.t('result.headshots'), String(m.stats.headshots)),
        stat(this.t.t('result.streak'), String(m.stats.bestStreak)),
        stat(this.t.t('result.damage'), String(Math.round(m.stats.damageDealt))),
        stat(this.t.t('result.score'), m.score.toLocaleString('en-US'), true),
      ].join('') + (best ? `<div class="r-best">${this.t.t('result.best')}</div>` : '') + (m.unranked ? `<div class="r-best dim">${this.t.t('result.unranked')}</div>` : '')
      n.querySelector('.r-board')!.innerHTML = `<table>${board.map((c, i) => `<tr class="${c.isPlayer ? 'me' : ''}"><td>${i + 1}</td><td>${nm(c.name)}</td><td>${c.kills}</td><td>${c.deaths}</td></tr>`).join('')}</table>`
    }
    this.show('results')
    window.setTimeout(() => {
      const [x, y] = this.center(head)
      const won = head.classList.contains('won')
      this.sparks.burst(x, y, { count: 120, speed: 700, color: won ? '#ffd35c' : '#ff3a1a', life: 1 })
    }, 80)
  }
}
