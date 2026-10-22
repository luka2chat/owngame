import '../lib/codex-browser-preflight.mjs';
import {chromium,devices} from 'playwright';
import fs from 'node:fs/promises';
import assert from 'node:assert/strict';
const base=process.env.OWNGAME_PC_BASE??'http://127.0.0.1:3021';
const out=process.env.OWNGAME_PC_OUT??'artifacts/web/pc-handoff-preview';
await fs.mkdir(out,{recursive:true});
let browser;const errors=[],results=[];
try{
 browser=await chromium.launch({headless:true,channel:process.platform==='darwin'?'chrome':undefined});
 const phone=await browser.newContext({...devices['iPhone 13'],permissions:['clipboard-read','clipboard-write']});
 const page=await phone.newPage();page.on('pageerror',e=>errors.push(e.message));
 const requests=[];page.on('request',r=>{if(new URL(r.url()).pathname.startsWith('/games/'))requests.push(r.url())});
 await page.goto(base+'/?lang=zh-CN');await page.locator('.game-card.tidal-reclaim').waitFor();
 assert.deepEqual(await page.locator('.game-card').evaluateAll(cards=>cards.slice(0,2).map(c=>c.querySelector('h3').textContent)),['潮汐回收站','星野来信']);
 for(const id of ['tidal-reclaim','star-letters']){const card=page.locator('.game-card.'+id);assert(await card.getByText('请在电脑上游玩',{exact:true}).isVisible());assert.equal(await card.locator('[data-download-game]').count(),0)}
 await page.screenshot({path:out+'/phone-library.png',fullPage:false});
 for(const id of ['tidal-reclaim','star-letters'])for(const lang of ['zh-CN','en']){
  await page.goto(base+'/play?game='+id+'&platform=pc&lang='+lang);
  await page.locator('#computer-notice').waitFor();
  assert.equal(await page.locator('#stage iframe').count(),0);
  assert.equal(await page.locator('#download').isVisible(),false);
  assert.equal(await page.locator('#enter-game').isVisible(),false);
  assert(await page.locator('#favorite').isVisible());
  assert(await page.locator('#computer-notice h2').innerText()===(lang==='en'?'Play on a computer':'请在电脑上游玩'));
  assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
  await page.screenshot({path:out+'/'+id+'-'+lang+'.png',fullPage:true});
  await page.locator('#copy-computer-link').click();
  const link=await page.evaluate(()=>navigator.clipboard.readText());assert.equal(new URL(link).searchParams.get('game'),id);
  results.push({id,lang,mobileReminder:true,copyLink:true});
 }
 // Clipboard rejection must leave a selectable URL, not a dead button.
 await page.evaluate(()=>Object.defineProperty(navigator,'clipboard',{value:{writeText:async()=>{throw Error('denied')}},configurable:true}));
 await page.locator('#copy-computer-link').click();await page.locator('.computer-link').waitFor();
 assert.equal(new URL(await page.locator('.computer-link').inputValue()).searchParams.get('game'),'star-letters');
 await page.locator('#favorite').click();assert.equal(await page.locator('#favorite').getAttribute('aria-pressed'),'true');
 assert.equal(await page.evaluate(()=>localStorage.getItem('owngame:recent')),null);
 await page.getByRole('link',{name:'Browse mobile games',exact:true}).click();await page.locator('#games[data-state="ready"]').waitFor();
 assert.equal(await page.locator('.game-card').count(),17);assert.equal(await page.locator('.game-card.tidal-reclaim').count(),0);assert.deepEqual(requests,[]);
 await phone.close();
 const tablet=await browser.newContext({...devices['iPad Pro 11']});const tp=await tablet.newPage();await tp.goto(base+'/play?game=tidal-reclaim&lang=zh-CN');await tp.locator('#computer-notice').waitFor();assert.equal(await tp.locator('#stage iframe').count(),0);await tp.screenshot({path:out+'/tablet.png'});await tablet.close();
 const desktop=await browser.newContext({viewport:{width:1440,height:1000}});const dp=await desktop.newPage();dp.on('pageerror',e=>errors.push(e.message));
 await dp.goto(base+'/?lang=zh-CN');await dp.locator('.game-card.tidal-reclaim').waitFor();assert.equal(await dp.locator('.computer-hint').count(),0);await dp.screenshot({path:out+'/desktop-library.png'});
 await dp.goto(base+'/play?game=tidal-reclaim&lang=zh-CN');await dp.frameLocator('#stage iframe').getByRole('button',{name:'开始回收行动'}).waitFor({timeout:90000});assert.equal(await dp.locator('#computer-notice').count(),0);
 await dp.setViewportSize({width:540,height:800});assert.equal(await dp.locator('#stage iframe').count(),1);assert.equal(await dp.locator('#computer-notice').count(),0);
 await dp.goto(base+'/play?game=star-letters&lang=zh-CN');await dp.locator('#stage iframe').waitFor();assert.equal(await dp.locator('#computer-notice').count(),0);await desktop.close();
 assert.deepEqual(errors,[]);await fs.writeFile(out+'/report.json',JSON.stringify({passed:true,base,results,noMobileGameDownloads:true,clipboardFallback:true,favorites:true,mobileFilterGames:17,tablet:true,narrowDesktopPreserved:true,errors},null,2));console.log('PC HANDOFF PASSED');
}finally{await browser?.close()}
