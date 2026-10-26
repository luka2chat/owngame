import * as THREE from 'three'
import type { Agent } from './agent'
import { flashTexture } from './fx'
import { AB, type AbMatch } from './rules/ab'
import type { Team } from './teams'

const TEAM_COLOR: Record<Team, number> = { alliance: 0x4f9dff, horde: 0xff4a36 }
/** Deeper than the team colour: added onto a pale sky the light column would wash out to white. */
const PILLAR_COLOR: Record<Team, number> = { alliance: 0x1f6dff, horde: 0xff2a10 }
const NEUTRAL = 0xe8dcb0
/** Where a channel beam lands on the banner pole. */
const BANNER_TOP = 2.6
const MOTES = 7

/** Ground circle round a banner: a dashed band filled clockwise up to `progress`. */
const RING_VERT = /* glsl */ `
varying vec2 vUv;
void main() {
  vUv = uv;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}`
const RING_FRAG = /* glsl */ `
uniform vec3 color;
uniform float progress;
uniform float opacity;
uniform float time;
varying vec2 vUv;
void main() {
  vec2 p = vUv * 2.0 - 1.0;
  float r = length(p);
  if (r > 1.0) discard;
  float band = smoothstep(0.84, 0.88, r) * (1.0 - smoothstep(0.96, 1.0, r));
  float ang = atan(p.x, p.y) / 6.2831853 + 0.5;
  float filled = step(ang, progress);
  float dash = 0.7 + 0.3 * sin(ang * 6.2831853 * 28.0 - time * 3.0);
  float glow = (1.0 - smoothstep(0.0, 0.88, r)) * 0.1 * filled;
  float k = (band * mix(0.22, 1.0, filled) * dash + glow) * opacity;
  gl_FragColor = vec4(color * k, k);
}`

type NodeRing = { mesh: THREE.Mesh; uniforms: { color: { value: THREE.Color }; progress: { value: number }; opacity: { value: number }; time: { value: number } } }
type Beam = { group: THREE.Group; core: THREE.Mesh; motes: THREE.Sprite[]; team: Team }
type Burst = { group: THREE.Group; pillar: THREE.Mesh; wave: THREE.Mesh; sparks: { s: THREE.Sprite; v: THREE.Vector3 }[]; life: number; total: number; big: boolean }

const UP = new THREE.Vector3(0, 1, 0)

/**
 * Arathi Basin node effects: a ground ring per node (owner colour, or the assaulter's filling up
 * over the contest), a beam from each channeller to the banner, and a pillar of light when a node
 * is assaulted, defended or captured.
 */
export class NodeFx {
  private readonly rings = new Map<string, NodeRing>()
  private readonly beams = new Map<number, Beam>()
  private bursts: Burst[] = []
  private readonly beamGeo = new THREE.CylinderGeometry(1, 1, 1, 8, 1, true)
  private readonly pillarGeo = new THREE.CylinderGeometry(1, 1, 1, 24, 1, true)
  private readonly waveGeo = new THREE.RingGeometry(0.86, 1, 64)
  private readonly beamMats = new Map<Team, THREE.MeshBasicMaterial>()
  private readonly moteMats = new Map<Team, THREE.SpriteMaterial>()
  private readonly pillarTex = pillarTexture()
  private readonly tmp = new THREE.Vector3()
  private readonly tmp2 = new THREE.Vector3()

  /** `groundAt` gives the floor height under a point (searching down from `fromY`), or null. */
  constructor(
    private readonly root: THREE.Object3D,
    ab: AbMatch,
    groundAt: (x: number, z: number, fromY: number) => number | null,
  ) {
    for (const node of ab.nodes) {
      const uniforms = { color: { value: new THREE.Color(NEUTRAL) }, progress: { value: 1 }, opacity: { value: 0.3 }, time: { value: 0 } }
      const mat = new THREE.ShaderMaterial({ uniforms, vertexShader: RING_VERT, fragmentShader: RING_FRAG, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, polygonOffset: true, polygonOffsetFactor: -4 })
      const mesh = new THREE.Mesh(groundDisc(node.pos, AB.radius * 1.05, groundAt), mat)
      mesh.renderOrder = 2
      root.add(mesh)
      this.rings.set(node.id, { mesh, uniforms })
    }
  }

