import fs from 'node:fs/promises';
import path from 'node:path';
import {spawnSync} from 'node:child_process';

const args=process.argv.slice(2);
let app,identity;
for(let i=0;i<args.length;i++) {
  if(args[i]==='--app' && args[i+1]) app=path.resolve(args[++i]);
  else if(args[i]==='--identity' && args[i+1]) identity=args[++i];
  else throw Error('Usage: prepare-test-runner --app UITEST_RUNNER_APP --identity SIGNING_IDENTITY');
}
if(!app || !identity || !path.basename(app).endsWith('UITests-Runner.app')) throw Error('An explicit UI test runner and signing identity are required.');
function run(cmd,args,capture=false) {
  const r=spawnSync(cmd,args,{encoding:'utf8',stdio:capture?'pipe':'inherit'});
  if(r.status!==0) throw Error(cmd+' failed: '+(r.stderr||r.status));
  return r.stdout?.trim();
}
const bundle=run('plutil',['-extract','CFBundleIdentifier','raw','-o','-',path.join(app,'Info.plist')],true);
if(!bundle.endsWith('.xctrunner')) throw Error('Refusing a non-test app.');
const platform=run('xcrun',['--sdk','iphoneos','--show-sdk-platform-path'],true);
// Xcode 26 test support references these SDK libraries, but its default runner
// packaging omits them for older phones whose developer image lacks them.
for(const relative of ['Developer/usr/lib/lib_TestingInterop.dylib','Developer/Library/Frameworks/_Testing_Foundation.framework']) {
  const source=path.join(platform,relative);
  try { await fs.access(source); } catch { continue; }
  const destination=path.join(app,'Frameworks',path.basename(source));
  run('ditto',[source,destination]);
  run('codesign',['--force','--sign',identity,'--timestamp=none',destination]);
}
run('codesign',['--force','--sign',identity,'--preserve-metadata=entitlements,requirements,flags,runtime','--timestamp=none',app]);
run('codesign',['--verify','--deep','--strict',app]);
console.log('UI test runner dependencies prepared; signature verified.');
