import Phaser from 'phaser';
import type {Layout} from './layout';
export const ART=['chime-stream','chime-sun','chime-moon','chime-leaf'];
export const NAMES=['溪','晴','月','叶'];
const INKS=['#205e67','#92521f','#68517f','#466244'];
export class GardenScene extends Phaser.Scene{
 private views:Phaser.GameObjects.Container[]=[];private effects!:Phaser.GameObjects.Graphics;private cords!:Phaser.GameObjects.Graphics;
 private layout:Layout|null=null;private loaded=false;
 constructor(private done:(scene:GardenScene)=>void,private failed:()=>void,private frameTick:(now:number)=>void){super('ceramic-garden');}
 preload(){this.load.on('loaderror',this.failed);for(const name of ART)this.load.image(name,'./assets/'+name+'.png');}
 create(){if(!ART.every(name=>this.textures.exists(name)))return;this.cords=this.add.graphics();this.effects=this.add.graphics();this.loaded=true;
 const context=this.game.canvas.getContext('2d');if(context)context.imageSmoothingQuality='high';this.done(this);}
 setLayout(layout:Layout){this.layout=layout;if(!this.loaded)return;this.scale.resize(720,layout.height);this.cameras.main.setSize(720,layout.height);
 this.views.forEach(v=>v.destroy());this.views=[];this.cords.clear();
 for(let i=layout.bells.length-1;i>=0;i--){const p=layout.bells[i],top=p.y-p.h/2+p.h*.035;
  this.cords.lineStyle(2.5,0x79552f,.85).lineBetween(p.x+(i>1?(i===2?-28:28):0),layout.headerTop+153,p.x,top);
  this.cords.lineStyle(.8,0xe0c294,.9).lineBetween(p.x+1,layout.headerTop+153,p.x+1,top);
 }
 layout.bells.forEach((p,i)=>{const pivot=this.add.container(p.x,p.y-p.h*.465),im=this.add.image(0,p.h*.465,ART[i]).setDisplaySize(p.w,p.h);pivot.add(im);
  for(const[text,factor,size]of[[NAMES[i],.745,36],[String(i+1),.824,23]] as const){const label=this.add.text(0,p.h*(factor-.035),text,{fontFamily:'"Songti SC",STSong,serif',fontSize:size*p.h/380,color:INKS[i]}).setOrigin(.5);pivot.add(label);}
  this.views.push(pivot);
 });}
 renderFrame(now:number,lit:boolean[],struckAt:number[],simple:boolean){if(!this.layout||!this.loaded)return;this.effects.clear();
 this.views.forEach((v,i)=>{const p=this.layout!.bells[i],elapsed=(now-struckAt[i])/1000;v.rotation=simple||elapsed>1.6?0:Math.sin(elapsed*18)*Math.exp(-elapsed*2.5)*.06;
  if(!lit[i])return;const y=p.y-p.h*.13,r=p.w*.42;
  for(let j=0;j<4;j++)this.effects.fillStyle(0xffe5a9,.035).fillEllipse(p.x,y,p.w*(1.15-j*.04),p.h*.54);
  for(const side of[-1,1])for(const offset of[15,31]){const pts=[];for(let n=0;n<=16;n++){const t=n/16;pts.push(new Phaser.Math.Vector2(p.x+side*(r+offset+Math.sin(t*Math.PI)*12),y-28+56*t));}this.effects.lineStyle(4,0xffe7a0,.95).strokePoints(pts,false,false);}
 });}
 update(){this.frameTick(performance.now());}
}
