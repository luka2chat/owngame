export type Box = { x: number; y: number; w: number; h: number };
export function fitLayout(
  width: number,
  height: number,
  top: number,
  left: number,
  boltCount: number,
  capacity: number,
) {
  const compact = height < 720,
    w = Math.min(width - 20, 500),
    x = left + (width - w) / 2;
  const reserve = 60;
  const title = {
    x,
    y: top + reserve + (compact ? 0 : 16),
    w,
    h: compact ? 38 : 49,
  };
  const subtitle = { x, y: title.y + title.h + 1, w, h: 20 };
  const levelY = subtitle.y + subtitle.h + (compact ? 5 : 12),
    levelW = Math.min(52, (w - 40) / 5),
    gap = Math.min(14, (w - 5 * levelW) / 4);
  const levels = Array.from({ length: 5 }, (_, i) => ({
    x: x + (w - 5 * levelW - 4 * gap) / 2 + i * (levelW + gap),
    y: levelY,
    w: levelW,
    h: 44,
  }));
  const goal = { x: x + 4, y: levelY + 52, w: w - 8, h: compact ? 31 : 36 };
  const buttonsY = top + height - 58;
  const footer = { x: x + 4, y: buttonsY - 39, w: w - 8, h: 30 };
  const board = {
    x: x - 1,
    y: goal.y + goal.h + 9,
    w: w + 2,
    h: footer.y - (goal.y + goal.h + 9) - 10,
  };
  const columns = Math.ceil(boltCount / 2),
    cellW = (board.w - 22) / columns,
    rowH = (board.h - 18) / 2;
  const nutWidth = Math.max(
    30,
    Math.min(cellW * 0.76, (rowH - 28) / (0.86 + (capacity - 1) * 0.48)),
  );
  const pitch = nutWidth * 0.48;
  const bolts = Array.from({ length: boltCount }, (_, i) => {
    const row = Math.floor(i / columns),
      count = Math.min(columns, boltCount - row * columns),
      cx = board.x + board.w / 2 + ((i % columns) - (count - 1) / 2) * cellW;
    const y = board.y + 8 + row * rowH;
    return {
      x: cx - cellW / 2 + 2,
      y,
      w: cellW - 4,
      h: rowH - 4,
      cx,
      base: y + rowH - 28,
      shaftTop: y + 8,
    };
  });
  const buttonGap = 8,
    progressW = 62,
    buttonW = (w - 16 - progressW - buttonGap * 2) / 2;
  const controls = {
    undo: { x: x + 8, y: buttonsY, w: buttonW, h: 48 },
    reset: { x: x + 8 + buttonW + buttonGap, y: buttonsY, w: buttonW, h: 48 },
    next: { x: x + w - 8 - progressW, y: buttonsY, w: progressW, h: 48 },
  };
  return {
    width,
    height,
    compact,
    title,
    subtitle,
    levels,
    goal,
    board,
    footer,
    bolts,
    nutWidth,
    pitch,
    controls,
  };
}
export type Layout = ReturnType<typeof fitLayout>;
