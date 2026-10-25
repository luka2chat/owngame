import type { Key } from '../i18n'

/**
 * Loading helpers: byte-accurate download progress, gzip inflation of pre-compressed assets, and
 * time slicing so long CPU builds never freeze the loading screen.
 */

export type LoadState = { stage: Key; fraction: number; loadedBytes: number; totalBytes: number }

/** Weighted progress over downloads plus named CPU steps; every weight is a share of the bar. */
export class LoadTracker {
  private files = new Map<string, { loaded: number; total: number }>()
  private steps = new Map<string, { weight: number; done: number }>()
  stage: Key = 'load.title'
  /** The bar only moves forward; late content-length headers must not pull it back. */
  private shown = 0

  constructor(
    private readonly downloadWeight: number,
    steps: Record<string, number>,
    private readonly onChange: (state: LoadState) => void,
  ) {
    for (const [name, weight] of Object.entries(steps)) this.steps.set(name, { weight, done: 0 })
  }

  get state(): LoadState {
    let loaded = 0
    let total = 0
    for (const f of this.files.values()) {
      loaded += Math.min(f.loaded, f.total || f.loaded)
      total += f.total || f.loaded
    }
    let weights = this.downloadWeight
    let sum = total > 0 ? (loaded / total) * this.downloadWeight : 0
    for (const s of this.steps.values()) {
      weights += s.weight
      sum += s.weight * s.done
    }
    const fraction = weights > 0 ? Math.min(1, sum / weights) : 0
    this.shown = Math.max(this.shown, fraction)
    return { stage: this.stage, fraction: this.shown, loadedBytes: loaded, totalBytes: total }
  }

  /** Report the current stage and optionally the completion (0..1) of a named step. */
  set(stage: Key, step?: string, done?: number): void {
    this.stage = stage
    if (step !== undefined && done !== undefined) {
      const s = this.steps.get(step)
      if (s) s.done = Math.min(1, Math.max(s.done, done))
    }
    this.onChange(this.state)
  }

  /** Mark steps as already done (cached between matches). */
  skip(...steps: string[]): void {
    for (const name of steps) {
      const s = this.steps.get(name)
      if (s) s.done = 1
    }
  }

  fetch(url: string): Promise<ArrayBuffer> {
    const entry = { loaded: 0, total: 0 }
    this.files.set(url, entry)
    return fetchBytes(url, (loaded, total) => {
      entry.loaded = loaded
      entry.total = total
      this.onChange(this.state)
    })
  }

  async json<T>(url: string): Promise<T> {
    return JSON.parse(new TextDecoder().decode(await this.fetch(url))) as T
  }
}

/** Fetch a file, reporting bytes as they arrive; gzip bodies (by magic number) are inflated. */
export async function fetchBytes(url: string, onBytes?: (loaded: number, total: number) => void): Promise<ArrayBuffer> {
  const res = await fetch(url)
  if (!res.ok) throw new Error(`${url}: HTTP ${res.status}`)
  const total = Number(res.headers.get('content-length') ?? 0)
  let bytes: Uint8Array
  if (!res.body || !onBytes) {
    bytes = new Uint8Array(await res.arrayBuffer())
    onBytes?.(bytes.length, bytes.length)
  } else {
    const reader = res.body.getReader()
    const chunks: Uint8Array[] = []
    let loaded = 0
    for (;;) {
      const { done, value } = await reader.read()
      if (done) break
      chunks.push(value)
      loaded += value.length
      onBytes(loaded, Math.max(total, loaded))
    }
    bytes = new Uint8Array(loaded)
    let at = 0
    for (const c of chunks) {
      bytes.set(c, at)
      at += c.length
    }
  }
  const plain = bytes[0] === 0x1f && bytes[1] === 0x8b ? await inflate(bytes) : (bytes.slice().buffer as ArrayBuffer)
  return unshuffle(plain)
}

function inflate(bytes: Uint8Array): Promise<ArrayBuffer> {
  const stream = new Blob([bytes as BlobPart]).stream().pipeThrough(new DecompressionStream('gzip'))
  return new Response(stream).arrayBuffer()
}

const SHUFFLE_MAGIC = 0x34464853

/** Undo tools/pack.mjs byte shuffling ('SHF4' header); other buffers pass through. */
export function unshuffle(buf: ArrayBuffer): ArrayBuffer {
  if (buf.byteLength < 8) return buf
  const head = new DataView(buf)
  if (head.getUint32(0, true) !== SHUFFLE_MAGIC) return buf
  const len = head.getUint32(4, true)
  const n = Math.floor(len / 4)
  const src = new Uint8Array(buf, 8)
  const out = new Uint8Array(len)
  for (let lane = 0; lane < 4; lane++) {
    const from = lane * n
    for (let i = 0; i < n; i++) out[i * 4 + lane] = src[from + i]
  }
  out.set(src.subarray(n * 4, n * 4 + (len - n * 4)), n * 4)
  return out.buffer
}

/** Gives the browser a chance to paint between chunks of work. */
export const nextTask = (): Promise<void> => new Promise(resolve => setTimeout(resolve, 0))

/** Call `tick()` between work items; it only yields once the time budget of the slice is used. */
export class Slicer {
  private start = performance.now()
  constructor(private readonly budgetMs = 12) {}

  async tick(): Promise<void> {
    if (performance.now() - this.start < this.budgetMs) return
    await nextTask()
    this.start = performance.now()
  }
}
