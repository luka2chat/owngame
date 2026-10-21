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

export function resolvePlatform({ query } = {}) {
  return ["all", ...platforms].includes(query) ? query : "all";
}

export function platformLabel(game) {
  return supportsPlatform(game, "mobile") && supportsPlatform(game, "pc")
    ? "手机 · PC" : supportsPlatform(game, "mobile") ? "移动端" : "PC";
}

// Target classification chooses the PC presentation, without blocking browser play.
export function playerPresentation(game) {
  const pcOnly = supportsPlatform(game, "pc") && !supportsPlatform(game, "mobile");
  return {
    wide: pcOnly || game.wideViewport === true,
    responsive: pcOnly || game.responsiveViewport === true || game.id === "star-triad",
  };
}

export function platformAcceptance(game) {
  return [
    ...(supportsPlatform(game, "mobile") ? ["Mobile touch controls, layout and device performance"] : []),
    ...(supportsPlatform(game, "pc") ? ["PC controls, layout and performance"] : []),
  ];
}
