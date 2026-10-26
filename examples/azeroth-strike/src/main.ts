import { Input } from './engine/input'
import { GameLoop } from './engine/loop'
import { Renderer } from './engine/renderer'
import { audio, type Bus } from './engine/audio'
import type { LoadState } from './engine/loader'
import { clampPlayerHp, PLAYER_HP } from './game/agent'
import { type Difficulty, Game, teamColor, type View } from './game/game'
import type { Team } from './game/teams'
import { type Key, LANG_LABEL, LANGS, type Lang, lang, onLangChange, setLang, t, tm } from './i18n'
import { sharePost } from './game/share'
import { Hud } from './ui/hud'
import { githubLink } from './ui/github'
import { GAME_URL, GAME_PUBLISHED } from './game/publication'
import { copyImage, prepareXShare } from './ui/share-actions'
import { captureMatchFrame, canvasBlob, downloadBlob, drawShareCard } from './ui/sharecard'

const canvas = document.getElementById('game') as HTMLCanvasElement
const ui = document.getElementById('ui') as HTMLElement
const renderer = new Renderer(canvas)
const input = new Input(canvas)
const params = new URLSearchParams(location.search)

let game: Game | null = null
let hud: Hud | null = null
const overlay = document.createElement('div')
overlay.className = 'overlay'
ui.appendChild(overlay)

const VIEW_STORE = 'wowfps.view'
const savedView = (): View => {
  try {
    return localStorage.getItem(VIEW_STORE) === 'third' ? 'third' : 'first'
  } catch {
    return 'first'
  }
}
const save = (key: string, value: string) => {
  try {
    localStorage.setItem(key, value)
  } catch {
    // storage blocked
  }
}

const SETTINGS_STORE = 'wowfps.settings'
/** Bumped when a default changes. Version 2: player health went from 500 to 1000. */
const SETTINGS_VERSION = 2
const settings: { v: number; sensitivity: number; invertY: boolean; playerHp: number } = { v: SETTINGS_VERSION, sensitivity: 1, invertY: false, playerHp: PLAYER_HP.default }
try {
  const saved = JSON.parse(localStorage.getItem(SETTINGS_STORE) ?? '{}')
  // Every save wrote the old 500 default along with the other settings, chosen or not.
  if (!saved.v && saved.playerHp === 500) delete saved.playerHp
  Object.assign(settings, saved, { v: SETTINGS_VERSION })
} catch {
  // storage blocked or corrupt
}
settings.playerHp = clampPlayerHp(Number(settings.playerHp))
if (params.has('hp')) settings.playerHp = clampPlayerHp(Number(params.get('hp')))
function applySettings(): void {
  input.sensitivity = settings.sensitivity
  input.invertY = settings.invertY
}
function saveSettings(): void {
  applySettings()
  save(SETTINGS_STORE, JSON.stringify(settings))
}
applySettings()

type Choice = { map: 'wsg' | 'ab' | 'hyjal'; team: Team; difficulty: Difficulty; teamSize: number; view: View; lang: Lang }
const choice: Choice = {
  map: (params.get('map') as 'wsg' | 'ab' | 'hyjal') ?? 'wsg',
  team: (params.get('team') as Team) ?? 'alliance',
  difficulty: (params.get('difficulty') as Difficulty) ?? 'normal',
  teamSize: Number(params.get('size') ?? 0),
  view: (params.get('view') as View) ?? savedView(),
  lang: lang(),
}

/** Which screen is up, so a language change can redraw it. */
let screen: 'menu' | 'loading' | 'click' | 'paused' | 'end' | 'none' = 'none'
/** Title screen: the game picker, or the settings sheet folded out of it. */
let menuPane: 'play' | 'setup' = 'play'
let loadState: LoadState = { stage: 'load.title', fraction: 0, loadedBytes: 0, totalBytes: 0 }
/** Timing of the last match load, for the test hooks. */
let lastLoad: { ms: number; bytes: number; map: string } | null = null
const TIP_COUNT = 12
let tip = 1 + Math.floor(Math.random() * TIP_COUNT)
let loadFrame = 0

const syncTitle = () => (document.title = lang() === 'zh' ? `${t('title')} · Azeroth Strike` : t('title'))
document.documentElement.lang = lang() === 'zh' ? 'zh-CN' : 'en'
syncTitle()

