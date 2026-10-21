/**
 * Web Audio mixer for Iron Rift.
 *
 * - Recorded SFX (AI-generated, see README credits) are decoded once at boot and played with
 *   pitch/volume variation, HRTF 3D panning, distance air-absorption filtering and per-sound voice
 *   limits so rapid fire never stacks into mush.
 * - UI/feedback cues (hit markers, kill confirms, medals, heartbeat) are synthesized for precision.
 * - Music: three streamed Lyria tracks (title / combat / boss) crossfaded on the music bus.
 * - Buses: music (tracks + ambience loop) and SFX → shell-shock low-pass → master compressor → output.
 *   Base gains follow the project rule (music 3×, SFX 2× over the starter's originals) and the
 *   compressor/limiter keeps the sum below 0 dBFS.
 */
/** Samples grouped by the gameplay stage that first needs them (see game/stages.ts). */
export const SAMPLE_STAGES = {
  core: [
    'rifle_shot', 'shotgun_shot', 'shotgun_pump', 'rifle_reload', 'dry_fire', 'enemy_shot', 'explosion',
    'impact_concrete', 'impact_metal', 'robot_death', 'robot_hit', 'robot_step', 'bullet_flyby', 'player_hurt',
    'pickup_health', 'pickup_armor', 'pickup_ammo', 'weapon_switch', 'shell_insert', 'shell_casing', 'ambience',
    'match_start', 'footstep', 'land', 'slide', 'victory', 'defeat', 'hitmarker', 'headshot', 'kill_confirm',
    'armor_break', 'shard_pickup', 'overdrive_on', 'rank_up', 'wave_start', 'wave_clear', 'spawn_in', 'perk_pick',
    'ui_hover', 'ui_confirm', 'heartbeat', 'human_hit', 'human_death', 'armor_recharge',
  ],
  drones: ['drone_loop', 'plasma_shot', 'grenade_throw', 'grenade_bounce', 'hound_step'],
  heavy: ['mech_stomp', 'minigun', 'rocket_launch', 'rocket_reload', 'rocket_loop'],
  boss: ['boss_roar', 'boss_slam', 'boss_cannon'],
} as const

export const SAMPLES = [...SAMPLE_STAGES.core, ...SAMPLE_STAGES.drones, ...SAMPLE_STAGES.heavy, ...SAMPLE_STAGES.boss] as const
export type MusicName = 'title' | 'combat' | 'boss'
export type SampleName = (typeof SAMPLES)[number]
export type Vec3 = { x: number; y: number; z: number }
export type Cue = 'hit' | 'head' | 'kill' | 'armorHit' | 'ui' | 'uiBack' | 'medal' | 'beep' | 'go' | 'deny' | 'heartbeat' | 'lowAmmo' | 'armorRegen' | 'armorFull'

/** `force` plays even while the world is silenced (death/defeat/victory stings). */
type PlayOpts = { volume?: number; rate?: number; jitter?: number; pos?: Vec3; ref?: number; offset?: number; duration?: number; force?: boolean }
/** Cues that stay audible on the game-over / results screen (UI navigation only). */
const UI_CUES: ReadonlySet<Cue> = new Set<Cue>(['ui', 'uiBack', 'deny'])
/** Menu samples: routed on the UI bus so they stay audible while paused / on the results screen. */
const UI_SAMPLES: ReadonlySet<string> = new Set(['ui_hover', 'ui_confirm'])

const VOICE_LIMIT: Partial<Record<SampleName, number>> = {
  rifle_shot: 5, enemy_shot: 8, impact_concrete: 6, impact_metal: 6, shell_casing: 4, footstep: 3, bullet_flyby: 3, explosion: 4, shotgun_shot: 3,
  robot_hit: 4, robot_step: 4, hitmarker: 4, headshot: 2, kill_confirm: 3, plasma_shot: 5, minigun: 3, mech_stomp: 3, grenade_bounce: 3,
  ui_hover: 2, shard_pickup: 4, spawn_in: 3, boss_cannon: 3, human_hit: 4, human_death: 3, hound_step: 6,
}

