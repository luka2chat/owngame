"""Export selected, immutable Web games as editable, portable public examples.

Only allowlisted inputs are read. Caches, private evidence, credentials and
machine-specific upstream download paths are never copied.
"""
from pathlib import Path
import argparse, hashlib, json, re, shutil, subprocess
from concurrent.futures import ThreadPoolExecutor

ROOT = Path(__file__).resolve().parents[2]
SHA = lambda b: hashlib.sha256(b).hexdigest()

def dump(p, value):
    p.parent.mkdir(parents=True, exist_ok=True)
    p.write_text(json.dumps(value, ensure_ascii=False, indent=2) + '\n')

def export(catalog, destination, library=None, only=None):
    projects = json.loads((ROOT/'scripts/games/projects.json').read_text())
    library = library or ROOT/'.owngame/library'
    planned = catalog
    prior_index = json.loads((destination/'games.json').read_text())['games'] if only else []
    if only:
        wanted = set(only.split(','))
        catalog = [g for g in catalog if g['id'] in wanted]
        if {g['id'] for g in catalog} != wanted:
            raise ValueError('Unknown game in --only')
    games = []
    for game in catalog:
        ident = game['id']
        if not re.fullmatch(r'[a-z0-9]+(?:-[a-z0-9]+)*', ident):
            raise ValueError('Unsafe game id')
        if ident not in projects:
            raise ValueError('Register source and license in scripts/games/projects.json: '+ident)
        spec = projects[ident]
        version = game['version']
        if not re.fullmatch(r'[a-f0-9]{64}', version):
            raise ValueError('Invalid selected game version')
        base = library/ident/version
        delivery = json.loads((base/'delivery.json').read_text())
        canonical = [{k:f[k] for k in ['bytes','path','sha256']} for f in delivery['files']]
        if SHA(json.dumps(canonical, separators=(',', ':'), ensure_ascii=False).encode()) != version:
            raise ValueError('Frozen delivery digest mismatch: '+ident)
        for f in delivery['files']:
            rel = Path(f['path'])
            if rel.is_absolute() or '..' in rel.parts:
                raise ValueError('Unsafe delivery path')
            b = (base/'files'/rel).read_bytes()
            if len(b) != f['bytes'] or SHA(b) != f['sha256']:
                raise ValueError('Corrupt selected delivery: '+ident+'/'+str(rel))
        target = destination/'examples'/ident
        source = ROOT/spec['project']
        inputs = {}
        def put(relative, b):
            p = target/relative
            p.parent.mkdir(parents=True, exist_ok=True)
            p.write_bytes(b)
        def copy(p, relative):
            b = p.read_bytes()
            # Provenance stays repository-relative; filesystem paths never leave this machine.
            inputs[str(p.relative_to(ROOT)) if p.is_relative_to(ROOT) else str(p.relative_to(base))] = SHA(b)
            put(relative, b)
        def tree(p, relative, allowed=None):
            for f in sorted(p.rglob('*')):
                if f.is_file() and (allowed is None or f.suffix in allowed):
                    copy(f, Path(relative)/f.relative_to(p))
        if spec['kind'] == 'unity':
            # The previously reviewed Unity source manifest is the allowlist.
            manifest = json.loads((source/'SOURCE_MANIFEST.json').read_text())
            prior_file = target/'SOURCE_MANIFEST.json'
            prior = {f['path']:f for f in json.loads(prior_file.read_text())['files']} if prior_file.exists() else {}
            def check_source(f):
                rel = Path(f['path'])
                if rel.is_absolute() or '..' in rel.parts:
                    raise ValueError('Unsafe Unity manifest path')
                if SHA((source/rel).read_bytes()) != f['sha256']:
                    raise ValueError('Unity source changed without manifest review: '+str(rel))
            with ThreadPoolExecutor(max_workers=12) as pool:
                list(pool.map(check_source, manifest['files']))
            for f in manifest['files']:
                rel = Path(f['path'])
                if rel.is_absolute() or '..' in rel.parts:
                    raise ValueError('Unsafe Unity manifest path')
                inputs[(Path(spec['project'])/rel).as_posix()] = f['sha256']
                if prior.get(f['path'], {}).get('sha256') == f['sha256']:
                    continue  # identical, already-reviewed Git source is retained without NAS rewrites
                b = (source/rel).read_bytes()
                if SHA(b) != f['sha256']:
                    raise ValueError('Unity source changed without manifest review: '+str(rel))
                copy(source/rel, rel)
            copy(source/'SOURCE_MANIFEST.json', 'SOURCE_MANIFEST.json')
            put('ONLINE_BUILD.json', (json.dumps({'id':ident, 'build_sha256':version,
                'entrypoint':delivery['entrypoint'], 'files':canonical}, ensure_ascii=False, indent=2)+'\n').encode())
        else:
            if target.exists():
                marker = target/'game.json'
                if not marker.exists() or json.loads(marker.read_text()).get('managed_export') != 'owngame':
                    raise ValueError('Refusing to overwrite unmanaged example: '+str(target))
                shutil.rmtree(target)
            target.mkdir(parents=True)
            kind = spec['kind']
            typed = {}
            excluded = {'source.tar.gz','README.md','UPSTREAM.json'}
            if kind in ['phaser','canvas','faune','moss','native-ts','native-js']:
                excluded |= {'game.js','game.js.LEGAL.txt','layout.js','rules.js','phaser.min.js'}
            if kind == 'vite':
                excluded |= {'index.html'}
            for f in delivery['files']:
                rel = f['path']
                if rel in excluded or (kind == 'vite' and rel.startswith('assets/')):
                    continue
                copy(base/'files'/rel, Path('public')/rel)
            if kind in ['phaser','canvas','faune','moss']:
                tree(source/'src', 'src', {'.ts','.js','.mjs','.json'})
            if kind == 'native-js':
                # Retain original types only when those exact inputs produce the selected release.
                # Otherwise keep the complete readable modules, rather than an in-progress candidate.
                typed = {name:(source/(name+'.ts')).read_text() for name in ['game','rules']}
                check = "import{stripTypeScriptTypes}from'node:module';import{createHash}from'node:crypto';import fs from'node:fs';const v=JSON.parse(fs.readFileSync(0,'utf8'));console.log(JSON.stringify(Object.fromEntries(Object.entries(v).map(([k,s])=>[k,createHash('sha256').update(stripTypeScriptTypes(s,{mode:'strip'})).digest('hex')]))));"
                emitted = json.loads(subprocess.check_output(['node','--input-type=module','-e',check], input=json.dumps(typed).encode()))
                if all(emitted[name] == SHA((base/'files'/(name+'.js')).read_bytes()) for name in typed):
                    kind = 'native-ts'
                else:
                    for name in ['game.js','rules.js']:
                        copy(base/'files'/name, 'src/'+name)
            if kind == 'native-ts':
                for name in ['game.ts','rules.ts']:
                    b = typed[name[:-3]].encode() if typed else (source/name).read_bytes()
                    inputs[(Path(spec['project'])/name).as_posix()] = SHA(b)
                    put('src/'+name, b)
            if ident == 'signal-harbor':
                for name in ['rules','progress','levels','layout']:
                    copy(ROOT/spec['extra']/(name+'.ts'), 'src/core/'+name+'.ts')
                for name in ['rules','layout']:
                    p = target/'src'/(name+'.ts')
                    p.write_text(p.read_text().replace('../../../signal-harbor/assets/scripts/', './core/'))
            if kind == 'vite':
                tree(source/'src', 'src')
                tree(source/'src/assets', 'src/assets')  # reviewed asset-directory link is followed explicitly
                tree(source/'public', 'public')
                # Use the exact published HTML shell, with Vite's source entry restored.
                html = (base/'files/index.html').read_text()
                html = re.sub(r'<script type="module"[^>]*src="[^"]+"[^>]*></script>', '', html)
                html = re.sub(r'<link rel="stylesheet"[^>]*href="[^\"]*assets/[^\"]+"[^>]*>', '', html)
                css_file = next(f['path'] for f in delivery['files'] if f['path'].startswith('assets/') and f['path'].endswith('.css'))
                copy(base/'files'/css_file, 'owngame.css')
                css = (target/'owngame.css').read_text()
                (target/'owngame.css').write_text(css.replace('url(art/', 'url(/art/').replace("url('art/", "url('/art/").replace('url("art/', 'url("/art/'))
                html = html.replace('</head>', '<link rel="stylesheet" href="./owngame.css"></head>')
                html = html.replace('</body>', '<script type="module" src="./src/main.js"></script></body>')
                put('index.html', html.encode())
            license_name = next((p for p in ['LICENSE','LICENSE.txt','public/LICENSE','public/LICENSE.txt'] if (target/p).is_file()), None)
            if not license_name:
                put('LICENSE', (ROOT/'LICENSE').read_bytes())
            else:
                put('LICENSE', (target/license_name).read_bytes())
            if spec.get('upstream'):
                upstream = json.loads((source/'UPSTREAM.json').read_text())
                dump(target/'UPSTREAM.json', {k:upstream[k] for k in ['repo','commit','archive_sha256']})
            original_sha = None
            bundled = base/'files/game.js'
            if bundled.exists():
                hashes = set(re.findall(r'(?<![a-f0-9])[a-f0-9]{64}(?![a-f0-9])', bundled.read_text()))
                if len(hashes) == 1:
                    original_sha = hashes.pop()
            config = {'managed_export':'owngame','id':ident,'title':game['title'], 'kind':kind,
                'online_build_sha256':version, 'original_source_sha256':original_sha,
                'license':spec.get('license','MIT'), 'description':game['description']}
            dump(target/'game.json', config)
            deps, dev = {}, {}
            if kind in ['phaser','faune']:
                deps['phaser'] = '3.90.0'
            if kind in ['phaser','faune','canvas']:
                dev['esbuild'] = '0.25.12'
            if kind == 'moss':
                dev['typescript'] = '7.0.2'
            if kind == 'vite':
                pkg = json.loads((source/'package-lock.json').read_text())
                for name in ['three','cannon-es','lil-gui']:
                    deps[name] = pkg['packages']['node_modules/'+name]['version']
                dev['vite'] = pkg['packages']['node_modules/vite']['version']
            dump(target/'package.json', {'name':'@owngame-example/'+ident,'version':'1.0.0','private':True,
                'type':'module','engines':{'node':'>=22.18'},'license':spec.get('license','MIT'),
                'scripts':{'build':'node build.mjs','serve':'node serve.mjs','start':'npm run build && npm run serve'},
                'dependencies':deps,'devDependencies':dev})
            put('build.mjs', (ROOT/'scripts/games/build-template.mjs').read_bytes())
            put('serve.mjs', (ROOT/'scripts/games/serve-template.mjs').read_bytes())
            notices = [f'# {game["title"]} · 授权与来源\n',
                f'游戏代码：{spec.get("license","MIT")}。请同时保留 LICENSE 和随素材附带的声明。\n',
                '原创 owngame 美术包含委托 OpenAI ImageGen 生成的图片；按所在项目许可分发。规则概念参考不代表复制参考游戏代码。\n']
            for f in sorted((target/'public').rglob('*')):
                if f.is_file() and (f.name in ['THIRD_PARTY.txt','SOURCE.json','ARTWORK.json'] or f.suffix.lower()=='.txt' and any(x in f.name.lower() for x in ['ofl','license','phaser','eventemitter'])):
                    notices.append(f'\n## {f.relative_to(target).as_posix()}\n\n'+f.read_text())
            if spec.get('upstream'):
                notices.append('\n## 上游\n\n'+json.dumps(json.loads((target/'UPSTREAM.json').read_text()),indent=2)+'\n')
            put('THIRD_PARTY_NOTICES.md', '\n'.join(notices).encode())
            put('.gitignore', b'node_modules\ndist/\n.DS_Store\n')
            put('README.md', (f'# {game["title"]}\n\n{game["description"]}\n\n'
                f'[在线试玩](https://owngame.dev/play?game={ident}) · [授权与来源](THIRD_PARTY_NOTICES.md)\n\n'
                '## 本地运行\n\n需要 Node.js 22.18 或更新版本与 npm。在本目录执行：\n\n'
                '```sh\nnpm ci\nnpm start\n```\n\n打开 http://127.0.0.1:5173 。也可分别运行 `npm run build` 和 `npm run serve`。'
                '构建输出位于 `dist/`；运行时素材在本地，不需要游戏运行时 CDN。\n\n'
                f'## 操作\n\n{game["instructions"]}\n\n'
                f'## 线上版本与源码\n\n对应线上交付：`{version}`。`ONLINE_BUILD.json` 记录原交付文件指纹，'
                '`SOURCE_MANIFEST.json` 记录这里的可编辑源码、构建脚本与素材。依赖通过 npm 恢复，构建脚本已移除开发机和 NAS 路径。'
                '打包路径、源码诊断标记或压缩器可能改变输出字节；重建结果和原交付的逐文件比较另见仓库检查结果。\n\n'
                f'代码许可：**{spec.get("license","MIT")}**。字体、引擎与上游素材依照各自声明；见 [授权与来源](THIRD_PARTY_NOTICES.md)。\n').encode())
            dump(target/'ONLINE_BUILD.json', {'id':ident,'build_sha256':version,
                'entrypoint':delivery['entrypoint'],'files':canonical})
        # A source fingerprint ties the published example back to reviewed local inputs.
        digest = SHA(json.dumps(inputs,sort_keys=True,separators=(',',':')).encode())
        files = []
        for p in ([] if spec['kind'] == 'unity' else sorted(target.rglob('*'))):
            if not p.is_file() or p.name == 'SOURCE_MANIFEST.json' or any(x in p.relative_to(target).parts for x in ['node_modules','dist','.git']):
                continue
            b = p.read_bytes()
            if p.suffix in ['.ts','.js','.mjs','.json','.md','.html','.css'] and re.search(rb'/Users/|/Volumes/|192\.168\.\d+\.\d+|gh[pousr]_[A-Za-z0-9]{30,}|-----BEGIN (?:RSA |OPENSSH )?PRIVATE KEY', b):
                raise ValueError('Private/machine-specific content: '+str(p.relative_to(target)))
            files.append({'path':p.relative_to(target).as_posix(),'bytes':len(b),'sha256':SHA(b)})
        if spec['kind'] != 'unity':
            dump(target/'SOURCE_MANIFEST.json', {'schema':'owngame.game-source.v1','id':ident,
                'online_build_sha256':version,'input_sha256':digest,'files':files})
        else:
            files = manifest['files']
            # Preserve per-file Unity/font licensing from the original audit.
            manifest['files'] = [f for f in manifest['files'] if f['path'] != 'ONLINE_BUILD.json']
            b = (target/'ONLINE_BUILD.json').read_bytes()
            manifest['files'].append({'path':'ONLINE_BUILD.json','bytes':len(b),'sha256':SHA(b),'license':'MIT'})
            dump(target/'SOURCE_MANIFEST.json', manifest)
        games.append({'id':ident,'title':game['title'],'kind':('unity' if spec['kind']=='unity' else config['kind']),
            'path':'examples/'+ident,'online_build_sha256':version,'input_sha256':digest,
            'source_manifest_sha256':SHA((target/'SOURCE_MANIFEST.json').read_bytes()),
            'license':spec.get('license','MIT')})
        print(json.dumps({'exported':ident,'files':len(files),'bytes':sum(f['bytes'] for f in files)}),flush=True)
    if only:
        merged = {g['id']:g for g in prior_index}
        merged.update({g['id']:g for g in games})
        games = [merged[g['id']] for g in planned]
    dump(destination/'games.json', {'schema':'owngame.open-games.v1','repository':'luka2chat/owngame','games':games})
    rows = '\n'.join(f"| [{g['title']}]({g['id']}/) | `{g['id']}` | {g['license']} |" for g in games)
    (destination/'examples/README.md').write_text('# 网站游戏源码\n\n'+f'共 {len(games)} 款，与 [games.json](../games.json) 中的线上版本对应。\n\n| 游戏 | ID | 代码许可 |\n|---|---|---|\n'+rows+'\n\n在目标目录执行 `npm ci` 与 `npm start`；Unity 游戏另见其 README。第三方素材按各目录声明使用。\n')

if __name__ == '__main__':
    parser = argparse.ArgumentParser()
    parser.add_argument('--catalog', required=True, type=Path)
    parser.add_argument('--out', required=True, type=Path)
    parser.add_argument('--library', type=Path)
    parser.add_argument('--only', help='Comma-separated IDs to refresh while preserving other reviewed exports')
    args = parser.parse_args()
    export(json.loads(args.catalog.read_text()), args.out.resolve(), args.library, args.only)
