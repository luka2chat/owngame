export interface Insets {top:number;right:number;bottom:number;left:number}
export interface Box {x:number;y:number;w:number;h:number}
const rect=(x:number,y:number,w:number,h:number):Box=>({x,y,w,h});
export function fitLayout(width:number,height:number,safe:Insets){
  const top=safe.top+56,bottom=height-safe.bottom-10;
  const usableWidth=width-safe.left-safe.right;
  const stageWidth=Math.max(180,Math.min(usableWidth-16,600,(height-safe.top-safe.bottom-100)*.72));
  const stageX=safe.left+(usableWidth-stageWidth)/2;
  const controlH=Math.max(44,Math.min(54,stageWidth*.135));
  const simple=rect(stageX+stageWidth*.26,bottom-controlH,stageWidth*.48,controlH);
  const mainTop=simple.y-controlH-8;
  const gap=8,undoW=stageWidth*.285,helpW=undoW,newW=stageWidth-undoW-helpW-gap*2;
  const undo=rect(stageX,mainTop,undoW,controlH),fresh=rect(stageX+undoW+gap,mainTop,newW,controlH),help=rect(stageX+stageWidth-helpW,mainTop,helpW,controlH);
  const status=rect(stageX,mainTop-26,stageWidth,20);
  const header=rect(stageX,top,stageWidth,stageWidth*380/1024);
  // Keep the painted board's own aspect; on short screens scale the entire tray down.
  const naturalH=stageWidth*808/920;
  const boardH=Math.max(60,Math.min(naturalH,status.y-header.y-header.h-16));
  const boardW=boardH*920/808;
  const board=rect(stageX+(stageWidth-boardW)/2,header.y+header.h+(status.y-header.y-header.h-boardH)/2,boardW,boardH);
  const hx=stageWidth/1024,bx=boardW/920;
  const cells=Array.from({length:16},(_,i)=>({
    x:board.x+(246+(i%4)*181-50)*bx,
    y:board.y+(519+Math.floor(i/4)*178-382)*bx,
  }));
  return {width,height,safe,stageX,stageWidth,header,board,cells,boardScale:bx,
    tileSize:200*bx,boardInput:rect(board.x+100*bx,board.y+44*bx,720*bx,712*bx),
    title:rect(header.x+174*hx,header.y+30*hx,470*hx,185*hx),
    current:rect(header.x+240*hx,header.y+233*hx,270*hx,84*hx),
    best:rect(header.x+530*hx,header.y+233*hx,260*hx,84*hx),
    turns:rect(header.x+240*hx,header.y+323*hx,550*hx,49*hx),
    controlH,undo,fresh,help,simple,status,hx,
  };
}
export type Layout=ReturnType<typeof fitLayout>;