const loop = new GameLoop({
  step: dt => {
    input.update()
    game?.step(dt)
    input.endFrame()
  },
  render: (alpha, frameSeconds) => {
    // Paused means no sim steps, so poll here or a gamepad's Start could never resume.
    if (loop.paused) input.update()
    if (input.consume('pause')) {
      if (screen === 'none') openSettings()
      else if (screen === 'paused') resume()
    }
    if (screen === 'none' && input.consume('mute')) toggleMute()
    if (!game) {
      renderer.camera.rotation.y += frameSeconds * 0.03
      renderer.render()
      return
    }
    game.render(alpha, frameSeconds)
    const cam = renderer.camera
    const w = game.player.weapon
    const cone = game.player.spread() + w.pelletSpread
    const spreadPx = (cone / Math.tan((cam.fov * Math.PI) / 360)) * (window.innerHeight / 2)
    hud?.update(game, input.held('scoreboard'), spreadPx)
  },
})
loop.speed = Number(params.get('speed') ?? 1)

const langButtons = () => LANGS.map(l => `<button class="opt lang ${lang() === l ? 'on' : ''}" data-lang="${l}">${LANG_LABEL[l]}</button>`).join('')

function bindLang(): void {
  overlay.querySelectorAll<HTMLButtonElement>('button[data-lang]').forEach(b =>
    b.addEventListener('click', e => {
      e.stopPropagation()
      setLang(b.dataset.lang as Lang)
    }),
  )
}

const pct = (n: number) => `${Math.round(n * 100)}%`
let sharePreview: string | null = null
let shareGeneration = 0
const matchFrames = new WeakMap<Game, string | null>()
function clearEndShare(): void {
  shareGeneration++
  if (sharePreview) URL.revokeObjectURL(sharePreview)
  sharePreview = null
}

function audioSliders(): string {
  const slider = (bus: Bus) =>
    `<div class="row"><label>${t(`settings.${bus}` as Key)}</label><input type="range" data-bus="${bus}" min="0" max="1" step="0.05" value="${audio.volumes[bus]}"><output>${pct(audio.volumes[bus])}</output></div>`
  return `${slider('master')}${slider('sfx')}${slider('music')}`
}

/** Keeps `--p` (the filled share of the track) in step with each slider for the styled tracks. */
function paintRanges(root: ParentNode): void {
  root.querySelectorAll<HTMLInputElement>('input[type="range"]').forEach(el => {
    const paint = () => {
      const min = Number(el.min)
      el.style.setProperty('--p', `${((Number(el.value) - min) / (Number(el.max) - min)) * 100}%`)
    }
    paint()
    el.addEventListener('input', paint)
  })
}

function bindAudio(root: ParentNode): void {
  root.querySelectorAll<HTMLInputElement>('input[data-bus]').forEach(el => {
    const bus = el.dataset.bus as Bus
    el.addEventListener('input', () => {
      audio.setVolume(bus, Number(el.value))
      el.nextElementSibling!.textContent = pct(audio.volumes[bus])
    })
    if (bus === 'sfx') el.addEventListener('change', () => audio.play('click'))
  })
  root.querySelector('[data-mute]')?.addEventListener('click', () => {
    toggleMute()
    if (screen === 'menu') showMenu()
    else if (screen === 'paused') showSettings()
  })
}

function hpRow(): string {
  return `<div class="row"><label>${t('settings.hp')}</label><input type="range" class="player-hp" min="${PLAYER_HP.min}" max="${PLAYER_HP.max}" step="${PLAYER_HP.step}" value="${settings.playerHp}"><output>${settings.playerHp}</output></div>`
}

const seg = (label: string, options: string) => `<div class="row"><label>${label}</label><div class="seg">${options}</div></div>`
const check = (attr: string, on: boolean, label: string) =>
  `<button class="check ${on ? 'on' : ''}" ${attr} role="switch" aria-checked="${on}"><i></i>${label}</button>`

function bindPlayerHp(root: ParentNode): void {
  const el = root.querySelector<HTMLInputElement>('input.player-hp')
  if (!el) return
  el.addEventListener('input', () => {
    settings.playerHp = clampPlayerHp(Number(el.value))
    el.nextElementSibling!.textContent = String(settings.playerHp)
    saveSettings()
    game?.player.setMaxHp(settings.playerHp)
  })
}

function toggleMute(): void {
  audio.setMuted(!audio.muted)
  if (game && screen === 'none') game.banner({ key: audio.muted ? 'audio.muted' : 'audio.unmuted' }, '#d8e6ff', 1.4)
}

