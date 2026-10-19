/** Geometry is in CSS pixels; DOM hit areas and canvas share it. */
export function fitLayout(width,height,safeTop=0){
 const landscape=width/height>1.3;
 if(landscape){const board=Math.min(520,Math.max(352,Math.min(height-16,width*.57)));const panel=Math.max(230,Math.min(350,width-board-32));const total=board+panel+20,x=(width-total)/2,panelTop=Math.max(8,(height-285)/2);return{width,height,landscape,board:{x,y:Math.max(8,(height-board)/2),size:board,viewHeight:Math.min(board,height-16)},header:{x:x+board+20,y:panelTop,w:panel,h:85},footer:{x:x+board+20,y:panelTop+125,w:panel,h:150},controlH:44,titleSize:31};}
 const topClear=Math.max(0,38-safeTop),headerH=Math.min(112,Math.max(86,height*.12))+topClear;
 const controlH=height>720?48:44,footerH=22+12+2+controlH*2+6;
 const board=Math.min(width-8,520);const extra=Math.max(0,height-headerH-board-footerH-4);
 const boardY=headerH+extra*.36,footerY=height-footerH-4;
 return{width,height,landscape,board:{x:(width-board)/2,y:boardY,size:board},header:{x:Math.max(4,(width-Math.min(width-8,500))/2),y:topClear,w:Math.min(width-8,500),h:headerH-topClear},footer:{x:Math.max(8,(width-Math.min(width-16,480))/2),y:footerY,w:Math.min(width-16,480),h:footerH},controlH,titleSize:height>720?40:33};
}
