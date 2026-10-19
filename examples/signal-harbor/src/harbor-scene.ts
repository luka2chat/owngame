import Phaser from 'phaser';
import {State,Signal,rejection,LEVELS,won} from './rules';
import {Layout,TOWER_ART,lampPoint} from './layout';

export const ART=['harbor-background','lighthouse','buoy','signal-a','signal-b','signal-c','button-plaque'] as const;
export type Flight={from:number;fromSlot:number;to:number;toSlot:number;color:Signal};
export class HarborScene extends Phaser.Scene{
  private board!:Phaser.GameObjects.Container;
  private flight:Phaser.GameObjects.Image|null=null;
  private flightHalo:Phaser.GameObjects.Graphics|null=null;
  private loaded=false;
  private geometry:unknown[]=[];
  constructor(private readonly done:(s:HarborScene)=>void,private readonly failed:(message:string)=>void){super('harbor');}
  preload(){
    this.load.on('loaderror',()=>this.failed('灯光素材加载失败，请重新打开'));
    for(const name of ART)this.load.image(name,'./assets/'+name+'.png');
  }
  create(){
    if(!ART.every(name=>this.textures.exists(name)))return;
    const a=TOWER_ART,t=this.textures.get('lighthouse');
    t.add('upper',0,0,0,a.width,a.upperEnd);
    t.add('window',0,0,a.upperEnd,a.width,a.windowEnd-a.upperEnd);
    t.add('base',0,0,a.windowEnd,a.width,a.height-a.windowEnd);
    this.board=this.add.container();this.loaded=true;this.done(this);
  }
  setLayout(l:Layout){this.scale.resize(l.width,l.height);this.cameras.main.setSize(l.width,l.height);}
  private ring(x:number,y:number,r:number,color=0xf4cb80){
    const g=this.add.graphics();
    for(const [width,alpha]of [[12,.08],[7,.18],[3,.85]])g.lineStyle(width,color,alpha).strokeCircle(x,y,r);
    this.board.add(g);
  }
  private symbol(s:Signal,x:number,y:number,r:number,done:boolean){
    const g=this.add.graphics().lineStyle(2.5,done?0xf4cb80:0xfff0d0,1);
    if(s==='A')g.strokeCircle(x,y,r);
    else g.strokePoints(s==='B'?[{x,y:y-r},{x:x+r,y:y+r},{x:x-r,y:y+r}]:[{x,y:y-r},{x:x+r,y},{x,y:y+r},{x:x-r,y}],true);
    this.board.add(g);
  }
  renderState(l:Layout,state:State,selected:number,pending:Flight|null){
    if(!this.loaded)return;
    this.board.removeAll(true);this.geometry=[];
    const tower=l.tower,berth=l.berth;
    for(let i=0;i<3;i++){
      for(const s of tower.segments)this.board.add(this.add.image(tower.x[i],s.y,'lighthouse',s.frame.replace('lighthouse-','')).setDisplaySize(tower.width,s.height));
      this.symbol('ABC'[i] as Signal,tower.x[i],tower.goalY,tower.goalRadius,state.board[i].length===LEVELS[state.level].capacity&&state.board[i].every(s=>s==='ABC'[i]));
    }
    for(const x of berth.x)this.board.add(this.add.image(x,berth.artY,'buoy').setDisplaySize(berth.artWidth,berth.artHeight));
    for(let column=0;column<state.board.length;column++){
      if(selected>=0&&rejection(state.board,selected,column,state.level)===null){
        const p=lampPoint(l,column,state.board[column].length);this.ring(p.x,p.y,p.size/2,0xb1ffec);
      }
      for(let slot=0;slot<state.board[column].length;slot++){
        if(pending?.to===column&&pending.toSlot===slot)continue;
        const p=lampPoint(l,column,slot),s=state.board[column][slot];
        if(selected===column&&slot===state.board[column].length-1)this.ring(p.x,p.y,p.size/2);
        const sprite=this.add.image(p.x,p.y,'signal-'+s.toLowerCase()).setDisplaySize(p.size,p.size);
        this.board.add(sprite);this.geometry.push({column,slot,color:s,x:sprite.x,y:sprite.y,size:sprite.displayWidth});
      }
    }
  }
  animate(l:Layout,f:Flight,complete:()=>void){
    this.stopFlight();
    const a=lampPoint(l,f.from,f.fromSlot),b=lampPoint(l,f.to,f.toSlot);
    const sprite=this.add.image(a.x,a.y,'signal-'+f.color.toLowerCase()).setDisplaySize(a.size,a.size);
    this.flight=sprite;
    this.tweens.add({targets:sprite,y:Math.min(a.y,b.y)-80,duration:100,ease:'Quad.easeOut',onComplete:()=>{
      if(this.flight!==sprite)return;
      this.tweens.add({targets:sprite,x:b.x,y:b.y,scaleX:b.size/sprite.width,scaleY:b.size/sprite.height,duration:140,ease:'Quad.easeInOut',onComplete:()=>{
        this.stopFlight();complete();
      }});
    }});
  }
  stopFlight(){
    if(this.flight){this.tweens.killTweensOf(this.flight);this.flight.destroy();this.flight=null;}
    this.flightHalo?.destroy();this.flightHalo=null;
  }
  snapshot(){return this.geometry;}
}
