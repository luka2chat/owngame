import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import {spawnSync} from 'node:child_process';
import {readPublicFiles} from '../android/public-source.mjs';
import {root, projectFiles} from './project.mjs';
import {localizationFiles} from '../mobile/localization.mjs';
for (const [relative, content] of await localizationFiles()) await fs.writeFile(path.join(root, relative), content);

// Reuse the reviewed, metadata-sanitized Android artwork and shell without copying private production inputs.
const files = await readPublicFiles(root);
const destination = path.join(root, 'apps/ios/Resources');
await fs.mkdir(destination, {recursive:true});
await fs.rm(path.join(destination, 'Shell'), {recursive:true,force:true});
for (const [relative, bytes] of files) {
  if (!relative.startsWith('apps/android/assets/')) continue;
  const name = relative.slice('apps/android/assets/'.length);
  const output = path.join(destination, 'Shell', name);
  await fs.mkdir(path.dirname(output), {recursive:true});
  let content = bytes;
  if (name === 'index.html') content = Buffer.from(bytes.toString().replace('<meta name="theme-color"',
    '<meta http-equiv="Content-Security-Policy" content="default-src \'self\'; script-src \'self\'; style-src \'self\' \'unsafe-inline\'; img-src \'self\' data:; connect-src \'none\'; frame-src \'none\'; object-src \'none\'; base-uri \'none\'" />\n    <meta name="theme-color"'));
  if (name === 'index.html') content = Buffer.from(content.toString().replace('检查 App 更新</button>', '关于苹果测试版</button>'));
  if (name === 'app.css') content = Buffer.concat([bytes, Buffer.from('\n/* iPhone notches, home indicator, and iPad split view use the same shell. */\n:root { --safe-top: max(12px, env(safe-area-inset-top)); --safe-bottom: max(8px, env(safe-area-inset-bottom)); }\nbody { padding-left: env(safe-area-inset-left); padding-right: env(safe-area-inset-right); }\n')]);
  await fs.writeFile(output, content);
}
const icon = path.join(destination, 'Assets.xcassets/AppIcon.appiconset');
await fs.mkdir(icon, {recursive:true});
const moduleCache = path.join(os.tmpdir(),'owngame-ios-icon-cache');
const result = spawnSync('swift', ['-module-cache-path',moduleCache,path.join(root,'scripts/ios/icon.swift'),
  path.join(root,'apps/android/res/drawable-nodpi/arcade_mascot.png'),path.join(icon,'app-icon.png')],
  {encoding:'utf8',env:{...process.env,CLANG_MODULE_CACHE_PATH:moduleCache}});
if (result.status !== 0) throw Error('macOS Swift/CoreGraphics is required to package the existing mascot icon: ' + (result.stderr || result.error));
await fs.writeFile(path.join(icon,'Contents.json'), JSON.stringify({images:[{filename:'app-icon.png',idiom:'universal',platform:'ios',size:'1024x1024'}],info:{author:'owngame',version:1}},null,2)+'\n');
await fs.writeFile(path.join(destination,'Assets.xcassets/Contents.json'), JSON.stringify({info:{author:'owngame',version:1}})+'\n');
for (const [file, text] of await projectFiles()) await fs.writeFile(path.join(root,'apps/ios',file),text);
console.log('iOS resources prepared from the existing reviewed brand assets');
