import Phaser from 'phaser'
import {controls,attachScene,savedAttempt,paintHUD,saveAttempt,clearControls,activeLevelIndex} from '../owngame'
import {WoodlandArt} from './WoodlandArt'
import {levels,makeLevelMap} from '../levels'
import {createLizardAnims} from '../anims/EnemyAnims'
import {createCharacterAnims} from '../anims/CharacterAnims'
import {createChestAnims} from '../anims/TreasureAnims'
import Lizard from '../enemies/Lizard'
import Faune from '../characters/Faune'
import '../characters/Faune'
import Chest from '../items/Chest'

export default class Game extends Phaser.Scene {
  private woodland!:WoodlandArt
  private cursors!:Phaser.Types.Input.Keyboard.CursorKeys
  private faune!:Faune
  private knives!:Phaser.Physics.Arcade.Group
  private bolts!:Phaser.Physics.Arcade.Group
  private lizards!:Phaser.Physics.Arcade.Group
  private chests!:Phaser.Physics.Arcade.StaticGroup
  private cues!:Phaser.GameObjects.Graphics
  private elapsed=0
  private saveTimer=0
  private miniTimer=0
  private awaitingStart=true
  private collected=new Set<number>()
  private defeated=new Set<number>()
  private miniFloor!:HTMLCanvasElement
  private miniBounds={x:0,y:0,w:1,h:1}
  complete=false
  failed=false
  levelIndex=0
  get level(){return levels[this.levelIndex]}
  constructor(){super('game')}
  preload(){this.cursors=this.input.keyboard.createCursorKeys()}
  create(){
    this.awaitingStart=true;this.physics.world.pause()
    this.complete=this.failed=false;this.elapsed=this.saveTimer=this.miniTimer=0
    this.defeated=new Set();this.collected=new Set();this.levelIndex=activeLevelIndex();clearControls()
    createCharacterAnims(this.anims);createLizardAnims(this.anims);createChestAnims(this.anims)
    const template=this.cache.tilemap.get('dungeon').data,key='chapter-'+this.level.id
    this.cache.tilemap.add(key,{format:Phaser.Tilemaps.Formats.TILED_JSON,data:makeLevelMap(this.level,template)})
    const map=this.make.tilemap({key}),tileset=map.addTilesetImage('dungeon','tiles',16,16,1,2)
    const ground=map.createLayer('Ground',tileset),walls=map.createLayer('Walls',tileset)
    walls.setCollisionByProperty({collides:true})
    this.knives=this.physics.add.group({classType:Phaser.Physics.Arcade.Image,maxSize:3})
    this.bolts=this.physics.add.group({classType:Phaser.Physics.Arcade.Image,maxSize:40})
    this.faune=this.add.faune(this.level.spawn.x,this.level.spawn.y,'faune');this.faune.setKnives(this.knives)
    this.physics.world.setBounds(0,0,map.widthInPixels,map.heightInPixels);this.faune.setCollideWorldBounds(true)
    this.chests=this.physics.add.staticGroup({classType:Chest})
    for(const obj of map.getObjectLayer('Chests').objects)this.chests.get(obj.x!+obj.width!*.5,obj.y!-obj.height!*.5,'treasure').setData('id',obj.id)
    this.lizards=this.physics.add.group({classType:Lizard,createCallback:go=>{(go as Lizard).body.onCollide=true}})
    map.getObjectLayer('Lizards').objects.forEach((obj,i)=>{
      const enemy=this.lizards.get(obj.x!+obj.width!*.5,obj.y!-obj.height!*.5,'lizard') as Lizard
      enemy.setData('id',obj.id).setCollideWorldBounds(true);enemy.configure(this.level.enemies?.[i]?.kind||'patrol',this.faune)
    })
    this.physics.add.collider(this.faune,walls);this.physics.add.collider(this.faune,this.chests)
    this.physics.add.collider(this.lizards,walls)
    this.physics.add.collider(this.knives,walls,k=>(k as Phaser.Physics.Arcade.Image).disableBody(true,true))
    this.physics.add.collider(this.knives,this.lizards,this.hitEnemy,undefined,this)
    this.physics.add.collider(this.lizards,this.faune,this.touchEnemy,undefined,this)
    this.physics.add.collider(this.bolts,walls,b=>(b as Phaser.Physics.Arcade.Image).disableBody(true,true))
    this.physics.add.overlap(this.bolts,this.faune,(a,b)=>{
      const bolt=(a===this.faune?b:a) as Phaser.Physics.Arcade.Image
      if(!bolt.active)return
      const dx=this.faune.x-bolt.x,dy=this.faune.y-bolt.y;bolt.disableBody(true,true)
      this.faune.handleDamage(new Phaser.Math.Vector2(dx,dy).normalize().scale(110))
    })
    const camera=this.cameras.main
    camera.setBounds(0,-72,map.widthInPixels,map.heightInPixels+72);camera.setZoom(2)
    camera.startFollow(this.faune,false,.15,.15);camera.setDeadzone(36,48)
    this.createEffects()
    this.woodland=new WoodlandArt(this,map,ground,walls,this.level)
    this.cues=this.add.graphics().setDepth(2200)
    this.makeMiniMap(map)
    if(savedAttempt)this.restoreAttempt(savedAttempt)
    camera.centerOn(this.faune.x,this.faune.y)
    this.woodland.sync(this.faune,this.lizards.getChildren(),this.chests.getChildren(),0)
    this.drawCues();this.renderMiniMap();queueMicrotask(()=>attachScene(this));paintHUD(this.snapshot())
  }
  private createEffects(){
    if(!this.textures.exists('lantern-glow')){
      const texture=this.textures.createCanvas('lantern-glow',96,96)!,c=texture.context
      const light=c.createRadialGradient(48,48,0,48,48,48);light.addColorStop(0,'rgba(255,211,128,.38)');light.addColorStop(.35,'rgba(245,165,73,.15)');light.addColorStop(1,'rgba(255,161,63,0)')
      c.fillStyle=light;c.fillRect(0,0,96,96);texture.refresh()
    }
    if(!this.textures.exists('warden-bolt')){
      const t=this.textures.createCanvas('warden-bolt',20,20)!,c=t.context,g=c.createRadialGradient(10,10,0,10,10,10)
      g.addColorStop(0,'#fff4bc');g.addColorStop(.35,'#9fe4a7');g.addColorStop(1,'#68c78700');c.fillStyle=g;c.fillRect(0,0,20,20);t.refresh()
    }
  }
  private hitEnemy(a:any,b:any){
    const enemy=(a instanceof Lizard?a:b) as Lizard,knife=(a===enemy?b:a) as Phaser.Physics.Arcade.Image
    if(!knife.active||!enemy.active)return
    knife.disableBody(true,true)
    if(enemy.takeHit()){this.defeated.add(enemy.getData('id'));enemy.destroy()}
  }
  private touchEnemy(a:any,b:any){
    const enemy=(a instanceof Lizard?a:b) as Lizard
    if(this.faune.health<=0)return
    this.faune.handleDamage(new Phaser.Math.Vector2(this.faune.x-enemy.x,this.faune.y-enemy.y).normalize().scale(150))
  }
  private trapPhase(index:number){const phase=(this.elapsed+index*730)%4200;return phase<2100?'safe':phase<3300?'warning':'active'}
  private exitUnlocked(){return this.chests.getChildren().every(c=>(c as Chest).opened)&&this.collected.size===this.level.runes.length&&!this.lizards.getChildren().some(e=>(e as Lizard).kind==='warden')}
  private drawCues(){
    const g=this.cues;g.clear()
    const open=this.exitUnlocked(),exit=this.level.exit
    g.lineStyle(2,open?0xbdf2b1:0xb69e75,open?.9:.45);g.strokeCircle(exit.x,exit.y,25+Math.sin(this.elapsed*.003)*1.5)
    if(open){g.fillStyle(0xbdf2b1,.1);g.fillCircle(exit.x,exit.y,24)}
    for(const [i,r] of this.level.runes.entries())if(!this.collected.has(i)){
      const y=r.y+Math.sin(this.elapsed*.003+i)*2
      g.lineStyle(2,0xcbb4ff,.9);g.fillStyle(0x9b8ac8,.35);g.fillPoints([{x:r.x,y:y-9},{x:r.x+7,y},{x:r.x,y:y+9},{x:r.x-7,y}],true);g.strokePoints([{x:r.x,y:y-9},{x:r.x+7,y},{x:r.x,y:y+9},{x:r.x-7,y}],true)
      g.lineStyle(1,0xe7d4ff,.35);g.strokeCircle(r.x,r.y,15)
    }
    for(const [i,p] of this.level.traps.entries()){
      const phase=this.trapPhase(i),color=phase==='active'?0xf18b65:phase==='warning'?0xf4cf77:0x709481
      g.lineStyle(phase==='safe'?1:2,color,phase==='safe'?.35:.9);g.strokeCircle(p.x,p.y,17)
      if(phase!=='safe'){g.fillStyle(color,phase==='active'?.48:.14);g.fillCircle(p.x,p.y,16)}
    }
    for(const enemy of this.lizards.getChildren() as Lizard[]){
      if(enemy.maxHealth>1&&enemy.kind!=='warden')for(let i=0;i<enemy.maxHealth;i++){g.fillStyle(i<enemy.health?0xf2d18b:0x534b3d,1);g.fillRect(enemy.x-7+i*8,enemy.y-27,5,3)}
      if(enemy.warning){g.lineStyle(3,enemy.enraged?0xf4ad87:0xf2da91,.65);g.lineBetween(enemy.x,enemy.y,enemy.aimPoint.x,enemy.aimPoint.y);g.strokeCircle(enemy.x,enemy.y,29)}
    }
  }
  private fireVolley(enemy:Lizard){
    const angle=Math.atan2(enemy.aimPoint.y-enemy.y,enemy.aimPoint.x-enemy.x)
    for(const offset of enemy.enraged?[-.5,-.25,0,.25,.5]:[-.3,0,.3]){
      const bolt=this.bolts.get(enemy.x,enemy.y,'warden-bolt') as Phaser.Physics.Arcade.Image
      if(!bolt)break
      bolt.enableBody(true,enemy.x,enemy.y,true,true).setDisplaySize(18,18);bolt.body.setCircle(5,5,5);bolt.setDepth(2100)
      bolt.setVelocity(Math.cos(angle+offset)*85,Math.sin(angle+offset)*85)
    }
  }
  snapshot(){
    const camera=this.cameras.main,open=this.exitUnlocked()
    return{ready:!!this.faune,levelId:this.level.id,levelIndex:this.levelIndex,levelTitle:this.level.title,totalLevels:levels.length,
      complete:this.complete,failed:this.failed,elapsed:this.elapsed,health:this.faune.health,coins:this.faune.coins,
      player:{x:this.faune.x,y:this.faune.y},opened:this.chests.getChildren().filter(c=>(c as Chest).opened).map(c=>c.getData('id')),
      defeated:[...this.defeated],runes:[...this.collected],
      enemies:(this.lizards.getChildren() as Lizard[]).map(e=>({id:e.getData('id'),x:e.x,y:e.y,health:e.health,maxHealth:e.maxHealth,kind:e.kind,warning:e.warning,charging:e.charging})),
      chests:this.chests.getChildren().map(c=>({id:c.getData('id'),x:(c as Chest).x,y:(c as Chest).y,opened:(c as Chest).opened})),
      seals:this.level.runes.map((p,i)=>({...p,id:i,collected:this.collected.has(i)})),
      hazards:this.level.traps.map((p,i)=>({...p,phase:this.trapPhase(i)})),exit:{...this.level.exit,open},paused:this.scene.isPaused(),
      attacks:this.faune.shotsFired,knives:(this.knives.getChildren() as Phaser.Physics.Arcade.Image[]).filter(k=>k.active).map(k=>({x:k.x,y:k.y,vx:k.body.velocity.x,vy:k.body.velocity.y})),
      bolts:(this.bolts.getChildren() as Phaser.Physics.Arcade.Image[]).filter(k=>k.active).map(k=>({x:k.x,y:k.y})),
      movement:{vx:this.faune.body?.velocity.x||0,vy:this.faune.body?.velocity.y||0},
      camera:{width:camera.width,height:camera.height,zoom:camera.zoom,worldX:camera.worldView.x,worldY:camera.worldView.y}}
  }
  releaseMovement(){this.input.keyboard?.resetKeys();if(this.faune?.body)this.faune.setVelocity(0,0);this.cameras.main?.setLerp(0,0)}
  pausePlay(){this.physics.world.pause();this.sys.pause()}
  resumePlay(){this.awaitingStart=false;this.physics.world.resume();this.sys.resume()}
  dragBy(dx:number,dy:number){
    const rect=this.game.canvas.getBoundingClientRect(),zoom=this.cameras.main.zoom
    controls.targetX=Phaser.Math.Clamp(controls.targetX+dx*this.scale.width/rect.width/zoom,8,this.physics.world.bounds.width-8)
    controls.targetY=Phaser.Math.Clamp(controls.targetY+dy*this.scale.height/rect.height/zoom,13,this.physics.world.bounds.height-13)
  }
  restoreAttempt(s:any){
    this.faune.setPosition(s.player.x,s.player.y);this.faune.restoreVitals(s.health,s.coins);this.elapsed=s.elapsed
    this.defeated=new Set(s.defeated);this.collected=new Set((s.runes||[]).filter((i:number)=>i>=0&&i<this.level.runes.length))
    for(const c of this.chests.getChildren() as Chest[])if(s.opened.includes(c.getData('id')))c.play('chest-open')
    for(const e of [...this.lizards.getChildren()] as Lizard[]){
      if(this.defeated.has(e.getData('id'))){e.destroy();continue}
      const old=s.enemies.find((v:any)=>v.id===e.getData('id'));if(old){e.setPosition(old.x,old.y);e.health=Phaser.Math.Clamp(old.health??e.maxHealth,1,e.maxHealth)}
    }
  }
  private makeMiniMap(map:Phaser.Tilemaps.Tilemap){
    const tiles=map.getLayer('Ground').data.flat().filter(t=>t.index>=0)
    const x=Math.min(...tiles.map(t=>t.x)),y=Math.min(...tiles.map(t=>t.y)),w=Math.max(...tiles.map(t=>t.x))-x+1,h=Math.max(...tiles.map(t=>t.y))-y+1
    this.miniBounds={x,y,w,h};this.miniFloor=document.createElement('canvas');this.miniFloor.width=w;this.miniFloor.height=h
    const c=this.miniFloor.getContext('2d')!;c.fillStyle='#8d9b6d';for(const t of tiles)c.fillRect(t.x-x,t.y-y,1,1)
  }
  private renderMiniMap(){
    const canvas=document.getElementById('mini-map') as HTMLCanvasElement;if(!canvas)return
    const c=canvas.getContext('2d')!,{x,y,w,h}=this.miniBounds,scale=Math.min((canvas.width-20)/w,(canvas.height-20)/h),ox=(canvas.width-w*scale)/2,oy=(canvas.height-h*scale)/2
    c.clearRect(0,0,canvas.width,canvas.height);c.imageSmoothingEnabled=false;c.globalAlpha=.6;c.drawImage(this.miniFloor,ox,oy,w*scale,h*scale);c.globalAlpha=1
    const mark=(p:{x:number,y:number},color:string,size:number)=>{c.fillStyle=color;c.fillRect(ox+(p.x/16-x)*scale-size/2,oy+(p.y/16-y)*scale-size/2,size,size)}
    for(const chest of this.chests.getChildren() as Chest[])mark(chest,chest.opened?'#607865':'#ffe0a3',5)
    this.level.runes.forEach((p,i)=>{if(!this.collected.has(i))mark(p,'#d6bbff',5)})
    mark(this.level.exit,this.exitUnlocked()?'#9df2bf':'#bf9875',7);mark(this.faune,'#fffdf2',6)
  }
  update(t:number,dt:number){
    if(!this.faune||this.awaitingStart||this.complete||this.failed)return
    // Damping depends on time, rather than the display refresh rate. Painted art is not pixel-rounded.
    const lerp=1-Math.exp(-dt/85);this.cameras.main.setLerp(lerp,lerp)
    const nearby=(this.chests.getChildren() as Chest[]).filter(c=>!c.opened&&Phaser.Math.Distance.BetweenPoints(this.faune,c)<35).sort((a,b)=>Phaser.Math.Distance.BetweenPoints(this.faune,a)-Phaser.Math.Distance.BetweenPoints(this.faune,b))[0]
    this.faune.setChest(nearby);this.faune.update(this.cursors,controls,dt);this.elapsed+=dt
    this.level.runes.forEach((p,i)=>{if(Phaser.Math.Distance.BetweenPoints(this.faune,p)<20)this.collected.add(i)})
    this.level.traps.forEach((p,i)=>{if(this.trapPhase(i)==='active'&&Phaser.Math.Distance.BetweenPoints(this.faune,p)<17)this.faune.handleDamage(new Phaser.Math.Vector2(this.faune.x-p.x,this.faune.y-p.y).normalize().scale(85))})
    for(const enemy of this.lizards.getChildren() as Lizard[])if(enemy.kind==='warden'&&enemy.consumeVolley())this.fireVolley(enemy)
    for(const group of [this.knives,this.bolts])for(const k of group.getChildren() as Phaser.Physics.Arcade.Image[])if(k.active&&(k.x<-32||k.y<-32||k.x>this.physics.world.bounds.width+32||k.y>this.physics.world.bounds.height+32))k.disableBody(true,true)
    this.woodland.sync(this.faune,this.lizards.getChildren(),this.chests.getChildren(),t);this.drawCues()
    this.miniTimer+=dt;if(this.miniTimer>100){this.renderMiniMap();this.miniTimer=0}
    if(this.faune.health<=0)this.failed=true
    else if(this.exitUnlocked()&&Phaser.Math.Distance.BetweenPoints(this.faune,this.level.exit)<20)this.complete=true
    this.saveTimer+=dt
    if(this.complete||this.failed){clearControls();saveAttempt(this.snapshot());paintHUD(this.snapshot());this.pausePlay()}
    else{paintHUD(this.snapshot());if(this.saveTimer>2000){saveAttempt(this.snapshot());this.saveTimer=0}}
  }
}
