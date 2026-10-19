import Phaser from 'phaser';
import {State} from './rules';
import {Layout} from './layout';
const bounds=[
 [102,157,271,335],[398,153,568,335],[702,170,861,337],[991,152,1156,337],
 [101,431,278,622],[408,436,576,622],[689,451,873,619],[981,435,1165,621],
 [99,704,273,888],[427,718,563,877],[692,712,855,885],[1001,705,1153,887],
 [104,965,287,1141],[405,988,579,1133],[693,978,853,1131],[971,1009,1174,1125],
];
export class CardScene extends Phaser.Scene{
 private cards!:Phaser.GameObjects.Container;
 private layout!:Layout;
 constructor(private done:(scene:CardScene)=>void,private failed:()=>void){super('herbarium');}
 preload(){
  this.load.on('loaderror',this.failed);
  this.load.image('back','./assets/card-back.png');this.load.image('paper','./assets/paper.png');
  this.load.image('specimens','./assets/specimens.png');
 }
 create(){
  if(!['back','paper','specimens'].every(t=>this.textures.exists(t)))return;
  bounds.forEach(([x,y,r,b],i)=>this.textures.get('specimens').add(String(i),0,x-6,y-6,r-x+12,b-y+12));
  this.cards=this.add.container();this.done(this);
 }
 setLayout(layout:Layout){this.layout=layout;this.scale.resize(layout.width,layout.height);this.cameras.main.setSize(layout.width,layout.height);}
 render(state:State,simple:boolean,animated=-1){
  if(!this.cards||!this.layout)return;
  this.tweens.killAll();this.cards.removeAll(true);
  state.deck.forEach((motif,i)=>{
   const p=this.layout.cells[i],owned=state.owners[i]>=0,face=state.open.includes(i)||owned;
   const card=this.add.container(p.x,p.y);this.cards.add(card);
   if(face){
    const g=this.add.graphics();card.add(g);
    if(!owned){
     const pair=state.open.length===2&&state.deck[state.open[0]]===state.deck[state.open[1]];
     const ink=pair?0xeacb72:0xf3ad69;
     g.lineStyle(5,ink,.17).strokeRoundedRect(-p.size/2+2,-p.size/2+2,p.size-4,p.size-4,3);
     g.lineStyle(2,ink,.95).strokeRoundedRect(-p.size/2+2,-p.size/2+2,p.size-4,p.size-4,3);
    }
    // Simple image scaling preserves the entire paper face at every card size.
    card.add(this.add.image(0,0,'paper').setDisplaySize(p.size,p.size));
    const texture=this.textures.get('specimens').get(String(motif));
    const z=Math.min((p.size-14)/texture.width,(p.size-22)/texture.height);
    card.add(this.add.image(0,-5,'specimens',String(motif)).setDisplaySize(texture.width*z,texture.height*z));
    if(owned)card.setAlpha(.48);
   }else{
    card.add(this.add.image(0,2,'back').setDisplaySize(p.size*1.095,p.size*1.095));
   }
   if(animated===i&&!simple){card.setScale(.12,1);this.tweens.add({targets:card,scaleX:1,duration:160,ease:'Quad.easeOut'});}
  });
 }
}
