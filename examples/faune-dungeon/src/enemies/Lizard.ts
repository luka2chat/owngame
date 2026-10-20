import Phaser from 'phaser'
import type {EnemyKind,Point} from '../levels'

export default class Lizard extends Phaser.Physics.Arcade.Sprite {
  private direction=1
  private moveEvent:Phaser.Time.TimerEvent
  private target?:Phaser.Physics.Arcade.Sprite
  private clock=0
  private cycle=-1
  private aim:Point={x:0,y:0}
  private volley=false
  private awake=false
  kind:EnemyKind='patrol'
  health=1
  maxHealth=1
  warning=false
  charging=false

  constructor(scene:Phaser.Scene,x:number,y:number,texture:string,frame?:string|number){
    super(scene,x,y,texture,frame)
    this.anims.play('lizard-idle')
    scene.physics.world.on(Phaser.Physics.Arcade.Events.TILE_COLLIDE,this.turn,this)
    this.moveEvent=scene.time.addEvent({delay:2000,callback:()=>this.direction=(this.direction+Phaser.Math.Between(1,3))%4,loop:true})
  }
  configure(kind:EnemyKind,target:Phaser.Physics.Arcade.Sprite){
    this.kind=kind;this.target=target
    this.health=this.maxHealth=kind==='warden'?10:kind==='guardian'?2:1
    if(kind==='warden'){
      this.setImmovable(true);this.body.setSize(24,24)
      this.body.setBoundsRectangle(new Phaser.Geom.Rectangle(this.x-144,this.y-160,256,320))
    }
    return this
  }
  takeHit(){this.health--;return this.health<=0}
  consumeVolley(){const pending=this.volley;this.volley=false;return pending}
  get aimPoint(){return this.aim}
  get enraged(){return this.health<=this.maxHealth/2}
  private turn(go:Phaser.GameObjects.GameObject){if(go===this)this.direction=(this.direction+Phaser.Math.Between(1,3))%4}
  destroy(fromScene?:boolean){
    if(!this.scene)return
    this.moveEvent.destroy();this.scene.physics.world.off(Phaser.Physics.Arcade.Events.TILE_COLLIDE,this.turn,this)
    super.destroy(fromScene)
  }
  preUpdate(t:number,dt:number){
    super.preUpdate(t,dt)
    if(!this.target?.active||this.scene.physics.world.isPaused)return
    if(this.kind==='warden'){
      if(!this.awake){
        this.setVelocity(0,0)
        if(Math.hypot(this.target.x-this.x,this.target.y-this.y)>=190)return
        this.awake=true
      }
      this.clock+=dt
      const duration=this.enraged?2400:3000,cycle=Math.floor(this.clock/duration),phase=this.clock%duration
      if(cycle!==this.cycle){this.cycle=cycle;this.aim={x:this.target.x,y:this.target.y};this.volley=false}
      this.warning=phase>=400&&phase<1300
      this.charging=phase>=1300&&phase<1600
      if(phase>=1300&&phase-dt<1300)this.volley=true
      const dx=this.aim.x-this.x,dy=this.aim.y-this.y,d=Math.hypot(dx,dy)||1
      this.setVelocity(this.charging?dx/d*150:0,this.charging?dy/d*150:0)
      return
    }
    const dx=this.target.x-this.x,dy=this.target.y-this.y
    if(this.kind==='hunter'&&Math.hypot(dx,dy)<155){
      const preferX=Math.abs(dx)>Math.abs(dy),body=this.body as Phaser.Physics.Arcade.Body
      const xBlocked=dx<0?body.blocked.left:body.blocked.right,yBlocked=dy<0?body.blocked.up:body.blocked.down
      this.direction=preferX&&!xBlocked?(dx>0?1:3):!yBlocked?(dy>0?2:0):(dx>0?1:3)
    }
    const speed=this.kind==='hunter'?55:this.kind==='guardian'?38:50
    this.setVelocity(this.direction===1?speed:this.direction===3?-speed:0,this.direction===2?speed:this.direction===0?-speed:0)
  }
}
