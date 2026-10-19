import {initial,restore as restoreState,State} from './rules';
export const SAVE_KEY='owngame:wind-chime-memory:v1';
export type Port=Pick<Storage,'getItem'|'setItem'>;
export interface Saved{schema:1;state:State;best:number[];muted:boolean;simple:boolean}
export function load(port:()=>Port,preferSimple=false){
 const empty={state:initial(Date.now()),best:[0,0,0],muted:false,simple:preferSimple,exists:false,notice:'',storageError:false};let raw:string|null=null;
 try{raw=port().getItem(SAVE_KEY);if(raw===null)return empty;const v=JSON.parse(raw),state=restoreState(v.state);
  if(v.schema!==1||!state||typeof v.muted!=='boolean'||typeof v.simple!=='boolean'||!Array.isArray(v.best)||v.best.length!==3||v.best.some((n:unknown)=>typeof n!=='number'||!Number.isInteger(n)||n<0||n>10000))throw Error('bad');
  return{state,best:v.best as number[],muted:v.muted as boolean,simple:v.simple as boolean,exists:true,notice:'已接续上次的旋律',storageError:false};
 }catch{
  if(raw===null)return{...empty,notice:'存储不可用，请保持页面打开',storageError:true};
  try{let key=SAVE_KEY+':backup';if(port().getItem(key)!==null){const prefix=key+':'+Date.now();key=prefix;let n=0;while(port().getItem(key)!==null)key=prefix+':'+(++n);}port().setItem(key,raw);return{...empty,notice:'存档异常，已保留备份'};}
  catch{return{...empty,notice:'存档异常且备份失败，请保持页面打开',storageError:true};}
 }
}
export function persist(port:()=>Port,data:Saved){try{port().setItem(SAVE_KEY,JSON.stringify(data));return true;}catch{return false;}}
