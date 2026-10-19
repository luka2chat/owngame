import {initial,restore,State,COUNTS} from './rules';
export const SAVE_KEY='owngame:petal-memory:v1';
export interface Save {schema:1;state:State;simple:boolean;best:number[];}
export function readSave(getStorage:()=>Storage):{save:Save;notice:string;error:boolean}{
 const fresh:Save={schema:1,state:initial(Date.now()>>>0),simple:matchMedia('(prefers-reduced-motion: reduce)').matches,best:[0,0,0]};
 try{
  const storage=getStorage(),raw=storage.getItem(SAVE_KEY);if(raw===null)return {save:fresh,notice:'',error:false};
  try{
   const v=JSON.parse(raw),s=restore(v.state);
   if(v.schema!==1||!s||typeof v.simple!=='boolean'||!Array.isArray(v.best)||v.best.length!==3||v.best.some((n:number,i:number)=>!Number.isInteger(n)||n<0||n>COUNTS[i]/2))throw Error('invalid');
   return {save:{schema:1,state:s,simple:v.simple,best:v.best},notice:'已接续上次的标本桌',error:false};
  }catch{
   let error=false;try{storage.setItem(SAVE_KEY+':backup',raw);}catch{error=true;}
   return {save:fresh,notice:'存档异常，已保留备份并新开一局',error};
  }
 }catch{return {save:fresh,notice:'',error:true};}
}
export function writeSave(getStorage:()=>Storage,save:Save):boolean{
 try{getStorage().setItem(SAVE_KEY,JSON.stringify(save));return true;}catch{return false;}
}
