export function fitLayout(width:number,height:number,count:number,backdrop?:{width:number;height:number;frameX:number;frameY:number}){
 const landscape=width/height>1.35;
 const cols=landscape?(count===30?10:count===22?8:7):(count===30?5:4),rows=Math.ceil(count/cols);
 const compact=height<650,titleTop=width<700?60:24;
 const headerHeight=84,controlHeight=44,footerHeight=134,gap=compact?4:7;
 let pad=width<500?16:28,boardTop=titleTop+headerHeight+8,boardBottom=height-footerHeight;
 let felt:{top:number;bottom:number;left:number;right:number}|null=null;
 if(backdrop){
  // The one full-screen background uses CSS cover. Keep real cards inside its felt tray,
  // including when native safe insets change the foreground's origin.
  const z=Math.max(backdrop.width/941,backdrop.height/1672);
  const ox=(backdrop.width-941*z)/2-backdrop.frameX,oy=(backdrop.height-1672*z)/2-backdrop.frameY;
  felt={left:ox+58*z,right:ox+884*z,top:oy+350*z,bottom:oy+1318*z};
  pad=Math.max(pad,felt.left+7,width-felt.right+7);
  boardTop=Math.max(boardTop,felt.top+7);boardBottom=Math.min(boardBottom,felt.bottom-7);
 }
 const availableHeight=Math.max(0,boardBottom-boardTop);
 const side=Math.min(116,(width-pad*2-gap*(cols-1))/cols,(availableHeight-gap*(rows-1))/rows);
 const feasible=side>=44;
 const size=Math.max(44,side),gridHeight=rows*size+(rows-1)*gap;
 const gridTop=boardTop+Math.max(0,(availableHeight-gridHeight)/2);
 const cells=Array.from({length:count},(_,i)=>{
  const row=Math.floor(i/cols),column=i%cols,n=Math.min(cols,count-row*cols);
  return{x:width/2+(column-(n-1)/2)*(size+gap),y:gridTop+row*(size+gap)+size/2,size};
 });
 return{width,height,landscape,cols,rows,size,gap,cells,titleTop,scoreTop:titleTop+39,metaTop:titleTop+67,
  boardTop,boardBottom,felt,statusTop:height-130,controlsTop:height-94,settingsTop:height-44,controlHeight,feasible};
}
export type Layout=ReturnType<typeof fitLayout>;
