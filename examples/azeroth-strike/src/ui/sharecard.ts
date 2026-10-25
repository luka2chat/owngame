export type ShareCardInput = {
  art: string
  title: string
  result: string
  reason: string
  score: string
  stats: string
  resultColor: string
  url: string
  linkLabel: string
}

const W = 1200
const H = 630
const FONT = '"Microsoft YaHei", "PingFang SC", "Segoe UI", sans-serif'

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const image = new Image()
    image.onload = () => resolve(image)
    image.onerror = () => reject(new Error('share image unavailable'))
    image.src = src
  })
}

/** Freeze the last rendered game frame. The DOM results panel is intentionally outside the image. */
export function captureMatchFrame(source: HTMLCanvasElement): string | null {
  try {
    if (!source.width || !source.height) return null
    const frame = document.createElement('canvas')
    const scale = Math.min(1, 1600 / source.width)
    frame.width = Math.round(source.width * scale)
    frame.height = Math.round(source.height * scale)
    frame.getContext('2d')!.drawImage(source, 0, 0, frame.width, frame.height)
    return frame.toDataURL('image/jpeg', 0.9)
  } catch { return null }
}

function line(ctx: CanvasRenderingContext2D, text: string, x: number, y: number, size: number, width: number, weight = 400): void {
  ctx.font = `${weight} ${size}px ${FONT}`
  while (ctx.measureText(text).width > width && size > 16) ctx.font = `${weight} ${--size}px ${FONT}`
  ctx.fillText(text, x, y, width)
}

/** A real match frame, restrained battle-report typography, and the future public game address. */
export async function drawShareCard(input: ShareCardInput): Promise<HTMLCanvasElement> {
  const canvas = document.createElement('canvas')
  canvas.width = W
  canvas.height = H
  const ctx = canvas.getContext('2d')!
  const art = await loadImage(input.art)
  const scale = Math.max(W / art.width, H / art.height)
  const w = art.width * scale, h = art.height * scale
  ctx.drawImage(art, (W-w)/2, (H-h)/2, w, h)
  const side = ctx.createLinearGradient(0,0,W,0)
  side.addColorStop(0,'rgba(8,10,12,.82)')
  side.addColorStop(.65,'rgba(8,10,12,.20)')
  side.addColorStop(1,'rgba(8,10,12,.06)')
  ctx.fillStyle=side;ctx.fillRect(0,0,W,H)
  const bottom=ctx.createLinearGradient(0,280,0,H)
  bottom.addColorStop(0,'transparent');bottom.addColorStop(1,'rgba(5,7,9,.97)')
  ctx.fillStyle=bottom;ctx.fillRect(0,280,W,H-280)
  ctx.strokeStyle='rgba(228,193,119,.6)';ctx.lineWidth=2;ctx.strokeRect(20,20,W-40,H-40)
  ctx.textBaseline='alphabetic';ctx.textAlign='left'
  ctx.fillStyle='#e4c17c';line(ctx,'AZEROTH STRIKE',52,68,23,1096,700)
  ctx.fillStyle='#f5ead1';line(ctx,input.title,52,112,29,1096)
  ctx.fillStyle=input.resultColor;line(ctx,input.result,48,220,82,730,700)
  ctx.fillStyle='#e6dfd2';line(ctx,input.reason,52,270,27,960)
  ctx.fillStyle='#fff4da';line(ctx,input.score,52,455,36,1096,700)
  ctx.fillStyle='#d6cbb7';line(ctx,input.stats,52,503,26,1096)
  ctx.strokeStyle='rgba(228,193,119,.35)';ctx.beginPath();ctx.moveTo(52,537);ctx.lineTo(1148,537);ctx.stroke()
  ctx.fillStyle='#e4c17c';line(ctx,input.linkLabel,52,583,19,210,700)
  ctx.fillStyle='#ece6da';line(ctx,input.url.replace(/^https:\/\//,''),280,583,22,868)
  return canvas
}

export function canvasBlob(canvas: HTMLCanvasElement): Promise<Blob> {
  return new Promise((resolve, reject) => canvas.toBlob(blob => blob ? resolve(blob) : reject(new Error('png')), 'image/png'))
}

export function downloadBlob(blob: Blob, name: string): void {
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url;link.download = name;link.click()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}
