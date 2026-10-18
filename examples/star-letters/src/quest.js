// A tiny finite-state machine. Rendering and DOM never decide story progress.
export const STAR_COUNT = 3;
export function createQuest() { return { collected: new Set(), stage: 'collect', completed: false }; }
export function advanceQuest(state, event, id) {
  if (event === 'collect' && state.stage === 'collect' && Number.isInteger(id) && id >= 0 && id < STAR_COUNT) {
    state.collected.add(id);
    if (state.collected.size === STAR_COUNT) state.stage = 'rose';
  } else if (event === 'rose' && state.stage === 'rose') state.stage = 'beacon';
  else if (event === 'beacon' && state.stage === 'beacon') { state.stage = 'complete'; state.completed = true; }
  return state;
}
export function questText(state) {
  return {
    collect: ['拾起 3 枚星光', '沿着金色的光，去草地和小屋之间走走。'],
    rose: ['把星光带给花', '靠近玻璃罩里的花，按 E 听听它的心愿。'],
    beacon: ['点亮远方的信标', '带着花的心愿，去小屋旁点亮信标。'],
    complete: ['信，已经寄往星海', '你让这颗星球亮了起来。继续散步，或打开工作台。'],
  }[state.stage];
}
