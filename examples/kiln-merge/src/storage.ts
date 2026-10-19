import {initial,restore as restoreState,State} from './rules';
export const SAVE_KEY='owngame:kiln-merge:v1';
export type StoragePort=Pick<Storage,'getItem'|'setItem'>;
export interface Loaded {state:State;best:number;simple:boolean;notice:string;saveError:boolean}
export function load(storage:()=>StoragePort,preferSimple=false,seed=Date.now()>>>0):Loaded {
  const empty:Loaded={state:initial(seed),best:0,simple:preferSimple,notice:'',saveError:false};
  let raw:string|null=null;
  try {
    raw=storage().getItem(SAVE_KEY);if(raw===null)return empty;
    const data=JSON.parse(raw),state=restoreState(data.state);
    if(data.schema!==1||!state||typeof data.simple!=='boolean'||!Number.isSafeInteger(data.best)||data.best<state.score||data.best<0||data.best%4)throw Error('bad save');
    return {state,best:data.best,simple:data.simple,notice:'已接续上次的窑火',saveError:false};
  }catch {
    if(raw===null)return {...empty,notice:'存储不可用，本局暂时无法保存',saveError:true};
    try {
      let key=SAVE_KEY+':backup';
      if(storage().getItem(key)!==null){const prefix=key+':'+Date.now();key=prefix;let suffix=0;while(storage().getItem(key)!==null)key=prefix+':'+(++suffix);}
      storage().setItem(key,raw);
      return {...empty,notice:'存档异常，已保留备份并重新开炉'};
    }catch{return {...empty,notice:'存档异常且备份失败，本局暂时无法保存',saveError:true};}
  }
}
export function persist(storage:()=>StoragePort,state:State,best:number,simple:boolean){
  try{storage().setItem(SAVE_KEY,JSON.stringify({schema:1,state,simple,best}));return true;}
  catch{return false;}
}
