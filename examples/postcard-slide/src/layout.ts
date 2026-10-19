export function fitLayout(w:number,h:number){
  const portrait=h/w>=1.25;
  if(!portrait&&w/h>1.35){
    const scale=Math.min(w/1000,h/720),width=w/scale,height=h/scale,controlHeight=Math.max(88,44/scale);
    const reserve=68/scale,traySize=Math.min(height-reserve-16,width*.46),boardSize=traySize*.90;
    const panelLeft=traySize+40,panelWidth=width-panelLeft-16,secondaryTop=height-16-controlHeight,primaryTop=secondaryTop-12-controlHeight;
    return{width,height,scale,portrait,left:0,top:0,headerTop:reserve,headerHeight:108,
      headerLeft:panelLeft,headerWidth:panelWidth,panelLeft,panelWidth,tabsTop:reserve+120,controlHeight,primaryTop,secondaryTop,statsTop:primaryTop-74,noticeTop:primaryTop-40,
      tray:{x:8,y:reserve,size:traySize},board:{x:8+traySize*.05,y:reserve+traySize*.05,size:boardSize}};
  }
  const scale=portrait?w/720:Math.min(w/720,h/1280);
  const height=portrait?h/scale:1280,width=720;
  const controlHeight=Math.max(88,44/scale),gap=12,margin=16;
  // The native capsule is above the title even when the WebView reports no top inset.
  const headerTop=68/scale,headerHeight=108+Math.min(38,Math.max(0,(height-1280)*.08));
  const tabsTop=headerTop+headerHeight+8,tabsBottom=tabsTop+controlHeight;
  const secondaryTop=height-margin-controlHeight,primaryTop=secondaryTop-gap-controlHeight;
  const statsTop=primaryTop-74,noticeTop=statsTop+34;
  const available=statsTop-12-(tabsBottom+12);
  const traySize=Math.min(712,available),boardSize=traySize*.90;
  const surplus=Math.max(0,available-traySize);
  const trayTop=tabsBottom+12+surplus*.45,boardTop=trayTop+traySize*.05;
  return{width,height,scale,portrait,left:portrait?0:(w-width*scale)/2,top:portrait?0:(h-height*scale)/2,
    headerTop,headerHeight,headerLeft:70,headerWidth:580,panelLeft:16,panelWidth:688,tabsTop,controlHeight,primaryTop,secondaryTop,statsTop,noticeTop,
    tray:{x:(720-traySize)/2,y:trayTop,size:traySize},board:{x:(720-boardSize)/2,y:boardTop,size:boardSize}};
}
export type Layout=ReturnType<typeof fitLayout>;
export function cell(layout:Layout,n:number,i:number){const s=layout.board.size/n;return{x:layout.board.x+(i%n)*s,y:layout.board.y+Math.floor(i/n)*s,size:s};}
