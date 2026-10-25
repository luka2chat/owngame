/** Epic ground mount: 100% speed is about twice a hero's run, the cast is the classic 1.5s summon. */
export const MOUNT_CAST = 1.5
export const MOUNT_RUN = 13
export const MOUNT_BACK = 6.5

export type MountWish = 'on' | 'off' | null

/**
 * Bots mount for a long walk and get off to fight, capture, or stand on a node.
 * `null` leaves whatever they are already doing alone.
 */
export function botWantsMount(o: { goalDist: number; fighting: boolean; carrying: boolean; channeling: boolean; urgent: boolean }): MountWish {
  if (o.fighting || o.carrying || o.channeling) return 'off'
  if (o.goalDist < 8) return 'off'
  if (o.urgent && o.goalDist < 30) return 'off'
  if (o.goalDist > 36) return 'on'
  return null
}