function showMenu(): void {
  screen = 'menu'
  const opt = <T extends string | number>(name: keyof Choice, value: T, label: string) =>
    `<button class="opt ${choice[name] === value ? 'on' : ''}" data-k="${name}" data-v="${value}">${label}</button>`
  const art = loadingArt(menuPane === 'play' ? 'wsg' : choice.map)
  overlay.style.display = ''
  overlay.className = 'overlay menu poster'
  const crest = (team: Team) => {
    const [name, race] = t(`menu.${team}`).split(/\s*[（(]|[）)]/)
    const on = choice.team === team
    return `<button class="crest ${team} ${on ? 'on' : ''}" data-k="team" data-v="${team}" aria-pressed="${on}">
      <i class="crest-art"></i><span class="crest-name">${name}</span><small>${race ?? ''}</small></button>`
  }
  const mode = (map: 'wsg' | 'ab' | 'hyjal') => `
      <button class="mode ${map}" data-map="${map}">
        <span class="mode-kicker">${t(`menu.${map}Size`)}</span><b>${t(`menu.${map}Name`)}</b><small>${t(`menu.${map}Sub`)}</small>
        <span class="mode-go">${t('menu.start')}</span>
      </button>`
  const play = `
    <header class="poster-title">
      <h1>${t('title')}</h1>
      <p class="kicker">${t('menu.kicker')}</p>
    </header>
    <div class="poster-bar">
      <section class="factions" role="group" aria-label="${t('menu.faction')}">
        <h3>${t('menu.faction')}</h3>
        <div class="crests">${crest('alliance')}${crest('horde')}</div>
      </section>
      <section class="modes" aria-label="${t('menu.map')}">
        <h3>${t('menu.tagline')}</h3>
        <div class="tickets">${mode('wsg')}${mode('ab')}${mode('hyjal')}</div>
      </section>
    </div>
    <footer class="menu-footer">
      <div class="menu-links"><button class="textbtn" data-open-setup="1">${t('menu.settings')}</button>${githubLink()}</div>
      <p class="menu-disclaimer">${t('menu.disclaimer')}</p>
    </footer>`
  const setup = `
    <h2 class="sheet-title">${t('settings.title')}</h2>
    <div class="sheet-cols">
      <section>
        <h3>${t('settings.match')}</h3>
        ${seg(t('menu.bots'), opt('difficulty', 'easy', t('menu.easy')) + opt('difficulty', 'normal', t('menu.normal')) + opt('difficulty', 'hard', t('menu.hard')))}
        ${choice.map==='hyjal'?`<p class="hint">${t(`hyjal.diff.${choice.difficulty}`)}</p>`:''}
        ${seg(t('menu.size'), opt('teamSize', 0, t('menu.sizeStd')) + opt('teamSize', 5, '5') + opt('teamSize', 8, '8'))}
        ${seg(t('menu.view'), opt('view', 'first', t('menu.first')) + opt('view', 'third', t('menu.third')))}
        ${hpRow()}
        <h3>${t('settings.controls')}</h3>
        <div class="row"><label>${t('settings.sensitivity')}</label><input type="range" class="sens" min="0.2" max="3" step="0.05" value="${settings.sensitivity}"><output>${settings.sensitivity.toFixed(2)}</output></div>
        <div class="row"><label></label>${check(`data-invert="${settings.invertY ? 0 : 1}"`, settings.invertY, t('settings.invertY'))}</div>
      </section>
      <section>
        <h3>${t('settings.audio')}</h3>
        ${audioSliders()}
        <div class="row"><label></label>${check('data-mute="1"', audio.muted, t('settings.mute'))}</div>
        <h3>${t('menu.lang')}</h3>
        ${seg('', langButtons())}
      </section>
    </div>
    <footer class="sheet-foot">
      <button class="redbtn" data-close-setup="1">${t('menu.back')}</button>
    </footer>`
  overlay.innerHTML = `
    <div class="poster-art" style="background-image:url(${art})"></div>
    <div class="poster-shade"></div>
    <div class="poster-panel ${menuPane === 'setup' ? 'sheet' : ''}">${menuPane === 'setup' ? setup : play}</div>`
  overlay.querySelectorAll<HTMLButtonElement>('.opt[data-k]').forEach(b =>
    b.addEventListener('click', () => {
      const k = b.dataset.k as keyof Choice
      const raw = b.dataset.v ?? ''
      ;(choice as Record<string, unknown>)[k] = typeof choice[k] === 'number' ? Number(raw) : raw
      if (k === 'view') save(VIEW_STORE, choice.view)
      showMenu()
    }),
  )
  overlay.querySelectorAll<HTMLButtonElement>('.crest[data-k]').forEach(b =>
    b.addEventListener('click', () => {
      choice.team = b.dataset.v as Team
      showMenu()
    }),
  )
  const paintArt = (map: string) => {
    const bg = overlay.querySelector<HTMLElement>('.poster-art')
    if (bg) bg.style.backgroundImage = `url(${loadingArt(map)})`
  }
  overlay.querySelector('.modes')?.addEventListener('mouseleave', () => paintArt('wsg'))
  overlay.querySelectorAll<HTMLButtonElement>('[data-map]').forEach(b => {
    b.addEventListener('mouseenter', () => paintArt(b.dataset.map!))
    b.addEventListener('click', () => {
      choice.map = b.dataset.map as 'wsg' | 'ab' | 'hyjal'
      void start()
    })
  })
  overlay.querySelectorAll<HTMLButtonElement>('button[data-invert]').forEach(b =>
    b.addEventListener('click', () => {
      settings.invertY = b.dataset.invert === '1'
      saveSettings()
      showMenu()
    }),
  )
  overlay.querySelector('[data-open-setup]')?.addEventListener('click', () => {
    menuPane = 'setup'
    showMenu()
  })
  overlay.querySelector('[data-close-setup]')?.addEventListener('click', () => {
    menuPane = 'play'
    showMenu()
  })
  const sens = overlay.querySelector<HTMLInputElement>('.sens')
  sens?.addEventListener('input', () => {
    settings.sensitivity = Number(sens.value)
    sens.nextElementSibling!.textContent = settings.sensitivity.toFixed(2)
    saveSettings()
  })
  bindLang()
  bindAudio(overlay)
  bindPlayerHp(overlay)
  paintRanges(overlay)
}

