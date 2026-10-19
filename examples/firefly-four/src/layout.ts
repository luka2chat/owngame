export const WIDTH = 720;
export function fitLayout(viewport: {
  x: number;
  y: number;
  width: number;
  height: number;
}) {
  const portrait = viewport.height / viewport.width >= 1.45;
  const scale = portrait
    ? viewport.width / WIDTH
    : Math.min(viewport.width / WIDTH, viewport.height / 1280);
  const height = portrait ? viewport.height / scale : 1280;
  const headTop = Math.max(16, (52 - viewport.y) / scale);
  const surplus = Math.max(0, height - headTop - 1130);
  const titleHeight = Math.min(203, 144 + surplus * 0.15),
    titleWidth = titleHeight * 3;
  const subtitle = surplus > 150;
  const titleY = height - headTop - titleHeight / 2;
  const scoreTop = headTop + titleHeight + (subtitle ? 34 : 0) + 8;
  const scoreY = height - scoreTop - 31;
  const boardLimit = height - 360;
  const free = Math.max(0, boardLimit - scoreTop - 62 - 8);
  const boardHeight = Math.min(600, free);
  const boardTop = scoreTop + 62 + 8 + Math.max(0, free - boardHeight) / 2;
  const boardY = height - boardTop - boardHeight / 2;
  const rowStep = Math.min(80, (boardHeight * 0.81 - 74) / 5);
  const radius = Math.min(36, (rowStep - 5) / 2);
  const controlHeight = Math.max(88, 44 / scale);
  // Reserve the actual native capsule (roughly y49..92 CSS px on moto).
  // Fit only the title; score, board and all touch rectangles retain build-01 geometry.
  let safeTitleX = 360,
    safeTitleY = titleY;
  let safeTitleWidth = titleWidth,
    safeTitleHeight = titleHeight;
  const frameTop = portrait ? 0 : (viewport.height - height * scale) / 2;
  const frameLeft = portrait ? 0 : (viewport.width - WIDTH * scale) / 2;
  const titleTopCss = viewport.y + frameTop + headTop * scale;
  const titleRightCss = viewport.x + frameLeft + (360 + titleWidth / 2) * scale;
  const capsuleLeft = viewport.x + viewport.width - 123;
  if (titleTopCss < 100 && titleRightCss > capsuleLeft - 8) {
    const clearTop = (100 - viewport.y - frameTop) / scale;
    const titleBottom = headTop + titleHeight;
    const belowHeight = titleBottom - clearTop;
    if (belowHeight * scale >= 50) {
      safeTitleHeight = Math.min(titleHeight, belowHeight);
      safeTitleWidth = safeTitleHeight * 3;
      safeTitleY = height - titleBottom + safeTitleHeight / 2;
    } else {
      const leftMargin = 16;
      const availableWidth =
        capsuleLeft - 8 - viewport.x - frameLeft - leftMargin;
      safeTitleWidth = Math.min(titleWidth, availableWidth / scale);
      safeTitleHeight = safeTitleWidth / 3;
      safeTitleX = (leftMargin + (safeTitleWidth * scale) / 2) / scale;
      safeTitleY = height - titleBottom + safeTitleHeight / 2;
    }
  }
  return {
    width: WIDTH,
    height,
    scale,
    portrait,
    left: portrait ? 0 : (viewport.width - WIDTH * scale) / 2,
    top: portrait ? 0 : (viewport.height - height * scale) / 2,
    headTop,
    titleX: safeTitleX,
    titleY: safeTitleY,
    titleWidth: safeTitleWidth,
    titleHeight: safeTitleHeight,
    subtitle,
    subtitleY: height - scoreTop + 17,
    scoreY,
    boardY,
    boardHeight,
    rowStep,
    radius,
    controlHeight,
    columnWidth: 88,
    statusY: 312,
    mainY: 210,
    settingsY: 112,
    footerY: 32,
  };
}
