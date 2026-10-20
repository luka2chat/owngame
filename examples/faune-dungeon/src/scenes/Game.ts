import { controls, attachScene, savedAttempt, paintHUD, saveAttempt, clearControls } from '../owngame'
import Phaser from 'phaser'
import { WoodlandArt } from './WoodlandArt'

import { debugDraw } from '../utils/debug'
import { createLizardAnims } from '../anims/EnemyAnims'
import { createCharacterAnims } from '../anims/CharacterAnims'
import { createChestAnims } from '../anims/TreasureAnims'

import Lizard from '../enemies/Lizard'

import '../characters/Faune'
import Faune from '../characters/Faune'

import { sceneEvents } from '../events/EventsCenter'
import Chest from '../items/Chest'

export default class Game extends Phaser.Scene
{
	private woodland!: WoodlandArt
	private cursors!: Phaser.Types.Input.Keyboard.CursorKeys
	private faune!: Faune

	private knives!: Phaser.Physics.Arcade.Group
	private lizards!: Phaser.Physics.Arcade.Group

	public complete = false
    public failed = false
    private elapsed = 0
    private saveTimer = 0
    private chests!: Phaser.Physics.Arcade.StaticGroup
    private defeated = new Set<number>()
    private playerLizardsCollider?: Phaser.Physics.Arcade.Collider

	constructor()
	{
		super('game')
	}

	preload()
    {
		this.cursors = this.input.keyboard.createCursorKeys()
    }

    create()
    {
        this.complete = false
        this.failed = false
        this.elapsed = 0
        this.saveTimer = 0
        clearControls()

		createCharacterAnims(this.anims)
		createLizardAnims(this.anims)
		createChestAnims(this.anims)

		const map = this.make.tilemap({ key: 'dungeon' })
		const tileset = map.addTilesetImage('dungeon', 'tiles', 16, 16, 1, 2)

		const ground = map.createLayer('Ground', tileset)

		this.knives = this.physics.add.group({
			classType: Phaser.Physics.Arcade.Image,
			maxSize: 3
		})

		this.faune = this.add.faune(128, 128, 'faune')
		this.faune.setKnives(this.knives)
        this.physics.world.setBounds(0,0,map.widthInPixels,map.heightInPixels)
        this.faune.setCollideWorldBounds(true)

		const wallsLayer = map.createLayer('Walls', tileset)

		wallsLayer.setCollisionByProperty({ collides: true })

		const chests = this.chests = this.physics.add.staticGroup({
			classType: Chest
		})
		const chestsLayer = map.getObjectLayer('Chests')
		chestsLayer.objects.forEach(chestObj => {
			chests.get(chestObj.x! + chestObj.width! * 0.5, chestObj.y! - chestObj.height! * 0.5, 'treasure').setData('id', chestObj.id)
		})

		// Keep the camera inside the dungeon, with only the HUD-height margin above it.
        this.cameras.main.setBounds(0, -72, map.widthInPixels, map.heightInPixels + 72)
        this.cameras.main.setZoom(2)
        this.cameras.main.startFollow(this.faune, true)

		this.lizards = this.physics.add.group({
			classType: Lizard,
			createCallback: (go) => {
				const lizGo = go as Lizard
				lizGo.body.onCollide = true
			}
		})

		const lizardsLayer = map.getObjectLayer('Lizards')
		lizardsLayer.objects.forEach(lizObj => {
			this.lizards.get(lizObj.x! + lizObj.width! * 0.5, lizObj.y! - lizObj.height! * 0.5, 'lizard').setData('id', lizObj.id)
		})

		this.physics.add.collider(this.faune, wallsLayer)
		this.physics.add.collider(this.lizards, wallsLayer)

		this.physics.add.collider(this.faune, chests, this.handlePlayerChestCollision, undefined, this)

		this.physics.add.collider(this.knives, wallsLayer, this.handleKnifeWallCollision, undefined, this)
		this.physics.add.collider(this.knives, this.lizards, this.handleKnifeLizardCollision, undefined, this)

		this.playerLizardsCollider = this.physics.add.collider(this.lizards, this.faune, this.handlePlayerLizardCollision, undefined, this)
        this.add.circle(128, 135, 13, 0x99d8a0, .22).setStrokeStyle(1, 0xb7e5ad).setDepth(-1)
        this.decorateDungeon(wallsLayer, map)
        this.woodland=new WoodlandArt(this,map,ground,wallsLayer)
        this.defeated = new Set()
        if (savedAttempt) this.restoreAttempt(savedAttempt)
        this.woodland.sync(this.faune,this.lizards.getChildren(),this.chests.getChildren(),0)
        queueMicrotask(()=>attachScene(this))
        paintHUD(this.snapshot())

	}

