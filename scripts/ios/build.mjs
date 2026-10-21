import path from 'node:path';
import os from 'node:os';
import {spawnSync} from 'node:child_process';
const root = path.resolve(import.meta.dirname,'../..');
const args = process.argv.slice(2);
let sdk = 'iphonesimulator', out = process.env.OWNGAME_IOS_BUILD_DIR || path.join(os.tmpdir(),'owngame-ios-build');
let team, device;
const usage = 'Usage: ios:build [--sdk iphonesimulator|iphoneos] [--out BUILD_DIRECTORY] [--team TEAM_ID --device DEVICE_ID]';
for (let i=0;i<args.length;i++) {
  if(args[i] === '--sdk' && ['iphoneos','iphonesimulator'].includes(args[i+1])) sdk=args[++i];
  else if(args[i] === '--out' && args[i+1]) out=path.resolve(args[++i]);
  else if(args[i] === '--team' && /^[A-Z0-9]{10}$/.test(args[i+1]||'')) team=args[++i];
  else if(args[i] === '--device' && /^[A-Fa-f0-9-]{20,40}$/.test(args[i+1]||'')) device=args[++i];
  else throw Error(usage);
}
if ((team || device) && !(team && device && sdk === 'iphoneos')) throw Error('Signing requires --sdk iphoneos, --team and --device together.');
// Keep the small signed app on a local filesystem: SMB can attach Finder
// metadata that codesign rejects. Large intermediates still use --out.
const products = team ? path.resolve(process.env.OWNGAME_IOS_PRODUCT_DIR || path.join(os.tmpdir(),'owngame-ios-signed-products')) : null;
const probe = spawnSync('xcodebuild',['-version'],{encoding:'utf8'});
if(probe.status !== 0) throw Error('Full Xcode with an iOS SDK is required. Install Xcode, then select it using Xcode Settings > Locations > Command Line Tools. No iOS build was produced.');
function run(command,args) { const result=spawnSync(command,args,{cwd:root,stdio:'inherit'}); if(result.status!==0) process.exit(result.status||1); }
run(process.execPath,['scripts/ios/prepare.mjs']);
run('xcodebuild',['-project','apps/ios/Owngame.xcodeproj','-scheme','owngame','-configuration','Debug','-sdk',sdk,
  '-destination',device ? 'platform=iOS,id='+device : sdk==='iphonesimulator'?'generic/platform=iOS Simulator':'generic/platform=iOS',
  // Command-line validation does not need the IDE index. Its concurrent record
  // replacement fails on some SMB shares even when object/module writes work.
  '-derivedDataPath',out,'COMPILER_INDEX_STORE_ENABLE=NO',
  ...(team ? ['CONFIGURATION_BUILD_DIR='+products,'DEVELOPMENT_TEAM='+team,'CODE_SIGNING_ALLOWED=YES','-allowProvisioningUpdates','-allowProvisioningDeviceRegistration'] : ['CODE_SIGNING_ALLOWED=NO']), 'build']);
console.log(team ? 'Signed device app built: '+path.join(products,'owngame.app') : 'Unsigned app built. Device installation and TestFlight require your own Apple signing team.');
