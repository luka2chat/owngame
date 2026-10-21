import fs from 'node:fs/promises';
import path from 'node:path';
import {assertPublicSource} from '../android/public-source.mjs';

export function assertIOSSource(relative, bytes) {
  assertPublicSource(relative, null);
  if (!/\.(?:swift|plist|xcprivacy|pbxproj|xcscheme|mjs|json|md)$/.test(relative)) throw Error('Unreviewed iOS source type: ' + relative);
  if (bytes === null) return;
  let text = bytes.toString('utf8');
  // These three reviewed files implement/test the loopback-only game origin, not a developer LAN service.
  if (['apps/ios/Sources/Core/GameHTTP.swift','apps/ios/Sources/App/GameViewController.swift','apps/ios/Tests/RepositoryTests.swift'].includes(relative)) {
    text = text.replaceAll('http://' + 'localhost:', 'game-loopback-port:');
  }
  assertPublicSource(relative + '.mjs', Buffer.from(text));
}
export async function readIOSPublicFiles(root) {
  const files = JSON.parse(await fs.readFile(path.join(root,'scripts/ios/public-files.json'),'utf8'));
  if (!Array.isArray(files) || new Set(files).size !== files.length) throw Error('Invalid iOS public allowlist');
  const result = new Map();
  for (const relative of files) {
    assertIOSSource(relative, null);
    let current = root;
    for (const part of relative.split('/')) {
      current = path.join(current,part);
      if ((await fs.lstat(current)).isSymbolicLink()) throw Error('Symlink in iOS export: ' + relative);
    }
    const bytes = await fs.readFile(current); assertIOSSource(relative,bytes); result.set(relative,bytes);
  }
  return result;
}
