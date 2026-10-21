import fs from 'node:fs/promises';
import path from 'node:path';
import {readIOSPublicFiles} from './public-source.mjs';
import {readPublicFiles} from '../android/public-source.mjs';
const root = path.resolve(import.meta.dirname,'../..');
const args = process.argv.slice(2);
if(args.length && (args.length !== 2 || args[0] !== '--out')) throw Error('Usage: ios:check [--out NEW_DIRECTORY]');
const files = await readIOSPublicFiles(root);
if (args.length) {
  // The shared shell inputs and its sanitizer are part of a reproducible iOS source delivery.
  const combined = new Map([...await readPublicFiles(root),...files]);
  for (const relative of ['LICENSE','THIRD_PARTY_NOTICES.md','.github/workflows/ios.yml']) combined.set(relative,await fs.readFile(path.join(root,relative)));
  const out = path.resolve(args[1]);
  if (out === root || out.startsWith(root + path.sep) || root.startsWith(out + path.sep)) throw Error('Use a new directory outside the source workspace');
  await fs.mkdir(out);
  try {
    for (const [relative,bytes] of combined) {
      const target = path.join(out,relative); await fs.mkdir(path.dirname(target),{recursive:true}); await fs.writeFile(target,bytes);
    }
    const scripts = {'ios:prepare':'node scripts/ios/prepare.mjs','ios:build':'node scripts/ios/build.mjs',
      'ios:check':'node scripts/ios/export-source.mjs && node --test tests/ios/*.test.mjs tests/mobile/*.test.mjs','test:ios':'node scripts/ios/test.mjs'};
    await fs.writeFile(path.join(out,'package.json'),JSON.stringify({name:'owngame-ios-source',private:true,type:'module',scripts},null,2)+'\n');
    await fs.writeFile(path.join(out,'.gitignore'),'apps/ios/Resources/\napps/ios/.build/\napps/ios/.swiftpm/\n**/xcuserdata/\n*.xcuserstate\n*.ipa\n*.p12\n*.mobileprovision\n*.xcarchive/\nartifacts/\n');
  } catch (error) { await fs.rm(out,{recursive:true,force:true}); throw error; }
}
console.log(JSON.stringify({status:'verified',ios_files:files.size,exported:Boolean(args.length)}));
