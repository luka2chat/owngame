import * as THREE from 'three'

type Tracer = { line: THREE.Line; life: number }
type Spark = { mesh: THREE.Mesh; life: number }

/** Bullet tracers, impact puffs and muzzle flashes. */
export class Fx {
  private tracers: Tracer[] = []
  private sparks: Spark[] = []
  private readonly tracerMats = new Map<number, THREE.LineBasicMaterial>()
  private readonly sparkGeo = new THREE.SphereGeometry(0.08, 6, 4)
  private readonly sparkMat = new THREE.MeshBasicMaterial({ color: 0xd8c8a0 })
  private readonly bloodMat = new THREE.MeshBasicMaterial({ color: 0xa01010 })
  private flashes: Spark[] = []
  private readonly flashMats = new Map<number, THREE.SpriteMaterial>()

  constructor(private readonly scene: THREE.Object3D) {}

  tracer(from: THREE.Vector3, to: THREE.Vector3, color = 0xffe9a0): void {
    let mat = this.tracerMats.get(color)
    if (!mat) this.tracerMats.set(color, (mat = new THREE.LineBasicMaterial({ color, transparent: true, opacity: 0.85 })))
    const geo = new THREE.BufferGeometry().setFromPoints([from, to])
    const line = new THREE.Line(geo, mat)
    this.scene.add(line)
    this.tracers.push({ line, life: 0.06 })
  }

  /** World-space muzzle flash for third-person shooters. */
  flash(at: THREE.Vector3, color: number, size = 0.45): void {
    let mat = this.flashMats.get(color)
    if (!mat) this.flashMats.set(color, (mat = new THREE.SpriteMaterial({ map: flashTexture(), color, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending })))
    const s = new THREE.Sprite(mat)
    s.position.copy(at)
    s.scale.setScalar(size)
    this.scene.add(s)
    this.flashes.push({ mesh: s as unknown as THREE.Mesh, life: 0.05 })
  }

  impact(at: THREE.Vector3, blood: boolean): void {
    const mesh = new THREE.Mesh(this.sparkGeo, blood ? this.bloodMat : this.sparkMat)
    mesh.position.copy(at)
    this.scene.add(mesh)
    this.sparks.push({ mesh, life: blood ? 0.25 : 0.4 })
  }

  update(dt: number): void {
    this.tracers = this.tracers.filter(t => {
      t.life -= dt
      if (t.life > 0) return true
      this.scene.remove(t.line)
      t.line.geometry.dispose()
      return false
    })
    this.sparks = this.sparks.filter(s => {
      s.life -= dt
      s.mesh.scale.setScalar(1 + (0.4 - s.life) * 3)
      if (s.life > 0) return true
      this.scene.remove(s.mesh)
      return false
    })
    this.flashes = this.flashes.filter(f => {
      f.life -= dt
      if (f.life > 0) return true
      this.scene.remove(f.mesh)
      return false
    })
  }
}

let flashTex: THREE.Texture | null = null
/** Soft radial star used for every muzzle flash (first and third person). */
export function flashTexture(): THREE.Texture {
  if (flashTex) return flashTex
  const c = document.createElement('canvas')
  c.width = c.height = 64
  const g = c.getContext('2d')!
  const grad = g.createRadialGradient(32, 32, 0, 32, 32, 32)
  grad.addColorStop(0, 'rgba(255,255,255,1)')
  grad.addColorStop(0.25, 'rgba(255,230,160,0.9)')
  grad.addColorStop(1, 'rgba(255,120,20,0)')
  g.fillStyle = grad
  g.beginPath()
  for (let i = 0; i < 12; i++) {
    const r = i % 2 ? 12 : 32
    const a = (i / 12) * Math.PI * 2
    g.lineTo(32 + Math.cos(a) * r, 32 + Math.sin(a) * r)
  }
  g.fill()
  flashTex = new THREE.CanvasTexture(c)
  flashTex.colorSpace = THREE.SRGBColorSpace
  return flashTex
}
