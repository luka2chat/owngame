import type { Team } from './teams'

/**
 * Bot slot -> hero asset. Same order as the names in src/i18n.ts, so bot 0 on a team is the first
 * hero here. Models are the recognizable versions (King Anduin, Warchief Garrosh, classic Tyrande),
 * not the giant or shadowlands variants.
 */
export const HEROES: Record<Team, readonly string[]> = {
  alliance: ['anduin', 'varian', 'jaina', 'turalyon', 'danath', 'malfurion', 'tyrande', 'muradin', 'magni', 'bolvar', 'uther', 'arthas', 'moroes', 'rhonin', 'velen'],
  horde: ['thrall', 'garrosh', 'grom', 'cairne', 'voljin', 'sylvanas', 'rokhan', 'saurfang', 'nazgrel', 'broxigar', 'rexxar', 'baine', 'orgrim', 'drekthar', 'gazlowe'],
}

/** Alliance rides the Stormwind Steed; Horde rides the red skeletal warhorse. */
export const MOUNTS: Record<Team, string> = { alliance: 'steed', horde: 'skeletal' }

export const heroKey = (team: Team, index: number): string => {
  const list = HEROES[team]
  return list[index % list.length]
}