type Voice = { src: AudioBufferSourceNode; at: number }

export class Audio {
  readonly ctx: AudioContext
  private master: GainNode
  private music: GainNode
  private sfx: GainNode
  private shock: BiquadFilterNode
  /** Pause gates: world SFX and music fade to silence while the pause menu is open. */
  private sfxGate: GainNode
  private musicGate: GainNode
  /** Menu sounds bypass the gates and the shell-shock filter. */
  private uiBus: GainNode
  private paused = false
  private buffers = new Map<SampleName, AudioBuffer>()
  private voices = new Map<SampleName, Voice[]>()
  /** Every playing world one-shot and loop, so game over can cut them all at once. */
  private active = new Set<{ src: AudioBufferSourceNode; gain: GainNode }>()
  /** True between game over and the next match / title: world SFX are blocked. */
  private silenced = false
  private ambience?: AudioBufferSourceNode
  private ambienceGain?: GainNode
  private ringOsc?: OscillatorNode
  private ringGain?: GainNode
  private noise?: AudioBuffer
  readonly listener = { x: 0, y: 0, z: 0 }
  private loading = new Map<SampleName, Promise<void>>()
  private tracks = new Map<MusicName, { el: HTMLAudioElement; gain: GainNode }>()
  private current: MusicName | null = null
  private musicTone!: BiquadFilterNode
  private musicBase = 'assets/music/'

  constructor() {
    this.ctx = new AudioContext({ latencyHint: 'interactive' })
    this.master = this.ctx.createGain()
    this.music = this.ctx.createGain()
    this.sfx = this.ctx.createGain()
    this.shock = this.ctx.createBiquadFilter()
    this.shock.type = 'lowpass'
    this.shock.frequency.value = 20000
    this.shock.Q.value = 0.5
    const comp = this.ctx.createDynamicsCompressor()
    comp.threshold.value = -14
    comp.knee.value = 8
    comp.ratio.value = 5
    comp.attack.value = 0.003
    comp.release.value = 0.18
    const limiter = this.ctx.createDynamicsCompressor()
    limiter.threshold.value = -1.5
    limiter.knee.value = 0
    limiter.ratio.value = 20
    limiter.attack.value = 0.001
    limiter.release.value = 0.08
    this.sfxGate = this.ctx.createGain()
    this.musicGate = this.ctx.createGain()
    this.uiBus = this.ctx.createGain()
    this.uiBus.gain.value = 1.6
    this.uiBus.connect(this.master)
    this.sfx.connect(this.sfxGate).connect(this.shock).connect(this.master)
    // Music runs through a low-pass "calm" filter: between waves it ducks and darkens slightly.
    this.musicTone = this.ctx.createBiquadFilter()
    this.musicTone.type = 'lowpass'
    this.musicTone.frequency.value = 20000
    this.music.connect(this.musicTone).connect(this.musicGate).connect(this.master)
    this.master.connect(comp).connect(limiter).connect(this.ctx.destination)
  }

  unlock(): void {
    if (this.ctx.state === 'suspended') void this.ctx.resume()
  }

  /** True once the browser has allowed audio (after the first user gesture). */
  get unlocked(): boolean {
    return this.ctx.state === 'running'
  }

  setVolumes(music: number, sfx: number, muted = false): void {
    const t = this.ctx.currentTime
    this.music.gain.setTargetAtTime(muted ? 0 : music * 0.55 * 3, t, 0.05)
    this.sfx.gain.setTargetAtTime(muted ? 0 : sfx * 0.8 * 2, t, 0.05)
    this.uiBus.gain.setTargetAtTime(muted ? 0 : sfx * 0.8 * 2, t, 0.05)
  }

  /** Decode the named samples (idempotent; concurrent calls share one fetch). */
  async loadSamples(base: string, names: readonly SampleName[]): Promise<void> {
    await Promise.all(
      names.map(name => {
        if (this.buffers.has(name)) return Promise.resolve()
        let p = this.loading.get(name)
        if (!p) {
          p = (async () => {
            try {
              const data = await (await fetch(`${base}${name}.mp3`)).arrayBuffer()
              this.buffers.set(name, await this.ctx.decodeAudioData(data))
            } catch (err) {
              console.warn('audio load failed', name, err)
            }
          })()
          this.loading.set(name, p)
        }
        return p
      }),
    )
  }

