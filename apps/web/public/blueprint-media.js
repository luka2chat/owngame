import { element } from "./data.js";
import { t } from "./i18n.js";

import { safeMediaUrl, mediaItems } from "./blueprint-media-policy.js";

function visual(item, title, interactive = false) {
  if (safeMediaUrl(item.preview)) {
    const img = element("img", "blueprint-media-image");
    img.src = item.preview;
    img.alt = title;
    img.loading = "lazy";
    img.decoding = "async";
    img.onerror = () =>
      img.replaceWith(
        element(
          "span",
          "blueprint-media-error",
          t("预览暂不可用，可查看源素材。"),
        ),
      );
    return img;
  }
  const frame = element("iframe", "blueprint-media-model");
  frame.src =
    "/blueprint-model.html?file=" +
    encodeURIComponent(item.model) +
    (interactive ? "&interactive=1" : "");
  frame.title = t("三维模型：{title}", { title });
  frame.loading = "lazy";
  frame.tabIndex = interactive ? 0 : -1;
  return frame;
}

function openMedia(item, title) {
  const dialog = element("dialog", "blueprint-media-dialog");
  const heading = element("h3", "", title),
    close = element("button", "blueprint-button blueprint-media-close", "×");
  close.type = "button";
  close.setAttribute("aria-label", t("关闭素材预览"));
  close.onclick = () => dialog.close();
  dialog.setAttribute("aria-label", title);
  dialog.append(close, heading, visual(item, title, true));
  if (item.model) dialog.append(element("p", "", t("拖动旋转 · 滚动缩放")));
  dialog.addEventListener("close", () => dialog.remove(), { once: true });
  document.body.append(dialog);
  dialog.showModal();
  close.focus();
}

export function mediaThumbnail(asset, title) {
  const items = mediaItems(asset);
  if (!items.length) return null;
  const host = element("span", "blueprint-media-thumb");
  host.append(
    visual(items[0], title),
    element(
      "span",
      "blueprint-media-badge",
      items[0].model
        ? t("3D 模型")
        : t("{count} 张素材", { count: items.length }),
    ),
  );
  return host;
}

export function appendMediaGallery(host, asset, title) {
  const items = mediaItems(asset);
  if (!items.length) return;
  const gallery = element("div", "blueprint-media-gallery");
  for (const item of items) {
    const name = item.title || title;
    const figure = element("figure", "blueprint-media-figure"),
      expand = element("button", "blueprint-media-expand");
    expand.type = "button";
    expand.setAttribute("aria-label", t("放大查看：{title}", { title: name }));
    expand.append(
      visual(item, name),
      element(
        "span",
        "blueprint-media-badge",
        item.model ? t("查看 3D ↗") : t("放大查看 ↗"),
      ),
    );
    expand.onclick = () => openMedia(item, name);
    figure.append(expand, element("figcaption", "", name));
    if (item.source) {
      const link = element("a", "blueprint-media-source", t("查看源素材 ↗"));
      link.href = item.source;
      link.target = "_blank";
      link.rel = "noopener";
      figure.append(link);
    }
    gallery.append(figure);
  }
  host.append(gallery);
}
