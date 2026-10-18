import { sha256, fetchBytes, downloadChunks } from './download.mjs';
const canvas=document.getElementById('game'),loading=document.getElementById('loading'),progress=document.getElementById('progress'),status=document.getElementById('status'),error=document.getElementById('error'),start=document.getElementById('start'),retry=document.getElementById('retry');
canvas.addEventListener('contextmenu',e=>e.preventDefault());
const blobs=[];
let running=false, engineStarted=false;
async function launch(){
 if(running)return;
 running=true; start.hidden=true;retry.hidden=true;error.textContent='';
 document.getElementById('download-progress').hidden=false;status.hidden=false;progress.value=0;
 status.textContent='正在打开星际邮袋……';
 const began=performance.now(), diagnostics={retries:0,phase:'manifest'};
 globalThis.starLetters={ready:false,...diagnostics};
 try{
  if(!globalThis.DecompressionStream)throw Error('请使用支持解压缩功能的新版 Chrome、Edge、Firefox 或 Safari。');
  let manifestBytes;
  for(let attempt=1;attempt<=3;attempt++){
   try{manifestBytes=await fetchBytes('assets.json',{maxBytes:256*1024,reload:attempt>1});break;}
   catch(e){if(attempt===3)throw e;status.textContent='正在重新打开邮袋……';}
  }
  const {assets}=JSON.parse(new TextDecoder().decode(manifestBytes));
  const allChunks=Object.values(assets).flatMap(a=>a.chunks);
  if(!allChunks.length||allChunks.some(c=>!/^Build\/[\w-]+\.bin$/.test(c.path)||!Number.isSafeInteger(c.bytes)||c.bytes<=0||c.bytes>2*1024*1024||!/^[a-f0-9]{64}$/.test(c.sha256)))throw Error('资源清单暂时不可用。');
  const total=allChunks.reduce((n,c)=>n+c.bytes,0);let completed=0;
  let cache;try{cache=await caches.open('star-letters-verified-chunks-v1');}catch{}
  const config={};
  for(const [key,asset] of Object.entries(assets)){
   diagnostics.phase='download';
   const compressed=await downloadChunks(asset.chunks,{baseUrl:location.href,cache,
    onProgress:received=>{progress.value=.75*(completed+received)/total;status.textContent=`正在收集星光 ${Math.round((completed+received)/total*100)}%`;},
    onRetry:()=>{diagnostics.retries++;status.textContent='信号有点远，正在自动重连……';globalThis.starLetters={ready:false,...diagnostics};}
   });
   completed+=asset.chunks.reduce((n,c)=>n+c.bytes,0);
   diagnostics.phase='unpack';status.textContent='正在展开小小星球……';
   const raw=await new Response(new Blob(compressed).stream().pipeThrough(new DecompressionStream('gzip'))).arrayBuffer();
   if(raw.byteLength!==asset.bytes||await sha256(raw)!==asset.sha256)throw Error('解压校验未通过，请重试。');
   const url=URL.createObjectURL(new Blob([raw],{type:asset.mime}));blobs.push(url);config[key]=url;
  }
  diagnostics.phase='engine';engineStarted=true;
  await createUnityInstance(canvas,{...config,streamingAssetsUrl:'StreamingAssets',companyName:'DefaultCompany',productName:'LittleOrbit',productVersion:'0.1.0',devicePixelRatio:Math.min(devicePixelRatio||1,1.5),showBanner:(message,type)=>{if(type==='error')error.textContent=message;else console.warn(message);}},value=>{progress.value=.75+value*.25;status.textContent='正在开启旅程 '+Math.round(value*100)+'%';});
  loading.remove();document.getElementById('credits').hidden=false;canvas.focus();
  globalThis.starLetters={ready:true,loadedMs:Math.round(performance.now()-began),retries:diagnostics.retries};
  // Bound our own verified cache to the current game's chunks; never touch site/offline caches.
  if(cache){const keep=new Set(allChunks.map(c=>new URL('/__star-letters-chunks/'+c.sha256,location.href).href));cache.keys().then(keys=>Promise.all(keys.filter(k=>!keep.has(k.url)).map(k=>cache.delete(k)))).catch(()=>{});}
  addEventListener('pagehide',()=>{for(const url of blobs)URL.revokeObjectURL(url);},{once:true});
 }catch(e){for(const url of blobs)URL.revokeObjectURL(url);blobs.length=0;status.textContent='星光暂时没有连上';error.textContent=String(e.message||e);retry.textContent=engineStarted?'重新打开 ↻':'继续接收 ↻';retry.hidden=false;globalThis.starLetters={ready:false,...diagnostics,error:String(e.message||e)};console.error(e);}
 finally{running=false;}
}
start.addEventListener('click',launch,{once:true});retry.addEventListener('click',()=>engineStarted?location.reload():launch());
start.disabled=false;
