import { routeBlueprintConnections } from "./blueprint-connections.js";
import { mediaThumbnail, appendMediaGallery } from "./blueprint-media.js";
import { element } from "./data.js";
import { t, localizeGame } from "./i18n.js";
import { openRemix } from "./remix.js";

const button = (label, action, cls = "") => {
  const node = element("button", "blueprint-button " + cls, label);
  node.type = "button";
  node.onclick = action;
  return node;
};

export function openBlueprint(game) {
  const previous = document.getElementById("blueprint-dialog");
  if (previous?.open) return;
  previous?.remove();
  const dialog = element("dialog", "blueprint-dialog");
  dialog.id = "blueprint-dialog";
  dialog.setAttribute("aria-labelledby", "blueprint-title");
  const close = button("×", () => dialog.close(), "blueprint-close");
  const title = element("h2");
  title.id = "blueprint-title";
  const note = element("p", "blueprint-note");
  const content = element("div", "blueprint-content");
  dialog.append(
    close,
    element("div", "eyebrow", "BEHIND THE GAME"),
    title,
    note,
    content,
  );
  document.body.append(dialog);
  dialog.showModal();
  const controller = new AbortController();
  let documentData,
    meta,
    section = "overview",
    selected,
    zoom = 1,
    query = "";
  let viewport, board, surface, inspector;

  function labels() {
    close.setAttribute("aria-label", t("关闭蓝图"));
    title.textContent = t("蓝图 · {title}", {
      title: localizeGame(game).title,
    });
    note.textContent = t(
      "看看这个游戏是怎样设计的：玩法、流程、世界、关卡与素材。公开设计快照，只读浏览。",
    );
    if (documentData) render();
  }
  function selectCard(id) {
    const card = documentData.project.cards.find((c) => c.id === id);
    if (!card) return;
    const switched = section !== card.section;
    section = card.section;
    selected = id;
    query = "";
    render();
    if (switched) fit();
    const node = [...board.querySelectorAll(".blueprint-card")].find(
      (n) => n.dataset.cardId === id,
    );
    node?.scrollIntoView({ block: "nearest", inline: "nearest" });
  }
  function render() {
    const project = documentData.project;
    const cards = project.cards.filter((c) => c.section === section);
    if (!cards.some((c) => c.id === selected)) selected = cards[0]?.id;
    content.replaceChildren();
    const heading = element(
      "p",
      "blueprint-experience",
      project.experience || project.tagline,
    );
    const nav = element("nav", "blueprint-sections");
    nav.setAttribute("aria-label", t("蓝图区域"));
    for (const area of meta.sections) {
      const count = project.cards.filter((c) => c.section === area.id).length;
      const tab = button(`${area.icon} ${t(area.name)} · ${count}`, () => {
        section = area.id;
        selected = undefined;
        query = "";
        render();
        fit();
      });
      tab.setAttribute("aria-pressed", String(section === area.id));
      nav.append(tab);
    }
    const tools = element("div", "blueprint-tools");
    const search = element("input");
    search.type = "search";
    search.placeholder = t("搜索整张蓝图");
    search.setAttribute("aria-label", t("搜索整张蓝图"));
    search.value = query;
    const results = element("div", "blueprint-results");
    results.setAttribute("aria-live", "polite");
    function searchCards() {
      results.replaceChildren();
      results.hidden = !query.trim();
      if (!query.trim()) return;
      const found = project.cards.filter((c) =>
        [c.title, c.body, ...Object.values(c.fields)]
          .join(" ")
          .toLocaleLowerCase()
          .includes(query.trim().toLocaleLowerCase()),
      );
      results.append(
        element("p", "", t("找到 {count} 张卡片", { count: found.length })),
      );
      for (const card of found)
        results.append(
          button(
            `${t(meta.sections.find((s) => s.id === card.section).name)} / ${card.title}`,
            () => selectCard(card.id),
          ),
        );
    }
    search.oninput = () => {
      query = search.value;
      searchCards();
    };
    const zoomLabel = element("span", "blueprint-zoom");
    function scale(next) {
      zoom = Math.max(0.05, Math.min(1.5, next));
      applyZoom();
      zoomLabel.textContent = Math.round(zoom * 100) + "%";
    }
    tools.append(
      search,
      button(t("适合画布"), () => {
        fit();
        scale(zoom);
      }),
      button("−", () => scale(zoom - 0.1)),
      zoomLabel,
      button("＋", () => scale(zoom + 0.1)),
    );
    tools.children[2].setAttribute("aria-label", t("缩小画布"));
    tools.children[4].setAttribute("aria-label", t("放大画布"));
    const layout = element("div", "blueprint-layout");
    viewport = element("div", "blueprint-viewport");
    viewport.tabIndex = 0;
    viewport.setAttribute("aria-label", t("蓝图画布"));
    surface = element("div", "blueprint-surface");
    board = element("div", "blueprint-board");
    surface.append(board);
    viewport.append(surface);
    inspector = element("section", "blueprint-inspector");
    inspector.setAttribute("aria-label", t("卡片详情"));
    layout.append(viewport, inspector);
    const footer = element("div", "blueprint-footer");
    const download = element("a", "blueprint-button", t("下载蓝图"));
    download.href = "/blueprints/" + encodeURIComponent(game.id) + ".json";
    download.download = game.id + "-game-outline.json";
    footer.append(
      element(
        "span",
        "",
        t("卡片状态来自设计记录；验证范围请以卡片正文为准。"),
      ),
      download,
      button(
        t("↻ 复刻"),
        () => {
          dialog.close();
          openRemix(game);
        },
        "blueprint-remix",
      ),
    );
    content.append(heading, nav, tools, results, layout, footer);
    searchCards();
    drawCards(cards);
    renderDetail();
    scale(zoom);
  }
  function applyZoom() {
    board.style.transform = `scale(${zoom})`;
    surface.style.width = board.offsetWidth * zoom + "px";
    surface.style.height = board.offsetHeight * zoom + "px";
    const label = content.querySelector(".blueprint-zoom");
    if (label) label.textContent = Math.round(zoom * 100) + "%";
  }
  function fit() {
    if (!board || !viewport.clientWidth) return;
    zoom = Math.max(
      0.02,
      Math.min(
        1,
        (viewport.clientWidth - 12) / board.offsetWidth,
        (viewport.clientHeight - 12) / board.offsetHeight,
      ),
    );
    applyZoom();
    viewport.scrollTo(0, 0);
  }
  function drawCards(cards) {
    if (!cards.length) {
      board.append(
        element("p", "blueprint-empty", t("这个区域还没有公开的设计卡片。")),
      );
      board.style.width = "320px";
      board.style.height = "200px";
      return;
    }
    const minX = Math.min(...cards.map((c) => c.x)),
      minY = Math.min(...cards.map((c) => c.y));
    const positions = new Map(
      cards.map((c, index) => [
        c.id,
        ["assets", "levels"].includes(section)
          ? { x: index * 300 + 32, y: 32 }
          : { x: c.x - minX + 32, y: c.y - minY + 32 },
      ]),
    );
    const width = Math.max(...[...positions.values()].map((p) => p.x + 300)),
      height = Math.max(...[...positions.values()].map((p) => p.y + 240));
    board.style.width = width + "px";
    board.style.height = height + "px";
    const ns = "http://www.w3.org/2000/svg",
      svg = document.createElementNS(ns, "svg");
    svg.setAttribute("width", width);
    svg.setAttribute("height", height);
    svg.setAttribute("aria-hidden", "true");
    svg.setAttribute("aria-hidden", "true");
    const defs = document.createElementNS(ns, "defs");
    for (const state of ["active", "muted"]) {
      const marker = document.createElementNS(ns, "marker"),
        arrow = document.createElementNS(ns, "path");
      marker.id = "blueprint-arrow-" + state;
      marker.classList.add("blueprint-arrow-" + state);
      marker.setAttribute("viewBox", "0 0 10 10");
      marker.setAttribute("refX", "9");
      marker.setAttribute("refY", "5");
      marker.setAttribute("markerWidth", "7");
      marker.setAttribute("markerHeight", "7");
      marker.setAttribute("orient", "auto");
      arrow.setAttribute("d", "M 0 0 L 10 5 L 0 10 z");
      marker.append(arrow);
      defs.append(marker);
    }
    svg.append(defs);
    const nodes = cards.map((card) => ({
      id: card.id,
      ...positions.get(card.id),
    }));
    for (const edge of routeBlueprintConnections(
      nodes,
      documentData.project.edges,
      width,
      height,
    )) {
      const group = document.createElementNS(ns, "g");
      group.classList.add("blueprint-connection");
      group.dataset.from = edge.from;
      group.dataset.to = edge.to;
      group.dataset.points = JSON.stringify(edge.points);
      for (const kind of ["halo", "line"]) {
        const path = document.createElementNS(ns, "path");
        path.classList.add("blueprint-connection-" + kind);
        path.setAttribute("d", edge.path);
        path.setAttribute("vector-effect", "non-scaling-stroke");
        group.append(path);
      }
      if (edge.label) {
        const label = document.createElementNS(ns, "g"),
          rect = document.createElementNS(ns, "rect"),
          text = document.createElementNS(ns, "text");
        label.classList.add("blueprint-connection-label");
        for (const key of ["x", "y", "width", "height"])
          rect.setAttribute(
            key,
            edge.label[key === "width" ? "w" : key === "height" ? "h" : key],
          );
        rect.setAttribute("rx", "5");
        text.setAttribute("x", edge.label.x + edge.label.w / 2);
        text.setAttribute("y", edge.label.y + edge.label.h / 2);
        text.textContent = edge.label.text;
        label.append(rect, text);
        group.append(label);
      }
      svg.append(group);
    }
    board.append(svg);
    for (const card of cards) {
      const node = button(
        "",
        () => {
          selected = card.id;
          for (const child of board.querySelectorAll(".blueprint-card"))
            child.setAttribute(
              "aria-pressed",
              String(child.dataset.cardId === selected),
            );
          renderDetail();
          updateConnections();
        },
        "blueprint-card color-" + meta.types[card.type].color,
      );
      node.dataset.cardId = card.id;
      node.setAttribute("aria-pressed", String(selected === card.id));
      node.setAttribute(
        "aria-label",
        t("查看卡片：{title}", { title: card.title }),
      );
      const position = positions.get(card.id);
      node.style.left = position.x + "px";
      node.style.top = position.y + "px";
      const media = mediaThumbnail(documentData.assets?.[card.id], card.title);
      if (media) node.classList.add("has-media");
      node.append(
        element("span", "blueprint-card-type", t(meta.types[card.type].name)),
        ...(media ? [media] : []),
        element("strong", "", card.title),
        element(
          "span",
          "blueprint-card-body",
          card.body || Object.values(card.fields).filter(Boolean).join("\n"),
        ),
        element("span", "blueprint-card-status", t(meta.statuses[card.status])),
      );
      board.append(node);
    }
    updateConnections();
  }
  function updateConnections() {
    for (const edge of board.querySelectorAll(".blueprint-connection")) {
      const active =
        edge.dataset.from === selected || edge.dataset.to === selected;
      edge.classList.toggle("is-active", active);
      edge
        .querySelector(".blueprint-connection-line")
        .setAttribute(
          "marker-end",
          "url(#blueprint-arrow-" + (active ? "active" : "muted") + ")",
        );
      if (active) edge.parentElement.append(edge);
    }
  }
  function renderDetail() {
    inspector.replaceChildren();
    const project = documentData.project,
      card = project.cards.find((c) => c.id === selected);
    if (!card) return;
    inspector.append(
      element("h3", "", card.title),
      element(
        "p",
        "blueprint-detail-meta",
        `${t(meta.types[card.type].name)} · ${t(meta.statuses[card.status])}`,
      ),
    );
    if (section === "overview" && project.scope) {
      const scope = element("details", "blueprint-scope");
      scope.append(
        element("summary", "", t("设计范围与说明")),
        element("p", "", project.scope),
      );
      inspector.append(scope);
    }
    const asset = documentData.assets?.[card.id];
    appendMediaGallery(inspector, asset, card.title);
    if (card.body) inspector.append(element("p", "blueprint-body", card.body));
    const fields = element("dl", "blueprint-fields");
    for (const [key, value] of Object.entries(card.fields))
      if (value)
        fields.append(
          element("dt", "", t(meta.types[card.type].fields[key] || key)),
          element("dd", "", value),
        );
    inspector.append(fields);
    if (asset?.source && !asset.items?.length) {
      const link = element("a", "blueprint-asset-link", t("查看源素材 ↗"));
      link.href = asset.source;
      link.target = "_blank";
      link.rel = "noopener";
      inspector.append(link);
    }
    const relations = project.edges.filter(
      (e) => e.from === card.id || e.to === card.id,
    );
    if (relations.length) {
      inspector.append(element("h4", "", t("关联卡片")));
      for (const edge of relations) {
        const outgoing = edge.from === card.id,
          other = project.cards.find(
            (c) => c.id === (outgoing ? edge.to : edge.from),
          );
        inspector.append(
          button(
            `${outgoing ? "→" : "←"} ${edge.label || t("关联")} · ${other.title}`,
            () => selectCard(other.id),
            "blueprint-relation",
          ),
        );
      }
    }
    inspector.scrollTop = 0;
  }
  async function load() {
    content.replaceChildren(
      element("p", "blueprint-loading", t("正在打开蓝图…")),
    );
    try {
      const responses = await Promise.all([
        fetch("/blueprints/" + encodeURIComponent(game.id) + ".json", {
          signal: controller.signal,
        }),
        fetch("/blueprints/meta.json", { signal: controller.signal }),
      ]);
      if (responses.some((r) => !r.ok)) throw Error("unavailable");
      const [data, schema] = await Promise.all(responses.map((r) => r.json()));
      if (
        data.schema !== "owngame-outline" ||
        data.gameId !== game.id ||
        !Array.isArray(data.project?.cards) ||
        !Array.isArray(data.project?.edges) ||
        !Array.isArray(schema.sections)
      )
        throw Error("invalid");
      if (!dialog.open) return;
      documentData = data;
      meta = schema;
      render();
      requestAnimationFrame(() => {
        if (dialog.open && window.innerWidth > 600) fit();
      });
    } catch {
      if (controller.signal.aborted) return;
      content.replaceChildren(
        element(
          "p",
          "blueprint-loading",
          t("暂时无法打开这款游戏的公开蓝图，请稍后重试。"),
        ),
        button(t("重试"), load),
      );
    }
  }
  labels();
  void load();
  window.addEventListener("owngame:languagechange", labels);
  dialog.addEventListener(
    "close",
    () => {
      controller.abort();
      window.removeEventListener("owngame:languagechange", labels);
    },
    { once: true },
  );
}
