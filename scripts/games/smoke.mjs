import '../lib/codex-browser-preflight.mjs';
import fs from 'node:fs/promises';
import path from 'node:path';
import http from 'node:http';
import {chromium} from 'playwright';
import {readGameEntries} from '../web/catalog.mjs';
const root=path.resolve(process.argv[2] || '.');
const output=path.resolve(process.env.OWNGAME_GAME_EVIDENCE || 'artifacts/game-source');
const index=JSON.parse(await fs.readFile(path.join(root,'games.json')));
await fs.mkdir(output,{recursive:true});
const mime={'.html':'text/html','.js':'text/javascript','.css':'text/css','.json':'application/json',
  '.png':'image/png','.jpg':'image/jpeg','.ttf':'font/ttf','.woff2':'font/woff2','.glb':'model/gltf-binary'};
const server=http.createServer(async(req,res)=>{try {
  const file=path.resolve(root,'.'+decodeURIComponent(new URL(req.url,'http://local').pathname));
  if(!file.startsWith(root+path.sep)) throw Error('Invalid path');
  const p=(await fs.stat(file)).isDirectory()?path.join(file,'index.html'):file;
  res.setHeader('Content-Type',mime[path.extname(p)] || 'application/octet-stream');
  res.end(await fs.readFile(p));
}catch{res.writeHead(404);res.end('Missing file');}});
await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
let browser;
const results=[];
const catalog=await readGameEntries(root);
try {
  browser=await chromium.launch({headless:true,executablePath:process.env.OWNGAME_CHROME_PATH,args:['--enable-unsafe-swiftshader']});
  const selected=process.env.OWNGAME_GAME_IDS?.split(',');
  for(const game of index.games.filter(g=>g.kind!=='unity' && (!selected || selected.includes(g.id)))) {
    const pc=catalog.find(e=>e.id===game.id)?.platforms.includes('pc');
    const context=await browser.newContext({viewport:pc?{width:1280,height:720}:{width:390,height:844}}),page=await context.newPage();
    const errors=[],missing=[],external=[];
    page.on('pageerror',e=>errors.push(String(e)));
    page.on('response',r=>{if(r.status()>=400)missing.push({url:r.url(),status:r.status()});});
    page.on('request',r=>{if(/^https?:/.test(r.url())&&!r.url().startsWith('http://127.0.0.1:'))external.push(r.url());});
    await page.goto(`http://127.0.0.1:${server.address().port}/${game.path}/dist/`,{waitUntil:'networkidle',timeout:90000});
    await page.waitForFunction(()=>{
      const keys=['__owngameBoard','__owngameChimes','__owngameSlide','__signalHarbor','__owngameMerge',
        '__owngameMemory','__owngameSerpent','__owngameRally','__owngameBolts','__owngameFaune','__owngameRace',
        '__owngameNeon','__crowdRunner','__arrowEscape'];
      const api=keys.map(k=>window[k]).find(x=>typeof x?.snapshot==='function');
      const s=api?.snapshot();
      return s ? s.ready!==false && s.atlasReady!==false : document.querySelectorAll('button').length>0;
    },null,{timeout:45000});
    if(game.id==='tidal-reclaim')await page.getByRole('button',{name:'开始回收行动'}).waitFor({timeout:90000});
    const starts=page.getByRole('button').filter({hasText:/^(开始|启程|出发|继续|进入|接着)/});
    let clicked=false;
    for(const start of await starts.all()) {
      if(!await start.isVisible() || !await start.isEnabled())continue;
      try{await start.click({trial:true,timeout:700});}catch{continue;}
      await start.click();clicked=true;break;
    }
    if(game.id==='tidal-reclaim'){
      await page.waitForFunction(()=>window.__game?.game.mode==='playing');
      const before=await page.evaluate(()=>({x:window.__game.game.player.position.x,shots:window.__game.game.shots}));
      await page.keyboard.down('d');await page.waitForTimeout(450);await page.keyboard.up('d');
      await page.mouse.down();await page.waitForTimeout(300);await page.mouse.up();
      const valid=await page.evaluate(b=>Math.abs(window.__game.game.player.position.x-b.x)>.1&&window.__game.game.shots>b.shots,before);
      if(!valid)errors.push('PC movement/fire did not respond');
    }
    await page.keyboard.press('ArrowRight');
    await page.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));
    await page.screenshot({path:path.join(output,game.id+'.png')});
    const result={id:game.id,status:errors.length||missing.length||external.length?'failed':'succeeded',
      errors,missing,external,started_with_pointer:clicked,keyboard_input:true};
    results.push(result);console.log(JSON.stringify(result));
    await context.close();
  }
  const report={status:results.every(r=>r.status==='succeeded')?'succeeded':'failed',games:results,
    scope:'Portable Web builds: load, asset resolution, one start/control input and screenshots; full gameplay, real phone and Unity editor are not repeated by this check.'};
  await fs.writeFile(path.join(output,'verification.json'),JSON.stringify(report,null,2)+'\n');
  if(report.status!=='succeeded')throw Error('Portable game smoke check failed');
}finally{await browser?.close();await new Promise(resolve=>server.close(resolve));}