  has(name: SampleName): boolean {
    return this.buffers.has(name)
  }

  // ─── Music: streamed <audio> elements, crossfaded on the music bus ─────
  private track(name: MusicName): { el: HTMLAudioElement; gain: GainNode } {
    let t = this.tracks.get(name)
    if (!t) {
      const el = new window.Audio()
      el.src = `${this.musicBase}${name}.mp3`
      el.loop = true
      el.preload = 'auto'
      el.crossOrigin = 'anonymous'
      const gain = this.ctx.createGain()
      gain.gain.value = 0
      this.ctx.createMediaElementSource(el).connect(gain).connect(this.music)
      t = { el, gain }
      this.tracks.set(name, t)
    }
    return t
  }

  /** Start buffering a track in the background without playing it. */
  prefetchMusic(name: MusicName): void {
    try {
      this.track(name).el.load()
    } catch {
      /* optional */
    }
  }

  /** Crossfade to `name` (null = fade out). `restart` rewinds the new track to its start. */
  playMusic(name: MusicName | null, fade = 1.5, restart = false): void {
    const t = this.ctx.currentTime
    if (name === this.current && !restart) return
    for (const [n, tr] of this.tracks) {
      if (n === name) continue
      tr.gain.gain.cancelScheduledValues(t)
      tr.gain.gain.setTargetAtTime(0, t, fade / 3)
      const el = tr.el
      window.setTimeout(() => {
        if (this.current !== n) el.pause()
      }, fade * 1000 + 200)
    }
    this.current = name
    if (!name) return
    const tr = this.track(name)
    if (restart || tr.el.paused) {
      if (restart) tr.el.currentTime = 0
      void tr.el.play().catch(() => {
        /* resumes on the next gesture via retryMusic() */
      })
    }
    tr.gain.gain.cancelScheduledValues(t)
    tr.gain.gain.setTargetAtTime(0.62, t, fade / 3)
  }

  /** Called after a user gesture in case autoplay blocked the current track. */
  retryMusic(): void {
    if (!this.current) return
    const tr = this.tracks.get(this.current)
    if (tr && tr.el.paused) void tr.el.play().catch(() => undefined)
  }

  /** 0 = full intensity (fighting), 1 = fully calm (ducked and darkened). */
  setMusicCalm(calm: number): void {
    const t = this.ctx.currentTime
    this.musicTone.frequency.setTargetAtTime(20000 * Math.pow(0.08, calm), t, 0.8)
  }

  setListener(pos: Vec3, forward: Vec3): void {
    this.listener.x = pos.x
    this.listener.y = pos.y
    this.listener.z = pos.z
    const l = this.ctx.listener
    const t = this.ctx.currentTime
    if (l.positionX) {
      l.positionX.setValueAtTime(pos.x, t)
      l.positionY.setValueAtTime(pos.y, t)
      l.positionZ.setValueAtTime(pos.z, t)
      l.forwardX.setValueAtTime(forward.x, t)
      l.forwardY.setValueAtTime(forward.y, t)
      l.forwardZ.setValueAtTime(forward.z, t)
      l.upX.setValueAtTime(0, t)
      l.upY.setValueAtTime(1, t)
      l.upZ.setValueAtTime(0, t)
    } else {
      l.setPosition(pos.x, pos.y, pos.z)
      l.setOrientation(forward.x, forward.y, forward.z, 0, 1, 0)
    }
  }

