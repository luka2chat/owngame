import * as THREE from 'three'
import { t } from '../i18n'
import { Agent } from './agent'
import type { Game } from './game'
import type { Props } from './props'
import { HyjalMatch, MONSTERS, type MonsterKind, type SpawnOrder }  from './rules/hyjal'
import { other, type MatchResult } from './teams'
import type { Point } from '../world/nav'
import { campSites } from './hyjal-sites'
import { POWERS, PowerSchedule, type PowerDrop } from './rules/hyjal-powers'

type Invader = { enraged:boolean; order:SpawnOrder; arrivalLeft:number; special:number; agent: Agent; mesh: THREE.Group; kind: MonsterKind; path: Point[]; cursor: number; attack: number; stuck: number; repath: number }
type Warning = {order:SpawnOrder; pos:Point; left:number; mesh:THREE.Mesh<THREE.RingGeometry,THREE.MeshBasicMaterial>}
type Bomb = {pos:THREE.Vector3; left:number; mesh:THREE.Mesh<THREE.RingGeometry,THREE.MeshBasicMaterial>}
const distance = (a: Point, b: Point) => Math.hypot(a.x-b.x,a.z-b.z)

/** Combat adapters around the deterministic wave rules. Movement uses the same collision and nav as players. */
export function tailRoute(path: Point[], length: number): Point[] {
  for(let i=path.length-1;i>0;i--) {
    const a=path[i-1],b=path[i],d=distance(a,b)
    if(d>=length) {const f=length/d;return [{x:b.x+(a.x-b.x)*f,y:b.y+(a.y-b.y)*f,z:b.z+(a.z-b.z)*f},...path.slice(i)]}
    length-=d
  }
  return path
}

