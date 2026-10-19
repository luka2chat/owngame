import {initial,replay,State} from './rules';

export const SAVE_KEY='owngame:board:star-triad:v1';
export interface SavedGame {schema:1;kind:'tris';solo:boolean;simple:boolean;moves:number[]}
export interface LoadedGame {state:State;solo:boolean;simple:boolean;notice:string;storageError:boolean}
export interface SaveResult {ok:boolean}
export type StoragePort=Pick<Storage,'getItem'|'setItem'>;

export function restore(storage:()=>StoragePort,preferSimple=false):LoadedGame {
  const empty:LoadedGame={state:initial('tris'),solo:true,simple:preferSimple,notice:'',storageError:false};
  let raw:string|null=null;
  try{
    raw=storage().getItem(SAVE_KEY);if(raw===null)return empty;
    const data:unknown=JSON.parse(raw);
    if(!data||typeof data!=='object')throw Error('invalid save');
    const d=data as Partial<SavedGame>;
    if(d.schema!==1||d.kind!=='tris'||typeof d.solo!=='boolean'||typeof d.simple!=='boolean')throw Error('invalid save');
    const state=replay('tris',d.moves);if(!state)throw Error('invalid moves');
    return {state,solo:d.solo,simple:d.simple,notice:'已接续上次的棋局',storageError:false};
  }catch{
    if(raw===null)return {...empty,notice:'存储不可用，本局暂时无法保存',storageError:true};
    try{
      let key=SAVE_KEY+':backup';
      if(storage().getItem(key)!==null){
        const prefix=key+':'+Date.now();key=prefix;let suffix=0;
        while(storage().getItem(key)!==null)key=prefix+':'+(++suffix);
      }
      storage().setItem(key,raw);
      return {...empty,notice:'存档异常，已保留备份并开始新局'};
    }catch{return {...empty,notice:'存档异常且备份失败，本局暂时无法保存',storageError:true};}
  }
}

export function persist(storage:()=>StoragePort,state:State,solo:boolean,simple:boolean):SaveResult {
  try{storage().setItem(SAVE_KEY,JSON.stringify({schema:1,kind:'tris',solo,simple,moves:state.moves} satisfies SavedGame));return {ok:true};}
  catch{return {ok:false};}
}
