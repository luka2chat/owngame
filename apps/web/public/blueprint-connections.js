// Route display-only connections through the free space around the cards.
// The public board's positions and relationships remain the source of truth.
// Match the card's logical dimensions before canvas zoom.
const W = 268,
  H = 208,
  clearance = 14;
const inside = (p, r) =>
  p.x > r.x && p.x < r.x + r.w && p.y > r.y && p.y < r.y + r.h;
const blocked = (a, b, rects) =>
  rects.some((r) =>
    a.x === b.x
      ? a.x > r.x &&
        a.x < r.x + r.w &&
        Math.max(a.y, b.y) > r.y &&
        Math.min(a.y, b.y) < r.y + r.h
      : a.y > r.y &&
        a.y < r.y + r.h &&
        Math.max(a.x, b.x) > r.x &&
        Math.min(a.x, b.x) < r.x + r.w,
  );
const distance = (a, b) => Math.abs(a.x - b.x) + Math.abs(a.y - b.y);
const simplify = (points) =>
  points.filter(
    (p, i) =>
      !i ||
      i === points.length - 1 ||
      !(
        (points[i - 1].x === p.x && p.x === points[i + 1].x) ||
        (points[i - 1].y === p.y && p.y === points[i + 1].y)
      ),
  );
function ports(r, offset) {
  return [
    [
      { x: r.x + W + 4, y: r.y + H / 2 + offset },
      { x: r.x + W + 20, y: r.y + H / 2 + offset },
      0,
    ],
    [
      { x: r.x - 4, y: r.y + H / 2 + offset },
      { x: r.x - 20, y: r.y + H / 2 + offset },
      0,
    ],
    [
      { x: r.x + W / 2 + offset, y: r.y - 4 },
      { x: r.x + W / 2 + offset, y: r.y - 20 },
      1,
    ],
    [
      { x: r.x + W / 2 + offset, y: r.y + H + 4 },
      { x: r.x + W / 2 + offset, y: r.y + H + 20 },
      1,
    ],
  ];
}
function congestion(a, b, used) {
  let cost = 0;
  for (const points of used)
    for (let i = 1; i < points.length; i++) {
      const c = points[i - 1],
        d = points[i],
        horizontal = a.y === b.y,
        other = c.y === d.y;
      if (horizontal === other) {
        if (horizontal ? a.y !== c.y : a.x !== c.x) continue;
        const axis = horizontal ? "x" : "y";
        const overlap =
          Math.min(Math.max(a[axis], b[axis]), Math.max(c[axis], d[axis])) -
          Math.max(Math.min(a[axis], b[axis]), Math.min(c[axis], d[axis]));
        if (overlap > 0) cost += overlap * 0.8;
      } else {
        const h = horizontal ? [a, b] : [c, d],
          v = horizontal ? [c, d] : [a, b];
        if (
          v[0].x > Math.min(h[0].x, h[1].x) &&
          v[0].x < Math.max(h[0].x, h[1].x) &&
          h[0].y > Math.min(v[0].y, v[1].y) &&
          h[0].y < Math.max(v[0].y, v[1].y)
        )
          cost += 55;
      }
    }
  return cost;
}
function search(source, target, rects, width, height, offset, used) {
  const sourcePorts = ports(source, offset),
    targetPorts = ports(target, offset);
  const start = source.id === target.id ? [sourcePorts[0]] : sourcePorts,
    end = source.id === target.id ? [targetPorts[3]] : targetPorts,
    obstacles = rects.map((r) => ({
      x: r.x - clearance,
      y: r.y - clearance,
      w: W + clearance * 2,
      h: H + clearance * 2,
    }));
  const xs = new Set([8, width - 8]),
    ys = new Set([8, height - 8]);
  for (const r of obstacles) {
    xs.add(r.x);
    xs.add(r.x + r.w);
    ys.add(r.y);
    ys.add(r.y + r.h);
  }
  // Multiple tracks in each corridor keep returns and branches separate.
  for (const values of [xs, ys]) {
    const sorted = [...values].sort((a, b) => a - b);
    for (let i = 1; i < sorted.length; i++)
      if (sorted[i] - sorted[i - 1] > 40) {
        const mid = (sorted[i] + sorted[i - 1]) / 2;
        for (const d of [-12, 0, 12]) values.add(mid + d);
      }
  }
  for (const [, p] of [...start, ...end]) {
    xs.add(p.x);
    ys.add(p.y);
  }
  const x = [...xs].filter((v) => v >= 0 && v <= width).sort((a, b) => a - b),
    y = [...ys].filter((v) => v >= 0 && v <= height).sort((a, b) => a - b),
    nx = x.length;
  const point = (id) => ({ x: x[id % nx], y: y[Math.floor(id / nx)] });
  const node = (p) => y.indexOf(p.y) * nx + x.indexOf(p.x),
    ends = new Map(end.map((p, i) => [node(p[1]), i]));
  const open = [],
    best = new Map(),
    previous = new Map(),
    origin = new Map();
  const heuristic = (p) => Math.min(...end.map((e) => distance(p, e[1])));
  start.forEach((port, i) => {
    if (obstacles.some((r) => inside(port[1], r))) return;
    const id = node(port[1]),
      key = id * 2 + port[2],
      g = 16;
    open.push({ id, dir: port[2], g, f: g + heuristic(port[1]), key });
    best.set(key, g);
    origin.set(key, i);
  });
  let steps = 0;
  while (open.length && steps++ < 16000) {
    let index = 0;
    for (let i = 1; i < open.length; i++)
      if (open[i].f < open[index].f) index = i;
    const current = open.splice(index, 1)[0];
    if (current.g !== best.get(current.key)) continue;
    if (ends.has(current.id)) {
      const destination = end[ends.get(current.id)];
      const points = [];
      let key = current.key;
      while (key !== undefined) {
        points.unshift(point(Math.floor(key / 2)));
        key = previous.get(key);
      }
      return simplify([
        start[origin.get(current.key)][0],
        ...points,
        destination[0],
      ]);
    }
    const p = point(current.id),
      ix = current.id % nx,
      iy = Math.floor(current.id / nx);
    for (const [dx, dy, dir] of [
      [-1, 0, 0],
      [1, 0, 0],
      [0, -1, 1],
      [0, 1, 1],
    ]) {
      if (ix + dx < 0 || ix + dx >= nx || iy + dy < 0 || iy + dy >= y.length)
        continue;
      const id = (iy + dy) * nx + ix + dx,
        q = point(id);
      if (blocked(p, q, obstacles)) continue;
      const key = id * 2 + dir,
        g =
          current.g +
          distance(p, q) +
          (dir !== current.dir ? 18 : 0) +
          congestion(p, q, used);
      if (g >= (best.get(key) ?? Infinity)) continue;
      best.set(key, g);
      previous.set(key, current.key);
      origin.set(key, origin.get(current.key));
      open.push({ id, dir, g, f: g + heuristic(q), key });
    }
  }
  return null;
}
export function roundedConnection(points) {
  if (!points?.length) return "";
  let path = `M ${points[0].x} ${points[0].y}`;
  for (let i = 1; i < points.length - 1; i++) {
    const a = points[i - 1],
      b = points[i],
      c = points[i + 1],
      radius = Math.min(7, distance(a, b) / 2, distance(b, c) / 2);
    const before = {
        x: b.x + Math.sign(a.x - b.x) * radius,
        y: b.y + Math.sign(a.y - b.y) * radius,
      },
      after = {
        x: b.x + Math.sign(c.x - b.x) * radius,
        y: b.y + Math.sign(c.y - b.y) * radius,
      };
    path += ` L ${before.x} ${before.y} Q ${b.x} ${b.y} ${after.x} ${after.y}`;
  }
  const last = points.at(-1);
  return path + ` L ${last.x} ${last.y}`;
}
export function routeBlueprintConnections(cards, edges, width, height) {
  const byId = new Map(cards.map((c) => [c.id, c])),
    used = [],
    labels = [];
  const visible = edges.filter((e) => byId.has(e.from) && byId.has(e.to));
  const ordered = visible
    .map((edge, index) => ({ edge, index }))
    .sort(
      (a, b) =>
        distance(byId.get(a.edge.from), byId.get(a.edge.to)) -
          distance(byId.get(b.edge.from), byId.get(b.edge.to)) ||
        a.index - b.index,
    );
  const result = [];
  for (const { edge, index } of ordered) {
    const points = search(
      byId.get(edge.from),
      byId.get(edge.to),
      cards,
      width,
      height,
      ((index % 5) - 2) * 12,
      used,
    );
    if (!points) continue;
    used.push(points);
    const text = [...(edge.label || "")].slice(0, 20).join(""),
      labelWidth = Math.max(
        40,
        [...text].reduce(
          (sum, c) => sum + (/[\u0000-\u007f]/.test(c) ? 7 : 12),
          0,
        ) + 12,
      );
    let label;
    for (let i = 1; i < points.length && !label; i++) {
      const a = points[i - 1],
        b = points[i];
      if (a.y !== b.y || Math.abs(a.x - b.x) < labelWidth + 8) continue;
      for (const f of [0.5, 0.3, 0.7]) {
        const box = {
          x: a.x + (b.x - a.x) * f - labelWidth / 2,
          y: a.y - 12,
          w: labelWidth,
          h: 24,
        };
        if (
          box.x < 0 ||
          box.x + box.w > width ||
          box.y < 0 ||
          box.y + box.h > height
        )
          continue;
        if (
          cards.some(
            (r) =>
              box.x < r.x + W + 5 &&
              box.x + box.w > r.x - 5 &&
              box.y < r.y + H + 5 &&
              box.y + box.h > r.y - 5,
          ) ||
          labels.some(
            (r) =>
              box.x < r.x + r.w + 6 &&
              box.x + box.w > r.x - 6 &&
              box.y < r.y + r.h + 6 &&
              box.y + box.h > r.y - 6,
          )
        )
          continue;
        label = { ...box, text };
        labels.push(box);
        break;
      }
    }
    result.push({ ...edge, points, path: roundedConnection(points), label });
  }
  return result;
}
