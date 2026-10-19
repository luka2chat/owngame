import Phaser from 'phaser';
import {shift,State,Dir} from './rules';
import {Layout} from './layout';
import {TILE_FRAMES,PANELS,LABELS,ink} from './art';

export class PotteryScene extends Phaser.Scene {
  private layout!:Layout;
  private background!:Phaser.GameObjects.Image;
  private backdrop!:Phaser.Textures.CanvasTexture;
  private controls!:Phaser.GameObjects.Image;
  private controlTexture!:Phaser.Textures.CanvasTexture;
  private atlasSource!:HTMLImageElement;
  private pieces!:Phaser.GameObjects.Container;
  private effects!:Phaser.GameObjects.Container;
  private loaded=false;
  private source!:HTMLImageElement;
  constructor(private readonly done:(scene:PotteryScene)=>void,private readonly failed:(message:string)=>void){super('pottery');}
  preload(){
    this.load.on('loaderror',()=>this.failed('窑房画面载入失败，请重新打开'));
    this.load.image('workshop','./assets/painted-workshop.png');
    this.load.image('atlas','./assets/painted-atlas.png');
  }
  create(){
    if(!['workshop','atlas'].every(k=>this.textures.exists(k)))return;
    const atlas=this.textures.get('atlas');
    for(const f of TILE_FRAMES)atlas.add(f.name,0,f.x,f.y,f.w,f.h);
    for(const [name,[x,y,w,h]]of Object.entries(PANELS))atlas.add(name,0,x,y,w,h);
    this.source=this.textures.get('workshop').getSourceImage() as HTMLImageElement;
    this.backdrop=this.textures.createCanvas('composed-workshop',1,1)!;
    this.background=this.add.image(0,0,'composed-workshop').setOrigin(0);
    this.controlTexture=this.textures.createCanvas('control-paint',1,1)!;
    this.controls=this.add.image(0,0,'control-paint').setOrigin(0);
    this.atlasSource=this.textures.get('atlas').getSourceImage() as HTMLImageElement;
    this.effects=this.add.container();this.pieces=this.add.container();
    this.loaded=true;this.done(this);
  }
  setLayout(layout:Layout){
    this.layout=layout;if(!this.loaded)return;
    this.scale.resize(layout.width,layout.height);this.cameras.main.setSize(layout.width,layout.height);
    const dpr=Math.min(2,window.devicePixelRatio||1);
    this.backdrop.setSize(Math.ceil(layout.width*dpr),Math.ceil(layout.height*dpr));
    const c=this.backdrop.getContext();c.setTransform(dpr,0,0,dpr,0,0);
    c.clearRect(0,0,layout.width,layout.height);
    // One continuous cover transform over the ENTIRE viewport. This original B
    // region is only kiln/wall/pottery, with no baked title, score paper or tray.
    // No safe-area/header/desk bands, tiled patches or second room crop.
    const room={x:790,y:0,w:234,h:380};
    const cover=Math.max(layout.width/room.w,layout.height/room.h);
    c.drawImage(this.source,room.x,room.y,room.w,room.h,
      (layout.width-room.w*cover)/2,(layout.height-room.h*cover)/2,room.w*cover,room.h*cover);
    const {header,board}=layout;
    // Retain the original painted objects as foreground cut-outs, without the
    // surrounding room/desk rectangles that caused the horizontal seams.
    this.foreground(c,header.x,header.y,header.w/1024,header.w/1024,[
      [175,60],[183,46],[240,38],[390,35],[537,36],[595,40],[610,50],
      [620,75],[631,115],[639,163],[637,197],[623,209],[568,216],
      [490,218],[397,214],[300,214],[212,209],[178,198],[173,151],[173,99],
    ]);
    const scale=board.w/920;
    this.foreground(c,board.x-50*scale,board.y-382*scale,scale,scale,[
      [130,389],[166,384],[280,390],[349,386],[454,390],[514,386],
      [623,389],[699,385],[806,390],[872,386],[901,396],[916,416],
      [923,490],[922,600],[929,690],[930,810],[936,910],[938,1047],
      [935,1135],[923,1169],[904,1182],[806,1187],[704,1185],[599,1188],
      [488,1187],[381,1186],[280,1185],[166,1185],[115,1178],[94,1165],
      [84,1137],[88,1044],[89,954],[93,863],[95,764],[99,670],
      [100,577],[100,500],[103,433],[112,409],
    ]);
    this.backdrop.refresh();this.background.setDisplaySize(layout.width,layout.height);
    this.panels(false);
  }
  private foreground(c:CanvasRenderingContext2D,x:number,y:number,sx:number,sy:number,outline:number[][]){
    c.save();c.translate(x,y);c.scale(sx,sy);c.beginPath();
    outline.forEach(([px,py],i)=>{if(i)c.lineTo(px,py);else c.moveTo(px,py);});
    c.closePath();c.clip();c.drawImage(this.source,0,0);c.restore();
  }
  private panel(context:CanvasRenderingContext2D,name:keyof typeof PANELS,r:{x:number;y:number;w:number;h:number}){
    // Source borders are 38px; destination borders are independent CSS sizes.
    // This preserves the torn paper / painted leaf edges at 44px target heights.
    const [sx,sy,sw,sh]=PANELS[name],b=38,edge=Math.min(11,r.h*.23);
    const sourceX=[sx,sx+b,sx+sw-b],sourceY=[sy,sy+b,sy+sh-b],sourceW=[b,sw-b*2,b],sourceH=[b,sh-b*2,b];
    const destX=[r.x,r.x+edge,r.x+r.w-edge],destY=[r.y,r.y+edge,r.y+r.h-edge],destW=[edge,r.w-edge*2,edge],destH=[edge,r.h-edge*2,edge];
    for(let y=0;y<3;y++)for(let x=0;x<3;x++)context.drawImage(this.atlasSource,sourceX[x],sourceY[y],sourceW[x],sourceH[y],destX[x],destY[y],destW[x],destH[y]);
  }
  panels(undoDisabled:boolean){
    if(!this.loaded)return;
    const l=this.layout,dpr=Math.min(2,window.devicePixelRatio||1);
    this.controlTexture.setSize(Math.ceil(l.width*dpr),Math.ceil(l.height*dpr));
    const c=this.controlTexture.getContext();c.setTransform(dpr,0,0,dpr,0,0);c.clearRect(0,0,l.width,l.height);
    for(const [frame,r]of [[undoDisabled?'disabled':'secondary',l.undo],['primary',l.fresh],['secondary',l.help],['paper',l.simple],['paper',l.turns],['paper',l.current],['paper',l.best],['paper',l.status]] as const)this.panel(c,frame,r);
    this.controlTexture.refresh();this.controls.setDisplaySize(l.width,l.height);
  }
  private tile(value:number,index:number){
    const l=this.layout,p=l.cells[index],s=l.tileSize/300,e=Math.log2(value);
    const n=this.add.container(p.x,p.y),im=this.add.image(0,0,'atlas','tile-'+value).setDisplaySize(l.tileSize,l.tileSize);
    // Leave the painted leaf at lower right clear; live labels sit slightly left of centre.
    const fontSize=(value>=1024?76:value>=128?94:127)*s;
    const digits=this.add.text(-3*s,-23*s,String(value),{fontFamily:'Georgia, serif',fontStyle:'bold',fontSize:fontSize+'px',color:ink(e)}).setOrigin(.5);
    const label=this.add.text(-4*s,65*s,LABELS[e-1]||'',{fontFamily:'serif',fontSize:44*s+'px',fontStyle:'bold',color:ink(e)}).setOrigin(.5);
    n.add([im,digits,label]);this.pieces.add(n);return n;
  }
  renderState(state:State){
    if(!this.loaded)return;
    this.tweens.killAll();this.pieces.removeAll(true);this.effects.removeAll(true);
    state.board.forEach((v,i)=>{if(v)this.tile(v,i);});
    this.panels(!state.undos||!state.previous);
  }
  animateMove(old:State,next:State,dir:Dir,simple:boolean){
    if(simple){this.renderState(next);return;}
    this.tweens.killAll();this.pieces.removeAll(true);this.effects.removeAll(true);
    const l=this.layout;
    for(let k=0;k<4;k++){
      const ids=Array.from({length:4},(_,j)=>dir==='left'?k*4+j:dir==='right'?k*4+3-j:dir==='up'?j*4+k:(3-j)*4+k);
      const filled=ids.filter(i=>old.board[i]);let at=0;
      for(let j=0;j<filled.length;j++){
        const token=this.tile(old.board[filled[j]],filled[j]),p=l.cells[ids[at]];
        this.tweens.add({targets:token,x:p.x,y:p.y,duration:160,ease:'Quad.easeOut'});
        if(j+1<filled.length&&old.board[filled[j]]===old.board[filled[j+1]]){
          j++;const token2=this.tile(old.board[filled[j]],filled[j]);
          this.tweens.add({targets:token2,x:p.x,y:p.y,duration:160,ease:'Quad.easeOut'});
        }
        at++;
      }
    }
    this.time.delayedCall(165,()=>{
      this.renderState(next);
      const moved=shift(old.board,dir);
      for(const i of moved.merged){
        const token=this.pieces.list.find(n=>Math.abs((n as Phaser.GameObjects.Container).x-l.cells[i].x)<.01&&Math.abs((n as Phaser.GameObjects.Container).y-l.cells[i].y)<.01) as Phaser.GameObjects.Container|undefined;
        if(token){token.setScale(.92);this.tweens.add({targets:token,scaleX:1.04,scaleY:1.04,duration:90,yoyo:true,onComplete:()=>token.setScale(1)});}
        const p=l.cells[i],r=l.tileSize*.42,g=this.add.graphics();this.effects.add(g);g.lineStyle(2,0xffe3a0,.95);
        for(let k=0;k<6;k++){const a=k*Math.PI/3;g.lineBetween(p.x+Math.cos(a)*r,p.y+Math.sin(a)*r,p.x+Math.cos(a)*(r+4),p.y+Math.sin(a)*(r+4));}
        this.tweens.add({targets:g,alpha:0,duration:280,onComplete:()=>g.destroy()});
      }
      const spawnAt=next.board.findIndex((v,i)=>v&&!moved.board[i]);
      if(spawnAt>=0){const token=this.pieces.list.find(n=>(n as Phaser.GameObjects.Container).x===l.cells[spawnAt].x&&(n as Phaser.GameObjects.Container).y===l.cells[spawnAt].y) as Phaser.GameObjects.Container|undefined;
        if(token){token.setScale(.72);this.tweens.add({targets:token,scaleX:1,scaleY:1,duration:150,ease:'Back.easeOut'});}}
    });
  }
  cancelAnimation(){this.time.removeAllEvents();this.tweens.killAll();}
}
