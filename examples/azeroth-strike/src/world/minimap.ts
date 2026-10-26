/** Light blue for ground the terrain mesh does not cover, so the disc is never a black hole. */
export const MAP_VOID: [number, number, number] = [158, 196, 214]

/**
 * Top-down colour for one terrain sample. `heightT` is 0 on the lowest ground and 1 on the highest;
 * `slope` is the height change across one cell, in yards. Both stay light enough to read at a glance.
 */
export function terrainColor(heightT: number, slope: number): [number, number, number] {
  const t = Math.min(1, Math.max(0, heightT))
  const low: [number, number, number] = [126, 184, 92]
  const mid: [number, number, number] = [222, 196, 122]
  const high: [number, number, number] = [206, 198, 184]
  const u = Math.min(1, t / 0.55)
  const v = t < 0.55 ? 0 : (t - 0.55) / 0.45
  let r = low[0] + (mid[0] - low[0]) * u
  let g = low[1] + (mid[1] - low[1]) * u
  let b = low[2] + (mid[2] - low[2]) * u
  r += (high[0] - r) * v
  g += (high[1] - g) * v
  b += (high[2] - b) * v
  const shade = 1 - Math.min(0.28, slope / 5)
  return [r * shade, g * shade, b * shade]
}

export type MinimapBake = {
  canvas: HTMLCanvasElement
  minX: number
  maxZ: number
  /** Image pixels per yard. */
  ppm: number
}

/**
 * Where one image pixel lands on the radar. The radar is heading-up: yaw 0 keeps world +Z toward
 * the top of the disc, and the player's position sits in the centre.
 */
export function minimapTransform(
  playerX: number,
  playerZ: number,
  yaw: number,
  range: number,
  radius: number,
  center: number,
  minX: number,
  maxZ: number,
  ppm: number,
): { a: number; b: number; c: number; d: number; e: number; f: number } {
  const s = radius / range / ppm
  const cos = Math.cos(yaw)
  const sin = Math.sin(yaw)
  const kx = minX - playerX
  const kz = maxZ - playerZ
  const yards = radius / range
  return {
    a: -cos * s,
    b: -sin * s,
    c: -sin * s,
    d: cos * s,
    e: center + yards * (-cos * kx + sin * kz),
    f: center + yards * (-sin * kx - cos * kz),
  }
}

const LONGEST = 640

/**
 * Raster the terrain meshes into a light height-coloured image. Vertices are splatted, then gaps of
 * a few yards are filled from their neighbours; everything else stays the void colour.
 */
export function rasterTerrain(positions: Float32Array[], minX: number, maxX: number, minZ: number, maxZ: number): { width: number; height: number; rgba: Uint8ClampedArray; ppm: number } {
  const spanX = Math.max(1, maxX - minX)
  const spanZ = Math.max(1, maxZ - minZ)
  const ppm = Math.min(1.7, LONGEST / Math.max(spanX, spanZ))
  const width = Math.max(2, Math.ceil(spanX * ppm))
  const height = Math.max(2, Math.ceil(spanZ * ppm))
  const heights = new Float32Array(width * height)
  heights.fill(Number.NaN)
  for (const p of positions) {
    for (let i = 0; i < p.length; i += 3) {
      const ix = Math.round((p[i] - minX) * ppm)
      const iy = Math.round((maxZ - p[i + 2]) * ppm)
      if (ix < 0 || iy < 0 || ix >= width || iy >= height) continue
      const k = iy * width + ix
      const y = p[i + 1]
      if (!(heights[k] >= y)) heights[k] = y
    }
  }
  // Close cracks between vertices without painting the whole surround.
  for (let pass = 0; pass < 3; pass++) {
    const prev = heights.slice()
    for (let y = 1; y < height - 1; y++) {
      for (let x = 1; x < width - 1; x++) {
        const k = y * width + x
        if (prev[k] === prev[k]) continue
        let sum = 0
        let n = 0
        for (const d of [1, -1, width, -width]) {
          const h = prev[k + d]
          if (h === h) {
            sum += h
            n++
          }
        }
        if (n >= 2) heights[k] = sum / n
      }
    }
  }
  const samples: number[] = []
  for (const h of heights) if (h === h && h > 1) samples.push(h)
  samples.sort((a, b) => a - b)
  const lo = samples.length ? samples[Math.floor(samples.length * 0.08)] : 0
  const hi = samples.length ? samples[Math.min(samples.length - 1, Math.floor(samples.length * 0.92))] : 1
  const span = Math.max(12, hi - lo)
  const rgba = new Uint8ClampedArray(width * height * 4)
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const k = y * width + x
      const h = heights[k]
      const o = k * 4
      let rgb: [number, number, number]
      if (h !== h) rgb = MAP_VOID
      else {
        const left = x > 0 ? heights[k - 1] : h
        const up = y > 0 ? heights[k - width] : h
        const slope = Math.abs(h - (left === left ? left : h)) + Math.abs(h - (up === up ? up : h))
        rgb = terrainColor((h - lo) / span, slope)
      }
      rgba[o] = rgb[0]
      rgba[o + 1] = rgb[1]
      rgba[o + 2] = rgb[2]
      rgba[o + 3] = 255
    }
  }
  return { width, height, rgba, ppm }
}
