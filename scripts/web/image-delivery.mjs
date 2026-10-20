// Apply optimized art to the shell only; published game packages stay immutable.
export function imageHtml(html, assets, icons) {
  return html
    .replace(/<img\b[^>]*>/g, (tag) =>
      tag.replace(/src="(\/art\/[^"?]+)"/, (match, source) => {
        const image = assets[source];
        return image ? `src="${image.src}"` : match;
      }),
    )
    .replace(
      /(<link\b[^>]*rel="icon"[^>]*href=")[^"]+("[^>]*>)/g,
      `$1${icons[64]}$2`,
    );
}
export function imageCss(css, assets) {
  return css.replace(
    /url\((['"]?)(\/?art\/[^)'"?]+)\1\)/g,
    (match, quote, source) => {
      const image = assets[source.startsWith("/") ? source : "/" + source];
      return image ? `url("${image.src}")` : match;
    },
  );
}
