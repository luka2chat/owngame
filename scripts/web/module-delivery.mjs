import fs from 'node:fs/promises';
import path from 'node:path';
import {createHash} from 'node:crypto';

// A release must load one module graph, even when browsers retain old imports.
export async function versionShellModules(out) {
  const names = (await fs.readdir(out)).filter(name => name.endsWith('.js') && name !== 'sw.js');
  for (const name of await fs.readdir(path.join(out, 'locales')).catch(() => [])) {
    if (name.endsWith('.js')) names.push('locales/' + name);
  }
  names.sort();
  const sources = await Promise.all(names.map(name => fs.readFile(path.join(out, name), 'utf8')));
  const hash = createHash('sha256');
  names.forEach((name, i) => hash.update(name + '\0' + sources[i] + '\0'));
  const revision = hash.digest('hex').slice(0, 12);
  await Promise.all(names.map((name, i) => fs.writeFile(path.join(out, name), sources[i]
    .replace(/(from\s*["'])(\.[^"']+\.js)(?:\?[^"']*)?(["'])/g, `$1$2?v=${revision}$3`))));
  for (const name of await fs.readdir(out)) {
    if (!name.endsWith('.html')) continue;
    const file = path.join(out, name);
    const html = await fs.readFile(file, 'utf8');
    await fs.writeFile(file, html.replace(/((?:src|href)=["'])(\/(?!\/)[^"'?]+\.js)(?:\?[^"']*)?(["'])/g, `$1$2?v=${revision}$3`));
  }
  return revision;
}
