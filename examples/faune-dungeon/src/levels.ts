export type Point = { x: number; y: number }
export type EnemyKind = 'patrol' | 'hunter' | 'guardian' | 'warden'
export type EnemySpawn = Point & { kind?: EnemyKind }
type Room = [number, number, number, number]
export type Level = {
  id: string; title: string; subtitle: string; briefing: string; par: number; tint: number
  spawn: Point; exit: Point; width?: number; height?: number
  rooms?: Room[]; links?: [number, number][]; pillars?: Room[]
  chests?: Point[]; enemies?: EnemySpawn[]; runes: Point[]; traps: Point[]
}

// Authored room graphs, with loops and alternate approaches. One tile is 16 world pixels.
// Chapter one retains the original object IDs and layout for existing checkpoints.
export const levels: Level[] = [
  {
    id: 'forest-gate', title: '苔庭入口', subtitle: '01 · 失落的营地', par: 95, tint: 0xdce5ba,
    briefing: '找回三只宝箱，再回到营地。先熟悉朝向与飞刀，留意巡逻的蜥蜴。',
    spawn: { x: 128, y: 128 }, exit: { x: 128, y: 128 }, runes: [], traps: []
  },
  {
    id: 'twin-rings', title: '双环回廊', subtitle: '02 · 两条归路', par: 130, tint: 0xe5c88c,
    briefing: '回廊有上下两条环线。收齐三只宝箱与两枚符印，穿过东南方的传送门；猎手会追近落单的旅人。',
    width: 66, height: 40, spawn: { x: 128, y: 128 }, exit: { x: 864, y: 480 },
    rooms: [[3,3,10,9],[22,3,12,9],[48,3,12,9],[3,24,12,10],[24,23,12,11],[48,24,12,10]],
    links: [[0,1],[1,2],[0,3],[3,4],[4,5],[2,5],[1,4]], pillars: [[27,6,2,3],[29,27,2,3]],
    chests: [{x:416,y:96},{x:880,y:128},{x:480,y:496}],
    runes: [{x:112,y:480},{x:848,y:432}], traps: [],
    enemies: [{x:480,y:160},{x:816,y:128,kind:'hunter'},{x:176,y:448},{x:480,y:400,kind:'hunter'},{x:912,y:480}]
  },
  {
    id: 'sunken-causeway', title: '机关水道', subtitle: '03 · 灯火的节拍', par: 165, tint: 0x9bcfc8,
    briefing: '橙色亮起时机关正在蓄力，红色脉冲会造成伤害。利用岔路与两侧空隙，收齐宝箱和符印后前往东南出口。',
    width: 62, height: 54, spawn: {x:128,y:128}, exit: {x:800,y:736},
    rooms: [[3,3,11,10],[23,3,12,10],[44,3,12,10],[44,23,12,10],[23,23,12,10],[3,23,11,10],[3,41,11,10],[23,41,12,10],[44,41,12,10]],
    links: [[0,1],[1,2],[2,3],[3,4],[4,5],[5,6],[6,7],[7,8],[1,4],[4,7]], pillars: [[27,6,2,3],[48,26,2,3]],
    chests: [{x:800,y:128},{x:144,y:448},{x:480,y:736}], runes: [{x:464,y:432},{x:144,y:736}],
    traps: [{x:464,y:272},{x:640,y:448},{x:272,y:448},{x:480,y:608},{x:272,y:736}],
    enemies: [{x:528,y:160},{x:816,y:480,kind:'hunter'},{x:480,y:496},{x:128,y:496},{x:176,y:752,kind:'hunter'},{x:848,y:736}]
  },
  {
    id: 'sealed-archive', title: '封印书库', subtitle: '04 · 三枚古老符印', par: 180, tint: 0xc6b0d8,
    briefing: '四只宝箱分布在南北两翼，三枚符印才能唤醒东侧出口。金色护甲守卫需要两次命中，柱廊可以挡住追击。',
    width:64,height:51,spawn:{x:128,y:416},exit:{x:816,y:416},
    rooms:[[3,21,10,10],[22,21,12,10],[44,21,13,10],[22,3,12,11],[44,3,13,11],[22,38,12,10],[44,38,13,10]],
    links:[[0,1],[1,2],[1,3],[3,4],[4,2],[1,5],[5,6],[6,2]],
    pillars:[[27,24,2,3],[48,6,2,3],[48,41,2,3]],
    chests:[{x:416,y:112},{x:816,y:112},{x:448,y:704},{x:816,y:704}],
    runes:[{x:480,y:160},{x:848,y:160},{x:848,y:688}], traps:[{x:640,y:416},{x:448,y:544}],
    enemies:[{x:448,y:208,kind:'guardian'},{x:448,y:624,kind:'guardian'},{x:816,y:192,kind:'hunter'},{x:816,y:640,kind:'hunter'},{x:512,y:448},{x:864,y:448}]
  },
  {
    id:'heart-sanctum',title:'林心圣殿',subtitle:'05 · 苏醒的守卫',par:190,tint:0x9edcaa,
    briefing:'从南北两翼取回符印与宝箱，再面对林心守卫。躲开蓄力射线与扇形弹幕；击败守卫后，圣殿中央的门才会开启。',
    width:62,height:48,spawn:{x:128,y:384},exit:{x:784,y:384},
    rooms:[[3,19,11,10],[22,19,12,10],[40,13,18,22],[22,3,12,10],[22,35,12,10]],
    links:[[0,1],[1,2],[1,3],[1,4],[3,2],[4,2]],pillars:[[26,22,2,3],[43,17,2,2],[53,29,2,2]],
    chests:[{x:128,y:352},{x:432,y:128},{x:432,y:672}],runes:[{x:480,y:128},{x:480,y:672}],
    traps:[{x:704,y:480},{x:864,y:288}],
    enemies:[{x:512,y:160,kind:'guardian'},{x:512,y:640,kind:'hunter'},{x:800,y:384,kind:'warden'}]
  }
]

