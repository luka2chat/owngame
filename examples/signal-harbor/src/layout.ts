import {harborLayout,TOWER_ART} from './core/layout';
export {TOWER_ART};
export type Rect={x:number;y:number;w:number;h:number};
export const DESIGN_WIDTH=720;

/** One coordinate system for sprites, animation endpoints and DOM touch targets.
 * The world expands on tall phones; the entire backdrop stays at viewport size.
 */
export function fitLayout(viewWidth:number,viewHeight:number,capacity:number,buoys:number,topClearance=76){
  const portrait=viewHeight/viewWidth>=1.35;
  const scale=portrait?viewWidth/720:Math.min(viewWidth/720,viewHeight/1280);
  const height=portrait?viewHeight/scale:1280;
  // Web capsule: 20px top + 46px height; native capsule: safeTop + 6px + 44px.
  const controlH=Math.max(88,44/scale),reserve=topClearance/scale;
  const title={x:164,y:reserve,w:392,h:68};
  const subTitle={x:164,y:reserve+66,w:392,h:22};
  const nav={x:28,y:reserve,w:128,h:controlH};
  const mode={x:564,y:nav.y,w:128,h:controlH};
  const stats={x:28,y:nav.y+controlH+12,w:664,h:62};
  const rule={x:28,y:stats.y+stats.h+8,w:664,h:38};
  const controlsY=height-20-controlH;
  const status={x:28,y:controlsY-16-controlH,w:664,h:controlH};
  const compact=height<1400,berthPitch=compact?56:82;
  const artWidth=compact?220:260,artHeight=artWidth/2,maxBerthToken=Math.min(68,berthPitch-10);
  const berthLabelY=status.y-14-32,platformY=berthLabelY-(artHeight/2-1);
  const berthSlots=[platformY+8,platformY+8-berthPitch];
  const labelLimit=Math.min(berthSlots[1]-maxBerthToken/2-8,platformY-8-artHeight/2)-12-36;
  const towerLimit=labelLimit-10,towerMin=rule.y+rule.h+18;
  const geometry=harborLayout(capacity,buoys),maxWidth=206;
  const towerHeight=Math.min(Math.max(100,towerLimit-towerMin),500*maxWidth/geometry.tower.width);
  const towerScale=towerHeight/500;
  const towerTop=towerMin+Math.max(0,towerLimit-towerMin-towerHeight)*.35;
  const convert=(y:number)=>towerTop+towerHeight/2-y*towerScale;
  const x=[138,360,582];
  const tower={x,top:towerTop,height:towerHeight,width:geometry.tower.width*towerScale,
    slots:geometry.tower.slots.map(convert),tokenSize:geometry.tower.tokenSize*towerScale,
    goalY:convert(geometry.tower.goalY),goalRadius:geometry.tower.goalRadius*towerScale,
    segments:geometry.tower.segments.map(s=>({...s,y:convert(s.y),height:s.height*towerScale})),
    labelY:towerTop+towerHeight+10,
    hits:x.map(cx=>({x:cx-108,y:towerTop-4,w:216,h:towerHeight+50})),
  };
  const berthHitTop=Math.min(berthSlots[1]-maxBerthToken/2-8,platformY-8-artHeight/2);
  const berth={x:buoys===1?[360]:[195,525],slots:berthSlots,tokenSize:Math.min(maxBerthToken,tower.tokenSize),
    artY:platformY-8,artWidth,artHeight,labelY:berthLabelY,
    hits:(buoys===1?[360]:[195,525]).map(cx=>({x:cx-138,y:berthHitTop,w:276,h:berthLabelY+32-berthHitTop})),
  };
  const controls=[28,256,484].map(cx=>({x:cx,y:controlsY,w:208,h:controlH}));
  const tabs=[28,256,484].map(cx=>({x:cx,y:rule.y+rule.h+20,w:208,h:controlH}));
  const mapDescription={x:28,y:tabs[0].y+controlH+10,w:664,h:38};
  const gridY=mapDescription.y+48,gap=14;
  const cardH=(controlsY-18-gridY-gap*3)/4;
  const cards=Array.from({length:8},(_,i)=>({x:i%2?368:28,y:gridY+Math.floor(i/2)*(cardH+gap),w:324,h:cardH}));
  return{width:720,height,scale,portrait,left:(viewWidth-720*scale)/2,top:(viewHeight-height*scale)/2,
    reserve,controlH,title,subTitle,nav,mode,stats,rule,status,controls,tower,berth,tabs,mapDescription,cards,
    resume:{x:28,y:controlsY,w:664,h:controlH}};
}
export type Layout=ReturnType<typeof fitLayout>;
export function lampPoint(layout:Layout,column:number,slot:number){
  const g=column<3?layout.tower:layout.berth;
  return{x:g.x[column<3?column:column-3],y:g.slots[slot],size:g.tokenSize};
}
