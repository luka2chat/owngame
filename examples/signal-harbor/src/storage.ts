import {decodeProgress,freshProgress,Progress,SAVE_KEY,recordWin,State} from './rules';
export type StorageAccess=()=>Pick<Storage,'getItem'|'setItem'>;
export function restore(access:StorageAccess,reducedPreference=false){
  let progress=freshProgress(),warning=false,notice='每次移一盏 · 空位或同图案可放';
  try{
    const store=access(),raw=store.getItem(SAVE_KEY),decoded=decodeProgress(raw);
    if(decoded){progress=decoded;if(!raw)progress.reduced=reducedPreference;}
    else{
      store.setItem(SAVE_KEY+'.recovered-'+Date.now(),raw!);
      notice='旧航迹无法读取，已保留备份';
    }
  }catch{warning=true;}
  return{progress,warning,notice};
}
export function persist(access:StorageAccess,progress:Progress,state:State,reduced:boolean){
  const next=recordWin({...progress,reduced},state);
  try{access().setItem(SAVE_KEY,JSON.stringify(next));return{progress:next,warning:false};}
  catch{return{progress:next,warning:true};}
}
