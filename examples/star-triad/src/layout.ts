export const DESIGN_WIDTH=720;
export const BASE_HEIGHT=1280;
export const BASE_CELLS=Array.from({length:9},(_,i)=>({x:360+(i%3-1)*186,y:630+(Math.floor(i/3)-1)*180}));

export function fitLayout(viewportWidth:number,viewportHeight:number){
  const portrait=viewportHeight/viewportWidth>=1.5;
  const scale=portrait?viewportWidth/DESIGN_WIDTH:Math.min(viewportWidth/DESIGN_WIDTH,viewportHeight/BASE_HEIGHT);
  // Portrait grows the world vertically instead of centering a fixed canvas in empty bands.
  const height=portrait?Math.ceil(viewportHeight/scale):BASE_HEIGHT;
  const extra=height-BASE_HEIGHT;
  const controlHeight=Math.max(88,44/scale),controlExtra=controlHeight-88;
  const headerOffset=Math.max(-20,Math.min(40,extra*.08));
  const footerOffset=extra-controlExtra*2,settingsOffset=extra-controlExtra;
  const boardScale=Math.min(1,Math.max(.6,(height-640-controlExtra*2)/640));
  const boardOffset=(footerOffset+headerOffset)/2;
  const boardCenter={x:360,y:632+boardOffset};
  const cells=BASE_CELLS.map(p=>({x:360+(p.x-360)*boardScale,y:boardCenter.y+(p.y-632)*boardScale}));
  return {width:DESIGN_WIDTH,height,scale,portrait,
    left:portrait?0:(viewportWidth-DESIGN_WIDTH*scale)/2,top:portrait?0:(viewportHeight-height*scale)/2,
    headerOffset,footerOffset,settingsOffset,controlHeight,boardScale,boardCenter,cells};
}
export type Layout=ReturnType<typeof fitLayout>;
