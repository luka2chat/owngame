import fs from 'node:fs/promises';
import path from 'node:path';

const escape = value => value.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;');
const repository = 'https://github.com/luka2chat/owngame/blob/main/';
export function usageSection(readme) {
  const normalized = readme.replaceAll('\r\n', '\n');
  const heading = '## 使用与授权\n';
  const start = normalized.indexOf(heading);
  if (start < 0) throw Error('README usage and licensing section is missing');
  const rest = normalized.slice(start + heading.length);
  const next = rest.indexOf('\n## ');
  const section = (next < 0 ? rest : rest.slice(0, next)).trim();
  if (!section) throw Error('README usage and licensing section is empty');
  return section;
}
function inline(text) {
  const tokens = /\*\*([^*]+)\*\*|`([^`]+)`|\[([^\]]+)\]\(([^\s)]+)\)/g;
  let result = '', cursor = 0;
  for (const match of text.matchAll(tokens)) {
    result += escape(text.slice(cursor, match.index));
    if (match[1]) result += '<strong>' + escape(match[1]) + '</strong>';
    else if (match[2]) result += '<code>' + escape(match[2]) + '</code>';
    else {
      const url = new URL(match[4], repository);
      if (url.protocol !== 'https:') throw Error('Unsupported README licensing link');
      result += '<a href="' + escape(url.href) + '">' + escape(match[3]) + '</a>';
    }
    cursor = match.index + match[0].length;
  }
  return result + escape(text.slice(cursor));
}
export function usageHtml(readme) {
  return usageSection(readme).split(/\n\s*\n/).map(block => {
    const lines = block.split('\n');
    if (lines.every(line => line.startsWith('- ')))
      return '<ul>' + lines.map(line => '<li>' + inline(line.slice(2)) + '</li>').join('') + '</ul>';
    if (lines.some(line => /^\s*(?:#|>|```|\||[-*] )/.test(line)))
      throw Error('Unsupported README licensing block; update the renderer before publishing');
    return '<p>' + inline(lines.join('\n')) + '</p>';
  }).join('\n');
}
export async function writeUsagePage(root, out) {
  const readme = await fs.readFile(path.join(root, 'README.md'), 'utf8');
  const template = await fs.readFile(path.join(root, 'apps/web/public/usage.html'), 'utf8');
  const marker = '<!-- OWNGAME_README_USAGE -->';
  if (template.split(marker).length !== 2) throw Error('Licensing page must have one README content marker');
  await fs.writeFile(path.join(out, 'usage.html'), template.replace(marker, usageHtml(readme)));
}
