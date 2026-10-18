const canvas=document.getElementById('game'),loading=document.getElementById('loading'),progress=document.getElementById('progress'),status=document.getElementById('status'),error=document.getElementById('error'),start=document.getElementById('start'),retry=document.getElementById('retry');
canvas.addEventListener('contextmenu',e=>e.preventDefault());
const blobs=[];
const hash=async bytes=>Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',bytes)),b=>b.toString(16).padStart(2,'0')).join('');
async function launch(){
 start.hidden=true;retry.hidden=true;error.textContent='';
 document.getElementById('download-progress').hidden=false;status.hidden=false;
 const began=performance.now();
 try{
  if(!globalThis.DecompressionStream)throw Error('请使用支持解压缩功能的新版 Chrome、Edge、Firefox 或 Safari。');
  const manifestResponse=await fetch('assets.json');if(!manifestResponse.ok)throw Error('资源清单暂时无法读取。');
  const {assets}=await manifestResponse.json();
  const total=Object.values(assets).flatMap(a=>a.chunks).reduce((n,c)=>n+c.bytes,0);let received=0;
  const config={};
  // One asset at a time bounds the peak memory used by compressed buffers.
  for(const [key,asset] of Object.entries(assets)){
   const compressed=[];
   for(const chunk of asset.chunks){
    const response=await fetch(chunk.path);if(!response.ok)throw Error('下载中断，请重试。');
    const reader=response.body.getReader(),parts=[];let size=0;
    for(;;){const {done,value}=await reader.read();if(done)break;parts.push(value);size+=value.length;received+=value.length;progress.value=.75*received/total;status.textContent=`正在收集星光 ${Math.min(100,Math.round(received/total*100))}%`;}
    const bytes=new Uint8Array(await new Blob(parts).arrayBuffer());
    if(size!==chunk.bytes||await hash(bytes)!==chunk.sha256)throw Error('资源校验未通过，请刷新重试。');
    compressed.push(bytes);
   }
   status.textContent='正在展开小小星球……';
   const raw=await new Response(new Blob(compressed).stream().pipeThrough(new DecompressionStream('gzip'))).arrayBuffer();
   if(raw.byteLength!==asset.bytes||await hash(raw)!==asset.sha256)throw Error('解压校验未通过，请刷新重试。');
   const url=URL.createObjectURL(new Blob([raw],{type:asset.mime}));blobs.push(url);config[key]=url;
  }
  const instance=await createUnityInstance(canvas,{...config,streamingAssetsUrl:'StreamingAssets',companyName:'DefaultCompany',productName:'LittleOrbit',productVersion:'0.1.0',devicePixelRatio:Math.min(devicePixelRatio||1,1.5),showBanner:(message,type)=>{if(type==='error')error.textContent=message;else console.warn(message);}},value=>{progress.value=.75+value*.25;status.textContent='正在开启旅程 '+Math.round(value*100)+'%';});
  loading.remove();document.getElementById('credits').hidden=false;canvas.focus();
  globalThis.starLetters={ready:true,loadedMs:Math.round(performance.now()-began)};
  // Unity owns the instance; keep blob URLs valid for its entire lifetime.
  addEventListener('pagehide',()=>{for(const url of blobs)URL.revokeObjectURL(url);},{once:true});
 }catch(e){for(const url of blobs)URL.revokeObjectURL(url);blobs.length=0;status.textContent='星光暂时没有连上';error.textContent=String(e.message||e);retry.hidden=false;console.error(e);}
}
start.addEventListener('click',launch,{once:true});retry.addEventListener('click',()=>location.reload());
start.disabled=false;
