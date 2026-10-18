import Phaser from 'phaser';
declare const __SOURCE_SHA__:string;
const width=720,height=1280;
const viewport=document.getElementById('viewport')!,frame=document.getElementById('frame')!;
function resize(){
  const bounds=viewport.getBoundingClientRect(),scale=Math.min(bounds.width/width,bounds.height/height);
  frame.style.left=(bounds.width-width*scale)/2+'px';
  frame.style.top=(bounds.height-height*scale)/2+'px';
  frame.style.transform=`scale(${scale})`;
}
resize();window.addEventListener('resize',resize);window.visualViewport?.addEventListener('resize',resize);
let ready=false;
class GameScene extends Phaser.Scene {
  create(){
    ready=true;
    document.getElementById('status')!.textContent='项目已就绪，请实现玩法';
    // Keep rules and save validation in independent TypeScript modules.
    // Add accessible DOM controls over the scene; verify their final CSS size in the player.
  }
}
new Phaser.Game({
  type:Phaser.AUTO,parent:'scene',width,height,backgroundColor:'#172033',banner:false,
  scale:{mode:Phaser.Scale.NONE},audio:{noAudio:true},
  render:{antialias:true},input:{mouse:false,touch:false,keyboard:false},scene:GameScene,
});
Object.defineProperty(window,'__owngameGame',{value:Object.freeze({snapshot:()=>({ready,engine:'phaser',source_sha256:__SOURCE_SHA__})})});
