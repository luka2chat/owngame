import {initial,restore as decode,encode,CONFIG,State} from './rules';

export const SAVE_KEY='owngame:silk-serpent:v1';
export type StoragePort=Pick<Storage,'getItem'|'setItem'>;
export interface SavedGame {schema:1;state:string;simple:boolean;muted:boolean;best:number[]}
export interface LoadedGame {state:State;simple:boolean;muted:boolean;best:number[];notice:string;saveError:boolean}

/** The published Cocos outer envelope and encoded rules state are kept verbatim. */
export function load(storage:()=>StoragePort,preferSimple=false):LoadedGame{
 const empty:LoadedGame={state:initial(Date.now()),simple:preferSimple,muted:false,best:[4,4,4],notice:'',saveError:false};
 let raw:string|null=null;
 try{
  raw=storage().getItem(SAVE_KEY);if(raw===null)return empty;
  const v=JSON.parse(raw) as SavedGame,s=decode(v.state);
  if(v.schema!==1||!s||typeof v.simple!=='boolean'||typeof v.muted!=='boolean'||!Array.isArray(v.best)||v.best.length!==3||v.best.some((n,i)=>!Number.isInteger(n)||n<4||n>CONFIG[i].width*CONFIG[i].height))throw Error('bad save');
  return{state:s,simple:v.simple,muted:v.muted,best:[...v.best],notice:'已找回上次游龙 · 点继续出发',saveError:false};
 }catch{
  if(raw===null)return{...empty,notice:'存储不可用，本局暂时无法保存',saveError:true};
  try{
   let key=SAVE_KEY+':backup';
   if(storage().getItem(key)!==null){const base=key+':'+Date.now();key=base;let n=0;while(storage().getItem(key)!==null)key=base+':'+(++n);}
   storage().setItem(key,raw);return{...empty,notice:'存档异常，已保留备份并开启新局'};
  }catch{return{...empty,notice:'存档异常且备份失败，本局暂时无法保存',saveError:true};}
 }
}
export function persist(storage:()=>StoragePort,state:State,simple:boolean,muted:boolean,best:number[]):boolean{
 try{storage().setItem(SAVE_KEY,JSON.stringify({schema:1,state:encode(state),simple,muted,best} satisfies SavedGame));return true;}catch{return false;}
}