const mb = (bytes: number) => (bytes / 1048576).toFixed(1)
const loadingArt = (map: string) => `./assets/ui/loading-${map.startsWith('hyjal') ? 'hyjal' : map}.webp`

/** WoW-style loading screen: the battleground's client loading art, the client loading bar, tips. */
function showLoading(): void {
  screen = 'loading'
  overlay.style.display = ''
  overlay.className = 'overlay loading'
  overlay.innerHTML = `
    <div class="art" style="background-image:url(${loadingArt(choice.map)})"></div>
    <div class="loadbox">
      <h2>${t(`map.${choice.map}`)}</h2>
      <p class="mode">${t(choice.map === 'hyjal' ? 'load.mode.defense' : choice.map === 'wsg' ? 'load.mode.ctf' : 'load.mode.dom')}</p>
      <p class="tip"><b>${t('load.tip')}</b><span></span></p>
      <div class="wowbar"><div class="track"><div class="fill"><i class="spark"></i></div></div><div class="frame"></div><span class="pct"></span></div>
      <p class="label"></p>
    </div>`
  renderTip()
  renderLoad()
}

function renderTip(): void {
  const el = overlay.querySelector('.loadbox .tip span')
  if (el) el.textContent = choice.map === 'hyjal' ? t('hyjal.intro') : t(`tip.${tip}` as Key)
}

function renderLoad(): void {
  loadFrame = 0
  if (screen !== 'loading') return
  const s = loadState
  const fill = overlay.querySelector<HTMLElement>('.wowbar .fill')
  if (fill) fill.style.width = `${(s.fraction * 100).toFixed(1)}%`
  const pct = overlay.querySelector('.wowbar .pct')
  if (pct) pct.textContent = `${Math.floor(s.fraction * 100)}%`
  const label = overlay.querySelector('.loadbox .label')
  if (label) label.textContent = s.stage === 'load.download' ? t('load.download', { done: mb(s.loadedBytes), total: mb(s.totalBytes) }) : t(s.stage)
}

setInterval(() => {
  if (screen !== 'loading') return
  tip = (tip % TIP_COUNT) + 1
  renderTip()
}, 6000)

