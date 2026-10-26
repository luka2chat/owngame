# Azeroth Strike · 艾泽拉斯反恐精英

A desktop keyboard-and-mouse FPS with four bot-based modes across three battlegrounds: unlimited-fire Mount Hyjal defense, normal nine-wave Mount Hyjal defense, Warsong Gulch capture the flag, and Arathi Basin resource control. Choose Alliance or Horde. The game supports Chinese and English menus, scoped rifles, mounts, and screenshot result cards.

[Play](https://owngame.dev/play?game=azeroth-strike) · [Asset provenance and rights](THIRD_PARTY_NOTICES.md)

## Run from source
Requires Node.js 22.18 or newer. Run `npm ci`, `npm run build`, and `npm run serve`. Open the URL printed by the server. Build output is `dist/`; dependencies are restored from the lockfile. The editable TypeScript, CSS and reviewed runtime assets are included.

## Controls
WASD move; mouse aim; left click shoot; right click toggle sights; 1–4 or Q change weapon; R reload; mouse wheel change scope magnification; Space jump; V change camera; F summon/dismiss mount; E interact or repair the Hyjal core; Tab scoreboard; P/Esc pause. Right-clicking with a sniper rifle while mounted dismounts and raises the scope in one action.

Warsong: capture three flags while your own flag is home. Arathi: hold bases to reach 1500 resources. Normal Hyjal: protect your faction's core through eight waves and a final boss; pick up temporary boons and repair during breaks. Settings persist locally; match progress is not a saved campaign.

## Scope and rights
PC only; no touch-control support is claimed. Original code is MIT. World of Warcraft assets remain proprietary to Blizzard Entertainment and other rights holders and are excluded from that license. This is an unofficial, non-profit learning project; it is not affiliated with Blizzard. See THIRD_PARTY_NOTICES.md before reusing any asset.

## 中文快速开始
选择联盟或部落，再选择战歌峡谷、阿拉希盆地或海加尔之战。首次进入战场需加载本地资源，点击游戏画面捕获鼠标，Esc 释放并暂停。开源许可仅覆盖原创代码，暴雪相关素材的版权保持不变。

## Unlimited Fire
The first menu card starts endless Mount Hyjal defense: infinite ammunition, no reloads, twice the firearm rate and triple damage. Hold the trigger to repeat fire, including the sniper rifle and wand. These match bonuses survive respawns; temporary Fury does not multiply triple damage again. Every nine waves begins another round with a boss at the end. Enemy numbers and strength gradually rise to bounded limits; wave progression continues until the core falls. Normal mode remains nine waves.

菜单顺序为：海加尔之战·无限火力、海加尔之战·正常、战歌峡谷、阿拉希盆地。无限火力提供无限弹药、免换弹、枪械双倍射速和三倍伤害，每九波进入下一轮，营地核心失守才结束。

## Game design board

The editable [game-outline.json](./game-outline.json) lives beside the game source. From this directory run `owngame outline` (or `npx @owngame/cli@latest outline .`). The command opens the local canvas; Ctrl+C stops it. Read the design before development and write design changes and actual validation back afterward. JSON and other project file references are relative to this directory. The published snapshot has been reviewed to remove private content.