export function makeLevelMap(level: Level, template: any) {
  if (!level.rooms) return template
  const width=level.width!,height=level.height!,floor=Array(width*height).fill(0)
  const fill=(x:number,y:number,w:number,h:number,value:number)=>{
    for(let yy=y;yy<y+h;yy++)for(let xx=x;xx<x+w;xx++)if(xx>=0&&yy>=0&&xx<width&&yy<height)floor[yy*width+xx]=value
  }
  for(const room of level.rooms)fill(...room,39)
  const center=(i:number)=>{const [x,y,w,h]=level.rooms![i];return{x:Math.floor(x+w/2),y:Math.floor(y+h/2)}}
  for(const [a,b] of level.links!){
    const p=center(a),q=center(b)
    fill(Math.min(p.x,q.x)-2,p.y-2,Math.abs(q.x-p.x)+4,4,39)
    fill(q.x-2,Math.min(p.y,q.y)-2,4,Math.abs(q.y-p.y)+4,39)
  }
  for(const room of level.pillars||[])fill(...room,0)
  const walls=floor.map((v,i)=>v?0:(()=>{const x=i%width,y=Math.floor(i/width);for(let dy=-1;dy<=1;dy++)for(let dx=-1;dx<=1;dx++)if(floor[(y+dy)*width+x+dx])return 12;return 0})())
  const tileLayer=(name:string,data:number[],id:number)=>({id,name,type:'tilelayer',x:0,y:0,width,height,opacity:1,visible:true,data})
  const objects=(name:string,points:Point[],base:number)=>({id:base,name,type:'objectgroup',x:0,y:0,opacity:1,visible:true,objects:points.map((p,i)=>({id:base+i,name:'',type:'',x:p.x-8,y:p.y+8,width:16,height:16,rotation:0,visible:true}))})
  return {...template,width,height,layers:[tileLayer('Ground',floor,1),tileLayer('Walls',walls,2),objects('Chests',level.chests!,100),objects('Lizards',level.enemies!,200)],nextlayerid:5,nextobjectid:300}
}
