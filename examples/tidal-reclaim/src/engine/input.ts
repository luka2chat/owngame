/**
 * Unified input for a desktop FPS: keyboard + mouse (pointer lock) with gamepad support. Gameplay
 * reads `move`, `takeLook()` and `held()/consume()`; it never checks raw keys.
 */
export type Action =
  | 'jump' | 'sprint' | 'fire' | 'ads' | 'reload' | 'slot1' | 'slot2' | 'slot3' | 'nextWeapon' | 'prevWeapon'
  | 'interact' | 'lastWeapon' | 'scoreboard' | 'pause' | 'confirm' | 'back' | 'slide' | 'grenade' | 'overdrive'
export type InputMethod = 'keyboard' | 'gamepad'

const KEY_BINDINGS: Record<Action, string[]> = {
  interact: ['KeyE'],
  jump: ['Space'],
  sprint: ['ShiftLeft', 'ShiftRight'],
  fire: [],
  ads: [],
  reload: ['KeyR'],
  slot1: ['Digit1', 'Numpad1'],
  slot2: ['Digit2', 'Numpad2'],
  slot3: ['Digit3', 'Numpad3'],
  nextWeapon: [],
  prevWeapon: [],
  lastWeapon: ['KeyQ'],
  scoreboard: ['Tab'],
  pause: ['Escape', 'KeyP'],
  confirm: ['Enter', 'NumpadEnter'],
  back: [],
  slide: ['KeyC', 'ControlLeft'],
  grenade: ['KeyG'],
  overdrive: ['KeyF'],
}
const PRESS_TTL = 100
const MOVE_KEYS = { up: ['KeyW', 'ArrowUp'], down: ['KeyS', 'ArrowDown'], left: ['KeyA', 'ArrowLeft'], right: ['KeyD', 'ArrowRight'] }
// Standard gamepad: A=0 B=1 X=2 Y=3 LB=4 RB=5 LT=6 RT=7 Back=8 Start=9 L3=10.
const PAD_BINDINGS: Partial<Record<Action, number[]>> = { jump: [0], sprint: [10], fire: [7], ads: [6], reload: [2], nextWeapon: [3, 5], prevWeapon: [4], scoreboard: [8], pause: [9], confirm: [0], back: [1], slide: [11], overdrive: [12], grenade: [13], interact: [1] }

export class Input {
  readonly move = { x: 0, y: 0 }
  readonly look = { x: 0, y: 0 }
  method: InputMethod = 'keyboard'
  sensitivity = 1
  invertY = false
  private keys = new Set<string>()
  private mouse = new Set<number>()
  private held_ = new Set<Action>()
  /**
   * Edge-triggered presses with their arrival time. The simulation runs at a fixed 60 Hz while
   * rendering can run at 120-240 Hz, so many render frames contain no sim step; a press is kept
   * until consumed or PRESS_TTL ms old so a step always gets to see it (no dropped Q/C/clicks).
   */
  private pressed_ = new Map<Action, number>()
  private padPrev = new Set<Action>()
  private listeners: Array<() => void> = []

  constructor(private readonly canvas: HTMLCanvasElement) {
    const on = <K extends keyof WindowEventMap>(target: Window | HTMLElement, type: K, fn: (e: WindowEventMap[K]) => void, opts?: AddEventListenerOptions) => {
      target.addEventListener(type, fn as EventListener, opts)
      this.listeners.push(() => target.removeEventListener(type, fn as EventListener, opts))
    }
    on(window, 'keydown', e => {
      const typing = (e.target as HTMLElement | null)?.matches?.('input, textarea')
      if (typing) return
      if (e.code === 'Tab' || e.code === 'Space' || e.code.startsWith('Arrow')) e.preventDefault()
      if (e.repeat) return
      this.keys.add(e.code)
      this.method = 'keyboard'
      for (const [action, codes] of Object.entries(KEY_BINDINGS) as [Action, string[]][]) {
        if (codes.includes(e.code)) this.press(action)
      }
    })
    on(window, 'keyup', e => this.keys.delete(e.code))
    on(window, 'blur', () => {
      this.keys.clear()
      this.mouse.clear()
      this.pressed_.clear()
      this.look.x = this.look.y = 0
    })
    on(window, 'mousedown', e => {
      if (!this.locked) return
      this.mouse.add(e.button)
      this.method = 'keyboard'
      if (e.button === 0) this.press('fire')
      if (e.button === 2) this.press('ads')
    })
    on(window, 'mouseup', e => this.mouse.delete(e.button))
    on(window, 'contextmenu', e => {
      if (this.locked) e.preventDefault()
    })
    on(window, 'wheel', e => {
      if (!this.locked) return
      if (e.deltaY > 0) this.press('nextWeapon')
      else if (e.deltaY < 0) this.press('prevWeapon')
    }, { passive: true })
    on(window, 'mousemove', e => {
      if (!this.locked) return
      // Ignore rare giant spikes some browsers emit when pointer lock engages.
      if (Math.abs(e.movementX) > 400 || Math.abs(e.movementY) > 400) return
      this.look.x += e.movementX * 0.0019
      this.look.y += e.movementY * 0.0019
    })
  }