  /** Play a recorded sample. With `pos` it is spatialised in 3D. */
  play(name: SampleName, o: PlayOpts = {}): AudioBufferSourceNode | undefined {
    if (this.ctx.state !== 'running') return undefined
    const ui = UI_SAMPLES.has(name)
    if (this.silenced && !o.force && !ui) return undefined
    const buffer = this.buffers.get(name)
    if (!buffer) return undefined
    const t = this.ctx.currentTime
    const src = this.ctx.createBufferSource()
    src.buffer = buffer
    const jitter = o.jitter ?? 0.06
    src.playbackRate.value = (o.rate ?? 1) * (1 + (Math.random() * 2 - 1) * jitter)
    const gain = this.ctx.createGain()
    gain.gain.value = o.volume ?? 1
    let node: AudioNode = src
    if (o.pos) {
      const d = Math.hypot(o.pos.x - this.listener.x, o.pos.y - this.listener.y, o.pos.z - this.listener.z)
      if (d > 3) {
        // Air absorption: distant sounds lose their top end.
        const lp = this.ctx.createBiquadFilter()
        lp.type = 'lowpass'
        lp.frequency.value = Math.max(1400, 18000 * Math.exp(-d / 35))
        node.connect(lp)
        node = lp
      }
      const p = this.ctx.createPanner()
      p.panningModel = 'HRTF'
      p.distanceModel = 'inverse'
      p.refDistance = o.ref ?? 4
      p.rolloffFactor = 1.1
      p.maxDistance = 200
      if (p.positionX) {
        p.positionX.value = o.pos.x
        p.positionY.value = o.pos.y
        p.positionZ.value = o.pos.z
      } else p.setPosition(o.pos.x, o.pos.y, o.pos.z)
      node.connect(p)
      node = p
    }
    node.connect(gain).connect(ui ? this.uiBus : this.sfx)
    const entry = { src, gain }
    this.active.add(entry)
    src.addEventListener('ended', () => this.active.delete(entry))
    const limit = VOICE_LIMIT[name]
    if (limit) {
      const list = this.voices.get(name) ?? []
      while (list.length >= limit) {
        const old = list.shift()!
        try {
          old.src.stop()
        } catch {
          /* already stopped */
        }
      }
      const v = { src, at: t }
      list.push(v)
      this.voices.set(name, list)
      src.onended = () => {
        const i = list.indexOf(v)
        if (i >= 0) list.splice(i, 1)
      }
    }
    src.start(t, o.offset ?? 0, o.duration)
    return src
  }

  /** Looping positional sound (rocket motor). */
  loop(name: SampleName, volume: number, at?: Vec3): { set(pos: Vec3): void; stop(): void } | undefined {
    if (this.ctx.state !== 'running' || this.silenced) return undefined
    const buffer = this.buffers.get(name)
    if (!buffer) return undefined
    const src = this.ctx.createBufferSource()
    src.buffer = buffer
    src.loop = true
    const p = this.ctx.createPanner()
    p.panningModel = 'HRTF'
    p.distanceModel = 'inverse'
    p.refDistance = 3
    p.rolloffFactor = 1.2
    const g = this.ctx.createGain()
    g.gain.value = volume
    src.connect(p).connect(g).connect(this.sfx)
    if (at) {
      if (p.positionX) {
        p.positionX.value = at.x
        p.positionY.value = at.y
        p.positionZ.value = at.z
      } else p.setPosition(at.x, at.y, at.z)
    }
    src.start()
    const entry = { src, gain: g }
    this.active.add(entry)
    return {
      set: pos => {
        if (p.positionX) {
          p.positionX.value = pos.x
          p.positionY.value = pos.y
          p.positionZ.value = pos.z
        } else p.setPosition(pos.x, pos.y, pos.z)
      },
      stop: () => {
        // May already have been cut by silenceWorld(); stopping twice throws.
        if (!this.active.delete(entry)) return
        g.gain.setTargetAtTime(0, this.ctx.currentTime, 0.03)
        src.stop(this.ctx.currentTime + 0.15)
      },
    }
  }

  startAmbience(): void {
    if (this.ambience || this.ctx.state !== 'running') return
    const buffer = this.buffers.get('ambience')
    if (!buffer) return
    const src = this.ctx.createBufferSource()
    src.buffer = buffer
    src.loop = true
    const g = this.ctx.createGain()
    g.gain.value = 0
    g.gain.setTargetAtTime(0.5, this.ctx.currentTime, 1.2)
    src.connect(g).connect(this.music)
    src.start()
    this.ambience = src
    this.ambienceGain = g
  }

