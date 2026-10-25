import * as THREE from 'three'
import { GROUP_AGENT, GROUP_WORLD, type Physics } from '../engine/physics'
import { type Agent } from './agent'
import type { WeaponDef } from './weapons'

export type ShotResult = { from: THREE.Vector3; to: THREE.Vector3; target: Agent | null; head: boolean; damage: number; normal: THREE.Vector3 | null }

/** Random direction inside a cone of half-angle `spread` around `dir`. */
export function spreadDir(dir: THREE.Vector3, spread: number, rand = Math.random): THREE.Vector3 {
  if (spread <= 0) return dir.clone()
  const up = Math.abs(dir.y) > 0.95 ? new THREE.Vector3(1, 0, 0) : new THREE.Vector3(0, 1, 0)
  const right = new THREE.Vector3().crossVectors(dir, up).normalize()
  const realUp = new THREE.Vector3().crossVectors(right, dir).normalize()
  const a = rand() * Math.PI * 2
  const r = Math.sqrt(rand()) * Math.tan(spread)
  return dir.clone().addScaledVector(right, Math.cos(a) * r).addScaledVector(realUp, Math.sin(a) * r).normalize()
}

export function falloff(distance: number, w: WeaponDef): number {
  if (distance <= w.falloffStart) return 1
  const t = Math.min(1, (distance - w.falloffStart) / (w.range - w.falloffStart))
  return 1 - t * (1 - w.minFactor)
}

/** Hitscan one bullet (or pellet) from `from` along `dir` (already spread). */
export function traceShot(
  physics: Physics,
  shooter: Agent,
  dir: THREE.Vector3,
  byCollider: Map<number, Agent>,
  w: WeaponDef,
  from = shooter.eye(),
  range = w.range,
): ShotResult {
  const hit = physics.ray(from, dir, range, GROUP_WORLD | GROUP_AGENT, shooter.collider)
  if (!hit) return { from, to: from.clone().addScaledVector(dir, range), target: null, head: false, damage: 0, normal: null }
  const to = new THREE.Vector3(hit.point.x, hit.point.y, hit.point.z)
  const target = byCollider.get(hit.collider.handle) ?? null
  if (!target || !target.alive || target.team === shooter.team) {
    return { from, to, target: null, head: false, damage: 0, normal: new THREE.Vector3(hit.normal.x, hit.normal.y, hit.normal.z) }
  }
  const head = to.y - target.pos.y >= target.headHeight
  const damage = w.damage * falloff(hit.distance, w) * (head ? w.headMultiplier : 1)
  return { from, to, target, head, damage, normal: null }
}

/**
 * Knife swing: a fan of short rays so a slash still connects when the crosshair is slightly off.
 * Hits from behind (target facing away from the attacker) deal the backstab multiplier.
 */
export function traceMelee(physics: Physics, shooter: Agent, dir: THREE.Vector3, byCollider: Map<number, Agent>, w: WeaponDef, heavy: boolean): ShotResult {
  const range = heavy && w.heavy ? w.heavy.range : w.range
  const base = heavy && w.heavy ? w.heavy.damage : w.damage
  const right = new THREE.Vector3(-dir.z, 0, dir.x).normalize()
  let miss: ShotResult | null = null
  for (const off of [0, -0.12, 0.12, -0.24, 0.24]) {
    const d = dir.clone().addScaledVector(right, off).normalize()
    const shot = traceShot(physics, shooter, d, byCollider, w, shooter.eye(), range)
    if (!shot.target) {
      miss ??= shot
      continue
    }
    const t = shot.target
    const facingAway = Math.sin(t.yaw) * d.x + Math.cos(t.yaw) * d.z > 0.4
    const damage = base * (facingAway ? (w.backstab ?? 1) : 1) * (shot.head ? w.headMultiplier : 1)
    return { ...shot, damage }
  }
  return miss!
}
