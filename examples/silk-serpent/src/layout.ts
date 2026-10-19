import {CONFIG,Difficulty,Cell} from './rules';
export function fitLayout(vw:number,vh:number,d:Difficulty){
 const portrait=vh/vw>=1.2;
 const scale=portrait?vw/720:Math.min(vw/720,vh/1280);
 const height=portrait?vh/scale:1280;
 const controlHeight=Math.max(88,44/scale),controlWidth=Math.max(210,44/scale);
 const headerTop=Math.max(120,60/scale),headerHeight=Math.max(160,Math.min(208,160+(height-1100)*.14));
 const row2Top=height-12-controlHeight,row1Top=row2Top-10-controlHeight;
 const statusTop=row1Top-10-44;
 const areaTop=headerTop+headerHeight+12,areaBottom=statusTop-14;
 const c=CONFIG[d],cell=Math.min(540/c.width,(areaBottom-areaTop)/c.height);
 const boardWidth=c.width*cell,boardHeight=c.height*cell;
 const board={x:360-boardWidth/2,y:areaTop+(areaBottom-areaTop-boardHeight)/2,w:boardWidth,h:boardHeight,cell,columns:c.width,rows:c.height};
 return{width:720,height,scale,portrait,left:(vw-720*scale)/2,top:(vh-height*scale)/2,headerTop,headerHeight,row1Top,row2Top,statusTop,controlHeight,controlWidth,board};
}
export type Layout=ReturnType<typeof fitLayout>;
export function cellPoint(layout:Layout,p:Cell){const b=layout.board;return{x:b.x+(p.x+.5)*b.cell,y:b.y+(b.rows-p.y-.5)*b.cell};}
