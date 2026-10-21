import type * as THREE from 'three'
import type { Audio } from '../engine/audio'
import type { ColliderTag } from './arena'
import type { Effects } from './fx'

export type DamageSource =
  | 'rifle' | 'shotgun' | 'rocket' | 'pulse' | 'scatter' | 'barrel' | 'fall'
  | 'grenade' | 'plasma' | 'cannon' | 'minigun' | 'slam' | 'kamikaze'

export type ProjectileKind = 'plasma' | 'cannon'

export type Hit = {
  point: THREE.Vector3
  normal: THREE.Vector3
  distance: number
  tag: ColliderTag | undefined
  colliderHandle: number
}

export type DamageInfo = {
  attacker: number
  amount: number
  source: DamageSource
  from: THREE.Vector3
  point?: THREE.Vector3
  normal?: THREE.Vector3
  headshot?: boolean
  splash?: boolean
}

export type DamageResult = { dealt: number; killed: boolean; armor: boolean }

/** What weapons, bots and props may ask of the game world. */
export interface CombatWorld {
  readonly fx: Effects
  readonly audio: Audio
  readonly time: number
  raycast(origin: THREE.Vector3, dir: THREE.Vector3, maxDist: number, excludeHandle?: number, worldOnly?: boolean): Hit | null
  lineOfSight(a: THREE.Vector3, b: THREE.Vector3): boolean
  /** Apply damage to a combatant (0 = player, 1.. = bots). */
  damage(target: number, info: DamageInfo): DamageResult
  damageProp(index: number, info: DamageInfo): void
  explode(pos: THREE.Vector3, radius: number, damage: number, attacker: number, source: DamageSource, normal?: THREE.Vector3): void
  fireRocket(owner: number, origin: THREE.Vector3, dir: THREE.Vector3, excludeHandle: number): void
  /** Slow, visible energy projectiles (drone plasma, boss cannon). */
  fireProjectile(owner: number, origin: THREE.Vector3, dir: THREE.Vector3, kind: ProjectileKind): void
  damageDrone(id: number, info: DamageInfo): DamageResult
  /** Boss hooks: phase transition, ground slam shockwave, drone summon, heavy footstep. */
  bossPhase(phase: number, at: THREE.Vector3): void
  bossSlam(at: THREE.Vector3, radius: number, damage: number, attacker: number): void
  summonDrones(at: THREE.Vector3, count: number): void
  stomp(at: THREE.Vector3, weight: number): void
  /** Onslaught mode is active (wave enemies share a team). */
  readonly onslaught: boolean
  /** Gunfire is loud: nearby bots hear it. */
  noise(pos: THREE.Vector3, source: number, radius: number): void
  groundAt(x: number, z: number, fromY: number): number
  /** Combatant is a human soldier (blood mist + flesh sounds) rather than a machine. */
  isHuman(target: number): boolean
}

/** Head height threshold from feet for robot headshots. */
export const HEAD_Y = 1.58
