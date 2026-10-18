import {copyFile} from 'node:fs/promises';
await copyFile('LICENSES/three-MIT.txt','dist/THREE-LICENSE.txt');
await copyFile('LICENSE','dist/LICENSE.txt');
