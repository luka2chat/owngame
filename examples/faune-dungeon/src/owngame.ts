import type Game from './scenes/Game'
import {levels} from './levels'
import {loadProgress,recordCompletion,saveKey,legacyKey} from './progress'
export const controls={left:false,right:false,up:false,down:false,dragging:false,targetX:0,targetY:0}
export type MovementControls=typeof controls
const el=(id:string)=>document.getElementById(id)!
let loaded:ReturnType<typeof loadProgress>
try{loaded=loadProgress(localStorage.getItem(saveKey),localStorage.getItem(legacyKey))}catch{loaded=loadProgress(null,null);loaded.warning=true}
const progress=loaded.progress
if(loaded.warning)el('save-warning').hidden=false
export const activeLevelIndex=()=>Math.max(0,levels.findIndex(l=>l.id===progress.selectedLevel))
export let savedAttempt:any=progress.attempts[progress.selectedLevel]||null
let game:Game|undefined,lastFinished=false,dragPointer:number|null=null,lastPoint:{x:number,y:number}|null=null
const surface=el('game')
function clearDrag(){const pointer=dragPointer;dragPointer=null;lastPoint=null;controls.dragging=false;if(pointer!==null&&surface.hasPointerCapture(pointer))surface.releasePointerCapture(pointer)}
export function clearControls(){controls.left=controls.right=controls.up=controls.down=false;clearDrag();game?.releaseMovement()}
function persist(){
 if(loaded.readOnly)return
 try{localStorage.setItem(saveKey,JSON.stringify(progress));el('save-warning').hidden=true}catch{el('save-warning').hidden=false}
}
export function saveAttempt(s:any){
 if(s.complete){if(!lastFinished){recordCompletion(progress,s);lastFinished=true}}
 else if(s.failed){delete progress.attempts[s.levelId]}
 else{
  lastFinished=false
  progress.attempts[s.levelId]={levelId:s.levelId,elapsed:s.elapsed,health:s.health,coins:s.coins,player:s.player,opened:s.opened,defeated:s.defeated,runes:s.runes,enemies:s.enemies.map((e:any)=>({id:e.id,x:e.x,y:e.y,health:e.health}))}
 }
 savedAttempt=progress.attempts[s.levelId]||null;persist()
}
function renderChapters(){
 const container=el('chapter-map');container.replaceChildren()
 levels.forEach((level,index)=>{
  const button=document.createElement('button'),result=progress.completed[level.id],checkpoint=progress.attempts[level.id]
  button.dataset.level=level.id;button.disabled=index>progress.unlocked
  button.className='chapter-card'+(game?.levelIndex===index?' selected':'')
  const title=document.createElement('strong');title.textContent=`${String(index+1).padStart(2,'0')} · ${level.title}`
  const status=document.createElement('span');status.textContent=button.disabled?'完成上一关解锁':result?'★'.repeat(result.stars)+'☆'.repeat(3-result.stars)+(checkpoint?' · 继续':' · 重玩'):checkpoint?'继续本关':'进入本关'
  button.append(title,status);button.addEventListener('click',()=>startLevel(index));container.append(button)
 })
}
export function paintHUD(s:any){
 el('hearts').textContent='♥'.repeat(Math.max(0,s.health))+'♡'.repeat(3-Math.max(0,s.health))
 el('coins').textContent=`金币 ${s.coins}`;el('chapter').textContent=`${s.levelIndex+1} / ${levels.length} · ${s.levelTitle}`
 const boss=s.enemies.find((e:any)=>e.kind==='warden'),sealed=s.seals.some((p:any)=>!p.collected),treasure=s.opened.length===s.chests.length
 el('objective').textContent=s.exit.open?'传送门已开启 · 前往出口':`宝箱 ${s.opened.length}/${s.chests.length}`+(s.seals.length?` · 符印 ${s.runes.length}/${s.seals.length}`:'')+(boss?' · 击败守卫':'')
 const target=!treasure?s.chests.find((c:any)=>!c.opened):sealed?s.seals.find((p:any)=>!p.collected):boss||s.exit
 const dx=target.x-s.player.x,dy=target.y-s.player.y
 el('bearing').textContent=`${!treasure?'宝箱':sealed?'符印':boss?'守卫':'出口'} ${Math.abs(dx)>Math.abs(dy)?dx>0?'→':'←':dy>0?'↓':'↑'}`
 el('boss-health').hidden=!boss
 if(boss){el('boss-name').textContent=boss.health<=boss.maxHealth/2?'林心守卫 · 狂怒':'林心守卫';(el('boss-meter') as HTMLProgressElement).max=boss.maxHealth;(el('boss-meter') as HTMLProgressElement).value=boss.health}
 if(s.complete||s.failed){
  el('modal').hidden=false;el('title').textContent=s.complete?(s.levelIndex===levels.length-1?'林心重新苏醒':s.levelTitle+' · 完成'):'探险暂告结束'
  const stars=progress.completed[s.levelId]?.stars||1
  el('description').textContent=s.complete?`${'★'.repeat(stars)}${'☆'.repeat(3-stars)} · 带回 ${s.coins} 金币，用时 ${Math.round(s.elapsed/1000)} 秒。${s.levelIndex===levels.length-1?'五段遗迹已走完，可在关卡手记中挑战满星。':'下一段遗迹已经解锁；出发时恢复三颗心。'}`:'被遗迹的守卫或机关击倒了。本关可以重新挑战，其他关卡的进度会保留。'
  el('resume').hidden=true;el('new-game').hidden=false;el('new-game').textContent='重试本关';el('pause').hidden=true
  el('next-level').hidden=!s.complete||s.levelIndex===levels.length-1
  el('chapter-map').hidden=true;el('chapters').textContent='关卡手记 · '+(progress.unlocked+1)+' / '+levels.length;renderChapters()
 }
}
export function attachScene(scene:Game){
 game=scene;lastFinished=false;game.pausePlay();clearControls();el('modal').hidden=false
 el('title').textContent=levels[game.levelIndex].title;el('eyebrow').textContent=levels[game.levelIndex].subtitle
 el('description').textContent=levels[game.levelIndex].briefing
 el('resume').textContent=savedAttempt?'继续本关':'开始探险';el('resume').hidden=false;el('resume').removeAttribute('disabled')
 el('new-game').hidden=!savedAttempt;el('new-game').textContent='重开本关';el('next-level').hidden=true;el('chapter-map').hidden=true
 el('chapters').textContent='关卡手记 · '+(progress.unlocked+1)+' / '+levels.length;el('pause').hidden=false;renderChapters()
}
function pause(){
 clearControls();if(!game||game.complete||game.failed)return
 game.pausePlay();saveAttempt(game.snapshot());el('modal').hidden=false;el('title').textContent=game.level.title+' · 暂停'
 el('description').textContent=el('save-warning').hidden?'本关进度已保存。其他关卡也各自保留探险进度。':'设备暂时无法保存进度'
 el('resume').textContent='继续探险';el('resume').hidden=false;el('new-game').hidden=true;el('next-level').hidden=true;el('chapter-map').hidden=true;renderChapters()
}
function resume(){if(!game||document.hidden||game.complete||game.failed)return;el('modal').hidden=true;clearControls();game.resumePlay()}
function startLevel(index:number,retry=false){
 if(!game||index>progress.unlocked)return
 clearControls()
 if(!game.complete&&!game.failed)saveAttempt(game.snapshot())
 const level=levels[index];if(retry)delete progress.attempts[level.id]
 progress.selectedLevel=level.id;savedAttempt=progress.attempts[level.id]||null;lastFinished=false;persist()
 el('modal').hidden=false;el('resume').setAttribute('disabled','');game.sys.resume();game.scene.restart()
}
el('resume').addEventListener('click',resume)
el('pause').addEventListener('click',pause)
el('new-game').addEventListener('click',()=>{if(game)startLevel(game.levelIndex,true)})
el('next-level').addEventListener('click',()=>{if(game)startLevel(game.levelIndex+1)})
el('chapters').addEventListener('click',()=>{renderChapters();el('chapter-map').hidden=!el('chapter-map').hidden;el('chapters').textContent=el('chapter-map').hidden?'关卡手记 · '+(progress.unlocked+1)+' / '+levels.length:'收起关卡手记'})
el('map-toggle').addEventListener('click',()=>{const map=el('mini-panel');map.hidden=!map.hidden;el('map-toggle').setAttribute('aria-expanded',String(!map.hidden))})
surface.addEventListener('pointerdown',e=>{
 if(!game||game.scene.isPaused()||game.complete||game.failed||dragPointer!==null||!e.isPrimary||e.button!==0)return
 e.preventDefault();surface.setPointerCapture(e.pointerId);dragPointer=e.pointerId;lastPoint={x:e.clientX,y:e.clientY};controls.dragging=true
 const p=game.snapshot().player;controls.targetX=p.x;controls.targetY=p.y
})
surface.addEventListener('pointermove',e=>{if(e.pointerId!==dragPointer||!lastPoint||!game||game.scene.isPaused())return;e.preventDefault();game.dragBy(e.clientX-lastPoint.x,e.clientY-lastPoint.y);lastPoint={x:e.clientX,y:e.clientY}})
for(const name of ['pointerup','pointercancel','lostpointercapture'])surface.addEventListener(name,(e:Event)=>{if((e as PointerEvent).pointerId===dragPointer)clearDrag()})
const movementCodes:Record<string,keyof Pick<MovementControls,'left'|'right'|'up'|'down'>>={KeyA:'left',KeyD:'right',KeyW:'up',KeyS:'down'}
document.addEventListener('keydown',e=>{
 if(!game||game.complete||game.failed)return
 if(e.code==='Escape'&&!e.repeat){e.preventDefault();game.scene.isPaused()?resume():pause();return}
 if(game.scene.isPaused())return
 const direction=movementCodes[e.code];if(direction){e.preventDefault();controls[direction]=true}
})
document.addEventListener('keyup',e=>{const direction=movementCodes[e.code];if(direction)controls[direction]=false})
window.addEventListener('blur',pause);document.addEventListener('visibilitychange',()=>{if(document.hidden)pause()})
window.addEventListener('pagehide',()=>{if(game)saveAttempt(game.snapshot())})
el('credits-button').addEventListener('click',()=>{(el('credits') as HTMLDialogElement).showModal()})
el('close-credits').addEventListener('click',()=>{(el('credits') as HTMLDialogElement).close()})
;(window as any).__owngameFaune=Object.freeze({snapshot:()=>game?JSON.parse(JSON.stringify({...game.snapshot(),campaign:{unlocked:progress.unlocked,completed:progress.completed}})):{ready:false}})
