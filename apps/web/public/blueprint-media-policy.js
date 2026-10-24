export const safeMediaUrl = (url, model = false) =>
  typeof url === "string" &&
  (new RegExp(
    "^/blueprint-media/[a-f0-9]{64}\\." +
      (model ? "glb" : "(?:png|jpe?g|webp)") +
      "$",
    "i",
  ).test(url) ||
    new RegExp(
      "^https://raw\\.githubusercontent\\.com/luka2chat/owngame/[a-f0-9]{40}/examples/[a-z0-9-]+/(?!.*(?:/\\.\\.?/|%|\\\\))[^\\s?#]+\\." +
        (model ? "glb" : "(?:png|jpe?g|webp)") +
        "$",
      "i",
    ).test(url));
export const mediaItems = (asset) =>
  (asset?.items || (asset ? [asset] : [])).filter(
    (item) => safeMediaUrl(item.preview) || safeMediaUrl(item.model, true),
  );
