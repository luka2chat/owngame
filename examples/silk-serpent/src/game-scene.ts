import Phaser from 'phaser';
import {State,Cell,stepMs} from './rules';
import {Layout,fitLayout,cellPoint} from './layout';

export class GardenScene extends Phaser.Scene{
 private layout:Layout=fitLayout(720,1280,0);
 private state:State|null=null;private previous:Cell[]=[];private movedAt=0;private pickedAt=-1000;private simple=false;
 private stone!:Phaser.GameObjects.Image;private tiles!:Phaser.GameObjects.Graphics;private ribbon!:Phaser.GameObjects.Graphics;private glow!:Phaser.GameObjects.Graphics;
 private sprites:Phaser.GameObjects.Image[]=[];private loaded=false;
 constructor(private done:(s:GardenScene)=>void,private failed:(m:string)=>void,private tick:(time:number)=>void){super('silk-courtyard');}
 preload(){
  this.load.on('loaderror',()=>this.failed('庭院画面载入失败，请重新打开'));
  for(const [key,file]of Object.entries({courtyard:'courtyard.png',title:'title.png',dragon:'dragon.png',bend:'bend.png'}))this.load.image(key,'./assets/'+file);
 }
 create(){
  if(!['courtyard','title','dragon','bend'].every(k=>this.textures.exists(k)))return;
  const tex=this.textures.get('courtyard'),im=tex.getSourceImage() as HTMLImageElement;
  tex.add('stone',0,Math.round(im.width*.35),Math.round(im.height*.32),Math.round(im.width*.3),Math.round(im.height*.3));
  const dragon=this.textures.get('dragon'),source=dragon.getSourceImage() as HTMLImageElement;
  for(const [name,crop]of Object.entries({head:[24,120,596,440],body:[668,250,566,220],tail:[22,770,600,368],pearl:[752,770,388,372]})){
   const [x,y,w,h]=crop;dragon.add(name,0,Math.round(x*source.width/1280),Math.round(y*source.height/1280),Math.round(w*source.width/1280),Math.round(h*source.height/1280));
  }
  const bend=this.textures.get('bend'),b=bend.getSourceImage() as HTMLImageElement;
  bend.add('elbow',0,Math.round(b.width*430/1280),Math.round(b.height*265/1280),Math.round(b.width*800/1280),Math.round(b.height*800/1280));
  this.stone=this.add.image(0,0,'courtyard','stone');this.tiles=this.add.graphics();this.glow=this.add.graphics();this.ribbon=this.add.graphics();
  this.loaded=true;this.done(this);
 }
 setLayout(layout:Layout){
  this.layout=layout;if(!this.loaded)return;
  this.scale.resize(layout.width,layout.height);this.cameras.main.setSize(layout.width,layout.height);
  const b=layout.board,c=b.cell,g=this.tiles;this.stone.setPosition(b.x+b.w/2,b.y+b.h/2).setDisplaySize(b.w,b.h);g.clear();
  g.lineStyle(28,0x403b30,.36).strokeRect(b.x-4,b.y,b.w+8,b.h+8);
  g.lineStyle(19,0x84734f,1).strokeRect(b.x,b.y,b.w,b.h);
  g.lineStyle(12,0x3f4a43,1).strokeRect(b.x,b.y,b.w,b.h);
  g.lineStyle(4,0xd1b67d,1).strokeRect(b.x,b.y,b.w,b.h);
  const colors=[0xb0b29b,0xb2b39d,0xb3b49e,0xb1b39c,0xb2b49c];
  for(let y=0;y<b.rows;y++)for(let x=0;x<b.columns;x++){
   g.fillStyle(colors[(x*17+y*11)%5],.73).fillRect(b.x+x*c,b.y+y*c,c,c);
   g.lineStyle(.8,0xe4dfb9,.45).lineBetween(b.x+x*c+1,b.y+(y+1)*c-1,b.x+x*c+1,b.y+y*c+1).lineBetween(b.x+x*c+1,b.y+y*c+1,b.x+(x+1)*c-1,b.y+y*c+1);
  }
  g.lineStyle(1.1,0x838971,.8);
  for(let x=0;x<=b.columns;x++)g.lineBetween(b.x+x*c,b.y,b.x+x*c,b.y+b.h);
  for(let y=0;y<=b.rows;y++)g.lineBetween(b.x,b.y+y*c,b.x+b.w,b.y+y*c);
  g.lineStyle(1.8,0xd4af68,1);
  for(const sx of [-1,1])for(const sy of [-1,1]){const x=b.x+b.w/2+sx*(b.w/2+7),y=b.y+b.h/2+sy*(b.h/2+7);g.strokePoints([{x:x-sx*18,y},{x,y},{x,y:y-sy*18},{x:x-sx*12,y:y-sy*18},{x:x-sx*12,y:y-sy*5},{x:x-sx*5,y:y-sy*5},{x:x-sx*5,y:y-sy*12}],false);}
  this.previous=[];this.paint(performance.now());
 }
 setState(state:State,simple:boolean,previous?:State){
  if(previous){this.previous=previous.body;this.movedAt=performance.now();if(state.eaten>previous.eaten)this.pickedAt=this.movedAt;}
  else this.previous=[];
  this.state=state;this.simple=simple;this.paint(performance.now());
 }
 update(){const now=performance.now();this.tick(now);if(this.loaded&&(!this.simple&&(now-this.movedAt<120||now-this.pickedAt<340)))this.paint(now);}
 private paint(now:number){
  if(!this.state||!this.loaded)return;const s=this.state,c=this.layout.board.cell;
  const mix=this.simple?1:Math.min(1,(now-this.movedAt)/Math.min(75,stepMs(s.difficulty)/2));
  const positions=s.body.map((p,i)=>{const end=cellPoint(this.layout,p),old=this.previous[Math.min(i,this.previous.length-1)];if(!old||mix>=1)return end;const start=cellPoint(this.layout,old);return{x:start.x+(end.x-start.x)*mix,y:start.y+(end.y-start.y)*mix};});
  const glow=this.glow.clear(),g=this.ribbon.clear();let index=0;
  const put=(texture:string,frame:string,x:number,y:number,angle:number,w:number,h:number)=>{let sp=this.sprites[index++];if(!sp){sp=this.add.image(x,y,texture,frame);this.sprites.push(sp);}sp.setVisible(true).setTexture(texture,frame).setPosition(x,y).setAngle(angle).setDisplaySize(w,h);};
  for(const f of s.food){const p=cellPoint(this.layout,f);for(let i=3;i>=1;i--)glow.fillStyle(0xffe7a2,i===1?.25:i===2?.12:.055).fillCircle(p.x,p.y,c*(.24+i*.09));put('dragon','pearl',p.x,p.y,0,c*.82,c*.82);}
  const pts=positions.slice().reverse(),path:{x:number;y:number}[]=[];
  if(pts.length){let last=pts[0];path.push(last);for(let i=1;i<pts.length-1;i++){const control=pts[i],next=pts[i+1],end={x:(control.x+next.x)/2,y:(control.y+next.y)/2};for(let k=1;k<=8;k++){const t=k/8,a=1-t;path.push({x:a*a*last.x+2*a*t*control.x+t*t*end.x,y:a*a*last.y+2*a*t*control.y+t*t*end.y});}last=end;}path.push(pts[pts.length-1]);}
  for(const [width,color,dy]of [[.67,0x6b4c30,2],[.65,0xe5b962,0],[.55,0x8f211c,0],[.45,0xce3b25,0],[.13,0xed8b49,-c*.12]]){
   const pp=path.map(p=>({x:p.x,y:p.y+dy}));g.lineStyle(c*width,color,1).strokePoints(pp,false);if(pp.length)g.fillStyle(color,1).fillCircle(pp[0].x,pp[0].y,c*width/2);
  }
  for(let i=s.body.length-1;i>=0;i--){const p=s.body[i],next=s.body[Math.max(0,i-1)],last=s.body[i+1],v=positions[i],angle=i===0?-s.direction*90:Math.atan2(p.y-next.y,next.x-p.x)*180/Math.PI;
   if(i===0)put('dragon','head',v.x,v.y,angle,c*1.2,c*.96);
   else if(i===s.body.length-1)put('dragon','tail',v.x,v.y,angle,c*1.08,c*.66);
   else if(last&&(next.x===last.x||next.y===last.y))put('dragon','body',v.x,v.y,angle,c*1.08,c*.58);
   else if(last){const left=next.x<p.x||last.x<p.x,up=next.y>p.y||last.y>p.y;put('bend','elbow',v.x,v.y,left?(up?0:-90):(up?90:180),c*1.04,c*1.04);}
  }
  for(let i=index;i<this.sprites.length;i++)this.sprites[i].setVisible(false);
  const head=positions[0];if(!head)return;const a=-s.direction*Math.PI/2,ux=Math.cos(a),uy=Math.sin(a),vx=-uy,vy=ux,x=head.x+ux*c*.65,y=head.y+uy*c*.65;
  g.lineStyle(1.8,s.status==='crashed'?0xa3261c:0x795825,.9).strokePoints([{x:x-ux*4+vx*3,y:y-uy*4+vy*3},{x,y},{x:x-ux*4-vx*3,y:y-uy*4-vy*3}],false);
  if(!this.simple&&now-this.pickedAt<320){const t=(now-this.pickedAt)/320;glow.lineStyle(2,0xfff2b5,(1-t)*.75).strokeCircle(head.x,head.y,c*(.4+t*.4));}
  if(s.status==='crashed')glow.lineStyle(2.5,0xa3261c,1).strokeCircle(head.x,head.y,c*.58);
 }
}
