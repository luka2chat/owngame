import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { stripTypeScriptTypes } from 'node:module';

const root = path.dirname(fileURLToPath(import.meta.url));
const config = JSON.parse(await fs.readFile(path.join(root, 'game.json'), 'utf8'));
const out = path.join(root, 'dist');
await fs.rm(out, {recursive:true, force:true});
await fs.mkdir(out);
if (config.kind === 'vite') {
  const {build} = await import('vite');
  await build({root, base:'./', build:{outDir:out, target:'es2022'}, configFile:false});
} else {
  await fs.cp(path.join(root, 'public'), out, {recursive:true});
  if (['phaser', 'canvas', 'faune'].includes(config.kind)) {
    const {build} = await import('esbuild');
    const plugins = config.kind === 'faune' ? [{name:'phaser-global', setup(b) {
      b.onResolve({filter:/^phaser$/}, () => ({path:'phaser', namespace:'global'}));
      b.onLoad({filter:/.*/, namespace:'global'}, () => ({contents:'export default window.Phaser', loader:'js'}));
    }}] : [];
    await build({absWorkingDir:root, entryPoints:['src/main.ts'], outfile:path.join(out, 'game.js'),
      bundle:true, minify:true, platform:'browser', format:'iife',
      target:config.kind === 'canvas' ? 'es2022' : 'es2020',
      legalComments:config.kind === 'canvas' ? 'inline' : config.kind === 'faune' ? 'eof' : 'linked',
      define:{__SOURCE_SHA__:JSON.stringify(config.original_source_sha256 || 'open-source-build')}, plugins});
    if (config.kind === 'faune') {
      await fs.copyFile(path.join(root, 'node_modules/phaser/dist/phaser.min.js'), path.join(out, 'phaser.min.js'));
    }
  } else if (config.kind === 'native-js') {
    for (const name of ['rules', 'game']) await fs.copyFile(path.join(root, 'src', name+'.js'), path.join(out, name+'.js'));
  } else if (config.kind === 'native-ts') {
    for (const name of ['rules', 'game']) {
      const source = await fs.readFile(path.join(root, 'src', name+'.ts'), 'utf8');
      await fs.writeFile(path.join(out, name+'.js'), stripTypeScriptTypes(source, {mode:'strip'}));
    }
  } else if (config.kind === 'moss') {
    for (const name of ['layout', 'game']) {
      const source = await fs.readFile(path.join(root, 'src', name+'.mjs'), 'utf8');
      await fs.writeFile(path.join(out, name+'.js'), source.replaceAll('./layout.mjs', './layout.js'));
    }
    const {execFileSync} = await import('node:child_process');
    execFileSync(process.execPath, [path.join(root, 'node_modules/typescript/bin/tsc'),
      '--ignoreConfig', '--skipLibCheck', path.join(root, 'src/rules.ts'),
      '--target', 'ES2022', '--module', 'ES2022', '--outDir', out], {stdio:'inherit'});
  } else if (config.kind !== 'static') throw Error('Unknown game kind: '+config.kind);
}
console.log(JSON.stringify({id:config.id, output:'dist', status:'built'}));
