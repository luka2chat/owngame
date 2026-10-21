import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import {assertIOSSource,readIOSPublicFiles} from '../../scripts/ios/public-source.mjs';
import {projectFiles,root} from '../../scripts/ios/project.mjs';

test('iOS source is explicit, contains every Swift source, and excludes generated/signing state', async () => {
  const files = await readIOSPublicFiles(root);
  for(const folder of ['apps/ios/Sources/Core','apps/ios/Sources/App','apps/ios/Tests','apps/ios/UITests']) {
    for(const file of await fs.readdir(path.join(root,folder))) assert(files.has(folder+'/'+file));
  }
  for(const file of files.keys()) assert(!/Resources\/|xcuserdata|\.ipa$|\.mobileprovision$/.test(file));
  for(const relative of ['keys.p12','app.ipa','developer.mobileprovision','apps/ios/.swiftpm/config.json','apps/ios/../private.swift']) {
    assert.throws(()=>assertIOSSource(relative,Buffer.from('private')));
  }
  for(const content of [['','Users','private','code'].join('/'),'https://' + [192,168,1,20].join('.'),
    ['https:','','localhost','api'].join('/'),'http://' + 'localhost:9000']) {
    assert.throws(()=>assertIOSSource('apps/ios/Info.plist',Buffer.from(content)));
  }
});
test('checked-in Xcode project and scheme match all actual sources', async () => {
  for (const [relative,text] of await projectFiles()) assert.equal(await fs.readFile(path.join(root,'apps/ios',relative),'utf8'),text);
});
test('native bridge is confined to the bundled library and ATS remains enabled', async () => {
  const source = file=>fs.readFile(path.join(root,'apps/ios',file),'utf8');
  const library = await source('Sources/App/LibraryViewController.swift');
  assert(library.includes('message.frameInfo.isMainFrame, message.frameInfo.request.url == shell'));
  const game = await source('Sources/App/GameViewController.swift');
  assert(!/\.add\(self, name:|addScriptMessageHandler/.test(game));
  assert(game.includes('compileContentRuleList'));
  const info = await source('Info.plist');
  assert(info.includes('NSAllowsLocalNetworking'));
  assert(!info.includes('NSAllowsArbitraryLoads'));
  const privacy = await source('PrivacyInfo.xcprivacy');
  assert(privacy.includes('<key>NSPrivacyTracking</key><false/>'));
});
