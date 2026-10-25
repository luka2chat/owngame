import { beforeAll, describe, expect, it } from 'vitest'
import { Agent } from '../src/game/agent'
import { Game } from '../src/game/game'
import { initPhysics, Physics } from '../src/engine/physics'
import type { Action } from '../src/engine/input'

beforeAll(initPhysics)

// Exercise the real player input step with a real agent/collider; rendering is not needed.
function fixture() {
  const physics = new Physics()
  const player = new Agent('alliance', () => 'test', true, physics, null)
  player.switchTo('sniper')
  player.updateWeapon(2)
  player.grounded = true
  player.beginMount()
  player.tickMount(2, false)
  const pressed = new Set<Action>()
  const game = Object.assign(Object.create(Game.prototype), {
    player, playerBot: null, zoom: false, aimToggle: false, scopeStep: 0,
    camLook: { yaw: 0, pitch: 0 }, renderer: { camera: { fov: 74 } },
    input: {
      method: 'keyboard', move: { x: 0, y: 0 }, takeLook: () => ({ x: 0, y: 0 }),
      consume: (action: Action) => pressed.delete(action), held: () => false,
    },
  }) as { zoom: boolean; stepPlayer(dt: number, frozen: boolean): void }
  return { player, game, press: () => pressed.add('ads'), step: (frozen = false) => game.stepPlayer(1 / 60, frozen) }
}

describe('mounted sniper scope', () => {
  it('dismounts and aims on the same right click, then toggles off on the next click', () => {
    const { player, game, press, step } = fixture()
    expect(player.mounted).toBe(true)
    press(); step()
    expect(player.mounted).toBe(false)
    expect(game.zoom).toBe(true)
    expect(player.aiming).toBe(true)
    step()
    expect(game.zoom).toBe(true)
    press(); step()
    expect(game.zoom).toBe(false)
  })
  it('cancels a mount summon when raising the scope', () => {
    const { player, game, press, step } = fixture()
    player.dismount(); player.grounded = true; player.beginMount()
    expect(player.mountCast).toBeGreaterThan(0)
    press(); step()
    expect(player.mountCast).toBe(0)
    expect(game.zoom).toBe(true)
  })
  it('does not dismount during frozen preparation', () => {
    const { player, game, press, step } = fixture()
    press(); step(true)
    expect(player.mounted).toBe(true)
    expect(game.zoom).toBe(false)
  })
})
