# Create and revise your first game

[Documentation](README.md) · [中文入门](zh-CN/quickstart.md)

This tutorial uses the default `web-canvas` starter: an original local two-player three-in-a-row game, shown in the interface as “月下连星”. It demonstrates a complete loop, replaceable visuals, saves and real-input validation. It does not include a computer opponent or require external fonts, images, a CDN or an image-generation account.

<a id="1-创建"></a>

## 1. Create a project

Follow the [installation guide](install.md), then run these commands in the intended workspace:

```sh
npx owngame research.prepare '{"query":"美术"}'
npx owngame project.create '{"directory":"my-game","name":"my-game"}'
cd my-game
npm test
npm run build
npm run preview
```

`美术` is an intentional search keyword in the bundled case metadata. Research reads public summaries; you do not need to research every game before starting the example.

Open the URL printed by the preview server (by default, <http://127.0.0.1:3215>). If that port is occupied, run `node scripts/serve.mjs dist 3217` and use the resulting URL.

<a id="2-真正玩一局"></a>

## 2. Play a complete round

Number the board cells from 1 to 9, left to right and top to bottom. Click 1, 4, 2, 5, 3 in order: the player labeled “星旅人” should win. Clicking an empty cell after the win must not place another piece. Click “悔一步” (undo) to return to the state before the win; making the winning move again should work.

Click “再开一局” (restart), then cells 1 and 5, and reload the page. Both pieces should remain. Tab to an empty cell and press Enter to check keyboard input. At a 360×640 viewport, check that the board, status and buttons remain usable. A simulated small viewport does not establish physical-phone coverage.

<a id="3-改一次美术保留进度"></a>

## 3. Revise the art without losing progress

In `src/theme.js`, change the title to “青玉星河” and `accent` to `#8dd7c0`. Keep `gameId` in `src/project.js` unchanged. Run `npm run build`, then reload the same address. The title and palette should change while existing moves and save continuity remain intact.

For example, tell the agent:

> Preserve the rules and saves. Change the actual running game to a jade-green visual direction. Check desktop and 360×640 layouts after editing; a concept image alone is not the deliverable.

A computer opponent or a different board is a new gameplay task. Define its rules and acceptance criteria before changing `rules.js` and the interface; the starter does not already provide those features.

<a id="4-核对交付"></a>

## 4. Verify the delivery

Return to the workspace directory and run:

```sh
npx owngame web.inspect '{"directory":"my-game/dist"}'
```

Record the resulting build fingerprint together with actual input, runtime screenshots, the test environment and uncovered behavior. Build and static checks do not establish offline cold-start support or human approval of the art.

You can deliver `dist` to a static hosting service. Public deployment and local preview are separate actions. The default starter has no Service Worker and does not promise an offline cold start after the server stops. Stop your own preview server when finished.