    // Decoration is independent of collisions, rewards and saved game state.
    private decorateDungeon(walls: Phaser.Tilemaps.TilemapLayer, map: Phaser.Tilemaps.Tilemap) {
        if (!this.textures.exists('lantern-glow')) {
            const texture = this.textures.createCanvas('lantern-glow', 96, 96)!
            const context = texture.context
            const light = context.createRadialGradient(48,48,0,48,48,48)
            light.addColorStop(0,'rgba(255,211,128,.38)')
            light.addColorStop(.35,'rgba(245,165,73,.15)')
            light.addColorStop(1,'rgba(255,161,63,0)')
            context.fillStyle=light;context.fillRect(0,0,96,96);texture.refresh()
        }
        for(let i=0;i<24;i++){
            const mote=this.add.rectangle(40+(i*83)%640,80+(i*53)%290,1,1,i%3?0xc5dbc6:0xffd88b,.3).setDepth(4)
            this.tweens.add({targets:mote,y:mote.y-12,alpha:.05,duration:2200+i*75,yoyo:true,repeat:-1})
        }
    }

	private handlePlayerChestCollision(obj1: Phaser.GameObjects.GameObject, obj2: Phaser.GameObjects.GameObject)
	{
		const chest = obj2 as Chest
		this.faune.setChest(chest)
	}

	private handleKnifeWallCollision(obj1: Phaser.GameObjects.GameObject, obj2: Phaser.GameObjects.GameObject)
	{
		(obj1 as Phaser.Physics.Arcade.Image).disableBody(true, true)
	}

	private handleKnifeLizardCollision(obj1: Phaser.GameObjects.GameObject, obj2: Phaser.GameObjects.GameObject)
	{
		(obj1 as Phaser.Physics.Arcade.Image).disableBody(true, true)
		this.defeated.add((obj2 as Lizard).getData('id'))
        obj2.destroy()
	}

	private handlePlayerLizardCollision(obj1: Phaser.GameObjects.GameObject, obj2: Phaser.GameObjects.GameObject)
	{
		const lizard = obj2 as Lizard
		
		const dx = this.faune.x - lizard.x
		const dy = this.faune.y - lizard.y

		const dir = new Phaser.Math.Vector2(dx, dy).normalize().scale(200)

		this.faune.handleDamage(dir)

		sceneEvents.emit('player-health-changed', this.faune.health)

		if (this.faune.health <= 0)
		{
			this.playerLizardsCollider?.destroy()
		}
	}
	
