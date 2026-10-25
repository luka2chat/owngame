import * as THREE from 'three'
import type { LoadTracker } from './loader'

/**
 * Web Audio mixer for the WoW client sounds exported by tools/export-media.mjs: master, effects and
 * music buses with persisted volumes and mute, a decoded sound bank, positional playback relative
 * to the camera, and voice limits so a 30-bot firefight stays readable. Music streams through an
 * <audio> element (tracks are long) with WoW-style silences between tracks.
 */

export type Bus = 'master' | 'sfx' | 'music'
export type Volumes = Record<Bus, number>
type Manifest = Record<string, { kind: 'sfx' | 'loop' | 'music'; files: string[] }>
type Voice = { key: string; src: AudioBufferSourceNode; started: number }
export type PlayOptions = { at?: THREE.Vector3 | null; gain?: number; rate?: number; variant?: number }
export type LoopHandle = { stop(fadeSeconds?: number): void }

const STORE = 'wowfps.audio'
const BASE = './assets/sound/'
const MAX_VOICES = 40
/** Yards; positional sounds farther than this are skipped. */
const MAX_DISTANCE = 160

/** Mix per sound: level, random pitch spread, concurrent voices, and distance (yards) at full volume. */
const MIX: Record<string, { gain: number; spread?: number; voices?: number; ref?: number }> = {
  gunfire: { gain: 0.5, spread: 0.05, voices: 10, ref: 10 },
  impact: { gain: 0.35, spread: 0.1, voices: 6, ref: 4 },
  wand: { gain: 0.45, spread: 0.06, voices: 6, ref: 10 },
  swing: { gain: 0.55, spread: 0.08, voices: 4, ref: 4 },
  swingheavy: { gain: 0.65, spread: 0.05, voices: 3, ref: 4 },
  stab: { gain: 0.75, spread: 0.05, voices: 3, ref: 4 },
  stabcrit: { gain: 0.85, voices: 2, ref: 4 },
  stabwall: { gain: 0.5, voices: 2, ref: 3 },
  gunload: { gain: 0.55, spread: 0.04, voices: 3, ref: 3 },
  draw: { gain: 0.45, voices: 2, ref: 3 },
  holster: { gain: 0.4, voices: 2, ref: 3 },
  wanddraw: { gain: 0.45, voices: 2, ref: 3 },
  wandholster: { gain: 0.4, voices: 2, ref: 3 },
  click: { gain: 0.4, voices: 3 },
  stepgrass: { gain: 0.3, spread: 0.08, voices: 6, ref: 3 },
  stepdirt: { gain: 0.3, spread: 0.08, voices: 6, ref: 3 },
  stepwood: { gain: 0.3, spread: 0.08, voices: 6, ref: 3 },
  stepstone: { gain: 0.3, spread: 0.08, voices: 6, ref: 3 },
  humanwound: { gain: 0.55, spread: 0.04, voices: 4, ref: 6 },
  humancrit: { gain: 0.6, voices: 3, ref: 6 },
  humandeath: { gain: 0.65, voices: 3, ref: 8 },
  orcwound: { gain: 0.55, spread: 0.04, voices: 4, ref: 6 },
  orccrit: { gain: 0.6, voices: 3, ref: 6 },
  orcdeath: { gain: 0.65, voices: 3, ref: 8 },
  countdown: { gain: 0.6, voices: 2 },
  buffspeed: { gain: 0.6, voices: 2, ref: 6 },
  buffheal: { gain: 0.6, voices: 2, ref: 6 },
  buffspawn: { gain: 0.5, voices: 2, ref: 8 },
  nodechannel: { gain: 0.5, voices: 4, ref: 6 },
  bannerup: { gain: 0.7, voices: 3, ref: 14 },
  countdownend: { gain: 0.7, voices: 1 },
  resurrect: { gain: 0.55, voices: 1 },
  spirithealer: { gain: 0.45, voices: 1 },
  amb_wsg: { gain: 0.4, voices: 1 },
  amb_ab: { gain: 0.4, voices: 1 },
}
const mixOf = (key: string) => MIX[key] ?? { gain: 0.75, voices: 2 }

