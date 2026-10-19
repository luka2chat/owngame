import {createHash} from 'node:crypto';
export const sha256 = bytes => createHash('sha256').update(bytes).digest('hex');

export function validateCoverage(index, catalog) {
  if (index.schema !== 'owngame.open-games.v1' || !Array.isArray(index.games)) throw Error('Invalid open-source index');
  const byId = new Map();
  for (const game of index.games) {
    if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(game.id) || byId.has(game.id) || game.path !== 'examples/'+game.id ||
        !/^[a-f0-9]{64}$/.test(game.source_manifest_sha256)) throw Error('Invalid/duplicate source entry: '+game.id);
    byId.set(game.id, game);
  }
  const seen = new Set();
  return catalog.map(game => {
    if (seen.has(game.id)) throw Error('Duplicate catalog game: '+game.id);
    seen.add(game.id);
    const source = byId.get(game.id);
    if (!source) throw Error('Game source is not published: '+game.id);
    if (source.online_build_sha256 !== game.version) throw Error('Publish matching source before this game version: '+game.id);
    return source;
  });
}

export async function loadPublishedSources(commit, catalog, fetcher=fetch) {
  if (!/^[a-f0-9]{40}$/.test(commit || '')) throw Error('Run npm run web:publish to synchronize game source before building the website');
  const base = 'https://raw.githubusercontent.com/luka2chat/owngame/'+commit+'/';
  const read = async relative => {
    const response = await fetcher(base+relative, {signal:AbortSignal.timeout(60000)});
    if (!response.ok) throw Error('Public source unavailable: '+relative+' HTTP '+response.status);
    return Buffer.from(await response.arrayBuffer());
  };
  const index = JSON.parse((await read('games.json')).toString());
  const sources = validateCoverage(index, catalog);
  await Promise.all(sources.map(async source => {
    const bytes = await read(source.path+'/SOURCE_MANIFEST.json');
    if (sha256(bytes) !== source.source_manifest_sha256) throw Error('Public source manifest mismatch: '+source.id);
    const manifest = JSON.parse(bytes.toString());
    if (!manifest.files?.length) throw Error('Empty public source: '+source.id);
  }));
  return new Map(sources.map(source => [source.id, {...source,
    sourceCommit:commit, sourceUrl:'https://github.com/luka2chat/owngame/tree/'+commit+'/'+source.path}]));
}
