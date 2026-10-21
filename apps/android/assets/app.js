"use strict";
const $ = (id) => document.getElementById(id);
const t = window.AppText.text;
const categories = [
  ["全部", "全部", "#ed3b26", ""],
  ["益智", "益智", "#ffce27", "✦"],
  ["街机", "街机", "#eeb384", "↝"],
  ["竞速", "竞速", "#b8daf2", "↗"],
  ["冒险", "冒险", "#c3d99e", "⚑"],
  ["模拟", "模拟", "#f4c1a4", "⌂"],
  ["射击", "射击", "#d1c7e9", "◎"],
];
const bridge = window.Owngame;
let games = [],
  page = "home",
  category = "全部",
  mine = "downloaded";
const known = {
  "bamboo-rally": {
    "title": "竹影回珠",
    "subtitle": "竹庭水墨 · 拖拍对打",
    "category": "街机",
    "kind": "bamboo-rally",
    "cover": "art/rollout/bamboo-rally.png",
    "coverTitleBaked": true
  },
  "silk-serpent": {
    "title": "绢龙逐珠",
    "subtitle": "绢本灯庭 · 三档逐珠",
    "category": "街机",
    "kind": "silk-serpent",
    "cover": "art/rollout/silk-serpent.png",
    "coverTitleBaked": true
  },
  "petal-memory": {
    "title": "花笺拾忆",
    "subtitle": "纸本植物志 · 翻牌配对",
    "category": "益智",
    "kind": "petal-memory",
    "cover": "art/rollout/petal-memory.png",
    "coverTitleBaked": false
  },
  "kiln-merge": {
    "title": "窑火相融",
    "subtitle": "手绘陶坊 · 滑动合成",
    "category": "益智",
    "kind": "kiln-merge",
    "cover": "art/rollout/kiln-merge.png",
    "coverTitleBaked": true
  },
  "postcard-slide": {
    "title": "山城来信",
    "subtitle": "旅途水彩 · 三种尺寸",
    "category": "益智",
    "kind": "postcard-slide",
    "cover": "art/rollout/postcard-slide.png",
    "coverTitleBaked": true
  },
  "star-triad": {
    "title": "星图三连",
    "subtitle": "月光珐琅 · 单人 / 双人",
    "category": "益智",
    "kind": "star-triad"
  },
  "firefly-four": {
    "title": "萤灯四连",
    "subtitle": "萤火纸灯 · 单人 / 双人",
    "category": "益智",
    "kind": "firefly-four"
  },
  "moss-reversi": {
    "title": "苔庭翻面",
    "subtitle": "纸上苔庭 · 单人 / 双人",
    "category": "益智",
    "kind": "moss-reversi",
    "cover": "art/rollout/moss-reversi.png",
    "coverTitleBaked": true
  },
  "signal-harbor": {
    "title": "潮光归位",
    "subtitle": "琉璃灯塔 · 24 个谜题",
    "category": "益智",
    "kind": "harbor",
    "cover": "art/rollout/signal-harbor.png",
    "coverTitleBaked": true
  },
  "unlock-bolts-mobile": {
    "title": "螺帽之间",
    "subtitle": "珐琅工坊 · 颜色归类",
    "category": "益智",
    "kind": "bolts",
    "cover": "art/rollout/unlock-bolts-mobile.png",
    "coverTitleBaked": true
  },
  "wind-chime-memory": {
    "title": "风铃回响",
    "subtitle": "掌心陶庭 · 音色记忆",
    "category": "益智",
    "kind": "wind-chime-memory",
    "cover": "art/rollout/wind-chime-memory.png",
    "coverTitleBaked": true
  },
  "rc-rally": {
    "title": "遥控冲线",
    "subtitle": "遥控赛车 · 两圈计时",
    "category": "竞速",
    "kind": "rc-rally",
    "cover": "art/rollout/rc-rally.png",
    "coverTitleBaked": false
  },
  "faune-dungeon": {
    "title": "法恩探险",
    "subtitle": "像素地牢 · 寻宝撤离",
    "category": "冒险",
    "kind": "faune-dungeon",
    "cover": "art/rollout/faune-dungeon.png",
    "coverTitleBaked": false
  },
  "civ-clicker": {
    "title": "小小文明",
    "subtitle": "城邦经营 · 居民与生产",
    "category": "模拟",
    "kind": "civ-clicker",
    "cover": "art/rollout/civ-clicker.png",
    "coverTitleBaked": false
  },
  "neon-shooter": {
    "title": "霓虹突围",
    "subtitle": "太空射击 · 波次与首领",
    "category": "射击",
    "kind": "neon-shooter",
    "cover": "art/rollout/neon-shooter.png",
    "coverTitleBaked": false
  },
  "star-letters": {
    "title": "星野来信",
    "subtitle": "星球来信 · 3D 童话冒险",
    "category": "冒险",
    "kind": "star-letters",
    "cover": "art/rollout/star-letters.jpg",
    "coverTitleBaked": false
  },
  "tidal-reclaim": {
    "title": "潮汐回收站",
    "subtitle": "PC 射击 · 净化与撤离",
    "category": "射击",
    "kind": "tidal-reclaim",
    "cover": "art/rollout/tidal-reclaim.png",
    "coverTitleBaked": true
  },
  "crowd-runner": {
    "title": "人潮冲线",
    "subtitle": "选门跑酷 · 8 关",
    "category": "街机",
    "kind": "crowd-runner",
    "cover": "art/rollout/crowd-runner.png",
    "coverTitleBaked": true
  },
  "arrow-escape": {
    "title": "箭径出逃",
    "subtitle": "箭头解谜 · 36 关",
    "category": "益智",
    "kind": "arrow-escape",
    "cover": "art/rollout/arrow-escape.png",
    "coverTitleBaked": true
  }
};
function info(g) {
  const base = known[g.id] || {title: g.title, subtitle: "挑一款喜欢的，下载后随时开玩", category: g.category || "其他", kind: "generic"};
  const translated = AppText.game(g.id);
  return translated ? {...base, title: translated.title, subtitle: translated.subtitle} : base;
}
function applyLanguage() {
  document.documentElement.lang = AppText.language;
  document.title = t("owngame · 做属于自己的游戏");
  for (const [selector, key] of [
    ['.masthead h1','做属于自己的游戏'], ['.promise','不充钱、不看广告、离线爽玩'],
    ['.foot b','快乐，就这么简单。'], ['.foot > span','联网挑选和更新，下载后没网络也能玩。'],
    ['#sync span','刷新游戏库'], ['.bottom-nav [data-page="home"] span','游戏库'],
    ['.bottom-nav [data-page="categories"] span','分类'], ['.bottom-nav [data-page="mine"] span','我的游戏'],
  ]) { const node=document.querySelector(selector); if(node) node.textContent=t(key); }
  for (const [selector, attr, key] of [
    ['.mascot','alt','戴皇冠帽的 owngame 街机小伙伴'], ['#search','placeholder','搜索你喜欢的游戏'],
    ['#search','aria-label','搜索游戏'], ['#clear-search','aria-label','清除搜索'],
    ['#chips','aria-label','游戏分类'], ['.bottom-nav','aria-label','主要导航'],
  ]) { const node=document.querySelector(selector); if(node) node.setAttribute(attr,t(key)); }
  $('app-update').textContent=t(window.__appPlatform === 'ios' ? '关于苹果测试版' : '检查 App 更新');
}
window.applyAppLanguage = () => { $('status').textContent=''; render(); };
window.addEventListener('languagechange', window.applyAppLanguage);
function el(tag, cls, text) {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (text !== undefined) e.textContent = t(String(text));
  return e;
}
function icon(id) {
  const s = document.createElementNS("http://www.w3.org/2000/svg", "svg");
  const u = document.createElementNS("http://www.w3.org/2000/svg", "use");
  u.setAttribute("href", "#i-" + id);
  s.append(u);
  s.setAttribute("aria-hidden", "true");
  return s;
}
function art(g) {
  const kind = info(g).kind,
    a = el("div", "art art-" + kind);
  a.setAttribute("aria-hidden", "true");
  if (info(g).cover) {
    const img = el("img", "board-cover");
    img.src = info(g).cover;
    img.alt = "";
    a.append(img);
    return a;
  }
  if (kind === "star-triad") {
    const board = el("div", "moonlight-board");
    // Reuse the actual selected game art, so the cover matches what players open.
    for (const [cell, piece] of [[0, "star"], [2, "moon"], [4, "star"], [6, "moon"], [8, "star"]]) {
      const token = el("span", "moonlight-piece " + piece);
      token.style.left = (21 + (cell % 3) * 29) + "%";
      token.style.top = (20 + Math.floor(cell / 3) * 28) + "%";
      board.append(token);
    }
    a.append(board);
  } else if (kind === "firefly-four") {
    const board = el("div", "paper-lantern-board");
    const grid = el("div", "paper-lantern-grid");
    // A real gravity position, composed with the selected runtime lantern atlas.
    const occupied = new Map([[35,1],[28,2],[36,2],[37,1],[30,1],[23,2],[38,2],[31,1],[24,1],[17,2],[39,1],[32,2],[40,2],[41,1]]);
    for (let i = 0; i < 42; i++) {
      const cell = el("span", "paper-lantern-cell");
      if (occupied.has(i)) cell.append(el("span", "paper-lantern-token " + (occupied.get(i) === 1 ? "amber" : "jade")));
      grid.append(cell);
    }
    board.append(grid);
    a.append(board);
  } else if (["postcard-slide", "kiln-merge", "petal-memory", "silk-serpent", "bamboo-rally"].includes(kind)) {
    const img=el("img", "board-cover"); img.src="art/"+kind+".png"; img.alt=""; a.append(img);
  } else if (["moss-reversi"].includes(kind)) {
    const img=el("img", "board-cover"); img.src="art/"+kind+".svg"; img.alt=""; a.append(img);
  } else if (kind === "harbor") {
    const set = el("div", "tower-set");
    [
      ["b", "a"],
      ["a", "b"],
      ["c", "c"],
    ].forEach((colors) => {
      const tower = el("div", "tower"),
        img = el("img");
      img.src = "art/lighthouse.png";
      img.alt = "";
      tower.append(img);
      colors.forEach((s, i) => {
        const t = el("img", "signal" + (i ? " lower" : ""));
        t.src = "art/signal-" + s + ".png";
        t.alt = "";
        tower.append(t);
      });
      set.append(tower);
    });
    a.append(set);
  } else if (kind === "bolts") {
    const set = el("div", "bolt-set");
    [
      ["#d7826e", "#83b39b", "#d7826e"],
      ["#83b39b", "#dcc074", "#83b39b"],
      ["#dcc074", "#d7826e", "#dcc074"],
    ].forEach((colors) => {
      const b = el("div", "bolt");
      colors.forEach((c) => {
        const n = el("div", "nut");
        n.style.setProperty("--c", c);
        b.append(n);
      });
      set.append(b);
    });
    a.append(set);
  } else a.append(icon("game"));
  return a;
}
function play(g) {
  if (bridge) {
    if (g.downloaded) bridge.play(g.id);
    else bridge.download(g.id);
  } else onStatus("此处为界面预览，请在手机 App 中游玩。");
}
function size(g) {
  return ((g.bytes || 0) / 1048576).toFixed(1) + " MB";
}
function state(g) {
  if (g.downloading) return t("下载中 {percent}%", {percent:g.progress});
  if (g.update_available) return t("有更新 · 旧版可玩");
  return g.downloaded ? t("已下载 · 离线可玩") : t("下载后离线玩 · {size}", {size:size(g)});
}
function action(g) {
  if (g.downloaded) return "开玩 ›";
  if (g.downloading) return t("下载中 {percent}%", {percent:g.progress});
  return "下载 ↓";
}
function card(g) {
  const c = el("article", "card"),
    b = el("button", "card-open");
  b.setAttribute(
    "aria-label",
    t(g.downloaded ? "开始游戏：{title}" : "下载游戏：{title}", {title:info(g).title}),
  );
  b.disabled = !g.downloaded && g.busy;
  b.onclick = () => play(g);
  b.append(art(g));
  const copy = el("span", "card-copy");
  copy.append(el("h3", "", info(g).title), el("span", "sub", state(g)));
  copy.append(el("span", "play-arrow", action(g)));
  b.append(copy);
  const f = el("button", "fav", g.favorite ? "★" : "☆");
  f.setAttribute(
    "aria-label",
    t(g.favorite ? "取消收藏：{title}" : "收藏：{title}", {title:info(g).title}),
  );
  f.setAttribute("aria-pressed", String(!!g.favorite));
  f.onclick = () => {
    if (bridge) bridge.favorite(g.id);
  };
  c.append(b, f);
  if (g.update_available || g.previous_version) {
    const actions = el("div", "download-actions");
    if (g.update_available) {
      const update = el(
        "button",
        "update-button",
        g.downloading ? t("下载中 {percent}%",{percent:g.progress}) : t("更新 · {size}",{size:size(g)}),
      );
      update.setAttribute("aria-label", t("更新游戏：{title}",{title:info(g).title}));
      update.disabled = g.busy;
      update.onclick = () => bridge && bridge.download(g.id);
      actions.append(update);
    }
    if (g.previous_version) {
      const rollback = el("button", "rollback-button", "恢复上一版");
      rollback.setAttribute("aria-label", t("恢复上一版：{title}",{title:info(g).title}));
      rollback.disabled = g.busy;
      rollback.onclick = () => bridge && bridge.rollback(g.id);
      actions.append(rollback);
    }
    c.append(actions);
  }
  return c;
}
function heading(title, note) {
  const h = el("div", "section-head");
  h.append(el("h2", "", title), el("small", "", note));
  return h;
}
function feature(g) {
  const c = el("article", "feature");
  c.append(art(g));
  const copy = el("div", "featured-copy");
  copy.append(el("span", "stamp", "今天，玩点喜欢的"));
  if (!info(g).coverTitleBaked || AppText.language === "en") copy.append(
    el("h2", "", info(g).title),
    el(
      "p",
      "",
      info(g).kind === "harbor"
        ? "点亮一盏灯，\n找回片刻宁静。"
        : info(g).subtitle,
    ),
  );
  const b = el(
    "button",
    "launch",
    g.downloaded ? "开玩 ▶" : g.downloading ? g.progress + "%" : "下载 ↓",
  );
  b.disabled = !g.downloaded && g.busy;
  b.setAttribute("aria-label", t(g.downloaded ? "开玩：{title}" : "下载：{title}", {title:info(g).title}));
  b.onclick = () => play(g);
  c.append(copy, el("span", "feature-meta", state(g)), b);
  return c;
}
function empty(title, text) {
  const c = el("div", "empty");
  c.append(el("h3", "", title), el("p", "", text));
  const b = el("button", "small-button", "去游戏库看看");
  b.onclick = goHome;
  c.append(b);
  return c;
}
function filtered() {
  const query = $("search").value.trim().toLocaleLowerCase();
  return games.filter(
    (g) =>
      (category === "全部" || info(g).category === category) &&
      (!query ||
        (g.title + " " + g.description + " " + info(g).title + " " + (known[g.id]?.title || ""))
          .toLocaleLowerCase()
          .includes(query)),
  );
}
function render() {
  applyLanguage();
  document
    .querySelectorAll(".bottom-nav button")
    .forEach((b) =>
      b.setAttribute(
        "aria-current",
        b.dataset.page === page ? "page" : "false",
      ),
    );
  $("clear-search").hidden = !$("search").value;
  $("chips").hidden = page !== "home";
  $("chips").replaceChildren();
  categories.forEach(([name]) => {
    const b = el("button", "chip" + (name === category ? " active" : ""), name);
    b.setAttribute("aria-pressed", String(name === category));
    b.onclick = () => {
      category = name;
      render();
    };
    $("chips").append(b);
  });
  const target = $("content");
  target.replaceChildren();
  let list = filtered();
  if (page === "categories") {
    target.append(heading("今天想玩什么？", "按喜好挑选"));
    const grid = el("div", "categories");
    categories.slice(1).forEach(([name, label, tint, mark]) => {
      const n = games.filter((g) => info(g).category === name).length;
      const b = el("button", "category");
      b.style.setProperty("--tint", tint);
      b.append(
        el("b", "", label),
        el("span", "", n ? t("{count} 款游戏", {count:n}) : "还没有游戏"),
        el("i", "", mark),
      );
      b.onclick = () => {
        page = "home";
        category = name;
        $("search").value = "";
        render();
        window.scrollTo(0, 0);
      };
      grid.append(b);
    });
    target.append(grid);
    return;
  }
  if (page === "mine") {
    target.append(heading("我的游戏", "喜欢的，都在这儿"));
    const tabs = el("div", "mine-tabs");
    [
      ["downloaded", "已下载"],
      ["favorites", "收藏"],
      ["recent", "最近玩过"],
    ].forEach(([id, text]) => {
      const b = el("button", mine === id ? "active" : "", text);
      b.setAttribute("aria-pressed", String(mine === id));
      b.onclick = () => {
        mine = id;
        render();
      };
      tabs.append(b);
    });
    target.append(tabs);
    list = list.filter((g) =>
      mine === "favorites"
        ? g.favorite
        : mine === "recent"
          ? g.last_played > 0
          : g.downloaded,
    );
    if (mine === "recent") list.sort((a, b) => b.last_played - a.last_played);
  } else {
    if (!$("search").value.trim() && category === "全部" && games.length) {
      target.append(
        feature(games.find((g) => g.id === "neon-shooter") || games[0]),
      );
    }
    target.append(
      heading(
        $("search").value.trim()
          ? "找到的游戏"
          : category === "全部"
            ? "你的快乐游戏库"
            : t("{category}游戏", {category:t(category)}),
        t("{count} 款 · 下载后离线玩", {count:list.length}),
      ),
    );
  }
  if (!list.length) {
    target.append(
      empty(
        mine === "favorites" && page === "mine"
          ? "把喜欢的游戏留在这里"
          : page === "mine" && mine === "recent"
            ? "还没有玩过游戏"
            : "还没找到这款快乐",
        page === "mine" && mine === "favorites"
          ? "点游戏卡上的星星，或在游戏的「···」里收藏。"
          : $("search").value.trim()
            ? "换个名字搜搜，或者回到全部游戏。"
            : "联网刷新游戏库，挑一款下载；下载完成后没网络也能玩。",
      ),
    );
    return;
  }
  const grid = el("div", "game-grid");
  list.forEach((g) => grid.append(card(g)));
  target.append(grid);
}
window.onStatus = (text) => {
  $("status").textContent = t(text);
};
window.setSafeArea = (top, bottom) => {
  document.documentElement.style.setProperty(
    "--safe-top",
    Math.max(top, 12) + "px",
  );
  document.documentElement.style.setProperty(
    "--safe-bottom",
    Math.max(bottom, 8) + "px",
  );
};
window.refresh = () => {
  try {
    games = bridge ? JSON.parse(bridge.list()) : [];
  } catch {
    games = [];
    onStatus("游戏列表暂时无法读取，试试重新打开 App。");
  }
  render();
};
window.goHome = () => {
  page = "home";
  category = "全部";
  $("search").value = "";
  refresh();
  window.scrollTo(0, 0);
};
window.backToHome = () => {
  if (page !== "home" || category !== "全部" || $("search").value) {
    goHome();
    return true;
  }
  return false;
};
$("search").addEventListener("input", () => {
  if (page === "categories") page = "home";
  render();
});
$("clear-search").onclick = () => {
  $("search").value = "";
  render();
  $("search").focus();
};
$("sync").onclick = () => {
  if (bridge) bridge.sync();
  else onStatus("请在手机 App 中刷新公网游戏库。");
};
$("search").onkeydown = (event) => {
  if (event.key === "Enter") $("search").blur();
};
$("app-update").onclick = () => {
  if (bridge && bridge.checkAppUpdate) bridge.checkAppUpdate();
  else onStatus("请在手机 App 中检查版本更新。");
};
document.querySelectorAll(".bottom-nav button").forEach(
  (b) =>
    (b.onclick = () => {
      page = b.dataset.page;
      category = "全部";
      $("search").value = "";
      render();
      window.scrollTo(0, 0);
    }),
);
refresh();