async function start(): Promise<void> {
  clearEndShare()
  setPaused(false)
  if (game) {
    game.dispose()
    game = null
  }
  hud?.root.remove()
  hud = null
  loadState = { stage: 'load.title', fraction: 0, loadedBytes: 0, totalBytes: 0 }
  showLoading()
  const started = performance.now()
  try {
    game = await Game.create(
      renderer,
      input,
      { map: choice.map === 'hyjal' ? `hyjal-${choice.team}` : choice.map, team: choice.team, difficulty: choice.difficulty, teamSize: choice.map === 'hyjal' ? undefined : choice.teamSize || undefined, autopilot: params.has('autopilot'), view: choice.view, playerHp: settings.playerHp },
      state => {
        loadState = state
        loadFrame ||= requestAnimationFrame(renderLoad)
      },
    )
    lastLoad = { ms: Math.round(performance.now() - started), bytes: loadState.totalBytes, map: choice.map }
  } catch (err) {
    screen = 'none'
    overlay.innerHTML = `<h2>${t('load.failed')}</h2><pre>${String((err as Error).stack ?? err)}</pre>`
    throw err
  }
  game.onEnd = showEnd
  hud = new Hud(ui)
  showClick()
  if (params.has('autopilot') || params.has('nolock')) {
    input.debugLock = true
    overlay.style.display = 'none'
    screen = 'none'
  }
  loop.resetAccumulator()
}

function showClick(): void {
  screen = 'click'
  overlay.style.display = ''
  overlay.className = 'overlay click'
  overlay.innerHTML = `<p>${t('click.start')}</p><small>${t('click.who', { map: choice.map === 'hyjal' ? `hyjal-${choice.team}` : choice.map, team: choice.team })}</small>`
}

function setPaused(paused: boolean): void {
  loop.paused = paused
  input.suspended = paused
  if (!paused) {
    loop.resetAccumulator()
    input.flush()
  }
}

function openSettings(): void {
  if (!game || game.phase === 'over' || screen !== 'none') return
  setPaused(true)
  input.unlockPointer()
  showSettings()
}

/** With pointer lock, play resumes only once the lock is back (see pointerlockchange). */
function resume(): void {
  if (input.debugLock) closeSettings()
  else input.lockPointer()
}

function closeSettings(): void {
  if (screen !== 'paused') return
  overlay.style.display = 'none'
  screen = 'none'
  setPaused(false)
}

function showSettings(): void {
  screen = 'paused'
  const opt = (attr: string, on: boolean, label: string) => `<button class="opt ${on ? 'on' : ''}" ${attr}>${label}</button>`
  overlay.style.display = ''
  overlay.className = 'overlay settings'
  overlay.innerHTML = `<div class="poster-panel sheet">
    <h2 class="sheet-title">${t('settings.title')}</h2>
    <div class="sheet-cols">
      <section>
        <h3>${t('settings.controls')}</h3>
        ${seg(t('menu.view'), opt('data-view="first"', game?.view === 'first', t('menu.first')) + opt('data-view="third"', game?.view === 'third', t('menu.third')))}
        ${hpRow()}
        <div class="row"><label>${t('settings.sensitivity')}</label><input type="range" class="sens" min="0.2" max="3" step="0.05" value="${settings.sensitivity}"><output>${settings.sensitivity.toFixed(2)}</output></div>
        <div class="row"><label></label>${check(`data-invert="${settings.invertY ? 0 : 1}"`, settings.invertY, t('settings.invertY'))}</div>
      </section>
      <section>
        <h3>${t('settings.audio')}</h3>
        ${audioSliders()}
        <div class="row"><label></label>${check('data-mute="1"', audio.muted, t('settings.mute'))}</div>
        <h3>${t('menu.lang')}</h3>
        ${seg('', langButtons())}
      </section>
    </div>
    <footer class="sheet-foot">
      <button class="redbtn resume">${t('settings.resume')}</button>
      <button class="redbtn restart">${t('settings.restart')}</button>
      <button class="redbtn menu-btn">${t('end.menu')}</button>
      <p class="hint">${t('settings.hint')}</p>
    </footer>
  </div>`
  const sens = overlay.querySelector<HTMLInputElement>('.sens')!
  sens.addEventListener('input', () => {
    settings.sensitivity = Number(sens.value)
    sens.nextElementSibling!.textContent = settings.sensitivity.toFixed(2)
    saveSettings()
  })
  overlay.querySelectorAll<HTMLButtonElement>('button[data-invert]').forEach(b =>
    b.addEventListener('click', () => {
      settings.invertY = b.dataset.invert === '1'
      saveSettings()
      showSettings()
    }),
  )
  overlay.querySelectorAll<HTMLButtonElement>('button[data-view]').forEach(b =>
    b.addEventListener('click', () => {
      choice.view = b.dataset.view as View
      save(VIEW_STORE, choice.view)
      game?.setView(choice.view)
      showSettings()
    }),
  )
  bindLang()
  bindAudio(overlay)
  bindPlayerHp(overlay)
  paintRanges(overlay)
  overlay.querySelector('.resume')!.addEventListener('click', resume)
  overlay.querySelector('.restart')!.addEventListener('click', () => start())
  overlay.querySelector('.menu-btn')!.addEventListener('click', quitToMenu)
}