export class HyjalDefense {
  readonly match:HyjalMatch
  readonly gates:Point[]
  readonly burrows:Point[]
  readonly supplySites:Point[]
  readonly supplies:PowerSchedule
  readonly warnings:Warning[]=[]
  readonly bombs:Bomb[]=[]
  private readonly powerMeshes=new Map<number,THREE.Group>()
  private readonly owned:THREE.Object3D[]=[]
  readonly core: THREE.Vector3
  readonly invaders = new Map<number, Invader>()
  readonly approach: Point[]
  readonly entry: Point
  private readonly crystal: THREE.Mesh<THREE.OctahedronGeometry, THREE.MeshStandardMaterial>
  private readonly ring: THREE.Mesh<THREE.RingGeometry, THREE.MeshBasicMaterial>
  private readonly banner: THREE.Group
  constructor(private readonly game: Game, private readonly root: THREE.Group, private readonly creatures: Props, props: Props) {
    this.match=new HyjalMatch(game.opts.difficulty)
    const cfg=game.cfg.defense!
    const n=game.nav.nearest(cfg.core)
    if(n<0) throw new Error('Hyjal core has no walkable ground')
    this.core=new THREE.Vector3().copy(game.nav.point(n))
    const path=game.nav.findPath(cfg.entry,this.core)
    if(!path || path.length<2) throw new Error('Hyjal invasion route is disconnected')
    // Keep the original approach, but stage the waves close enough for an FPS encounter.
    this.approach=tailRoute(path,125);this.entry=this.approach[0]
    const heading=Math.atan2(this.entry.x-this.core.x,this.entry.z-this.core.z)
    this.gates=campSites(game.nav,this.core,3,55,85,heading)
    this.burrows=campSites(game.nav,this.core,3,25,36,heading+Math.PI/3)
    this.supplySites=campSites(game.nav,this.core,4,10,23,heading+Math.PI/4)
    this.supplies=new PowerSchedule(this.match.tuning.power,this.supplySites.length)
    for(const gate of this.gates){const ring=this.marker(gate,3,0xe57c37);ring.material.opacity=.4;this.owned.push(ring)}
    this.crystal=new THREE.Mesh(new THREE.OctahedronGeometry(0.8),new THREE.MeshStandardMaterial({color:0xa9f4ff,emissive:0x178899,emissiveIntensity:.35,metalness:.3,roughness:.25,transparent:true,opacity:.82}))
    this.crystal.scale.set(.75,1.4,.75);this.crystal.position.copy(this.core).add(new THREE.Vector3(0,2.7,0));root.add(this.crystal)
    this.ring=new THREE.Mesh(new THREE.RingGeometry(5.7,6,64),new THREE.MeshBasicMaterial({color:0x6edbeb,side:THREE.DoubleSide,transparent:true,opacity:.65,depthWrite:false}))
    this.ring.rotation.x=-Math.PI/2;this.ring.position.copy(this.core).add(new THREE.Vector3(0,.12,0));root.add(this.ring)
    this.banner=props.create(`banner_${cfg.team}`);this.banner.position.copy(this.core);root.add(this.banner)
  }
  get result(): MatchResult | null {
    if(!this.match.terminal) return null
    const won=this.match.state==='won'
    return {winner:won?this.game.player.team:other(this.game.player.team),reason:{key:won?'hyjal.won':'hyjal.lost'}}
  }
  isMonster(id:number): boolean { return this.invaders.has(id) }
  killed(agent:Agent): void { if(this.isMonster(agent.id))this.match.killed() }
  canRepair(): boolean { return this.match.state==='break' && this.game.player.alive && distance(this.game.player.pos,this.core)<7 }
  goal(agent:Agent): Point {
    if(agent.isPlayer) {
      const drop=this.nearestSupply(agent.pos)
      if(drop)return this.supplySites[drop.slot]
    }
    if(this.match.state==='break')return this.core
    // Each defender covers the nearest active threat instead of camping at the old single gate.
    const threat=[...this.invaders.values()].filter(m=>m.agent.alive).sort((a,b)=>distance(a.agent.pos,this.core)-distance(b.agent.pos,this.core))[0]
    const p=threat?.agent.pos??this.gates[agent.id%this.gates.length]
    const d=Math.max(1,distance(p,this.core)),range=Math.min(17,d*.55)
    const n=this.game.nav.nearest({x:this.core.x+(p.x-this.core.x)/d*range,y:this.core.y,z:this.core.z+(p.z-this.core.z)/d*range})
    return n<0?this.core:this.game.nav.point(n)
  }
  nearestSupply(p:Point):PowerDrop|undefined {
    return [...this.supplies.drops].sort((a,b)=>distance(p,this.supplySites[a.slot])-distance(p,this.supplySites[b.slot]))[0]
  }
  private marker(p:Point,radius:number,color:number) {
    const mesh=new THREE.Mesh(new THREE.RingGeometry(radius-.16,radius,48),new THREE.MeshBasicMaterial({color,side:THREE.DoubleSide,transparent:true,opacity:.9,depthWrite:false}))
    mesh.rotation.x=-Math.PI/2;mesh.position.set(p.x,p.y+.2,p.z);this.root.add(mesh);return mesh
  }
  private removeMarker(mesh:THREE.Mesh<THREE.RingGeometry,THREE.MeshBasicMaterial>):void {
    this.root.remove(mesh);mesh.geometry.dispose();mesh.material.dispose()
  }
  private prepare(order:SpawnOrder):void {
    const site=(order.arrival==='burrow'||order.arrival==='meteor'?this.burrows:this.gates)[order.lane]
    const color=order.arrival==='air'?0xa78aff:order.arrival==='burrow'?0xffc668:0xff6748
    this.warnings.push({order,pos:site,left:this.match.tuning.warning,mesh:this.marker(site,order.kind==='boss'?5:2.6,color)})
  }
  private updateSupplies(dt:number):void {
    for(const drop of this.supplies.update(dt)) {
      const def=POWERS[drop.kind],group=new THREE.Group(),p=this.supplySites[drop.slot]
      const material=new THREE.MeshStandardMaterial({color:def.color,emissive:def.color,emissiveIntensity:.7,metalness:.4,roughness:.25})
      const gem=new THREE.Mesh(new THREE.OctahedronGeometry(.7),material);gem.position.y=1.7;group.add(gem)
      const ring=new THREE.Mesh(new THREE.TorusGeometry(1.1,.05,6,32),material);ring.rotation.x=Math.PI/2;ring.position.y=.2;group.add(ring)
      const beam=new THREE.Mesh(new THREE.CylinderGeometry(.12,.5,6,12,1,true),new THREE.MeshBasicMaterial({color:def.color,transparent:true,opacity:.2,depthWrite:false,side:THREE.DoubleSide}));beam.position.y=3;group.add(beam)
      group.position.set(p.x,p.y,p.z);this.root.add(group);this.powerMeshes.set(drop.id,group)
      this.game.sounds?.buffSpawn(p)
      this.game.banner({key:'hyjal.powerSpawn',params:{name:t(`hyjal.power.${drop.kind}`)}},'#8ce9ff',3)
    }
    const player=this.game.player
    for(const drop of [...this.supplies.drops]) {
      const p=this.supplySites[drop.slot]
      if(distance(player.pos,p)<2.5 && Math.abs(player.pos.y-p.y)<3 && player.alive) {
        const kind=this.supplies.take(drop.id,true)
        if(kind){player.grantPower(kind);this.game.sounds?.buff(player,'speed',p);this.game.banner({key:'hyjal.powerTaken',params:{name:t(`hyjal.power.${kind}`),s:POWERS[kind].seconds}},'#ffe58d',4)}
      }
    }
    for(const [id,mesh] of this.powerMeshes)if(!this.supplies.drops.some(d=>d.id===id)) {this.removePower(mesh);this.powerMeshes.delete(id)}
  }
  private removePower(group:THREE.Group):void {
    this.root.remove(group)
    const mats=new Set<THREE.Material>()
    group.traverse(o=>{if(o instanceof THREE.Mesh){o.geometry.dispose();for(const m of Array.isArray(o.material)?o.material:[o.material])mats.add(m)}})
    mats.forEach(m=>m.dispose())
  }
  private updateBombs(dt:number):void {
    for(let i=this.bombs.length-1;i>=0;i--) {
      const bomb=this.bombs[i];bomb.left-=dt;bomb.mesh.material.opacity=.45+Math.sin(bomb.left*15)*.3
      if(bomb.left>0)continue
      for(const friend of this.game.agents)if(friend.alive&&friend.team===this.game.player.team&&distance(friend.pos,bomb.pos)<4.5&&Math.abs(friend.pos.y-bomb.pos.y)<5)this.game.damage(friend,160*this.match.tuning.damage,null)
      if(distance(this.core,bomb.pos)<5)this.match.hit(90*this.match.tuning.damage)
      this.game.fx.impact(bomb.pos,false);this.removeMarker(bomb.mesh);this.bombs.splice(i,1)
    }
  }
  update(dt:number,repair:boolean): void {
    for(const order of this.match.update(dt))this.prepare(order)
    if(!this.match.terminal) {
      this.updateSupplies(dt);this.updateBombs(dt)
      for(let i=this.warnings.length-1;i>=0;i--) {
        const warning=this.warnings[i];warning.left-=dt
        warning.mesh.material.opacity=.55+Math.sin(warning.left*9)*.35
        if(warning.left<=0){this.spawn(warning.order,warning.pos);this.removeMarker(warning.mesh);this.warnings.splice(i,1)}
      }
    } else {this.supplies.clear();this.game.player.powers.clear()}
    if(repair && this.canRepair()) this.match.repair(dt)
    for(const e of this.match.events.splice(0)) {
      if(e.type==='start')this.game.banner({key:'hyjal.waveStart',params:{n:e.wave,total:this.match.total}},'#ffb171',4)
      if(e.type==='clear') {
        for(const a of this.game.agents)if(a.team===this.game.player.team && a.alive){ a.hp=a.maxHp;a.refill() }
        this.game.banner({key:'hyjal.clear'},'#91edb1',5)
      }
    }
    for(const [id,m] of this.invaders) {
      const a=m.agent
      if(!a.alive) {
        if(this.game.time-a.deathTime>2) {
          this.root.remove(m.mesh);this.game.byCollider.delete(a.collider.handle)
          this.game.agents.splice(this.game.agents.indexOf(a),1);a.dispose();this.invaders.delete(id)
        }
        continue
      }
      if(this.match.terminal)break
      if(m.arrivalLeft>0) {
        m.arrivalLeft=Math.max(0,m.arrivalLeft-dt)
        if(m.arrivalLeft>0)continue
        a.collider.setEnabled(true)
      }
      m.attack-=dt;m.repath-=dt;m.special-=dt
      if(m.kind==='boss'&&a.hp<a.maxHp*.5&&!m.enraged){m.enraged=true;this.game.banner({key:'hyjal.enrage'},'#ff715c',4)}
      if(m.kind==='boss'&&m.special<=0) {
        m.special=a.hp<a.maxHp*.5?7:11
        const point=this.game.player.alive?this.game.player.pos:this.core
        const n=this.game.nav.nearest(point),p=n<0?this.core:this.game.nav.point(n)
        this.bombs.push({pos:new THREE.Vector3(p.x,p.y,p.z),left:2.2,mesh:this.marker(p,4.5,0xff4a28)})
        this.game.banner({key:'hyjal.meteorWarning'},'#ff9576',2)
      }
      if(m.kind==='flyer'){this.updateFlyer(m,dt);continue}
      const def=MONSTERS[m.kind]
      let target:Agent|null=null, near=4.5
      for(const friend of this.game.agents) {
        if(!friend.alive || friend.team===a.team)continue
        const d=distance(friend.pos,a.pos)
        if(d<near && Math.abs(friend.pos.y-a.pos.y)<4 && this.game.sees(a.eye(),friend.eye())){near=d;target=friend}
      }
      const atCore=distance(a.pos,this.core)<6.5 && Math.abs(a.pos.y-this.core.y)<5
      if(atCore || target) {
        a.move(new THREE.Vector3(),false,dt)
        const point=atCore?this.core:target!.pos
        a.yaw=Math.atan2(point.x-a.pos.x,point.z-a.pos.z)
        if(m.attack<=0) {
          m.attack=def.interval*(m.kind==='boss'&&a.hp<a.maxHp*.5?.7:1)
          if(atCore) { this.match.hit(def.damage*this.match.tuning.damage*(m.order.elite?1.35:1));this.game.fx.impact(this.crystal.position,false) }
          else this.game.damage(target!,def.damage*this.match.tuning.damage*(m.order.elite?1.35:1),a)
        }
      } else {
        while(m.cursor<m.path.length-1 && distance(a.pos,m.path[m.cursor])<1.7)m.cursor++
        const point=m.path[m.cursor]??this.core
        const wish=new THREE.Vector3(point.x-a.pos.x,0,point.z-a.pos.z).normalize().multiplyScalar(def.speed*this.match.tuning.speed*(this.match.wave===6?1.3:1))
        a.yaw=Math.atan2(wish.x,wish.z)
        a.move(wish,m.stuck>.6,dt)
        m.stuck=a.moveVel.length()<.4?m.stuck+dt:0
        if(m.stuck>1.5 && m.repath<=0) {
          const path=this.game.nav.findPath(a.pos,this.core)
          if(path){m.path=path;m.cursor=0}m.repath=3
        }
      }
    }
  }
  private updateFlyer(m:Invader,dt:number):void {
    const a=m.agent,def=MONSTERS.flyer
    const atCore=distance(a.pos,this.core)<13
    let target:Agent|undefined
    for(const friend of this.game.agents)if(friend.alive&&friend.team!==a.team&&a.pos.distanceTo(friend.pos)<23&&this.game.sees(a.eye(),friend.eye())){target=friend;break}
    if((atCore&&this.game.sees(a.eye(),this.crystal.position))||target) {
      const point=target?target.eye():this.crystal.position
      a.yaw=Math.atan2(point.x-a.pos.x,point.z-a.pos.z);a.fly(new THREE.Vector3(),dt)
      if(m.attack<=0&&this.game.sees(a.eye(),point)) {
        m.attack=def.interval;this.game.fx.tracer(a.eye(),point,0xb89dff)
        if(target)this.game.damage(target,def.damage*this.match.tuning.damage,a)
        else this.match.hit(def.damage*this.match.tuning.damage)
      }
    } else {
      while(m.cursor<m.path.length-1&&distance(a.pos,m.path[m.cursor])<2)m.cursor++
      const p=m.path[m.cursor]??this.core
      const targetPoint=new THREE.Vector3(p.x,p.y+12,p.z)
      const wish=targetPoint.sub(a.pos).normalize().multiplyScalar(def.speed*this.match.tuning.speed)
      a.yaw=Math.atan2(wish.x,wish.z);a.fly(wish,dt)
      m.stuck=a.moveVel.length()<.4?m.stuck+dt:0
      if(m.stuck>1) a.fly(new THREE.Vector3(0,6,0),dt)
    }
  }
  private spawn(order:SpawnOrder,p:Point):void {
    const {kind}=order,def=MONSTERS[kind]
    const hp=def.hp*this.match.tuning.hp*(order.elite?1.55:1)
    const agent=new Agent(other(this.game.player.team),()=>t(`hyjal.monster.${kind}`)+(order.elite?` · ${t('hyjal.elite')}`:''),false,this.game.level.physics,null,hp)
    const radius={fiend:.6,guard:.5,brute:.8,boss:1.05,flyer:.6}[kind]
    agent.bodyHeight=def.height;agent.collider.setRadius(radius);agent.collider.setHalfHeight(Math.max(.3,def.height/2-radius))
    const mesh=this.creatures.create(kind)
    const box=new THREE.Box3().setFromObject(mesh),size=box.getSize(new THREE.Vector3()),center=box.getCenter(new THREE.Vector3())
    const scale=def.height/size.y
    mesh.scale.setScalar(scale);mesh.position.set(-center.x*scale,-box.min.y*scale,-center.z*scale)
    const pivot=new THREE.Group();pivot.add(mesh)
    const path=this.game.nav.findPath(p,this.core)??this.approach
    agent.teleport({...p,y:p.y+(kind==='flyer'?12:0)});agent.yaw=Math.atan2(this.core.x-p.x,this.core.z-p.z)
    if(order.arrival==='burrow'||order.arrival==='meteor')agent.collider.setEnabled(false)
    this.game.agents.push(agent);this.game.byCollider.set(agent.collider.handle,agent);this.root.add(pivot)
    this.invaders.set(agent.id,{agent,mesh:pivot,kind,path,cursor:0,attack:1,stuck:0,repath:0,order,arrivalLeft:order.arrival==='burrow'?.8:order.arrival==='meteor'?1.2:0,special:8,enraged:false})
  }
  render(alpha:number): void {
    const time=this.game.time
    this.crystal.rotation.y=time*.65
    this.crystal.position.y=this.core.y+2.7+Math.sin(time*1.8)*.2
    this.crystal.material.color.set(this.match.hp/this.match.maxHp<.3?0xff6847:0xa9f4ff)
    for(const [id,mesh] of this.powerMeshes) {
      mesh.rotation.y=time*.8;mesh.children[0].position.y=1.7+Math.sin(time*2.4+id)*.3
    }
    for(const m of this.invaders.values()) {
      m.mesh.position.lerpVectors(m.agent.prevPos,m.agent.pos,alpha)
      m.mesh.rotation.set(0,m.agent.yaw,0)
      if(m.arrivalLeft>0){m.mesh.position.y+=m.order.arrival==='meteor'?25*m.arrivalLeft/1.2:-MONSTERS[m.kind].height*m.arrivalLeft/.8;continue}
      if(m.kind==='flyer'){m.mesh.position.y+=Math.sin(time*4+m.agent.id)*.4;m.mesh.rotation.z=Math.sin(time*3+m.agent.id)*.12}
      if(!m.agent.alive){m.mesh.rotation.z=Math.min(Math.PI/2,(time-m.agent.deathTime)*3);continue}
      if(m.agent.moveVel.length()>.4){m.mesh.position.y+=Math.abs(Math.sin(time*9+m.agent.id))*.1;m.mesh.rotation.z=Math.sin(time*7+m.agent.id)*.035}
      else if(m.attack>MONSTERS[m.kind].interval-.3)m.mesh.rotation.x=-Math.sin((MONSTERS[m.kind].interval-m.attack)*10)*.2
    }
  }
  dispose(): void {
    for(const warning of this.warnings)this.removeMarker(warning.mesh)
    for(const bomb of this.bombs)this.removeMarker(bomb.mesh)
    for(const mesh of this.owned)this.removeMarker(mesh as THREE.Mesh<THREE.RingGeometry,THREE.MeshBasicMaterial>)
    for(const mesh of this.powerMeshes.values())this.removePower(mesh)
    this.warnings.length=0;this.bombs.length=0;this.powerMeshes.clear();this.supplies.clear();this.game.player.powers.clear()
    this.crystal.geometry.dispose();this.crystal.material.dispose();this.ring.geometry.dispose();this.ring.material.dispose()
  }
}
