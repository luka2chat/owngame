import {promises as fs} from "node:fs";
import path from "node:path";
import {validPlatforms} from "../../apps/web/public/platforms.js";
export async function readGameEntries(root) {
const entries = [
  {
    id: "signal-harbor",
    title: "潮光归位",
    subtitle: "SIGNAL HARBOR",
    tag: "安静夜港 · 三章航程",
    art: "harbor",
    category: "益智",
    responsiveViewport: true,
    viewportHeight: 800,
    description: "借一处泊位，让灯光慢慢归航。24 个谜题，随时选关。",
    instructions:
      "每次点选一盏顶灯，再点空位或相同图案。按各关容量周转灯光，让三塔各归其图案，并清空泊位。支持航图选关、提示、撤销和本地进度。",
  },
  {
    id: "unlock-bolts-mobile",
    title: "螺帽之间",
    subtitle: "NUTS & BOLTS",
    tag: "颜色归类 · 5 个关卡",
    art: "bolts",
    category: "益智",
    responsiveViewport: true,
    viewportHeight: 800,
    description: "转个念头，把每一种颜色放回它的位置。",
    instructions:
      "先点一根螺栓，再点目标螺栓。同色叠放，空位周转。集齐一柱颜色可解锁备用位置；随时可以撤销或重来。",
  },
];
entries.push(...JSON.parse(await fs.readFile(path.join(root, "scripts/pocket-boards/catalog.json"), "utf8")));
entries.push(...JSON.parse(await fs.readFile(path.join(root, "scripts/postcard-slide/catalog.json"), "utf8")));
entries.push(...JSON.parse(await fs.readFile(path.join(root, "scripts/kiln-merge/catalog.json"), "utf8")));
entries.push(...JSON.parse(await fs.readFile(path.join(root, "scripts/petal-memory/catalog.json"), "utf8")));
entries.push(...JSON.parse(await fs.readFile(path.join(root, "scripts/silk-serpent/catalog.json"), "utf8")));
entries.push(...JSON.parse(await fs.readFile(path.join(root, "scripts/bamboo-rally/catalog.json"), "utf8")));
entries.push(...JSON.parse(await fs.readFile(path.join(root, "scripts/game-rollout/catalog.json"), "utf8")));
// Accepted and published four-genre expansion.
entries.push(...JSON.parse(await fs.readFile(path.join(root,"scripts/open-source-expansion/catalog.json"),"utf8")));
entries.push(...JSON.parse(await fs.readFile(path.join(root,"scripts/star-letters/catalog.json"),"utf8")));
entries.push(...JSON.parse(await fs.readFile(path.join(root,"scripts/crowd-runner/catalog.json"),"utf8")));
entries.push(...JSON.parse(await fs.readFile(path.join(root,"scripts/arrow-escape/catalog.json"),"utf8")));
entries.push(...JSON.parse(await fs.readFile(path.join(root,"scripts/tidal-reclaim/catalog.json"),"utf8")));
// Lead with README's four creative examples, followed by its standalone 3D recommendation.
// Stable sorting preserves the existing relative order of all remaining games.
const featuredOrder = new Map([
  "neon-shooter", "faune-dungeon", "wind-chime-memory", "postcard-slide", "star-letters", "tidal-reclaim",
].map((id, index) => [id, index]));
entries.sort((a, b) =>
  (featuredOrder.get(a.id) ?? featuredOrder.size) -
  (featuredOrder.get(b.id) ?? featuredOrder.size));
const targets = JSON.parse(await fs.readFile(path.join(root, "scripts/games/platforms.json"), "utf8"));
for (const entry of entries) {
  if (!validPlatforms(targets[entry.id])) throw Error("Declare supported platforms for " + entry.id);
  entry.platforms = [...targets[entry.id]];
}
for (const id of Object.keys(targets)) {
  if (!entries.some(entry => entry.id === id)) throw Error("Unknown platform declaration: " + id);
}
return entries;
}
