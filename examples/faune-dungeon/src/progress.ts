import {levels} from './levels'
export const saveKey='owngame:faune-dungeon:v2'
export const legacyKey='owngame:faune-dungeon:v1'
export type Progress={schema:2;selectedLevel:string;unlocked:number;wins:number;best:number;attempts:Record<string,any>;completed:Record<string,{stars:number;coins:number;time:number}>}
export const freshProgress=():Progress=>({schema:2,selectedLevel:levels[0].id,unlocked:0,wins:0,best:0,attempts:{},completed:{}})
const validAttempt=(a:any)=>a&&Number.isFinite(a.player?.x)&&Number.isFinite(a.player?.y)&&a.player.x>=0&&a.player.y>=0&&a.player.x<=1600&&a.player.y<=1600&&a.health>0&&a.health<=3&&Number.isFinite(a.coins)&&Number.isFinite(a.elapsed)&&['opened','defeated','enemies'].every(k=>Array.isArray(a[k])&&a[k].length<=64)
export function loadProgress(current:string|null,legacy:string|null){
  const progress=freshProgress()
  try{
    if(current){
      const s=JSON.parse(current)
      if(s.schema!==2)return{progress,warning:true,readOnly:true}
      progress.unlocked=Math.max(0,Math.min(levels.length-1,Math.floor(Number(s.unlocked)||0)))
      const selected=levels.findIndex(l=>l.id===s.selectedLevel)
      progress.selectedLevel=levels[selected>=0&&selected<=progress.unlocked?selected:0].id
      progress.wins=Math.max(0,Number(s.wins)||0);progress.best=Math.max(0,Number(s.best)||0)
      for(const level of levels){
        const a=s.attempts?.[level.id];if(validAttempt(a))progress.attempts[level.id]={...a,levelId:level.id,runes:Array.isArray(a.runes)?a.runes:[]}
        const c=s.completed?.[level.id];if(c&&Number.isFinite(c.time)&&Number.isFinite(c.coins))progress.completed[level.id]={stars:Math.max(1,Math.min(3,Number(c.stars)||1)),coins:c.coins,time:c.time}
      }
    }else if(legacy){
      const s=JSON.parse(legacy)
      if(s.schema!==1)return{progress,warning:true,readOnly:false}
      progress.wins=Math.max(0,Number(s.wins)||0);progress.best=Math.max(0,Number(s.best)||0)
      if(validAttempt(s.attempt))progress.attempts[levels[0].id]={...s.attempt,levelId:levels[0].id,runes:[]}
      if(progress.wins>0){progress.unlocked=1;if(!progress.attempts[levels[0].id])progress.selectedLevel=levels[1].id}
    }
    return{progress,warning:false,readOnly:false}
  }catch{return{progress,warning:true,readOnly:false}}
}
export function recordCompletion(p:Progress,s:any){
  const index=levels.findIndex(l=>l.id===s.levelId);if(index<0)throw Error('Unknown chapter')
  const stars=1+Number(s.health===3)+Number(s.elapsed<=levels[index].par*1000)
  const old=p.completed[s.levelId]
  p.completed[s.levelId]={stars:Math.max(stars,old?.stars||0),coins:Math.max(s.coins,old?.coins||0),time:Math.min(s.elapsed,old?.time??Infinity)}
  p.wins++;p.best=Math.max(p.best,s.coins);delete p.attempts[s.levelId]
  p.unlocked=Math.max(p.unlocked,Math.min(levels.length-1,index+1))
  p.selectedLevel=levels[Math.min(levels.length-1,index+1)].id
  return stars
}
