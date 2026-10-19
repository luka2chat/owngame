import Phaser from 'phaser';
import {State,won,legal} from './rules';
import {Layout,fitLayout,cell} from './layout';
export class BoardScene extends Phaser.Scene{
  private layout:Layout=fitLayout(720,1280);
  private tray!:Phaser.GameObjects.Image;
  private pieces!:Phaser.GameObjects.Container;
  private effects!:Phaser.GameObjects.Container;
  private loaded=false;
  constructor(private done:(s:BoardScene)=>void,private failed:()=>void){super('postcard');}
  preload(){this.load.on('loaderror',()=>this.failed());for(const name of ['watercolor-town','wood-tray','paper-panel'])this.load.image(name,'./assets/'+name+'.png');}
  create(){
    if(!['watercolor-town','wood-tray','paper-panel'].every(k=>this.textures.exists(k)))return;
    const image=this.textures.get('watercolor-town'),source=image.getSourceImage();
    for(const n of [3,4,5])for(let i=0;i<n*n;i++){
      const x=Math.round(i%n*source.width/n),y=Math.round(Math.floor(i/n)*source.height/n);
      image.add(n+'-'+(i+1),0,x,y,Math.round((i%n+1)*source.width/n)-x,Math.round((Math.floor(i/n)+1)*source.height/n)-y);
    }
    const p=this.textures.get('paper-panel'),img=p.getSourceImage();
    p.add('tag',0,Math.round(img.width*.025),Math.round(img.height*.16),Math.round(img.width*.95),Math.round(img.height*.68));
    this.tray=this.add.image(360,640,'wood-tray');this.effects=this.add.container();this.pieces=this.add.container();
    this.loaded=true;this.done(this);
  }
  setLayout(layout:Layout){
    this.layout=layout;if(!this.loaded)return;
    this.scale.resize(layout.width,layout.height);this.cameras.main.setSize(layout.width,layout.height);
    const p=layout.tray;this.tray.setPosition(p.x+p.size/2,p.y+p.size/2).setDisplaySize(p.size,p.size);
  }
  renderState(s:State,simple:boolean,previous?:number[]){
    if(!this.loaded)return;this.tweens.killAll();this.pieces.removeAll(true);this.effects.removeAll(true);
    const complete=won(s.board),board=this.layout.board,n=s.n;
    if(complete){this.pieces.add(this.add.image(board.x+board.size/2,board.y+board.size/2,'watercolor-town','__BASE').setDisplaySize(board.size,board.size));return;}
    const candidates=legal(s.board,n),z=s.board.indexOf(0);
    const emphasized=candidates.find(i=>Math.floor(i/n)===Math.floor(z/n)&&Math.abs(i-z)===1)??candidates[0];
    s.board.forEach((v,i)=>{
      const p=cell(this.layout,n,i),x=p.x+p.size/2,y=p.y+p.size/2;
      if(!v){
        const g=this.add.graphics().lineStyle(2,0xb7a07b,.8);
        const r=Math.min(18,p.size*.12);
        g.strokePoints([{x,y:y-r},{x:x+r*.35,y:y-r*.25},{x:x+r,y},{x:x+r*.35,y:y+r*.25},{x,y:y+r},{x:x-r*.35,y:y+r*.25},{x:x-r,y},{x:x-r*.35,y:y-r*.25}],true);this.effects.add(g);return;
      }
      const group=this.add.container(x,y),size=p.size-4;this.pieces.add(group);
      const shade=this.add.rectangle(0,2,size+1,size+1,0x745534,.9);
      const art=this.add.image(0,0,'watercolor-town',n+'-'+v).setDisplaySize(size,size);group.add([shade,art]);
      if(i===emphasized){const outline=this.add.graphics().lineStyle(3,0xeac071,.95).strokeRoundedRect(-size/2,-size/2,size,size,3);group.add(outline);}
      const tagx=-p.size/2+22,tagy=p.size/2-23;
      group.add(this.add.image(tagx,tagy,'paper-panel','tag').setDisplaySize(38,40));
      group.add(this.add.text(tagx,tagy,String(v),{fontFamily:'PostcardHand',fontSize:'28px',color:'#312c22'}).setOrigin(.5));
      if(candidates.includes(i)){
        const direction=Math.floor(i/n)===Math.floor(z/n)?(i<z?'right':'left'):(i<z?'down':'up');
        const ax=p.size/2-18,ay=p.size/2-20;
        const points=direction==='right'?[{x:ax-5,y:ay-8},{x:ax+6,y:ay},{x:ax-5,y:ay+8}]:direction==='left'?[{x:ax+5,y:ay-8},{x:ax-6,y:ay},{x:ax+5,y:ay+8}]:direction==='down'?[{x:ax-8,y:ay-5},{x:ax,y:ay+6},{x:ax+8,y:ay-5}]:[{x:ax-8,y:ay+5},{x:ax,y:ay-6},{x:ax+8,y:ay+5}];
        group.add(this.add.graphics().fillStyle(0xffedb3,.96).fillCircle(ax,ay,12).fillStyle(0x86581f).lineStyle(1,0x86581f).fillPoints(points,true).strokePoints(points,true));
      }
      if(previous&&!simple){const old=cell(this.layout,n,previous.indexOf(v));if(old.x!==p.x||old.y!==p.y){group.setPosition(old.x+p.size/2,old.y+p.size/2);this.tweens.add({targets:group,x,y,duration:160,ease:'Quad.easeOut'});}}
    });
  }
}