  stopAmbience(): void {
    if (!this.ambience) return
    this.ambienceGain!.gain.setTargetAtTime(0, this.ctx.currentTime, 0.4)
    this.ambience.stop(this.ctx.currentTime + 2)
    this.ambience = undefined
  }

  /**
   * Game over: fade the music and ambience out and cut every playing world sound (gunfire,
   * explosions, footsteps, rocket/drone loops, tinnitus). New world sounds are blocked until
   * restoreWorld(); `force` stings and UI cues still play.
   */
  silenceWorld(fade = 0.25): void {
    this.silenced = true
    this.playMusic(null, Math.max(0.3, fade * 2))
    this.stopAmbience()
    const t = this.ctx.currentTime
    for (const v of this.active) {
      v.gain.gain.cancelScheduledValues(t)
      v.gain.gain.setTargetAtTime(0, t, fade / 3)
      try {
        v.src.stop(t + fade + 0.05)
      } catch {
        /* already stopped */
      }
    }
    this.active.clear()
    for (const list of this.voices.values()) list.length = 0
    if (this.ringGain) {
      this.ringGain.gain.cancelScheduledValues(t)
      this.ringGain.gain.setTargetAtTime(0, t, 0.05)
    }
    this.shock.frequency.cancelScheduledValues(t)
    this.shock.frequency.setTargetAtTime(20000, t, 0.1)
  }
  /**
   * Pause menu: fade world SFX (incl. loops/ambience/tinnitus) and music to silence and pause the
   * current music track; menu sounds stay audible. Resuming fades everything back in place.
   */
  setPaused(paused: boolean): void {
    if (paused === this.paused) return
    this.paused = paused
    const t = this.ctx.currentTime
    for (const g of [this.sfxGate, this.musicGate]) {
      g.gain.cancelScheduledValues(t)
      g.gain.setTargetAtTime(paused ? 0 : 1, t, paused ? 0.04 : 0.12)
    }
    if (paused && this.ringGain) {
      this.ringGain.gain.cancelScheduledValues(t)
      this.ringGain.gain.setTargetAtTime(0, t, 0.03)
    }
    const tr = this.current ? this.tracks.get(this.current) : undefined
    if (!tr) return
    if (paused) {
      window.setTimeout(() => {
        if (this.paused) tr.el.pause()
      }, 220)
    } else if (tr.el.paused) void tr.el.play().catch(() => undefined)
  }
  get isPaused(): boolean {
    return this.paused
  }
  /** Re-enable world sounds (new match or back to title). */
  restoreWorld(): void {
    this.silenced = false
  }
  get isSilenced(): boolean {
    return this.silenced
  }
  /** Shell-shock: muffle SFX and add a tinnitus whine; strength 0..1. */
  deafen(strength: number): void {
    if (this.ctx.state !== 'running' || strength <= 0.05 || this.silenced) return
    const t = this.ctx.currentTime
    const f = this.shock.frequency
    f.cancelScheduledValues(t)
    f.setValueAtTime(Math.max(380, 20000 * (1 - strength * 0.97)), t)
    f.setTargetAtTime(20000, t + 0.25 + strength * 0.9, 0.6)
    if (!this.ringOsc) {
      this.ringOsc = this.ctx.createOscillator()
      this.ringOsc.frequency.value = 3900
      this.ringGain = this.ctx.createGain()
      this.ringGain.gain.value = 0
      this.ringOsc.connect(this.ringGain).connect(this.master)
      this.ringOsc.start()
    }
    const rg = this.ringGain!.gain
    rg.cancelScheduledValues(t)
    rg.setValueAtTime(0.012 * strength, t)
    rg.setTargetAtTime(0, t + 0.4, 0.7 + strength)
  }

  private noiseBuffer(): AudioBuffer {
    if (this.noise) return this.noise
    const b = this.ctx.createBuffer(1, this.ctx.sampleRate * 0.5, this.ctx.sampleRate)
    const d = b.getChannelData(0)
    for (let i = 0; i < d.length; i += 1) d[i] = Math.random() * 2 - 1
    this.noise = b
    return b
  }

