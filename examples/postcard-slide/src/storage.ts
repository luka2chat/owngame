import {initial,restore as restoreState,State} from './rules';
export const SAVE_KEY='owngame:postcard-slide:v1';
export type StoragePort=Pick<Storage,'getItem'|'setItem'>;
export type Saved={schema:1;state:State;simple:boolean;best:Record<string,number>};
export function load(storage:()=>StoragePort,reduced=false,seed=Date.now()>>>0){
  const empty={state:initial(3,seed),simple:reduced,best:{} as Record<string,number>,notice:'',saveError:false};
  let raw:string|null=null;
  try{
    raw=storage().getItem(SAVE_KEY);if(raw===null)return empty;
    const v=JSON.parse(raw),state=restoreState(v.state);
    if(v.schema!==1||!state||typeof v.simple!=='boolean'||!v.best||typeof v.best!=='object'||Array.isArray(v.best)||Object.entries(v.best).some(([k,x])=>!['3','4','5'].includes(k)||!Number.isSafeInteger(x)||Number(x)<1))throw Error('invalid');
    return{state,simple:v.simple as boolean,best:v.best as Record<string,number>,notice:'已接续上次的明信片',saveError:false};
  }catch{
    if(raw===null)return{...empty,notice:'存储不可用，本局暂时无法保存',saveError:true};
    try{
      let key=SAVE_KEY+':backup';if(storage().getItem(key)!==null){const base=key+':'+Date.now();key=base;let i=0;while(storage().getItem(key)!==null)key=base+':'+(++i);}
      storage().setItem(key,raw);return{...empty,notice:'存档异常，已保留备份并重新开局'};
    }catch{return{...empty,notice:'存档异常且备份失败，本局暂时无法保存',saveError:true};}
  }
}
export function persist(storage:()=>StoragePort,state:State,simple:boolean,best:Record<string,number>){
  try{storage().setItem(SAVE_KEY,JSON.stringify({schema:1,state,simple,best} satisfies Saved));return true;}catch{return false;}
}
