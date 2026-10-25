import path from 'node:path';
import os from 'node:os';
import fs from 'node:fs';
import {spawnSync} from 'node:child_process';
const root = path.resolve(import.meta.dirname,'../..');
const cache = process.env.OWNGAME_IOS_TEST_DIR || path.join(os.tmpdir(),'owngame-ios-tests');
const args = ['test','--disable-index-store','--package-path',path.join(root,'apps/ios'),'--scratch-path',path.join(cache,'build'),
  '--cache-path',path.join(cache,'cache'),'--config-path',path.join(cache,'config'),'--security-path',path.join(cache,'security')];
if(process.env.OWNGAME_SWIFT_BUILD_SYSTEM) args.push('--build-system',process.env.OWNGAME_SWIFT_BUILD_SYSTEM);
const moduleCache = process.env.OWNGAME_IOS_MODULE_CACHE || path.join(cache,'modules');
args.push('-Xswiftc','-module-cache-path','-Xswiftc',moduleCache);
// Only SwiftPM's nested build sandbox is disabled within Codex's existing Seatbelt sandbox.
// The process remains inside Codex's sandbox; no system security settings change.
if(process.env.CODEX_SANDBOX === 'seatbelt') args.push('--disable-sandbox');
// Some Command Line Tools releases omit this macro search path from SwiftPM's defaults.
const developer = spawnSync('xcode-select',['-p'],{encoding:'utf8'}).stdout?.trim();
if(developer) {
  const candidates = [path.join(developer,'usr/lib/swift/host/plugins/testing'),path.resolve(developer,'../Toolchains/XcodeDefault.xctoolchain/usr/lib/swift/host/plugins/testing')];
  for(const directory of candidates) if(fs.existsSync(path.join(directory,'libTestingMacros.dylib'))) {
    args.push('-Xswiftc','-plugin-path','-Xswiftc',directory); break;
  }
}
const result = spawnSync('swift',args,{cwd:root,stdio:'inherit',env:{...process.env,
  CLANG_MODULE_CACHE_PATH:moduleCache,SWIFTPM_MODULECACHE_OVERRIDE:moduleCache}});
process.exit(result.status??1);
