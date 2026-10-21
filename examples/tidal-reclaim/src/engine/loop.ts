/**
 * Fixed-step simulation loop with interpolated rendering.
 *
 * Gameplay and physics advance in constant `stepSeconds` increments so behaviour is identical on
 * 30 Hz phones and 144 Hz monitors. Rendering happens once per animation frame and receives the
 * interpolation factor `alpha` (0..1) between the previous and current simulation state.
 */
export type LoopCallbacks = {
  /** Advance simulation by exactly one fixed step. */
  step: (stepSeconds: number) => void
  /** Draw the current frame; `alpha` blends the last two simulation states. `frameSeconds` is wall time. */
  render: (alpha: number, frameSeconds: number) => void
}

export class GameLoop {
  readonly stepSeconds: number
  private accumulator = 0
  private last = 0
  private handle = 0
  private running = false
  /** Simulation is paused (menus); rendering continues so UI and backgrounds stay alive. */
  paused = false
  /** Guards against the "spiral of death" after a tab was hidden or the device stalled. */
  private readonly maxFrameSeconds = 0.25

  constructor(private readonly callbacks: LoopCallbacks, stepHz = 60) {
    this.stepSeconds = 1 / stepHz
  }

  start(): void {
    if (this.running) return
    this.running = true
    this.last = performance.now()
    const frame = (now: number) => {
      if (!this.running) return
      const frameSeconds = Math.min((now - this.last) / 1000, this.maxFrameSeconds)
      this.last = now
      if (!this.paused) {
        this.accumulator += frameSeconds
        while (this.accumulator >= this.stepSeconds) {
          this.callbacks.step(this.stepSeconds)
          this.accumulator -= this.stepSeconds
        }
      }
      this.callbacks.render(this.paused ? 1 : this.accumulator / this.stepSeconds, frameSeconds)
      this.handle = requestAnimationFrame(frame)
    }
    this.handle = requestAnimationFrame(frame)
  }

  stop(): void {
    this.running = false
    cancelAnimationFrame(this.handle)
  }

  /** Drop pending simulation time, e.g. when resuming from pause so the world does not jump. */
  resetAccumulator(): void {
    this.accumulator = 0
    this.last = performance.now()
  }
}
