import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { Core } from '../../dist/packages/core/index.js';
const root = path.resolve(import.meta.dirname, '../..');

test('Unity projects have independent identities and retain a self-contained scene', async t => {
  const workspace = await fs.mkdtemp(path.join(os.tmpdir(), 'owngame-unity-'));
  t.after(() => fs.rm(workspace, {recursive:true, force:true}));
  const core = new Core({root, workspace}); await core.initialize();
  const identities = [];
  for (const directory of ['first', 'second']) {
    const result = await core.call('project.create', {directory, name:'my-home', template:'unity-home'});
    assert.equal(result.status, 'succeeded');
    assert.equal(result.data.scene, 'Assets/Scenes/HomeArt.unity');
    assert.equal(result.data.build, undefined);
    assert.equal(result.data.preview, undefined);
    assert.match(await fs.readFile(path.join(workspace, directory, '.gitignore'), 'utf8'), /\/\[Ll\]ibrary\//);
    const p = path.join(workspace, directory);
    const settings = await fs.readFile(path.join(p, 'ProjectSettings/ProjectSettings.asset'), 'utf8');
    assert.match(settings, /productName: my-home/);
    const id = settings.match(/productGUID: ([a-f0-9]{32})/)[1]; identities.push(id);
    assert.match(settings, new RegExp(`Standalone: dev.owngame.g${id}`));
    const build = await fs.readFile(path.join(p, 'ProjectSettings/EditorBuildSettings.asset'), 'utf8');
    const meta = await fs.readFile(path.join(p, result.data.scene + '.meta'), 'utf8');
    assert(build.includes(meta.match(/guid: (\w+)/)[1]));
    assert(!build.includes('StoryAdventure'));
    assert.equal((await fs.stat(path.join(p, result.data.scene))).isFile(), true);
    assert.equal((await fs.stat(path.join(p, 'Assets/Resources/Fonts/StarLettersUI.ttf'))).isFile(), true);
    const runtime = await fs.readFile(path.join(p, 'Assets/Scripts/Story/HomeAdventure.cs'), 'utf8');
    assert.doesNotMatch(runtime, /CampaignDirector|StoryWorld|campaign/);
    for (const excluded of ['Library', 'Temp', 'UserSettings', 'package.json', 'Assets/Scenes/StoryAdventure.unity'])
      await assert.rejects(fs.access(path.join(p, excluded)), {code:'ENOENT'});
  }
  assert.notEqual(identities[0], identities[1]);
  assert.equal((await core.call('project.create', {directory:'first', name:'other', template:'unity-home'})).diagnostics[0].code, 'PROJECT_EXISTS');
  assert.equal((await core.call('project.create', {directory:'../escape', name:'other', template:'unity-home'})).diagnostics[0].code, 'WORKSPACE_ESCAPE');
});
