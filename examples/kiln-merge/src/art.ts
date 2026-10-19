export const TILE_FRAMES=Array.from({length:11},(_,i)=>({name:'tile-'+2**(i+1),x:20+(i%4)*305,y:[20,314,611][Math.floor(i/4)],w:300,h:300}));
export const PANELS={paper:[28,909,283,284],primary:[335,908,284,285],disabled:[642,908,283,285],secondary:[948,908,281,285]} as const;
export const LABELS=['土','芽','泉','叶','雨','霞','焰','釉','星','月','光'];
export const ink=(exponent:number)=>[4,7,8,9].includes(exponent)?'#fff8df':'#173f3c';