export class AudioEngine {
  ctx: AudioContext | null = null
  private buses: Record<Bus, GainNode> | null = null
  private manifest: Manifest | null = null
  private bank = new Map<string, AudioBuffer[]>()
  private pending = new Map<string, Promise<void>>()
  private voices: Voice[] = []
  private ext: 'ogg' | 'mp3' = 'ogg'
  volumes: Volumes = { master: 0.8, sfx: 0.9, music: 0.4 }
  muted = false
  /** Plays per sound key (test hook / debugging). */
  readonly played = new Map<string, number>()
  private readonly listenerPos = new THREE.Vector3()
  private music: { el: HTMLAudioElement; playing: boolean; timer: number; order: string[]; next: number } | null = null
  private changeListeners = new Set<() => void>()

  constructor() {
    try {
      const saved = JSON.parse(localStorage.getItem(STORE) ?? '{}') as Partial<Volumes & { muted: boolean }>
      for (const bus of ['master', 'sfx', 'music'] as Bus[]) if (typeof saved[bus] === 'number') this.volumes[bus] = clamp01(saved[bus]!)
      this.muted = !!saved.muted
    } catch {
      // storage blocked or corrupt
    }
    if (typeof window !== 'undefined') {
      // Browsers keep audio suspended until a gesture; resume (and start pending music) on the first one.
      const unlock = () => {
        void this.context()?.resume()
        if (this.music?.playing && this.music.el.paused && this.music.el.src) void this.music.el.play().catch(() => undefined)
      }
      window.addEventListener('pointerdown', unlock, true)
      window.addEventListener('keydown', unlock, true)
    }
  }

  private context(): AudioContext | null {
    if (this.ctx) return this.ctx
    try {
      const ctx = new AudioContext()
      const gain = () => ctx.createGain()
      const buses = { master: gain(), sfx: gain(), music: gain() }
      buses.sfx.connect(buses.master)
      buses.music.connect(buses.master)
      buses.master.connect(ctx.destination)
      this.ctx = ctx
      this.buses = buses
      this.ext = document.createElement('audio').canPlayType('audio/ogg; codecs="vorbis"') ? 'ogg' : 'mp3'
      this.applyVolumes()
    } catch {
      return null
    }
    return this.ctx
  }

  onChange(fn: () => void): () => void {
    this.changeListeners.add(fn)
    return () => this.changeListeners.delete(fn)
  }

  private applyVolumes(): void {
    if (!this.ctx || !this.buses) return
    const t = this.ctx.currentTime
    const set = (bus: Bus, v: number) => this.buses![bus].gain.setTargetAtTime(v, t, 0.02)
    set('master', this.muted ? 0 : this.volumes.master)
    set('sfx', this.volumes.sfx)
    set('music', this.volumes.music)
  }

  private persist(): void {
    try {
      localStorage.setItem(STORE, JSON.stringify({ ...this.volumes, muted: this.muted }))
    } catch {
      // storage blocked
    }
    this.applyVolumes()
    for (const fn of this.changeListeners) fn()
  }

  setVolume(bus: Bus, value: number): void {
    this.volumes[bus] = clamp01(value)
    this.persist()
  }

  setMuted(muted: boolean): void {
    this.muted = muted
    this.persist()
  }

  /** Effective output level of a bus after master and mute (test hook). */
  level(bus: Bus): number {
    const master = this.muted ? 0 : this.volumes.master
    return bus === 'master' ? master : master * this.volumes[bus]
  }

  /**
   * Fetch and decode every one-shot effect plus the given loops. Idempotent; reports progress on
   * the tracker's 'sounds' step when one is given.
   */
  async load(tracker?: LoadTracker, loops: string[] = []): Promise<void> {
    const ctx = this.context()
    if (!ctx) {
      tracker?.skip('sounds')
      return
    }
    this.manifest ??= (await (await fetch(`${BASE}sounds.json`)).json()) as Manifest
    const keys = [...Object.entries(this.manifest).filter(([, s]) => s.kind === 'sfx').map(([k]) => k), ...loops]
    let done = 0
    await Promise.all(
      keys.map(key =>
        this.decode(key, tracker).then(() => {
          tracker?.set('load.sounds', 'sounds', ++done / keys.length)
        }),
      ),
    )
  }