  /** Light pillar and shock ring for an assault/defence (`big` for a capture). */
  burst(at: { x: number; y: number; z: number }, team: Team, big: boolean): void {
    const color = TEAM_COLOR[team]
    const group = new THREE.Group()
    group.position.set(at.x, at.y, at.z)
    // Unfogged so an assault across the basin still reads.
    const pillarMat = new THREE.MeshBasicMaterial({ map: this.pillarTex, color: PILLAR_COLOR[team], transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide, fog: false })
    const pillar = new THREE.Mesh(this.pillarGeo, pillarMat)
    group.add(pillar)
    const waveMat = new THREE.MeshBasicMaterial({ color, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide })
    const wave = new THREE.Mesh(this.waveGeo, waveMat)
    wave.rotation.x = -Math.PI / 2
    wave.position.y = 0.2
    group.add(wave)
    const sparks: Burst['sparks'] = []
    const sparkMat = this.moteMat(team)
    for (let i = 0; i < (big ? 28 : 16); i++) {
      const s = new THREE.Sprite(sparkMat)
      const a = Math.random() * Math.PI * 2
      const r = Math.random() * 1.2
      s.position.set(Math.cos(a) * r, 0.5 + Math.random() * 1.5, Math.sin(a) * r)
      s.scale.setScalar(0.35 + Math.random() * 0.3)
      group.add(s)
      sparks.push({ s, v: new THREE.Vector3(Math.cos(a) * (1 + Math.random() * 2), 4 + Math.random() * (big ? 9 : 6), Math.sin(a) * (1 + Math.random() * 2)) })
    }
    this.root.add(group)
    const total = big ? 2.6 : 1.7
    this.bursts.push({ group, pillar, wave, sparks, life: total, total, big })
  }

  update(dt: number, time: number, ab: AbMatch, agents: readonly Agent[]): void {
    for (const node of ab.nodes) {
      const ring = this.rings.get(node.id)!
      const u = ring.uniforms
      u.time.value = time
      if (node.assaulter) {
        u.color.value.setHex(TEAM_COLOR[node.assaulter])
        u.progress.value = 1 - node.timer / AB.contest
        u.opacity.value = 0.75 + 0.25 * Math.sin(time * 5)
      } else if (node.owner) {
        u.color.value.setHex(TEAM_COLOR[node.owner])
        u.progress.value = 1
        u.opacity.value = 0.45
      } else {
        u.color.value.setHex(NEUTRAL)
        u.progress.value = 1
        u.opacity.value = 0.22
      }
    }
    // While someone channels, their ring shows the channel instead, so the bar is readable on the ground.
    for (const [id, ch] of ab.channels) {
      const a = agents.find(x => x.id === id)
      const ring = this.rings.get(ch.node)
      if (!a || !ring) continue
      ring.uniforms.color.value.setHex(TEAM_COLOR[a.team])
      ring.uniforms.progress.value = ch.t / AB.channel
      ring.uniforms.opacity.value = 1
    }

    for (const [id, beam] of this.beams) {
      if (ab.channels.has(id)) continue
      this.dropBeam(beam)
      this.beams.delete(id)
    }
    for (const [id, ch] of ab.channels) {
      const a = agents.find(x => x.id === id)
      if (!a?.alive) continue
      let beam = this.beams.get(id)
      if (!beam || beam.team !== a.team) {
        if (beam) this.dropBeam(beam)
        beam = this.makeBeam(a.team)
        this.beams.set(id, beam)
      }
      const node = ab.node(ch.node)
      const root = a.avatar?.root.position ?? a.pos
      const from = this.tmp.set(root.x, root.y + (a.avatar?.footHead ?? 1.6) * 0.78, root.z)
      const to = this.tmp2.set(node.pos.x, node.pos.y + BANNER_TOP, node.pos.z)
      const dir = to.clone().sub(from)
      const len = dir.length()
      dir.divideScalar(Math.max(len, 1e-3))
      const k = ch.t / AB.channel
      beam.core.position.copy(from).addScaledVector(dir, len / 2)
      beam.core.quaternion.setFromUnitVectors(UP, dir)
      const width = 0.03 + 0.05 * k + 0.015 * Math.sin(time * 23)
      beam.core.scale.set(width, len, width)
      ;(beam.core.material as THREE.MeshBasicMaterial).opacity = 0.45 + 0.4 * k
      const side = new THREE.Vector3().crossVectors(dir, UP).normalize()
      const lift = new THREE.Vector3().crossVectors(side, dir)
      beam.motes.forEach((m, i) => {
        const f = (time * (0.7 + k * 0.8) + i / MOTES) % 1
        const swirl = time * 6 + i * 2.1
        const r = 0.18 * Math.sin(f * Math.PI)
        m.position.copy(from).addScaledVector(dir, len * f).addScaledVector(side, Math.cos(swirl) * r).addScaledVector(lift, Math.sin(swirl) * r)
        m.scale.setScalar(0.22 + 0.25 * k)
      })
    }

    this.bursts = this.bursts.filter(b => {
      b.life -= dt
      const t = 1 - b.life / b.total
      if (b.life <= 0) {
        this.root.remove(b.group)
        ;(b.pillar.material as THREE.Material).dispose()
        ;(b.wave.material as THREE.Material).dispose()
        return false
      }
      const height = b.big ? 34 : 22
      const grow = Math.min(1, t * 6)
      const radius = (b.big ? 1.8 : 1.3) * (0.35 + 0.65 * grow) * (1 - 0.6 * t)
      b.pillar.scale.set(radius, height * grow, radius)
      b.pillar.position.y = (height * grow) / 2
      ;(b.pillar.material as THREE.MeshBasicMaterial).opacity = Math.pow(1 - t, 1.4) * 0.95
      const w = Math.min(1, t * 2.2)
      b.wave.scale.setScalar(0.6 + w * (b.big ? 13 : 9))
      ;(b.wave.material as THREE.MeshBasicMaterial).opacity = Math.max(0, 1 - w) * 0.9
      for (const sp of b.sparks) {
        sp.s.position.addScaledVector(sp.v, dt)
        sp.v.y -= dt * 2.5
        sp.v.x *= 1 - dt
        sp.v.z *= 1 - dt
      }
      return true
    })
  }

