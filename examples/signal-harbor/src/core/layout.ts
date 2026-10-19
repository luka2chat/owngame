/** Geometry for the existing two-window artwork; no new textures or rule changes.
 * Source Y is measured from the top of lighthouse.png. Repeat its lower window
 * between the original upper window and base, then fit the assembled tower.
 */
export const TOWER_ART = {
  width: 810,
  height: 1941,
  upperEnd: 1174,
  windowEnd: 1574,
  upperLampY: 1000,
  lowerLampY: 1374,
  goalY: 1757,
  lampSize: 370,
} as const;

export function harborLayout(capacity: number, buoys: number) {
  if (!Number.isInteger(capacity) || capacity < 1) throw new Error('Invalid tower capacity');
  if (buoys !== 1 && buoys !== 2) throw new Error('Invalid berth count');
  const a = TOWER_ART, repeatHeight = a.windowEnd - a.upperEnd;
  const sourceHeight = a.height + (capacity - 2) * repeatHeight;
  const height = 500, scale = height / sourceHeight;
  const localY = (sourceY: number) => height / 2 - sourceY * scale;
  const segments = [{ frame: 'lighthouse-upper', y: localY(a.upperEnd / 2), height: a.upperEnd * scale }];
  const topDownSlots = [localY(a.upperLampY)];
  for (let i = 0; i < capacity - 1; i++) {
    segments.push({ frame: 'lighthouse-window', y: localY(a.upperEnd + (i + 0.5) * repeatHeight), height: repeatHeight * scale });
    topDownSlots.push(localY(a.lowerLampY + i * repeatHeight));
  }
  const baseStart = a.upperEnd + (capacity - 1) * repeatHeight;
  segments.push({ frame: 'lighthouse-base', y: localY(baseStart + (a.height - a.windowEnd) / 2), height: (a.height - a.windowEnd) * scale });
  const tokenSize = a.lampSize * scale;
  return {
    tower: {
      x: [-225, 0, 225], y: 60, width: a.width * scale, height,
      // Tap the whole tower, even when a taller stack has narrower artwork.
      hitWidth: 212, hitHeight: 500,
      segments, slots: topDownSlots.reverse(), tokenSize,
      goalY: localY(a.goalY + (capacity - 2) * repeatHeight), goalRadius: 62 * scale,
      labelY: -274,
    },
    berth: {
      x: buoys === 1 ? [0] : [-165, 165], y: -335,
      slots: [-24, 54], tokenSize: Math.min(68, tokenSize),
      width: 280, height: 180, artY: -14, artWidth: 260, artHeight: 130, labelY: -76,
    },
    statusY: -464,
  };
}

export function lampPoint(layout: ReturnType<typeof harborLayout>, column: number, slot?: number) {
  const tower = column < 3, group = tower ? layout.tower : layout.berth;
  return { x: group.x[tower ? column : column - 3], y: group.y + (slot === undefined ? 0 : group.slots[slot]) };
}
