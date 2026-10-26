import { type Game, SPIRIT_HEALER_WAVE, teamColor } from '../game/game'
import { POWERS, POWER_KINDS } from '../game/rules/hyjal-powers'
import { WAVE_NAMES, waveStage } from '../game/rules/hyjal'
import { MOUNT_CAST } from '../game/mount'
import { AB } from '../game/rules/ab'
import type { BuffKind } from '../game/rules/buffs'
import { WSG } from '../game/rules/wsg'
import { TEAMS, type Team } from '../game/teams'
import { WEAPONS } from '../game/weapons'
import { type Key, t, tm } from '../i18n'
import { minimapTransform } from '../world/minimap'

const fmt = (s: number) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`
const el = (cls: string, parent: HTMLElement, tag = 'div') => {
  const e = document.createElement(tag)
  e.className = cls
  parent.appendChild(e)
  return e
}
const icon = (name: string) => {
  const img = new Image()
  img.src = `./assets/ui/${name}.webp`
  return img
}
const esc = (s: string) => s.replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]!)

/** DOM heads-up display, refreshed every rendered frame from the game state. */
export class Hud {
  readonly root: HTMLElement
  private top: HTMLElement
  private crosshair: HTMLElement
  private hit: HTMLElement
  private hp: HTMLElement
  private ammo: HTMLElement
  private weapons: HTMLElement
  private feed: HTMLElement
  private banners: HTMLElement
  private channel: HTMLElement
  private death: HTMLElement
  private board: HTMLElement
  private flash: HTMLElement
  private carry: HTMLElement
  private radar: HTMLCanvasElement
  private hint: HTMLElement
  private scope: HTMLElement
  private scopeInfo: HTMLElement
  private powers: HTMLElement
  private haste: HTMLElement
  private lastBoard = 0
  private readonly runeIcons: Record<BuffKind, HTMLImageElement> = { speed: icon('icon-speed'), heal: icon('icon-heal') }

  constructor(parent: HTMLElement) {
    this.root = el('hud', parent)
    this.scope = el('scope', this.root)
    this.scopeInfo = el('info', this.scope)
    this.flash = el('flash', this.root)
    this.top = el('top', this.root)
    this.crosshair = el('crosshair', this.root)
    for (const side of ['t', 'b', 'l', 'r', 'dot', 'ring']) el('ch ' + side, this.crosshair)
    this.hit = el('hitmarker', this.root)
    this.hp = el('hp', this.root)
    this.haste = el('haste', this.root)
    this.powers = el('hyjal-powers', this.root)
    this.ammo = el('ammo', this.root)
    this.weapons = el('weapons', this.root)
    this.feed = el('feed', this.root)
    this.banners = el('banners', this.root)
    this.channel = el('channel', this.root)
    this.death = el('death', this.root)
    this.board = el('board', this.root)
    this.carry = el('carry', this.root)
    this.hint = el('hint', this.root)
    this.radar = el('radar', this.root, 'canvas') as HTMLCanvasElement
    this.radar.width = this.radar.height = 420
  }

  update(game: Game, scoreboard: boolean, crossPx: number): void {
    const p = game.player
    const w = p.weapon
    this.hint.textContent = game.defense?.match.state === 'break' ? t('hyjal.repair') : game.defense ? t('hyjal.controls') : t('menu.controls')
    this.top.innerHTML = game.defense ? this.hyjalTop(game) : game.wsg ? this.wsgTop(game) : this.abTop(game)
    const gap = 6 + crossPx
    this.crosshair.style.setProperty('--gap', `${gap}px`)
    this.crosshair.dataset.mode = w.mode
    // Iron sights replace the crosshair in first person; the shoulder camera keeps it.
    this.crosshair.style.display = p.alive && !(game.zoom && game.view === 'first') && !game.scoped ? '' : 'none'
    this.scope.style.display = game.scoped ? '' : 'none'
    if (game.scoped) {
      const range = game.rangefinder === null ? '—' : t('hud.scopeRange', { d: Math.round(game.rangefinder) })
      const steps = w.view.zoomFovs?.length ?? 1
      const html = `<b>×${game.magnify.toFixed(1)}</b><span>${range}</span>${steps > 1 ? `<small>${t('hud.scopeHint')}</small>` : ''}`
      if (this.scopeInfo.innerHTML !== html) this.scopeInfo.innerHTML = html
    }
    this.haste.style.display = p.alive && p.haste > 0 ? '' : 'none'
    if (p.haste > 0) this.haste.innerHTML = `<img src="${this.runeIcons.speed.src}" alt=""><span>${t('hud.haste')}</span><b>${Math.ceil(p.haste)}</b>`
    this.powers.style.display=game.defense?'':'none'
    if(game.defense) {
      const defense=game.defense,drop=defense.nearestSupply(p.pos)
      const active=POWER_KINDS.filter(k=>p.powers.left[k]>0).map(k=>`<div class="power-active" style="--power:#${POWERS[k].color.toString(16)}"><b>${POWERS[k].symbol}</b><span>${t(`hyjal.power.${k}`)}</span><strong>${Math.ceil(p.powers.left[k])}s</strong></div>`).join('')
      const next=drop?t('hyjal.powerNearest',{name:t(`hyjal.power.${drop.kind}`),d:Math.round(Math.hypot(p.pos.x-defense.supplySites[drop.slot].x,p.pos.z-defense.supplySites[drop.slot].z)),s:Math.ceil(drop.expires-defense.supplies.time)}):t('hyjal.powerNext',{s:Math.ceil(defense.supplies.next-defense.supplies.time)})
      this.powers.innerHTML=`${p.powers.unlimitedFire?`<div class="power-active permanent"><b>∞</b><span>${t('hyjal.unlimitedFire')}</span><strong>${t('hyjal.fireBonuses')}</strong></div>`:''}${active}<div class="power-guide">${next}<small>${t('hyjal.powerHint')}</small></div>`
    }
    this.hit.style.opacity = game.hitMarker > 0 ? '1' : '0'
    this.hit.classList.toggle('head', game.hitHead)
    this.flash.style.opacity = String(game.damageFlash * 0.45)
    const hpPct = p.maxHp > 0 ? p.hp / p.maxHp : 0
    this.hp.innerHTML = `<span class="label">${t('hud.hp')}</span><b style="color:${hpPct > 0.35 ? '#e8f5d0' : '#ff7060'}">${Math.max(0, Math.ceil(p.hp))}</b>`

    let ammo: string
    if (p.switchTimer > 0) ammo = `<b class="small">${t('hud.switching')}</b>`
    else if (w.mode === 'melee') ammo = `<b class="small">${t('hud.melee')}</b>`
    else if (p.powers.unlimitedFire) ammo = `<b>∞</b><span> ${t('hyjal.unlimitedFire')}</span>`
    else if (p.powers.infiniteAmmo) ammo = `<b>∞</b><span> ${Math.ceil(p.powers.left.ammo)}s</span>`
    else if (p.reloading) ammo = `<b class="small">${t('hud.reloading')}</b><i style="width:${(1 - p.reloadTimer / p.reloadTotal) * 100}%"></i>`
    else ammo = `<b>${p.ammo}</b><span> / ${p.reserve}</span>`
    this.ammo.innerHTML = `<div class="wname">${t(`weapon.${w.id}` as Key)}</div>${ammo}`
    this.ammo.classList.toggle('low', w.mode !== 'melee' && !p.powers.infiniteAmmo && p.ammo <= w.magazine * 0.2)
    this.weapons.innerHTML = p.loadout
      .map(id => {
        const def = WEAPONS[id]
        const a = p.ammoFor(id)
        const count = def.mode === 'melee' || p.powers.infiniteAmmo ? '∞' : `${a.ammo}/${a.reserve}`
        const on = id === p.weaponId
        return `<div class="slot ${on ? 'on' : ''} ${def.mode !== 'melee' && a.ammo === 0 ? 'empty' : ''}"><em>${def.slot}</em><span>${t(`weaponKind.${id}` as Key)}</span><small>${count}</small></div>`
      })
      .join('')

    this.feed.innerHTML = game.feed
      .filter(f => game.time - f.time < 8)
      .map(f => {
        const who = f.attacker ? esc(f.attacker.name) : t('feed.world')
        const wpn = f.weapon ? `<span class="wpn">[${t('feed.weapon', { weapon: f.weapon })}]</span>` : '→'
        return `<div style="color:${f.color}">${who} ${wpn}${f.head ? ' <b class="hs">⌖</b>' : ''} <span style="color:${teamColor(f.victim.team)}">${esc(f.victim.name)}</span></div>`
      })
      .join('')
    game.banners = game.banners.filter(b => b.time > game.time)
    this.banners.innerHTML = game.banners.map(b => `<div style="color:${b.color}">${esc(tm(b.msg))}</div>`).join('')
    if (game.phase === 'prep') this.banners.innerHTML += `<div class="big">${Math.ceil(game.prep)}</div>`

    const ch = game.ab?.channels.get(p.id)
    if (p.mountCast > 0) {
      this.channel.style.display = ''
      this.channel.innerHTML = `<span>${t('hud.mounting')}</span><i style="width:${((MOUNT_CAST - p.mountCast) / MOUNT_CAST) * 100}%"></i>`
    } else if (ch) {
      this.channel.style.display = ''
      this.channel.innerHTML = `<span>${t('hud.channel', { node: ch.node })}</span><i style="width:${(ch.t / AB.channel) * 100}%"></i>`
    } else this.channel.style.display = 'none'

    if (!p.alive && game.phase !== 'over') {
      this.death.style.display = ''
      const gy = game.nearestGraveyard(p)
      this.death.innerHTML = `<div>${t('hud.dead')}</div><small>${t('hud.respawn', { s: Math.ceil(game.wave), gy: gy.id, wave: SPIRIT_HEALER_WAVE })}</small>`
    } else this.death.style.display = 'none'

    const carrying = game.wsg?.carrying(p.id)
    this.carry.style.display = carrying ? '' : 'none'
    if (carrying) {
      const home = game.wsg!.flags[p.team].status === 'base'
      const stacks = game.wsg!.assaultStacks
      this.carry.innerHTML = t('hud.carry', { flag: carrying, home: home ? 1 : 0 }) + (stacks ? t('hud.assault', { n: stacks }) : '')
    }

    this.root.style.display = game.phase === 'over' ? 'none' : ''
    this.board.style.display = scoreboard ? '' : 'none'
    if (this.board.style.display === '' && performance.now() - this.lastBoard > 250) {
      this.lastBoard = performance.now()
      this.board.innerHTML = this.scoreboard(game)
    }
    this.drawRadar(game)
  }

  private hyjalTop(game: Game): string {
    const m=game.defense!.match
    const phase=m.state==='break'?t('hyjal.break',{s:Math.ceil(m.countdown),n:m.wave,total:m.totalLabel}):t('hyjal.wave',{n:m.wave,total:m.totalLabel,left:m.remaining})
    const alive=[...game.defense!.invaders.values()].filter(m=>m.agent.alive),air=alive.filter(m=>m.kind==='flyer').length
    const name=t(`hyjal.wave.${WAVE_NAMES[m.endless?waveStage(m.state==='break'?m.wave+1:m.wave)-1:Math.min(8,m.state==='break'?m.wave:m.wave-1)]}`)
    return `<div class="hyjal-top"><span>${t(`map.${game.opts.map}`)}${m.endless?` · ${t('hyjal.unlimitedFire')}`:''}</span><b>${phase}</b><small>${name} · ${t('hyjal.threats',{ground:alive.length-air,air,incoming:game.defense!.warnings.length})}</small><div class="core-health"><i style="width:${m.hp/m.maxHp*100}%"></i><strong>${t('hyjal.core')} ${Math.ceil(m.hp)} / ${m.maxHp}</strong></div></div>`
  }

  private wsgTop(game: Game): string {
    const m = game.wsg!
    const flagText = (team: Team) => {
      const f = m.flags[team]
      const carrier = game.agents.find(a => a.id === f.carrier)
      const s = Math.ceil(f.timer)
      const status = { base: t('hud.flagBase'), carried: t('hud.flagCarried', { name: esc(carrier?.name ?? '?') }), dropped: t('hud.flagDropped', { s }), respawning: t('hud.flagRespawning', { s }) }[f.status]
      return t('hud.flagLine', { team, status })
    }
    return `<div class="score">
      <span class="team a">${t('team.alliance')} <b>${m.score.alliance}</b></span>
      <span class="clock">${fmt(m.timeLeft)}<small>${t('hud.firstCaps', { n: WSG.capturesToWin })}</small></span>
      <span class="team h"><b>${m.score.horde}</b> ${t('team.horde')}</span></div>
      <div class="sub"><span style="color:${teamColor('alliance')}">${flagText('alliance')}</span><span style="color:${teamColor('horde')}">${flagText('horde')}</span></div>`
  }

  private abTop(game: Game): string {
    const m = game.ab!
    const bar = (team: Team) =>
      `<span class="res ${team === 'alliance' ? 'a' : 'h'}"><i style="width:${(m.resources[team] / AB.win) * 100}%"></i><b>${t(`team.${team}`)} ${m.resources[team]}/${AB.win}</b><small>${t('hud.nodes', { n: m.controlled(team) })}</small></span>`
    const nodes = m.nodes
      .map(n => {
        const color = n.assaulter ? teamColor(n.assaulter) : n.owner ? teamColor(n.owner) : '#bbb'
        const mark = n.assaulter ? `<em>${Math.ceil(n.timer)}</em>` : ''
        return `<span class="node ${n.assaulter ? 'contested' : ''}" style="border-color:${color};color:${color}">${t(`node.${n.id}` as Key)}${mark}</span>`
      })
      .join('')
    return `<div class="score">${bar('alliance')}<span class="clock">${fmt(m.elapsed)}</span>${bar('horde')}</div><div class="nodes">${nodes}</div>`
  }

  scoreboard(game: Game): string {
    if(game.defense) {
      const players=game.agents.filter(a=>a.team===game.player.team).sort((a,b)=>b.stats.kills-a.stats.kills)
      return `<table><caption>${t('hyjal.core')}</caption><tr><th>${t('board.name')}</th><th>${t('board.kills')}</th><th>${t('board.deaths')}</th><th>${t('board.damage')}</th></tr>${players.map(a=>`<tr class="${a.isPlayer?'me':''}"><td>${esc(a.name)}</td><td>${a.stats.kills}</td><td>${a.stats.deaths}</td><td>${Math.round(a.stats.damage)}</td></tr>`).join('')}</table>`
    }
    const rows = (team: Team) =>
      game.agents
        .filter(a => a.team === team)
        .sort((x, y) => y.stats.kills - x.stats.kills)
        .map(
          a =>
            `<tr class="${a.isPlayer ? 'me' : ''} ${a.alive ? '' : 'dead'}"><td>${esc(a.name)}</td><td>${a.stats.kills}</td><td>${a.stats.deaths}</td><td>${Math.round(a.stats.damage)}</td><td>${game.wsg ? a.stats.caps : a.stats.assaults}</td><td>${game.wsg ? a.stats.returns : a.stats.defends}</td></tr>`,
        )
        .join('')
    const head = `<tr><th>${t('board.name')}</th><th>${t('board.kills')}</th><th>${t('board.deaths')}</th><th>${t('board.damage')}</th><th>${t(game.wsg ? 'board.caps' : 'board.assaults')}</th><th>${t(game.wsg ? 'board.returns' : 'board.defends')}</th></tr>`
    return TEAMS.map(team => `<table class="${team}"><caption style="color:${teamColor(team)}">${t(`team.${team}`)}</caption>${head}${rows(team)}</table>`).join('')
  }

  private drawRadar(game: Game): void {
    const ctx = this.radar.getContext('2d')!
    const size = this.radar.width
    const c = size / 2
    const range = 220
    const radius = c - 10
    const p = game.player
    ctx.setTransform(1, 0, 0, 1, 0, 0)
    ctx.clearRect(0, 0, size, size)
    ctx.save()
    ctx.beginPath()
    ctx.arc(c, c, radius, 0, Math.PI * 2)
    ctx.clip()
    ctx.fillStyle = '#9ec4d4'
    ctx.fillRect(0, 0, size, size)
    const map = game.level.world.overview()
    const m = minimapTransform(p.pos.x, p.pos.z, p.yaw, range, radius, c, map.minX, map.maxZ, map.ppm)
    ctx.setTransform(m.a, m.b, m.c, m.d, m.e, m.f)
    ctx.drawImage(map.canvas, 0, 0)
    ctx.restore()
    ctx.setTransform(1, 0, 0, 1, 0, 0)
    ctx.beginPath()
    ctx.arc(c, c, radius, 0, Math.PI * 2)
    ctx.lineWidth = 6
    ctx.strokeStyle = '#f0d78a'
    ctx.stroke()
    // Rotate so the view direction points up.
    const yaw = p.yaw
    const toScreen = (x: number, z: number): [number, number] | null => {
      const dx = x - p.pos.x
      const dz = z - p.pos.z
      const fwd = dx * Math.sin(yaw) + dz * Math.cos(yaw)
      const right = dx * -Math.cos(yaw) + dz * Math.sin(yaw)
      const sx = c + (right / range) * radius
      const sy = c - (fwd / range) * radius
      const clamp = Math.hypot(sx - c, sy - c) > radius
      if (clamp) {
        const a = Math.atan2(sy - c, sx - c)
        return [c + Math.cos(a) * radius, c + Math.sin(a) * radius]
      }
      return [sx, sy]
    }
    const dot = (x: number, z: number, color: string, r: number) => {
      const s = toScreen(x, z)
      if (!s) return
      ctx.beginPath()
      ctx.arc(s[0], s[1], r, 0, Math.PI * 2)
      ctx.fillStyle = color
      ctx.fill()
      ctx.lineWidth = 3
      ctx.strokeStyle = 'rgba(20, 16, 8, 0.9)'
      ctx.stroke()
    }
    if(game.defense) {
      dot(game.defense.core.x,game.defense.core.z,'#8df4ff',17)
      for(const gate of game.defense.gates)dot(gate.x,gate.z,'#ff633e',10)
      for(const warning of game.defense.warnings)dot(warning.pos.x,warning.pos.z,'#ffd768',14)
      for(const drop of game.defense.supplies.drops) {const site=game.defense.supplySites[drop.slot];dot(site.x,site.z,'#'+POWERS[drop.kind].color.toString(16),13)}
    }
    if (game.wsg) {
      for (const team of TEAMS) {
        const f = game.wsg.flags[team]
        if (f.status === 'respawning') continue
        dot(f.pos.x, f.pos.z, teamColor(team), 14)
        dot(f.pos.x, f.pos.z, '#fff', 6)
      }
    }
    if (game.ab) {
      for (const n of game.ab.nodes) {
        const s = toScreen(n.pos.x, n.pos.z)
        if (!s) continue
        ctx.fillStyle = n.assaulter ? teamColor(n.assaulter) : n.owner ? teamColor(n.owner) : '#f4f0e4'
        ctx.fillRect(s[0] - 11, s[1] - 11, 22, 22)
        ctx.lineWidth = 3
        ctx.strokeStyle = 'rgba(20, 16, 8, 0.9)'
        ctx.strokeRect(s[0] - 11, s[1] - 11, 22, 22)
        ctx.fillStyle = '#1a140c'
        ctx.font = 'bold 16px sans-serif'
        ctx.fillText(t(`node.${n.id}` as Key)[0], s[0] - 6, s[1] + 6)
      }
    }
    for (const spot of game.buffs.spots) {
      if (!game.buffs.ready(spot)) continue
      const s = toScreen(spot.pos.x, spot.pos.z)
      const img = this.runeIcons[spot.kind]
      if (s && img.complete) ctx.drawImage(img, s[0] - 13, s[1] - 13, 26, 26)
    }
    for (const a of game.agents) {
      if (a === p || !a.alive) continue
      const friendly = a.team === p.team
      // Enemies only show when close or carrying a flag (flag carriers are tracked on the WoW map too).
      if (!game.defense && !friendly && a.pos.distanceTo(p.pos) > 25 && !game.wsg?.carrying(a.id)) continue
      dot(a.pos.x, a.pos.z, friendly ? (game.defense ? '#79caff' : teamColor(a.team)) : '#ff3020', 8)
    }
    ctx.beginPath()
    ctx.moveTo(c, c - 16)
    ctx.lineTo(c - 11, c + 12)
    ctx.lineTo(c + 11, c + 12)
    ctx.closePath()
    ctx.fillStyle = '#ffe27a'
    ctx.fill()
    ctx.lineWidth = 3
    ctx.strokeStyle = '#2a2114'
    ctx.stroke()
  }
}