  private decode(key: string, tracker?: LoadTracker): Promise<void> {
    if (this.bank.has(key)) return Promise.resolve()
    let p = this.pending.get(key)
    if (p) return p
    const ctx = this.ctx!
    const files = this.manifest?.[key]?.files ?? []
    p = Promise.all(
      files.map(async base => {
        const url = `${BASE}${base}.${this.ext}`
        const bytes = tracker ? await tracker.fetch(url) : await (await fetch(url)).arrayBuffer()
        return ctx.decodeAudioData(bytes)
      }),
    )
      .then(buffers => void this.bank.set(key, buffers))
      .catch(err => console.warn(`sound ${key}:`, err))
      .finally(() => this.pending.delete(key))
    this.pending.set(key, p)
    return p
  }

  /** Follow the camera: position plus facing for left/right panning. */
  setListener(camera: THREE.Camera): void {
    const ctx = this.ctx
    if (!ctx) return
    const pos = camera.getWorldPosition(this.listenerPos)
    const fwd = new THREE.Vector3(0, 0, -1).applyQuaternion(camera.quaternion)
    const up = new THREE.Vector3(0, 1, 0).applyQuaternion(camera.quaternion)
    const l = ctx.listener
    if (l.positionX) {
      l.positionX.value = pos.x
      l.positionY.value = pos.y
      l.positionZ.value = pos.z
      l.forwardX.value = fwd.x
      l.forwardY.value = fwd.y
      l.forwardZ.value = fwd.z
      l.upX.value = up.x
      l.upY.value = up.y
      l.upZ.value = up.z
    } else {
      l.setPosition(pos.x, pos.y, pos.z)
      l.setOrientation(fwd.x, fwd.y, fwd.z, up.x, up.y, up.z)
    }
  }

  /** Play a random variant of `key`; `at` makes it positional. Returns false when skipped. */
  play(key: string, opts: PlayOptions = {}): boolean {
    const ctx = this.ctx
    const buffers = this.bank.get(key)
    if (!ctx || !this.buses || !buffers?.length || this.muted || this.volumes.master <= 0 || this.volumes.sfx <= 0) return false
    const mix = mixOf(key)
    const ref = mix.ref ?? 6
    if (opts.at) {
      const d = opts.at.distanceTo(this.listenerPos)
      // Inverse falloff (as the panner computes it); skip what nobody could hear.
      if (d > MAX_DISTANCE || (ref / (ref + Math.max(0, d - ref))) * mix.gain * (opts.gain ?? 1) < 0.015) return false
    }
    this.reclaim(key, mix.voices ?? 4)
    const src = ctx.createBufferSource()
    src.buffer = buffers[(opts.variant ?? Math.floor(Math.random() * buffers.length)) % buffers.length]
    src.playbackRate.value = (opts.rate ?? 1) * (1 + (Math.random() * 2 - 1) * (mix.spread ?? 0))
    const gain = ctx.createGain()
    gain.gain.value = mix.gain * (opts.gain ?? 1)
    let tail: AudioNode = gain
    if (opts.at) {
      const panner = new PannerNode(ctx, {
        panningModel: 'equalpower',
        distanceModel: 'inverse',
        refDistance: ref,
        rolloffFactor: 1,
        maxDistance: MAX_DISTANCE,
        positionX: opts.at.x,
        positionY: opts.at.y,
        positionZ: opts.at.z,
      })
      gain.connect(panner)
      tail = panner
    }
    src.connect(gain)
    tail.connect(this.buses.sfx)
    const voice: Voice = { key, src, started: ctx.currentTime }
    this.voices.push(voice)
    src.onended = () => {
      const i = this.voices.indexOf(voice)
      if (i >= 0) this.voices.splice(i, 1)
      tail.disconnect()
    }
    src.start()
    this.played.set(key, (this.played.get(key) ?? 0) + 1)
    return true
  }

