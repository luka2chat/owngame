import Phaser from 'phaser'
import Chest from '../items/Chest'
import type { MovementControls } from '../owngame'
import {arrivalSpeed} from '../movement'

import { sceneEvents } from '../events/EventsCenter'

declare global
{
	namespace Phaser.GameObjects
	{
		interface GameObjectFactory
		{
			faune(x: number, y: number, texture: string, frame?: string | number): Faune
		}
	}
}

enum HealthState
{
	IDLE,
	DAMAGE,
	DEAD
}

export default class Faune extends Phaser.Physics.Arcade.Sprite
{
	private healthState = HealthState.IDLE
	private damageTime = 0

	private _health = 3
	private _coins = 0

	private knives?: Phaser.Physics.Arcade.Group
	private activeChest?: Chest
	private knifeCooldown = 0
    private shots = 0
    get shotsFired(){ return this.shots }

	get coins() { return this._coins }

    restoreVitals(health: number, coins: number) {
        this._health = health; this._coins = coins;
        this.healthState = HealthState.IDLE; this.damageTime = 0;
    }

    get health()
	{
		return this._health
	}

	constructor(scene: Phaser.Scene, x: number, y: number, texture: string, frame?: string | number)
	{
		super(scene, x, y, texture, frame)

		this.anims.play('faune-idle-down')
	}

	setKnives(knives: Phaser.Physics.Arcade.Group)
	{
		this.knives = knives
	}

	setChest(chest?: Chest)
	{
		this.activeChest = chest
	}

	handleDamage(dir: Phaser.Math.Vector2)
	{
		if (this._health <= 0)
		{
			return
		}

		if (this.healthState === HealthState.DAMAGE)
		{
			return
		}

		--this._health

		if (this._health <= 0)
		{
			// TODO: die
			this.healthState = HealthState.DEAD
			this.anims.play('faune-faint')
			this.setVelocity(0, 0)
		}
		else
		{
			this.setVelocity(dir.x, dir.y)

			this.setTint(0xff0000)

			this.healthState = HealthState.DAMAGE
			this.damageTime = 0
		}
	}

	private throwKnife()
	{
		if (!this.knives)
		{
			return
		}

		const knife = this.knives.get(this.x, this.y, 'knife') as Phaser.Physics.Arcade.Image
		if (!knife)
		{
			return
		}

		const parts = this.anims.currentAnim.key.split('-')
		const direction = parts[2]

		const vec = new Phaser.Math.Vector2(0, 0)

		switch (direction)
		{
			case 'up':
				vec.y = -1
				break

			case 'down':
				vec.y = 1
				break

			default:
			case 'side':
				if (this.scaleX < 0)
				{
					vec.x = -1
				}
				else
				{
					vec.x = 1
				}
				break
		}

		const angle = vec.angle()

		knife.enableBody(true, this.x, this.y, true, true)
        this.shots++
		knife.setVisible(true)

		knife.setRotation(angle)

		knife.x += vec.x * 16
		knife.y += vec.y * 16

		knife.setVelocity(vec.x * 300, vec.y * 300)
	}

	preUpdate(t: number, dt: number)
	{
		super.preUpdate(t, dt)

		switch (this.healthState)
		{
			case HealthState.IDLE:
				break

			case HealthState.DAMAGE:
				this.damageTime += dt
				if (this.damageTime >= 800)
				{
					this.healthState = HealthState.IDLE
					this.setTint(0xffffff)
					this.damageTime = 0
				}
				break
		}
	}

	update(cursors: Phaser.Types.Input.Keyboard.CursorKeys, input: MovementControls, dt: number)
	{
        this.knifeCooldown=Math.max(0,this.knifeCooldown-dt)
        // Invulnerability lasts 800ms, but control returns after the brief knockback.
        // Otherwise a hunter can pin the player against a wall for all three hearts.
        if((this.healthState===HealthState.DAMAGE&&this.damageTime<160)||this.healthState===HealthState.DEAD){
            if(input.dragging){input.targetX=this.x;input.targetY=this.y}
            return
        }
        const left=!!(cursors.left?.isDown||input.left),right=!!(cursors.right?.isDown||input.right)
        const up=!!(cursors.up?.isDown||input.up),down=!!(cursors.down?.isDown||input.down)
        let dx=Number(right)-Number(left),dy=Number(down)-Number(up),speed=100
        if(left||right||up||down){
            // Keyboard control takes priority without retaining an old drag destination.
            if(input.dragging){input.targetX=this.x;input.targetY=this.y}
        }else if(input.dragging){
            dx=input.targetX-this.x;dy=input.targetY-this.y
            // Drop blocked-axis offset so reversing a finger immediately moves away from a wall.
            if((dx<0&&this.body.blocked.left)||(dx>0&&this.body.blocked.right)){input.targetX=this.x;dx=0}
            if((dy<0&&this.body.blocked.up)||(dy>0&&this.body.blocked.down)){input.targetY=this.y;dy=0}
            const distance=Math.hypot(dx,dy)
            // Render frames and fixed Arcade steps can run at different rates.
            // A bounded arrival controller never crosses a stationary target.
            speed=arrivalSpeed(distance,dt,this.scene.physics.world.fps)
        }
        const distance=Math.hypot(dx,dy)
        if(distance>0&&speed>0){
            this.setVelocity(dx/distance*speed,dy/distance*speed)
            if(Math.abs(dx)>Math.abs(dy)){
                this.anims.play('faune-run-side',true)
                this.scaleX=dx<0?-1:1;this.body.offset.x=dx<0?24:8
            }else this.anims.play(dy<0?'faune-run-up':'faune-run-down',true)
        }else{
            this.setVelocity(0,0)
            const parts=this.anims.currentAnim.key.split('-');parts[1]='idle';this.anims.play(parts.join('-'),true)
        }
        if(this.activeChest&&Phaser.Math.Distance.Between(this.x,this.y,this.activeChest.x,this.activeChest.y)<35){
            const coins=this.activeChest.open()
            if(coins){this._coins+=coins;sceneEvents.emit('player-coins-changed',this._coins)}
        }
        // Preserve facing, knife speed, damage and the original three-knife pool.
        if(this.knifeCooldown<=0){this.throwKnife();this.knifeCooldown=400}
	}

}

Phaser.GameObjects.GameObjectFactory.register('faune', function (this: Phaser.GameObjects.GameObjectFactory, x: number, y: number, texture: string, frame?: string | number) {
	var sprite = new Faune(this.scene, x, y, texture, frame)

	this.displayList.add(sprite)
	this.updateList.add(sprite)

	this.scene.physics.world.enableBody(sprite, Phaser.Physics.Arcade.DYNAMIC_BODY)

	sprite.body.setSize(sprite.width * 0.5, sprite.height * 0.8)

	return sprite
})