    snapshot() {
        const camera=this.cameras.main
        return {
            ready: !!this.faune, complete:this.complete, failed:this.failed, elapsed:this.elapsed,
            health:this.faune.health, coins:this.faune.coins,
            player:{x:this.faune.x,y:this.faune.y},
            opened:this.chests.getChildren().filter(c=>(c as Chest).opened).map(c=>c.getData('id')),
            defeated:[...this.defeated],
            enemies:this.lizards.getChildren().map(e=>({id:e.getData('id'),x:(e as Lizard).x,y:(e as Lizard).y})),
            chests:this.chests.getChildren().map(c=>({id:c.getData('id'),x:(c as Chest).x,y:(c as Chest).y,opened:(c as Chest).opened})),
            exit:{x:128,y:128}, paused:this.scene.isPaused(),
            attacks:this.faune.shotsFired,
            knives:(this.knives.getChildren() as Phaser.Physics.Arcade.Image[]).filter(k=>k.active).map(k=>({x:k.x,y:k.y,vx:k.body.velocity.x,vy:k.body.velocity.y})),
            movement:{vx:this.faune.body?.velocity.x||0,vy:this.faune.body?.velocity.y||0},
            camera:{width:camera.width,height:camera.height,zoom:camera.zoom,worldX:camera.worldView.x,worldY:camera.worldView.y}
        }
    }

    releaseMovement(){
        this.input.keyboard?.resetKeys()
        if(this.faune?.body)this.faune.setVelocity(0,0)
    }

    dragBy(dx:number,dy:number){
        const rect=this.game.canvas.getBoundingClientRect(),zoom=this.cameras.main.zoom
        controls.targetX=Phaser.Math.Clamp(controls.targetX+dx*this.scale.width/rect.width/zoom,8,this.physics.world.bounds.width-8)
        controls.targetY=Phaser.Math.Clamp(controls.targetY+dy*this.scale.height/rect.height/zoom,12,this.physics.world.bounds.height-12)
    }

    restoreAttempt(s: any) {
        this.faune.setPosition(s.player.x,s.player.y)
        this.faune.restoreVitals(s.health,s.coins)
        this.elapsed = s.elapsed
        this.defeated = new Set(s.defeated)
        for(const c of this.chests.getChildren() as Chest[]) if(s.opened.includes(c.getData('id'))) c.play('chest-open')
        for(const e of [...this.lizards.getChildren()] as Lizard[]) {
            if(this.defeated.has(e.getData('id'))) { e.destroy(); continue }
            const previous = s.enemies.find((v:any)=>v.id===e.getData('id'))
            if(previous) e.setPosition(previous.x,previous.y)
        }
    }

    update(t: number, dt: number) {
        if (!this.faune || this.complete || this.failed) return
        // Choose interaction by reach, so releasing movement beside a chest still opens it.
        const nearby = (this.chests.getChildren() as Chest[]).filter(c => !c.opened && Phaser.Math.Distance.Between(this.faune.x,this.faune.y,c.x,c.y)<35).sort((a,b)=>Phaser.Math.Distance.Between(this.faune.x,this.faune.y,a.x,a.y)-Phaser.Math.Distance.Between(this.faune.x,this.faune.y,b.x,b.y))[0]
        this.faune.setChest(nearby)
        this.faune.update(this.cursors, controls,dt)
        // Continuous firing must recycle knives that leave the map, including long open corridors.
        for(const knife of this.knives.getChildren() as Phaser.Physics.Arcade.Image[]){
            if(knife.active&&(knife.x < -32 || knife.y < -32 || knife.x > this.physics.world.bounds.width+32 || knife.y > this.physics.world.bounds.height+32))knife.disableBody(true,true)
        }
        this.woodland.sync(this.faune,this.lizards.getChildren(),this.chests.getChildren(),t)
        this.elapsed += dt
        const s = this.snapshot()
        if (s.health <= 0) this.failed = true
        else if (s.opened.length === 3 && Phaser.Math.Distance.Between(this.faune.x,this.faune.y,128,128)<20) this.complete = true
        this.saveTimer += dt
        if (this.complete || this.failed) {
            clearControls(); this.faune.setVelocity(0,0); saveAttempt(this.snapshot()); paintHUD(this.snapshot()); this.sys.pause()
        } else {
            paintHUD(s)
            if (this.saveTimer>2000) {saveAttempt(s); this.saveTimer=0}
        }
    }
}