function showEnd(g: Game): void {
  clearEndShare()
  const generation = shareGeneration
  if (!matchFrames.has(g)) matchFrames.set(g, captureMatchFrame(canvas))
  screen = 'end'
  const r = g.result!
  const won = r.winner === g.player.team
  overlay.style.display = ''
  overlay.className = 'overlay end settings'
  const title = t(r.winner === null ? 'end.draw' : won ? 'end.win' : 'end.lose')
  const color = g.defense ? (won ? '#b9efb7' : '#ff7662') : r.winner ? teamColor(r.winner) : '#ddd'
  const score = g.wsg ? { a: g.wsg.score.alliance, h: g.wsg.score.horde } : { a: g.ab?.resources.alliance ?? 0, h: g.ab?.resources.horde ?? 0 }
  const scoreText = g.defense ? t('hyjal.summary', {n:g.defense.match.wave,total:g.defense.match.total,kills:g.defense.match.kills,hp:Math.ceil(g.defense.match.hp),max:g.defense.match.maxHp}) : t('end.score', score)
  const post = sharePost(g)
  const metrics = (['kills', 'deaths', 'damage'] as const).map(key => `<div><strong>${Math.round(g.player.stats[key])}</strong><span>${t(`board.${key}`)}</span></div>`).join('')
  overlay.innerHTML = `<div class="poster-panel sheet result-sheet">
    <h2 class="sheet-title">${t('end.title')}</h2>
    <div class="result-body">
      <header class="result-heading">
        <div><p class="result-map">${t(`map.${g.opts.map}`)}</p><h1 style="color:${color}">${title}</h1></div>
        <div class="result-summary"><p>${tm(r.reason)}</p><strong>${scoreText}</strong></div>
      </header>
      <div class="result-columns">
        <section class="result-share">
          <h3>${t('share.preview')} <span>AZEROTH STRIKE</span></h3>
          <div class="result-image"><img alt="${t('share.card')}" /></div>
          <div class="result-share-actions">
            <button class="redbtn share-x" disabled>${t('share.x')}</button>
            <button class="share-copy" disabled>${t('share.copy')}</button>
            <button class="share-dl" disabled>${t('share.download')}</button>
            <button class="share-native" hidden>${t('share.native')}</button>
          </div>
          <p class="share-status" role="status" aria-live="polite">${t('share.preparing')}</p>
          <a class="share-open" href="${post.url}" target="_blank" rel="noopener noreferrer" hidden>${t('share.openX')}</a>
        </section>
        <section class="result-details">
          <h3>${t('end.personal')}</h3><div class="result-metrics">${metrics}</div>
          <details class="result-roster" ${g.defense ? 'open' : ''}><summary>${t('end.roster')}</summary><div class="endboard">${hud!.scoreboard(g)}</div></details>
          <div class="result-address"><span>${t(GAME_PUBLISHED ? 'share.live' : 'share.soon')}</span><a href="${GAME_URL}" target="_blank" rel="noopener noreferrer">${GAME_URL.replace('https://', '')}</a><button class="copy-link">${t('share.copyLink')}</button></div>
        </section>
      </div>
    </div>
    <footer class="sheet-foot result-foot"><div class="result-langs">${langButtons()}</div>${githubLink()}<button class="redbtn again">${t('end.again')}</button><button class="redbtn menu-btn">${t('end.menu')}</button></footer>
  </div>`
  const preview = overlay.querySelector<HTMLImageElement>('.result-image img')!
  const status = overlay.querySelector('.share-status')!
  const composer = overlay.querySelector<HTMLAnchorElement>('.share-open')!
  const xButton = overlay.querySelector<HTMLButtonElement>('.share-x')!
  const nativeButton = overlay.querySelector<HTMLButtonElement>('.share-native')!
  let card: Blob | null = null
  const fileName = `azeroth-strike-${g.opts.map}.png`
  void drawShareCard({
    art: matchFrames.get(g) ?? loadingArt(g.opts.map),
    title: `${t('title')} · ${t(`map.${g.opts.map}`)}`,
    result: title, reason: tm(r.reason), score: scoreText, stats: post.stats,
    resultColor: color, url: GAME_URL, linkLabel: t(GAME_PUBLISHED ? 'share.live' : 'share.soon'),
  }).then(canvasBlob).then(blob => {
    if (generation !== shareGeneration) return
    card = blob
    sharePreview = URL.createObjectURL(blob)
    preview.src = sharePreview
    overlay.querySelectorAll<HTMLButtonElement>('.result-share-actions button').forEach(button => { button.disabled = false })
    const file = new File([blob], fileName, { type: 'image/png' })
    nativeButton.hidden = !navigator.canShare?.({ files: [file] })
    status.textContent = t('share.ready')
  }).catch(() => {
    if (generation !== shareGeneration) return
    status.textContent = t('share.prepareFailed')
    composer.hidden = false
    composer.textContent = t('share.textOnly')
  })
  xButton.addEventListener('click', async () => {
    if (!card) return
    xButton.disabled = true
    composer.hidden = false
    try {
      const outcome = await prepareXShare(card, fileName, post.url, {
        copyImage, download: downloadBlob,
        openX: url => { if (generation === shareGeneration) window.open(url, '_blank', 'noopener,noreferrer,width=640,height=720') },
      })
      if (generation === shareGeneration) status.textContent = t(outcome === 'copied' ? 'share.xCopied' : 'share.xDownloaded')
    } finally { xButton.disabled = false }
  })
  overlay.querySelector('.share-dl')!.addEventListener('click', () => { if (card) downloadBlob(card, fileName) })
  overlay.querySelector('.share-copy')!.addEventListener('click', async () => {
    if (!card) return
    try { await copyImage(card); status.textContent = t('share.copied') }
    catch { downloadBlob(card, fileName); status.textContent = t('share.copyFail') }
  })
  nativeButton.addEventListener('click', async () => {
    if (!card) return
    try {
      await navigator.share({ title: t('title'), text: post.text, files: [new File([card], fileName, {type:'image/png'})] })
      status.textContent = t('share.nativeSent')
    } catch (error) {
      if (!(error instanceof DOMException && error.name === 'AbortError')) status.textContent = t('share.nativeFailed')
    }
  })
  overlay.querySelector('.copy-link')!.addEventListener('click', async () => {
    try { await navigator.clipboard.writeText(GAME_URL); status.textContent = t('share.linkCopied') }
    catch { status.textContent = t('share.linkFailed') }
  })
  bindLang()
  overlay.querySelector('.again')!.addEventListener('click', () => start())
  overlay.querySelector('.menu-btn')!.addEventListener('click', quitToMenu)
}

