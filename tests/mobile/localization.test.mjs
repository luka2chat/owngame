import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import vm from 'node:vm';
import {root, localizationFiles} from '../../scripts/mobile/localization.mjs';

const source = await fs.readFile(path.join(root,'apps/android/assets/localization.js'),'utf8');
const data = JSON.parse(await fs.readFile(path.join(root,'scripts/mobile/localization.json'),'utf8'));
// The standalone Android source export intentionally excludes the iOS client.
const hasIOS = await fs.stat(path.join(root,'apps/ios')).then(()=>true,()=>false);
function runtime(language, nativeLanguage) {
  const window = nativeLanguage ? {Owngame:{language:()=>nativeLanguage}} : {};
  vm.runInNewContext(source,{window,navigator:{language}});
  return window;
}
test('mobile language selection follows the app/system language, with English fallback',()=>{
  for(const locale of ['zh-CN','zh-Hans','zh-TW']) assert.equal(runtime(locale).AppText.text('游戏库'),'游戏库');
  for(const locale of ['en-US','en-GB','fr-FR','ja-JP']) assert.equal(runtime(locale).AppText.text('游戏库'),'Library');
  assert.equal(runtime('zh-CN','en').AppText.language,'en');
  const window=runtime('en-US'); window.__appLanguage='zh-Hans';
  assert.equal(window.AppText.text('游戏库'),'游戏库');
  window.__appLanguage='en'; assert.equal(window.AppText.text('游戏库'),'Library');
});
test('translated status templates preserve progress, counts and game identifiers',()=>{
  const {AppText:t}=runtime('en-US');
  assert.equal(t.text('下载中 {percent}%',{percent:37}),'Downloading 37%');
  assert.equal(t.text('{count} 款游戏',{count:1}),'1 game');
  assert.equal(t.text('{count} 款游戏',{count:18}),'18 games');
  assert.equal(t.text('下载游戏：{title}',{title:'<img src=x>'}),'Download <img src=x>');
  assert.equal(t.game('signal-harbor').title,'Signal Harbor');
  assert.equal(t.game('unknown-game'),undefined);
  assert.equal(t.text('A new user game'),'A new user game');
});
test('JavaScript, Android and iOS localization outputs match the canonical copy',async()=>{
  for(const [file,text] of await localizationFiles()) {
    if(file.startsWith('apps/ios/') && !hasIOS) continue;
    assert.equal(await fs.readFile(path.join(root,file),'utf8'),text,file);
  }
  for(const g of Object.values(data.games)) assert(g.title && g.originalTitle && g.description);
});
test('all native Chinese copy is routed through translation and has an English entry',async()=>{
  const files=['apps/android/src/dev/owngame/app/MainActivity.java'];
  if(hasIOS) for(const folder of ['Core','App']) for(const file of await fs.readdir(path.join(root,'apps/ios/Sources',folder))) {
    if(file.endsWith('.swift') && file!=='AppText.swift') files.push('apps/ios/Sources/'+folder+'/'+file);
  }
  for(const file of files) {
    const text=await fs.readFile(path.join(root,file),'utf8');
    for(const match of text.matchAll(/"(?:\\.|[^"\\])*"/g)) {
      if(!/\p{Script=Han}/u.test(match[0])) continue;
      const key=JSON.parse(match[0]);
      assert(text.slice(Math.max(0,match.index-13),match.index).endsWith('AppText.text('),file+': '+key);
      assert(data.messages[key],file+': untranslated '+key);
    }
  }
});