  /** Synthesized feedback cues. */
  cue(name: Cue, volume = 1): void {
    if (this.ctx.state !== 'running') return
    if (this.silenced && !UI_CUES.has(name)) return
    const out = UI_CUES.has(name) ? this.uiBus : this.sfx
    const t = this.ctx.currentTime
    const tone = (freq: number, end: number, dur: number, type: OscillatorType, vol: number, delay = 0) => {
      const o = this.ctx.createOscillator()
      const g = this.ctx.createGain()
      o.type = type
      o.frequency.setValueAtTime(freq, t + delay)
      o.frequency.exponentialRampToValueAtTime(Math.max(end, 20), t + delay + dur)
      g.gain.setValueAtTime(0.0001, t + delay)
      g.gain.exponentialRampToValueAtTime(vol * volume, t + delay + 0.004)
      g.gain.exponentialRampToValueAtTime(0.0001, t + delay + dur)
      o.connect(g).connect(out)
      o.start(t + delay)
      o.stop(t + delay + dur + 0.05)
    }
    const click = (freq: number, dur: number, vol: number, delay = 0) => {
      const src = this.ctx.createBufferSource()
      src.buffer = this.noiseBuffer()
      const bp = this.ctx.createBiquadFilter()
      bp.type = 'bandpass'
      bp.frequency.value = freq
      bp.Q.value = 2
      const g = this.ctx.createGain()
      g.gain.setValueAtTime(vol * volume, t + delay)
      g.gain.exponentialRampToValueAtTime(0.0001, t + delay + dur)
      src.connect(bp).connect(g).connect(out)
      src.start(t + delay, Math.random() * 0.3, dur + 0.02)
    }
    switch (name) {
      case 'hit':
        click(3800, 0.04, 0.5)
        tone(2300, 1900, 0.05, 'triangle', 0.16)
        break
      case 'armorHit':
        click(5200, 0.035, 0.45)
        tone(3100, 2600, 0.04, 'square', 0.05)
        break
      case 'head':
        click(5200, 0.05, 0.5)
        tone(3300, 3000, 0.1, 'sine', 0.24)
        tone(4950, 4700, 0.08, 'sine', 0.1, 0.01)
        break
      case 'kill':
        tone(1320, 1320, 0.09, 'triangle', 0.22)
        tone(1980, 1980, 0.2, 'triangle', 0.2, 0.07)
        tone(90, 45, 0.25, 'sine', 0.5)
        break
      case 'ui':
        tone(900, 1000, 0.05, 'triangle', 0.14)
        break
      case 'uiBack':
        tone(700, 520, 0.07, 'triangle', 0.12)
        break
      case 'medal':
        ;[660, 880, 1320].forEach((f, i) => tone(f, f, 0.16, 'triangle', 0.14, i * 0.06))
        tone(70, 40, 0.4, 'sine', 0.35)
        break
      case 'beep':
        tone(880, 880, 0.12, 'square', 0.08)
        break
      case 'go':
        tone(1320, 1320, 0.35, 'square', 0.08)
        break
      case 'deny':
        tone(220, 180, 0.12, 'square', 0.08)
        break
      case 'heartbeat':
        tone(62, 40, 0.14, 'sine', 0.55)
        tone(58, 38, 0.16, 'sine', 0.4, 0.18)
        break
      case 'armorRegen':
        // Rising servo-charge whine: the shield is coming back online.
        tone(420, 1650, 0.55, 'sawtooth', 0.035)
        tone(840, 3300, 0.5, 'sine', 0.05, 0.03)
        click(6000, 0.05, 0.12)
        break
      case 'armorFull':
        tone(1760, 1760, 0.12, 'sine', 0.12)
        tone(2640, 2640, 0.22, 'sine', 0.08, 0.05)
        click(7000, 0.04, 0.2)
        break
      case 'lowAmmo':
        tone(1600, 1600, 0.035, 'square', 0.05)
        tone(1600, 1600, 0.035, 'square', 0.05, 0.07)
        break
    }
  }
}