function quitToMenu(): void {
  clearEndShare()
  menuPane = 'play'
  setPaused(false)
  game?.dispose()
  game = null
  hud?.root.remove()
  hud = null
  showMenu()
}

onLangChange(l => {
  choice.lang = l
  syncTitle()
  if (screen === 'menu') showMenu()
  else if (screen === 'loading') showLoading()
  else if (screen === 'click') showClick()
  else if (screen === 'paused') showSettings()
  else if (screen === 'end' && game) showEnd(game)
})

canvas.addEventListener('click', () => {
  if (game && game.phase !== 'over') {
    input.lockPointer()
    if (overlay.classList.contains('click')) {
      overlay.style.display = 'none'
      screen = 'none'
    }
  }
})
overlay.addEventListener('click', e => {
  if (screen === 'paused' && e.target === overlay) resume()
})
document.addEventListener('pointerlockchange', () => {
  if (!game || game.phase === 'over' || input.debugLock) return
  if (document.pointerLockElement) closeSettings()
  else openSettings()
})

// Test hooks for headless browser checks.
;(window as unknown as Record<string, unknown>).__wow = {
  get game() {
    return game
  },
  get hud() {
    return hud
  },
  get lastLoad() {
    return lastLoad
  },
  audio,
  input,
  loop,
  start,
  choice,
  setLang,
  showMenu,
  showSettings,
}

loop.start()
if (params.has('autostart')) void start()
else showMenu()
