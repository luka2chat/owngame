import Phaser from 'phaser';
import type {State} from './rules';
import {fitLayout,Layout} from './layout';

export class BoardScene extends Phaser.Scene {
  private pieces!:Phaser.GameObjects.Container;
  private effects!:Phaser.GameObjects.Container;
  private previewSprite!:Phaser.GameObjects.Image;
  private previewFrame!:Phaser.GameObjects.Graphics;
  private board!:Phaser.GameObjects.Image;
  private layout:Layout=fitLayout(720,1280);
  private loaded=false;
  constructor(private readonly done:(scene:BoardScene)=>void,private readonly failed:(message:string)=>void){super('observatory');}
  preload(){
    this.load.on('loaderror',(file:Phaser.Loader.File)=>this.failed('画面载入失败，请重新打开'));
    this.load.image('observatory','./assets/observatory.png');
    this.load.image('board','./assets/board.png');
    this.load.image('pieces','./assets/pieces.png');
  }
  create(){
    if(!['observatory','board','pieces'].every(key=>this.textures.exists(key)))return;
    const sheet=this.textures.get('pieces');
    sheet.add('star',0,0,0,887,887);sheet.add('moon',0,887,0,887,887);
    // A single viewport-fixed CSS backdrop also covers the native safe area.
    this.board=this.add.image(360,632,'board');
    this.effects=this.add.container();
    this.pieces=this.add.container();
    this.previewSprite=this.add.image(0,0,'pieces','star').setDisplaySize(168,168).setAlpha(.22).setVisible(false);
    this.previewFrame=this.add.graphics();
    this.loaded=true;this.done(this);
  }
  setLayout(layout:Layout){
    this.layout=layout;if(!this.loaded)return;
    this.scale.resize(layout.width,layout.height);
    this.cameras.main.setSize(layout.width,layout.height);
    this.board.setPosition(layout.boardCenter.x,layout.boardCenter.y).setDisplaySize(640*layout.boardScale,640*layout.boardScale);
    this.previewSprite.setDisplaySize(168*layout.boardScale,168*layout.boardScale);
  }
  renderState(state:State,animate:boolean,simple:boolean){
    if(!this.loaded)return;
    this.tweens.killTweensOf([...this.pieces.list,...this.effects.list]);
    this.pieces.removeAll(true);this.effects.removeAll(true);this.preview(-1,1);
    if(state.line.length){
      const g=this.add.graphics();this.effects.add(g);
      const a=this.layout.cells[state.line[0]],b=this.layout.cells[state.line[2]],s=this.layout.boardScale;
      for(const [width,alpha]of [[25,.045],[16,.10],[9,.25],[4,.80],[2,1]]){
        g.lineStyle(width*s,0xffe5ad,alpha).lineBetween(a.x,a.y,b.x,b.y);
      }
      for(const i of state.line){const p=this.layout.cells[i];
        for(const [width,alpha]of [[14,.03],[8,.08],[2,.75]])g.lineStyle(width*s,0xffebbf,alpha).strokeCircle(p.x,p.y,77*s);
        for(let k=0;k<10;k++){
          const angle=k*Math.PI/5,x=p.x+Math.cos(angle)*77*s,y=p.y+Math.sin(angle)*77*s,r=(k%2?3:5)*s;
          g.fillStyle(0xffedc3,.95).fillPoints([{x,y:y-r},{x:x+r*.25,y:y-r*.25},{x:x+r,y},{x:x+r*.25,y:y+r*.25},{x,y:y+r},{x:x-r*.25,y:y+r*.25},{x:x-r,y},{x:x-r*.25,y:y-r*.25}],true);
        }
      }
      if(!simple)this.tweens.add({targets:g,alpha:{from:.72,to:1},duration:1000,yoyo:true,repeat:-1});
    }
    state.board.forEach((v,i)=>{
      if(!v)return;const p=this.layout.cells[i],s=this.layout.boardScale;
      if(state.last===i&&!state.winner){
        const outline=this.add.graphics().lineStyle(2*s,0xfff7dc,.9).strokeRoundedRect(p.x-83*s,p.y-80*s,166*s,160*s,25*s);
        this.effects.add(outline);
      }
      const token=this.add.image(p.x,p.y,'pieces',v===1?'star':'moon').setDisplaySize(174*s,174*s);
      this.pieces.add(token);
      if(animate&&!simple&&i===state.last){
        const scale=token.scaleX;token.setScale(scale*.76);
        this.tweens.add({targets:token,scaleX:scale,scaleY:scale,duration:160,ease:'Quad.easeOut'});
      }
    });
  }
  preview(at:number,turn:number){
    if(!this.loaded)return;
    this.previewFrame.clear();this.previewSprite.setVisible(at>=0);
    if(at<0)return;
    const p=this.layout.cells[at],s=this.layout.boardScale;this.previewSprite.setPosition(p.x,p.y).setFrame(turn===1?'star':'moon');
    this.previewFrame.lineStyle(2*s,0xffffff,.75).strokeRoundedRect(p.x-83*s,p.y-80*s,166*s,160*s,25*s);
  }
}
