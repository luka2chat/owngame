export function fitLayout(w:number,h:number,count=4){
  const portrait=h/w>=1.25,scale=portrait?w/720:Math.min(w/720,h/1280);
  const height=portrait?h/scale:1280,controlHeight=Math.max(88,44/scale);
  const headerTop=60/scale;
  const settingsTop=height-controlHeight-16,controlsTop=settingsTop-controlHeight-14;
  const statusTop=controlsTop-86,fieldTop=headerTop+186,fieldBottom=statusTop-10;
  const rowHeight=(fieldBottom-fieldTop)/2;
  const imageHeight=Math.min(408,rowHeight-8),imageWidth=imageHeight*.75;
  const row1=fieldTop+rowHeight/2,row2=fieldTop+rowHeight*1.5;
  const bells=Array.from({length:count},(_,i)=>({x:i===2&&count===3?360:i%2===0?202:518,y:i<2?row1:row2,w:imageWidth,h:imageHeight}));
  return{width:720,height,scale,portrait,left:(w-720*scale)/2,top:portrait?0:(h-height*scale)/2,
    headerTop,controlHeight,settingsTop,controlsTop,statusTop,fieldTop,fieldBottom,bells};
}
export type Layout=ReturnType<typeof fitLayout>;
