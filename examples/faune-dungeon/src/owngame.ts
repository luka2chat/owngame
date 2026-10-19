import type Game from './scenes/Game'
const key='owngame:faune-dungeon:v1'
export const controls={left:false,right:false,up:false,down:false,action:false}
export function clearControls(){ for(const k in controls) controls[k as keyof typeof controls]=false }
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
 savedAttempt=s.complete||s.failed?null:s
 try{localStorage.setItem(key,JSON.stringify({schema:1,wins,best,attempt:savedAttempt}));el('save-warning').hidden=true}catch{el('save-warning').hidden=false}
}
export function paintHUD(s:any){
 el('hearts').textContent='♥'.repeat(Math.max(0,s.health))+'♡'.repeat(3-Math.max(0,s.health))
 el('coins').textContent=`金币 ${s.coins}`
 el('objective').textContent=s.opened.length===3?'回到出发点，带着宝藏撤离':'寻找宝箱 '+s.opened.length+' / 3 · 靠近后按行动'
 const target=s.chests.find((c:any)=>!c.opened)||s.exit
 const dx=target.x-s.player.x,dy=target.y-s.player.y
 el('bearing').textContent=`${s.opened.length===3?'出口':'宝箱'} ${Math.abs(dx)>Math.abs(dy)?dx>0?'→':'←':dy>0?'↓':'↑'}`
 if(s.complete||s.failed){
  el('modal').hidden=false;el('title').textContent=s.complete?'宝藏已带回':'探险暂告结束'
  el('description').textContent=s.complete?`带回 ${s.coins} 金币，用时 ${Math.round(s.elapsed/1000)} 秒。已完成 ${wins} 次探险。`:'被蜥蜴击倒了。先面向敌人，再按行动投出飞刀；保持距离。'
  el('resume').hidden=true;el('new-game').textContent='再探一次';el('new-game').hidden=false;el('pause').hidden=true
 }
}
export function attachScene(scene:Game){
 game=scene;game.scene.pause();clearControls()
 el('modal').hidden=false;el('title').textContent='法恩探险'
 el('description').textContent='收集地牢中的三只宝箱，再回到出发点撤离。方向按钮移动；行动可投飞刀或打开身边的宝箱。'
 el('resume').textContent=savedAttempt?'继续上次探险':'开始探险';el('resume').hidden=false;el('resume').removeAttribute('disabled')
 el('new-game').hidden=!savedAttempt;el('pause').hidden=false
}
function pause(){
 clearControls();if(!game||game.complete||game.failed)return
 game.scene.pause();saveAttempt(game.snapshot());el('modal').hidden=false;el('title').textContent='探险已暂停'
 el('description').textContent=el('save-warning').hidden?'进度已保存在此设备':'设备暂时无法保存进度'
 el('resume').textContent='继续探险';el('resume').hidden=false;el('new-game').hidden=true
}
el('resume').addEventListener('click',()=>{if(!game)return;el('modal').hidden=true;clearControls();game.scene.resume()})
el('new-game').addEventListener('click',()=>{if(!game)return;savedAttempt=null;lastFinished=false;el('new-game').hidden=true;game.scene.resume();game.scene.restart()})
el('pause').addEventListener('click',pause)
for(const id of ['left','right','up','down','action'] as const){
 const button=el(id)
 button.addEventListener('pointerdown',e=>{e.preventDefault();if(!game||game.scene.isPaused())return;button.setPointerCapture(e.pointerId);controls[id]=true})
 for(const event of ['pointerup','pointercancel','lostpointercapture'])button.addEventListener(event,()=>{if(id!=='action')controls[id]=false})
}
window.addEventListener('blur',pause)
document.addEventListener('visibilitychange',()=>{if(document.hidden)pause()})
window.addEventListener('pagehide',()=>{if(game)saveAttempt(game.snapshot())})
el('credits-button').addEventListener('click',()=>{(el('credits') as HTMLDialogElement).showModal()})
el('close-credits').addEventListener('click',()=>{(el('credits') as HTMLDialogElement).close()})
;(window as any).__owngameFaune=Object.freeze({snapshot:()=>game?JSON.parse(JSON.stringify(game.snapshot())):{ready:false}})
