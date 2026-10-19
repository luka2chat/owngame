import { RULES } from "./rules";
export function fitLayout(w: number, h: number) {
  const portrait = h / w >= 1.45,
    scale = portrait ? w / 720 : Math.min(w / 720, h / 1280);
  const height = portrait ? Math.ceil(h / scale) : 1280;
  const controlHeight = Math.max(96, 44 / scale),
    playTop = 340,
    playBottom = height - controlHeight - 98;
  const tableScale = Math.min(
    36,
    Math.max(15, (playBottom - playTop - 210) / (2 * RULES.tableZ)),
  );
  const cx = 360,
    cy = (playTop + playBottom) / 2;
  return {
    width: 720,
    height,
    scale,
    portrait,
    left: (w - 720 * scale) / 2,
    top: (h - height * scale) / 2,
    controlHeight,
    playTop,
    playBottom,
    cx,
    cy,
    tableScale,
    outerXScale: tableScale * 0.75,
    outerZScale: 2,
    table: {
      x: cx - RULES.tableX * tableScale,
      y: cy - RULES.tableZ * tableScale,
      w: 2 * RULES.tableX * tableScale,
      h: 2 * RULES.tableZ * tableScale,
    },
    paddleWidth: Math.min(96, tableScale * 3.6),
    buttonTop: height - controlHeight - 18,
    statusTop: height - controlHeight - 88,
  };
}
export type Layout = ReturnType<typeof fitLayout>;
const project = (v: number, b: number, scale: number, outer: number) =>
  Math.sign(v) *
  (Math.min(Math.abs(v), b) * scale + Math.max(0, Math.abs(v) - b) * outer);
const inverse = (v: number, b: number, scale: number, outer: number) =>
  Math.sign(v) *
  (Math.min(Math.abs(v), b * scale) / scale +
    Math.max(0, Math.abs(v) - b * scale) / outer);
export const screenPoint = (l: Layout, x: number, z: number) => ({
  x: l.cx + project(x, RULES.tableX, l.tableScale, l.outerXScale),
  y: l.cy - project(z, RULES.tableZ, l.tableScale, l.outerZScale),
});
export const worldPoint = (l: Layout, x: number, y: number) => ({
  x: inverse(x - l.cx, RULES.tableX, l.tableScale, l.outerXScale),
  z: inverse(l.cy - y, RULES.tableZ, l.tableScale, l.outerZScale),
});
