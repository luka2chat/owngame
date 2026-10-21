// Product support targets, independent of engine, layout and screen size.
export const platforms = ["mobile", "pc"];

export function validPlatforms(value) {
  return Array.isArray(value) && value.length > 0 &&
    new Set(value).size === value.length &&
    value.every((target) => platforms.includes(target));
}

export function supportsPlatform(game, target) {
  if (!platforms.includes(target)) return false;
  // Catalogues and installed packages from before target declarations remain usable.
  return game.platforms === undefined ||
    (validPlatforms(game.platforms) && game.platforms.includes(target));
}

export function devicePlatform(device = globalThis.navigator) {
  return device?.userAgentData?.mobile ||
    /Android|iPhone|iPad|iPod/i.test(device?.userAgent || "") ||
    (device?.platform === "MacIntel" && device?.maxTouchPoints > 1)
    ? "mobile" : "pc";
}

export function resolvePlatform({ query, saved, device } = {}) {
  return [query, saved].find((target) => platforms.includes(target)) ||
    devicePlatform(device);
}

export function platformLabel(game) {
  return supportsPlatform(game, "mobile") && supportsPlatform(game, "pc")
    ? "手机 · PC" : supportsPlatform(game, "mobile") ? "移动端" : "PC";
}

export function platformNotice(game) {
  return supportsPlatform(game, "mobile") ? "请在手机或平板上游玩这款游戏。"
    : "这款游戏支持 PC，请在电脑上游玩。";
}

export function platformAcceptance(game) {
  return [
    ...(supportsPlatform(game, "mobile") ? ["Mobile touch controls, layout and device performance"] : []),
    ...(supportsPlatform(game, "pc") ? ["PC controls, layout and performance"] : []),
  ];
}
