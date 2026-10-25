import { describe, expect, it } from 'vitest'
import { Agent, BODY } from '../src/game/agent'
import { initPhysics, Physics } from '../src/engine/physics'
import { MOUNT_BACK, MOUNT_RUN, botWantsMount } from '../src/game/mount'

describe('bot mounts', () => {
  it('rides the long way and dismounts to fight or arrive', () => {
    expect(botWantsMount({ goalDist: 80, fighting: false, carrying: false, channeling: false, urgent: false })).toBe('on')
    expect(botWantsMount({ goalDist: 80, fighting: true, carrying: false, channeling: false, urgent: false })).toBe('off')
    expect(botWantsMount({ goalDist: 80, fighting: false, carrying: true, channeling: false, urgent: true })).toBe('off')
    expect(botWantsMount({ goalDist: 4, fighting: false, carrying: false, channeling: false, urgent: false })).toBe('off')
    expect(botWantsMount({ goalDist: 20, fighting: false, carrying: false, channeling: false, urgent: false })).toBe(null)
  })
})

describe('mounted movement', () => {
  it('uses the epic mount speed instead of the weapon', async () => {
    await initPhysics()
    const a = new Agent('horde', () => 'thrall', false, new Physics(), null)
    expect(a.speed()).toBeLessThan(MOUNT_RUN)
    a.mounted = true
    expect(a.speed()).toBe(MOUNT_RUN)
    expect(a.speed(true)).toBe(MOUNT_BACK)
    expect(MOUNT_RUN).toBeGreaterThan(BODY.runSpeed * 1.5)
    a.dismount()
    expect(a.mounted).toBe(false)
  })
})