  private press(action: Action): void {
    this.pressed_.set(action, performance.now())
  }

  /** Test hook: headless browsers cannot take pointer lock. */
  debugLock = false
  get locked(): boolean {
    return this.debugLock || document.pointerLockElement === this.canvas
  }

  lockPointer(): void {
    if (document.pointerLockElement === this.canvas) return
    try {
      const r = (this.canvas.requestPointerLock as (o?: unknown) => Promise<void> | undefined)?.call(this.canvas, { unadjustedMovement: true })
      r?.catch?.(() => this.canvas.requestPointerLock?.()?.catch?.(() => undefined))
    } catch {
      this.canvas.requestPointerLock?.()
    }
  }

  unlockPointer(): void {
    if (document.pointerLockElement) document.exitPointerLock()
    this.mouse.clear()
  }

  update(): void {
    const k = (codes: string[]) => codes.some(code => this.keys.has(code))
    let x = (k(MOVE_KEYS.right) ? 1 : 0) - (k(MOVE_KEYS.left) ? 1 : 0)
    let y = (k(MOVE_KEYS.up) ? 1 : 0) - (k(MOVE_KEYS.down) ? 1 : 0)
    this.held_.clear()
    for (const [action, codes] of Object.entries(KEY_BINDINGS) as [Action, string[]][]) {
      if (k(codes)) this.held_.add(action)
    }
    if (this.mouse.has(0)) this.held_.add('fire')
    if (this.mouse.has(2)) this.held_.add('ads')
    const pad = navigator.getGamepads?.().find(p => p && p.connected)
    if (pad) {
      const dead = (v: number) => (Math.abs(v) < 0.16 ? 0 : v)
      const lx = dead(pad.axes[0] ?? 0)
      const ly = dead(pad.axes[1] ?? 0)
      const rx = dead(pad.axes[2] ?? 0)
      const ry = dead(pad.axes[3] ?? 0)
      const active = lx !== 0 || ly !== 0 || rx !== 0 || ry !== 0 || pad.buttons.some(b => b.pressed)
      if (active) this.method = 'gamepad'
      if (lx !== 0 || ly !== 0) {
        x = lx
        y = -ly
      }
      const curve = (v: number) => Math.sign(v) * v * v
      this.look.x += curve(rx) * 0.05
      this.look.y += curve(ry) * 0.04
      const now = new Set<Action>()
      for (const [action, buttons] of Object.entries(PAD_BINDINGS) as [Action, number[]][]) {
        if (buttons.some(i => (pad.buttons[i]?.value ?? 0) > 0.4 || pad.buttons[i]?.pressed)) now.add(action)
      }
      for (const action of now) {
        this.held_.add(action)
        if (!this.padPrev.has(action)) this.press(action)
      }
      this.padPrev = now
    }
    const len = Math.hypot(x, y)
    this.move.x = len > 1 ? x / len : x
    this.move.y = len > 1 ? y / len : y
  }

  /** Test-only: actions forced held by the headless probes. */
  debugHeld = new Set<string>()
  held(action: Action): boolean {
    return this.held_.has(action) || this.debugHeld.has(action)
  }
  pressed(action: Action): boolean {
    return this.pressed_.has(action)
  }
  consume(action: Action): boolean {
    return this.pressed_.delete(action)
  }
  takeLook(): { x: number; y: number } {
    const out = { x: this.look.x * this.sensitivity, y: this.look.y * this.sensitivity * (this.invertY ? -1 : 1) }
    this.look.x = 0
    this.look.y = 0
    return out
  }
  /** Drop presses nobody consumed within PRESS_TTL (they were offered to at least one sim step). */
  endFrame(): void {
    const now = performance.now()
    for (const [a, t] of this.pressed_) if (now - t > PRESS_TTL) this.pressed_.delete(a)
  }
  /** Debug/test hook: inject an edge-triggered press. */
  debugPress(action: Action): void {
    this.press(action)
  }
  dispose(): void {
    for (const off of this.listeners) off()
    this.listeners = []
  }
}
