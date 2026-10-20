import type Game from './scenes/Game'
const key='owngame:faune-dungeon:v1'
export const controls={left:false,right:false,up:false,down:false,dragging:false,targetX:0,targetY:0}
export type MovementControls=typeof controls
let dragPointer:number|null=null,lastPoint:{x:number,y:number}|null=null
const surface=document.getElementById('game')!
function clearDrag(){
 const pointer=dragPointer;dragPointer=null;lastPoint=null;controls.dragging=false
 if(pointer!==null&&surface.hasPointerCapture(pointer))surface.releasePointerCapture(pointer)
}
export function clearControls(){
 controls.left=controls.right=controls.up=controls.down=false
 clearDrag();game?.releaseMovement()
}
let game:Game | undefined, wins=0, best=0, unknownSchema=false
export let savedAttempt:any=null
const el=(id:string)=>document.getElementById(id)!
try {
 const s=JSON.parse(localStorage.getItem(key)||'null')
 if(s){
  if(s.schema!==1){ unknownSchema=true; throw Error('Unknown save version') }
  wins=Number(s.wins)||0; best=Number(s.best)||0
  const a=s.attempt
  if(a && Number.isFinite(a.player?.x) && Number.isFinite(a.player?.y) && a.player.x>=0 && a.player.y>=0 && a.player.x<=1600 && a.player.y<=1600 && a.health>0 && a.health<=3 && Number.isFinite(a.coins) && Number.isFinite(a.elapsed) && Array.isArray(a.opened) && Array.isArray(a.defeated) && Array.isArray(a.enemies)) savedAttempt=a
 }
} catch {el('save-warning').hidden=false}
let lastFinished=false
export function saveAttempt(s:any){
 if(unknownSchema)return
 if(s.complete && !lastFinished){ wins++;best=Math.max(best,s.coins);lastFinished=true }
 if(!s.complete&&!s.failed)lastFinished=false
 const {camera,knives,movement,attacks,...attempt}=s
 savedAttempt=s.complete||s.failed?null:attempt
 try{localStorage.setItem(key,JSON.stringify({schema:1,wins,best,attempt:savedAttempt}));el('save-warning').hidden=true}catch{el('save-warning').hidden=false}
}
export function paintHUD(s:any){
 el('hearts').textContent='♥'.repeat(Math.max(0,s.health))+'♡'.repeat(3-Math.max(0,s.health))
 el('coins').textContent=`金币 ${s.coins}`
 el('objective').textContent=s.opened.length===3?'回到出发点，带着宝藏撤离':'寻找宝箱 '+s.opened.length+' / 3 · 靠近自动打开'
 const target=s.chests.find((c:any)=>!c.opened)||s.exit
 const dx=target.x-s.player.x,dy=target.y-s.player.y
 el('bearing').textContent=`${s.opened.length===3?'出口':'宝箱'} ${Math.abs(dx)>Math.abs(dy)?dx>0?'→':'←':dy>0?'↓':'↑'}`
 if(s.complete||s.failed){
  el('modal').hidden=false;el('title').textContent=s.complete?'宝藏已带回':'探险暂告结束'
  el('description').textContent=s.complete?`带回 ${s.coins} 金币，用时 ${Math.round(s.elapsed/1000)} 秒。已完成 ${wins} 次探险。`:'被蜥蜴击倒了。面向敌人会自动投出飞刀，保持距离再接近宝箱。'
  el('resume').hidden=true;el('new-game').textContent='再探一次';el('new-game').hidden=false;el('pause').hidden=true
 }
}
export function attachScene(scene:Game){
 game=scene;game.sys.pause();clearControls()
 el('modal').hidden=false;el('title').textContent='法恩探险'
 el('description').textContent='拖动移动，沿面朝方向自动投飞刀；靠近宝箱自动打开。找到三只宝箱，再回到出发点撤离。'
 el('resume').textContent=savedAttempt?'继续上次探险':'开始探险';el('resume').hidden=false;el('resume').removeAttribute('disabled')
 el('new-game').hidden=!savedAttempt;el('pause').hidden=false
}
function pause(){
 clearControls();if(!game||game.complete||game.failed)return
 game.sys.pause();saveAttempt(game.snapshot());el('modal').hidden=false;el('title').textContent='探险已暂停'
 el('description').textContent=el('save-warning').hidden?'进度已保存在此设备':'设备暂时无法保存进度'
 el('resume').textContent='继续探险';el('resume').hidden=false;el('new-game').hidden=true
}
function resume(){if(!game||document.hidden||game.complete||game.failed)return;el('modal').hidden=true;clearControls();game.sys.resume()}
el('resume').addEventListener('click',resume)
el('new-game').addEventListener('click',()=>{if(!game)return;savedAttempt=null;lastFinished=false;el('new-game').hidden=true;game.sys.resume();game.scene.restart()})
el('pause').addEventListener('click',pause)
surface.addEventListener('pointerdown',e=>{
 if(!game||game.scene.isPaused()||game.complete||game.failed||dragPointer!==null||!e.isPrimary||e.button!==0)return
 e.preventDefault();surface.setPointerCapture(e.pointerId);dragPointer=e.pointerId
 lastPoint={x:e.clientX,y:e.clientY};controls.dragging=true
 const p=game.snapshot().player;controls.targetX=p.x;controls.targetY=p.y
})
surface.addEventListener('pointermove',e=>{
 if(e.pointerId!==dragPointer||!lastPoint||!game||game.scene.isPaused())return
 e.preventDefault();game.dragBy(e.clientX-lastPoint.x,e.clientY-lastPoint.y)
 lastPoint={x:e.clientX,y:e.clientY}
})
for(const name of ['pointerup','pointercancel','lostpointercapture'])surface.addEventListener(name,(event:Event)=>{if((event as PointerEvent).pointerId===dragPointer)clearDrag()})
const movementCodes:Record<string,keyof Pick<MovementControls,'left'|'right'|'up'|'down'>>={KeyA:'left',KeyD:'right',KeyW:'up',KeyS:'down'}
document.addEventListener('keydown',e=>{
 if(!game||game.complete||game.failed)return
 if(e.code==='Escape'&&!e.repeat){e.preventDefault();game.scene.isPaused()?resume():pause();return}
 if(game.scene.isPaused())return
 const direction=movementCodes[e.code];if(direction){e.preventDefault();controls[direction]=true}
})
document.addEventListener('keyup',e=>{const direction=movementCodes[e.code];if(direction)controls[direction]=false})
window.addEventListener('blur',pause)
document.addEventListener('visibilitychange',()=>{if(document.hidden)pause()})
window.addEventListener('pagehide',()=>{if(game)saveAttempt(game.snapshot())})
el('credits-button').addEventListener('click',()=>{(el('credits') as HTMLDialogElement).showModal()})
el('close-credits').addEventListener('click',()=>{(el('credits') as HTMLDialogElement).close()})
;(window as any).__owngameFaune=Object.freeze({snapshot:()=>game?JSON.parse(JSON.stringify(game.snapshot())):{ready:false}})
