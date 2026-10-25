import type { NavBounds } from '../world/nav'
import type { BuffSpawn } from './rules/buffs'
import type { Team, Vec3 } from './teams'

/** WoW world coordinates (X north, Y west, Z up) to terrain-OBJ space used by the renderer. */
export const fromWow = (x: number, y: number, z: number): Vec3 => ({ x: y, y: z, z: x })

export type Graveyard = { id: string; pos: Vec3; team: Team | null; node?: string }

export type MapKey = 'wsg' | 'ab' | 'hyjal-alliance' | 'hyjal-horde'

export type MapConfig = {
  key: MapKey
  mode: 'ctf' | 'domination' | 'defense'
  defense?: { team: Team; core: Vec3; entry: Vec3 }
  teamSize: number
  nav: NavBounds & { cell: number }
  spawn: Record<Team, Vec3>
  graveyards: Graveyard[]
  flags?: Record<Team, Vec3>
  nodes?: { id: string; pos: Vec3 }[]
  /** Power-up rune spots. */
  buffs: BuffSpawn[]
  sky: number
  /** Extra flood-fill seeds for areas only reachable by dropping down. */
  seeds?: Vec3[]
}

/** Flood-fill seeds of the nav graph: everywhere a bot must be able to reach. */
export const navSeeds = (cfg: MapConfig): Vec3[] => [
  ...Object.values(cfg.spawn),
  ...(cfg.flags ? Object.values(cfg.flags) : []),
  ...cfg.graveyards.map(g => g.pos),
  ...(cfg.nodes ?? []).map(n => n.pos),
  ...(cfg.seeds ?? []),
  ...(cfg.defense ? [cfg.defense.core, cfg.defense.entry] : []),
]

/** Coordinates from the server data of the battlegrounds (flag stands, banners, graveyards). */
export const MAPS: Record<MapKey, MapConfig> = {
  'hyjal-alliance': hyjal('alliance'),
  'hyjal-horde': hyjal('horde'),
  wsg: {
    key: 'wsg',
    mode: 'ctf',
    teamSize: 10,
    nav: { minX: 1240, maxX: 1700, minZ: 840, maxZ: 1620, cell: 1.25 },
    flags: { alliance: fromWow(1540.423, 1481.325, 351.8284), horde: fromWow(916.0226, 1434.405, 345.4134) },
    spawn: { alliance: fromWow(1523.81, 1481.76, 352.008), horde: fromWow(933.989, 1430.735, 345.537) },
    graveyards: [
      { id: 'wsg_a', pos: { x: 1563.68, y: 319.8, z: 1407.1 }, team: 'alliance' },
      { id: 'wsg_h', pos: { x: 1376.0, y: 322.1, z: 1056.3 }, team: 'horde' },
    ],
    // Speed runes in the base tunnels, restoration in the side huts; the berserking spots by
    // the ramps roll either kind.
    buffs: [
      { pos: fromWow(1449.93, 1470.71, 342.6346), kinds: ['speed'] },
      { pos: fromWow(1005.171, 1447.946, 335.9032), kinds: ['speed'] },
      { pos: fromWow(1317.506, 1550.851, 313.2344), kinds: ['heal'] },
      { pos: fromWow(1110.451, 1353.656, 316.5181), kinds: ['heal'] },
      { pos: fromWow(1320.09, 1378.79, 314.7532), kinds: ['heal', 'speed'] },
      { pos: fromWow(1139.688, 1560.288, 306.8432), kinds: ['heal', 'speed'] },
    ],
    sky: 0xa9c8e8,
  },
  ab: {
    key: 'ab',
    mode: 'domination',
    teamSize: 15,
    nav: { minX: 560, maxX: 1360, minZ: 640, maxZ: 1420, cell: 1.6 },
    nodes: [
      { id: 'stables', pos: fromWow(1166.78, 1200.15, -56.7) },
      { id: 'blacksmith', pos: fromWow(977.05, 1046.52, -44.83) },
      { id: 'farm', pos: fromWow(806.25, 874.22, -55.99) },
      { id: 'mine', pos: fromWow(1146.92, 848.19, -110.92) },
      { id: 'lumber', pos: fromWow(856.14, 1148.9, 11.18) },
    ],
    spawn: { alliance: fromWow(1354.7, 1270.27, -11.13), horde: fromWow(713.71, 638.36, -10.6) },
    graveyards: [
      { id: 'ab_a', pos: fromWow(1354.7, 1270.27, -11.13), team: 'alliance' },
      { id: 'ab_h', pos: fromWow(713.71, 638.36, -10.6), team: 'horde' },
      { id: 'gy_stables', pos: fromWow(1201.87, 1163.13, -56.29), team: null, node: 'stables' },
      { id: 'gy_farm', pos: fromWow(834.73, 784.98, -57.08), team: null, node: 'farm' },
      { id: 'gy_blacksmith', pos: fromWow(1016.59, 955.18, -42.83), team: null, node: 'blacksmith' },
      { id: 'gy_mine', pos: fromWow(1211.52, 781.56, -82.71), team: null, node: 'mine' },
      { id: 'gy_lumber', pos: fromWow(772.76, 1213.11, 15.8), team: null, node: 'lumber' },
    ],
    // One rune beside each node, a new random kind every time it comes back.
    buffs: [
      { pos: fromWow(1185.566, 1184.629, -56.36329), kinds: ['heal', 'speed'] },
      { pos: fromWow(990.1131, 1008.73, -42.60328), kinds: ['heal', 'speed'] },
      { pos: fromWow(816.1689, 842.9634, -56.53851), kinds: ['heal', 'speed'] },
      { pos: fromWow(808.8463, 1185.417, 11.92161), kinds: ['heal', 'speed'] },
      { pos: fromWow(1147.091, 816.8362, -98.39896), kinds: ['heal', 'speed'] },
    ],
    sky: 0xb7cfe0,
  },
}

/** Original HyjalPast camps; coordinates are WoW world positions. */
function hyjal(team: Team): MapConfig {
  const a = team === 'alliance'
  const core = a ? fromWow(5037.38, -1778.39, 1322.61) : fromWow(5484.98, -2721.69, 1483.39)
  const entry = a ? fromWow(4928.48, -1526.38, 1326.83) : fromWow(5466, -2344, 1460)
  return {
    key: `hyjal-${team}`, mode: 'defense', teamSize: 3,
    defense: { team, core, entry },
    nav: a ? { minX:-2020,maxX:-1340,minZ:4750,maxZ:5230,cell:1.6 } : { minX:-3020,maxX:-2150,minZ:5230,maxZ:5710,cell:1.6 },
    spawn: { alliance: a ? core : entry, horde: a ? entry : core },
    graveyards: [{id:'hyjal', pos:core, team}],
    buffs: [], sky: 0x9bacbb,
  }
}
