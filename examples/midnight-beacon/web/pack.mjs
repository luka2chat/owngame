import fs from 'node:fs/promises';
import path from 'node:path';
import {gzipSync, gunzipSync} from 'node:zlib';
import {createHash} from 'node:crypto';
const [input, output] = process.argv.slice(2);
if (!input || !output) throw Error('Usage: node web/pack.mjs GODOT_WEB_EXPORT NEW_OUTPUT');
await fs.mkdir(output, {recursive: false});
const sha = b => createHash('sha256').update(b).digest('hex');
const wasm = await fs.readFile(path.join(input, 'index.wasm'));
const packed = gzipSync(wasm, {level: 9});
if (packed.length > 25 * 1024 * 1024 || !gunzipSync(packed).equals(wasm)) throw Error('Invalid compressed engine');
for (const name of ['index.js', 'index.pck', 'index.png', 'index.audio.worklet.js', 'index.audio.position.worklet.js']) {
  await fs.copyFile(path.join(input, name), path.join(output, name));
}
const html = await fs.readFile(path.join(input, 'index.html'), 'utf8');
if (!html.includes('<script src="index.js"></script>')) throw Error('Unsupported Godot HTML shell');
await fs.writeFile(path.join(output, 'index.html'), html.replace('<script src="index.js"></script>', '<script src="engine-loader.js"></script>\n<script src="index.js"></script>'));
await fs.writeFile(path.join(output, 'engine.bin'), packed);
await fs.writeFile(path.join(output, 'engine.json'), JSON.stringify({encoding:'gzip', bytes:wasm.length, sha256:sha(wasm), packedBytes:packed.length, packedSha256:sha(packed)})+'\n');
await fs.copyFile(path.join(import.meta.dirname, 'engine-loader.js'), path.join(output, 'engine-loader.js'));
console.log(JSON.stringify({output, engineBytes:wasm.length, downloadBytes:packed.length}));
