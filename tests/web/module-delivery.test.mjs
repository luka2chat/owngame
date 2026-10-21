import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {versionShellModules} from '../../scripts/web/module-delivery.mjs';

test('a changed dependency invalidates the whole shell graph and keeps game files intact', async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'owngame-modules-'));
  try {
    const make = async (folder, value) => {
      await fs.mkdir(path.join(folder, 'games/frozen'), {recursive:true});
      await fs.writeFile(path.join(folder, 'app.js'), 'import {value} from "./data.js";');
      await fs.writeFile(path.join(folder, 'data.js'), `export const value=${value};`);
      await fs.writeFile(path.join(folder, 'index.html'), '<link rel="modulepreload" href="/data.js"><script type="module" src="/app.js"></script>');
      await fs.writeFile(path.join(folder, 'games/frozen/game.js'), 'original game');
      return versionShellModules(folder);
    };
    const first = path.join(root, 'first'), second = path.join(root, 'second');
    const a = await make(first, 1), b = await make(second, 2);
    assert.notEqual(a, b);
    assert.match(await fs.readFile(path.join(second, 'app.js'), 'utf8'), new RegExp('data\\.js\\?v=' + b));
    const html = await fs.readFile(path.join(second, 'index.html'), 'utf8');
    assert(html.includes('/data.js?v=' + b));
    assert(html.includes('/app.js?v=' + b));
    assert.equal(await fs.readFile(path.join(second, 'games/frozen/game.js'), 'utf8'), 'original game');
  } finally { await fs.rm(root, {recursive:true, force:true}); }
});