  /** Voice stealing: drop the oldest voice of this sound, or overall, when over the limits. */
  private reclaim(key: string, limit: number): void {
    const same = this.voices.filter(v => v.key === key)
    if (same.length >= limit) this.drop(same[0])
    else if (this.voices.length >= MAX_VOICES) this.drop(this.voices[0])
  }

  /** Stop a voice and forget it now; `stop()` only removes it later, which lets a burst pile up. */
  private drop(voice: Voice): void {
    const index = this.voices.indexOf(voice)
    if (index >= 0) this.voices.splice(index, 1)
    try {
      voice.src.stop()
    } catch {
      // already stopped
    }
  }

  get activeVoices(): number {
    return this.voices.length
  }

  /** Seamless loop (ambience, spirit healer) fading in; decoded on first use. */
  loop(key: string, opts: { gain?: number; fade?: number } = {}): LoopHandle {
    let stopped = false
    let stopNow: (fade: number) => void = () => undefined
    const start = () => {
      const ctx = this.ctx
      const buffer = this.bank.get(key)?.[0]
      if (stopped || !ctx || !this.buses || !buffer) return
      const src = ctx.createBufferSource()
      src.buffer = buffer
      src.loop = true
      const gain = ctx.createGain()
      const target = mixOf(key).gain * (opts.gain ?? 1)
      gain.gain.setValueAtTime(0, ctx.currentTime)
      gain.gain.linearRampToValueAtTime(target, ctx.currentTime + (opts.fade ?? 1.5))
      src.connect(gain).connect(this.buses.sfx)
      src.start(0, Math.random() * buffer.duration)
      this.played.set(key, (this.played.get(key) ?? 0) + 1)
      stopNow = fade => {
        const t = ctx.currentTime
        gain.gain.cancelScheduledValues(t)
        gain.gain.setValueAtTime(gain.gain.value, t)
        gain.gain.linearRampToValueAtTime(0, t + fade)
        src.stop(t + fade + 0.05)
      }
    }
    if (this.context()) {
      if (this.bank.has(key)) start()
      else void this.decode(key).then(start)
    }
    return {
      stop: (fade = 1) => {
        stopped = true
        stopNow(fade)
      },
    }
  }

  /** Battleground music: shuffled tracks with silences between them, like the client's zone music. */
  startMusic(firstDelay = 4): void {
    const ctx = this.context()
    const files = this.manifest?.music?.files
    if (!ctx || !this.buses || !files?.length) return
    if (!this.music) {
      const el = new window.Audio()
      el.preload = 'auto'
      ctx.createMediaElementSource(el).connect(this.buses.music)
      this.music = { el, playing: false, timer: 0, order: [], next: 0 }
      el.addEventListener('ended', () => this.queueTrack(15 + Math.random() * 20))
    }
    this.music.order = [...files].sort(() => Math.random() - 0.5)
    this.music.next = 0
    this.music.playing = true
    this.queueTrack(firstDelay)
  }

  private queueTrack(delay: number): void {
    const m = this.music
    if (!m || !m.playing) return
    clearTimeout(m.timer)
    m.timer = window.setTimeout(() => {
      if (!m.playing) return
      const base = m.order[m.next++ % m.order.length]
      m.el.src = `${BASE}${base}.mp3`
      m.el.volume = 1
      void m.el.play().catch(() => undefined)
      this.played.set('music', (this.played.get('music') ?? 0) + 1)
    }, delay * 1000)
  }

  stopMusic(fade = 2): void {
    const m = this.music
    if (!m) return
    m.playing = false
    clearTimeout(m.timer)
    const el = m.el
    const from = el.volume
    const started = performance.now()
    const step = () => {
      const k = Math.min(1, (performance.now() - started) / (fade * 1000))
      el.volume = from * (1 - k)
      if (k < 1 && !m.playing) requestAnimationFrame(step)
      else if (!m.playing) el.pause()
    }
    step()
  }

  get musicPlaying(): boolean {
    return !!this.music && !this.music.el.paused
  }
}

const clamp01 = (v: number) => Math.min(1, Math.max(0, v))

export const audio = new AudioEngine()
