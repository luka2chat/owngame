# Tidal Reclaim / 潮汐回收站

A PC browser FPS on an offshore water-reclamation platform. Activate three purification stations, defend their areas, then hold the extraction dock for eight uninterrupted seconds.

[Play](https://owngame.dev/play?game=tidal-reclaim&platform=pc) · [Source and asset licenses](THIRD_PARTY_NOTICES.md)

中文：用键鼠完成三座净化站并撤离。基于用户付费 Manus 生成的《裂隙突击》二次开发；保留来源说明，原 Mixamo 人形角色与动画已由新付费 Tripo 资产替代。

## Run and edit

Requires Node.js 22.18 or later and npm.

```sh
npm ci
npm run typecheck
npm test
npm start
```

Open the local address printed by the server (normally http://127.0.0.1:5173). `npm run build` creates `dist/`. The complete runtime assets are included; no provider login, API key, NAS mount or runtime CDN is needed. The web build can also be downloaded through owngame's player for offline use.

Edit `src/game/tidal-mission.ts` for the mission, `src/game/arena.ts` for the platform, and `src/i18n/zh-CN.json` for game text. `src/styles/presentation.css` places full-bleed backgrounds, transparent title lettering and live controls independently. Chinese is the current in-game language; website discovery and instructions also support English.

## Controls

WASD / arrows move, mouse looks, left click fires, right click aims, R reloads, Shift sprints, Space jumps, E activates a station. Stay in its blue field until purification finishes. Complete all three stations and stay at the dock for eight seconds; leaving the boarding zone resets its timer. Number keys select unlocked weapons, G throws a grenade, and Esc pauses. Click Start/Resume to capture the pointer. Scores and settings are stored locally; an active mission restarts when the page reloads.

## Source and provenance

The owner supplied a paid Manus-generated Riftstrike / Iron Rift project. Owngame added the offshore scene, purification/extraction loop, encounter changes, paid Tripo robot/purifier and imagegen interface artwork. Original Mixamo-derived humanoids/animations are excluded. The included robot animation clips were generated through Tripo; compatible bone names are only a naming convention. See `THIRD_PARTY_NOTICES.md`, `public-assets.json`, `tripo-assets.provenance.json` and `interface-art.provenance.json` for distinct rights and provenance.

`ONLINE_BUILD.json` identifies the matching hosted delivery. `SOURCE_MANIFEST.json` fingerprints this editable export. A clean rebuild may differ in chunk names and optimized bytes; the public CI verifies loading, local assets, keyboard movement and mouse firing in addition to game rules and type checking. Assisted browser playtests cover full station/extraction progression; they do not establish human aiming difficulty or physical-device performance. PC is the only declared platform.

## Game design board

The editable [game-outline.json](./game-outline.json) lives beside the game source. From this directory run `owngame outline` (or `npx @owngame/cli@latest outline .`). The command opens the local canvas; Ctrl+C stops it. Read the design before development and write design changes and actual validation back afterward. JSON and other project file references are relative to this directory. The published snapshot has been reviewed to remove private content.
