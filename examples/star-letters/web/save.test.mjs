import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {unityDirectoryHash} from './save.mjs';

test('Unity save namespaces match MD5 for browser directories and UTF-8', () => {
  for (const value of ['', 'a', 'abc', 'http://localhost:5197', 'https://game.example/games/star-letters/'+ 'a'.repeat(64), 'https://game.example/星野来信'])
    assert.equal(unityDirectoryHash(value),createHash('md5').update(value).digest('hex'));
});
