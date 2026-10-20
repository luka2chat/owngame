# Website game source

[Documentation](README.md) · [中文入门](zh-CN/quickstart.md)

Editable sources for games hosted on owngame.dev are organized by game ID in `examples/<game-id>/`. The root [`games.json`](../games.json) lists games, online versions and source fingerprints. Each game's `ONLINE_BUILD.json` records the SHA-256 of its matching immutable online delivery files; `SOURCE_MANIFEST.json` inventories public source and assets for version verification.

<a id="游玩与修改"></a>

## Run and modify a game

Clone the repository, choose a game from `games.json`, and enter its source directory. For the Web projects using the shared npm workflow, run:

```sh
npm ci
npm start
```

These projects require Node.js 22.18 or newer and npm. Open the address printed by the server (normally <http://127.0.0.1:5173>). `npm run build` produces `dist/`; `npm run serve` starts a local preview. For example:

```sh
git clone https://github.com/luka2chat/owngame.git
cd owngame/examples/crowd-runner
npm ci
npm start
```

Follow the selected project's README for engine-specific requirements. Unity projects require a separately installed editor and target-platform modules; a Web prototype is not interchangeable with the full engine project. The [`unity-home`](../templates/unity-home/README.md) template is a separate starter that can be created through the CLI.

## Licensing

<a id="授权"></a>

Each project's `LICENSE` and `THIRD_PARTY_NOTICES.md` define its licensing scope. Source code may be subject to MIT, GPL or another stated license; engines, fonts, icons, models and other assets may have separate terms. Commercial use, modification and redistribution must follow the applicable project and asset licenses. The root MIT license does not replace them.

The source delivery includes published runtime assets and build instructions. npm or the Unity package manager restores dependencies. Caches, private records, account settings and machine-specific tool paths are excluded. Game examples live in the GitHub repository; the npm package distributes authoring tools and templates.

<a id="更新"></a>

## Updates and verification

New games and updates use the [joint source and website publication workflow](game-publishing.md). Source links in the website catalogue point to the Git commit matching a delivery, supporting historical inspection and reproduction.

Automated checks cover source inventories, dependency installation, lightweight Web rebuilds and browser loading/input. Unity editor behavior, physical devices, offline cold starts and complete gameplay acceptance require separate game-specific delivery evidence.