  dispose(): void {
    for (const ring of this.rings.values()) this.root.remove(ring.mesh)
    for (const beam of this.beams.values()) this.dropBeam(beam)
    for (const b of this.bursts) this.root.remove(b.group)
    this.rings.clear()
    this.beams.clear()
    this.bursts = []
  }

  private dropBeam(beam: Beam): void {
    this.root.remove(beam.group)
    ;(beam.core.material as THREE.Material).dispose()
  }

  private makeBeam(team: Team): Beam {
    const group = new THREE.Group()
    let mat = this.beamMats.get(team)
    if (!mat) this.beamMats.set(team, (mat = new THREE.MeshBasicMaterial({ color: TEAM_COLOR[team], transparent: true, depthWrite: false, blending: THREE.AdditiveBlending })))
    const core = new THREE.Mesh(this.beamGeo, mat.clone())
    group.add(core)
    const motes: THREE.Sprite[] = []
    for (let i = 0; i < MOTES; i++) {
      const s = new THREE.Sprite(this.moteMat(team))
      group.add(s)
      motes.push(s)
    }
    this.root.add(group)
    return { group, core, motes, team }
  }

  private moteMat(team: Team): THREE.SpriteMaterial {
    let mat = this.moteMats.get(team)
    if (!mat) this.moteMats.set(team, (mat = new THREE.SpriteMaterial({ map: flashTexture(), color: TEAM_COLOR[team], transparent: true, depthWrite: false, blending: THREE.AdditiveBlending })))
    return mat
  }
}

/**
 * A disc of `radius` round `center` draped over the floor (banner plinths and slopes poke through
 * a flat one), lifted a little so it never z-fights. UVs span the disc's square for the ring shader.
 */
function groundDisc(center: { x: number; y: number; z: number }, radius: number, groundAt: (x: number, z: number, fromY: number) => number | null): THREE.BufferGeometry {
  const RINGS = 8
  const SEGMENTS = 72
  const LIFT = 0.12
  const positions: number[] = []
  const uvs: number[] = []
  const index: number[] = []
  const top = center.y + 4
  for (let i = 0; i <= RINGS; i++) {
    const r = (radius * i) / RINGS
    for (let j = 0; j < SEGMENTS; j++) {
      const a = (j / SEGMENTS) * Math.PI * 2
      const dx = Math.sin(a) * r
      const dz = Math.cos(a) * r
      const y = groundAt(center.x + dx, center.z + dz, top) ?? center.y
      positions.push(center.x + dx, y + LIFT, center.z + dz)
      uvs.push(0.5 + (0.5 * dx) / radius, 0.5 + (0.5 * dz) / radius)
    }
  }
  for (let i = 0; i < RINGS; i++) {
    for (let j = 0; j < SEGMENTS; j++) {
      const a = i * SEGMENTS + j
      const b = i * SEGMENTS + ((j + 1) % SEGMENTS)
      index.push(a, a + SEGMENTS, b, b, a + SEGMENTS, b + SEGMENTS)
    }
  }
  const geo = new THREE.BufferGeometry()
  geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3))
  geo.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2))
  geo.setIndex(index)
  return geo
}

/** Bright at the foot, fading out toward the top and at the seam-less edges. */
function pillarTexture(): THREE.Texture {
  const c = document.createElement('canvas')
  c.width = 4
  c.height = 128
  const g = c.getContext('2d')!
  const grad = g.createLinearGradient(0, 128, 0, 0)
  grad.addColorStop(0, 'rgba(255,255,255,1)')
  grad.addColorStop(0.25, 'rgba(255,255,255,0.65)')
  grad.addColorStop(1, 'rgba(255,255,255,0)')
  g.fillStyle = grad
  g.fillRect(0, 0, 4, 128)
  const tex = new THREE.CanvasTexture(c)
  tex.colorSpace = THREE.SRGBColorSpace
  return tex
}
