import * as THREE from 'three'
import type { Agent } from '../game/agent'

/** Nameplates fade out past this many yards so a whole battleground does not cover the screen. */
export const PLATE_RANGE = 110

const v = new THREE.Vector3()

export function plateFill(hp: number): string {
  if (hp > 60) return '#8ed24a'
  if (hp > 30) return '#e6c14a'
  return '#e24b3a'
}

/**
 * Screen position of a head, or null when it is behind the camera, off the screen, or too far.
 * `ndc` is a three.js `project()` result.
 */
export function plateScreen(ndcX: number, ndcY: number, ndcZ: number, width: number, height: number, dist: number): { x: number; y: number; scale: number } | null {
  if (ndcZ > 1 || dist > PLATE_RANGE || dist < 0.4) return null
  const x = (ndcX * 0.5 + 0.5) * width
  const y = (-ndcY * 0.5 + 0.5) * height
  if (x < -80 || y < -30 || x > width + 80 || y > height + 30) return null
  const scale = Math.min(1, Math.max(0.55, 1.2 - dist / 80))
  return { x, y, scale }
}

type Plate = { root: HTMLElement; name: HTMLElement; fill: HTMLElement; shown: string }

/**
 * One health bar per combatant, parked just above the head. The player's own bar is only drawn
 * when their body is visible (third person, or on a mount).
 */
export class Nameplates {
  readonly root: HTMLElement
  private readonly nodes = new Map<number, Plate>()

  constructor(parent: HTMLElement, private readonly defense = false) {
    this.root = document.createElement('div')
    this.root.className = 'plates'
    parent.appendChild(this.root)
  }

  /** `magnify` is the optical zoom: plates go by how far away someone looks, not how far they are. */
  update(agents: readonly Agent[], camera: THREE.Camera, show: (agent: Agent) => boolean, magnify = 1): void {
    const width = window.innerWidth
    const height = window.innerHeight
    const seen = new Set<number>()
    for (const agent of agents) {
      if (!show(agent)) continue
      const base = agent.avatar?.root.position ?? agent.pos
      v.set(base.x, base.y + agent.headHeight + 0.42, base.z)
      const dist = v.distanceTo(camera.position) / magnify
      v.project(camera)
      const screen = plateScreen(v.x, v.y, v.z, width, height, dist)
      if (!screen) continue
      seen.add(agent.id)
      const plate = this.plate(agent)
      const hp = Math.max(0, Math.min(100, agent.maxHp > 0 ? (agent.hp / agent.maxHp) * 100 : 0))
      const sig = `${agent.name}|${Math.ceil(hp)}|${agent.team}`
      if (plate.shown !== sig) {
        plate.shown = sig
        plate.name.textContent = agent.name
        plate.fill.style.width = `${hp}%`
        plate.fill.style.background = plateFill(hp)
      }
      plate.root.style.transform = `translate(${screen.x}px, ${screen.y}px) translate(-50%, -100%) scale(${screen.scale.toFixed(3)})`
      plate.root.style.display = ''
    }
    for (const [id, plate] of this.nodes) {
      if (!seen.has(id)) plate.root.style.display = 'none'
    }
  }

  private plate(agent: Agent): Plate {
    const existing = this.nodes.get(agent.id)
    if (existing) return existing
    const root = document.createElement('div')
    root.className = `plate ${this.defense ? (agent.bodyHeight ? 'hostile' : 'friendly') : agent.team}`
    const name = document.createElement('span')
    name.className = 'nm'
    const track = document.createElement('span')
    track.className = 'track'
    const fill = document.createElement('i')
    track.appendChild(fill)
    root.append(name, track)
    root.style.display = 'none'
    this.root.appendChild(root)
    const plate = { root, name, fill, shown: '' }
    this.nodes.set(agent.id, plate)
    return plate
  }

  dispose(): void {
    this.root.remove()
    this.nodes.clear()
  }
}
