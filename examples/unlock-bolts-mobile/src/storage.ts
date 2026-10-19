import { Controller } from "./controller";
import { LEVELS } from "./levels";
export const SAVE_KEY = "owngame:unlock-bolts-mobile:v1";
export type Pair = [string, string];
export type Save = {
  schema: 1;
  game_id: "unlock-bolts-mobile";
  levelId: string;
  moves: Pair[];
  completed: string[];
};
export type StoragePort = Pick<Storage, "getItem" | "setItem">;
export function load(storage: () => StoragePort) {
  const controller = new Controller(LEVELS),
    empty = {
      controller,
      moves: [] as Pair[],
      completed: [] as string[],
      notice: "",
      writable: true,
    };
  let raw: string | null = null;
  try {
    raw = storage().getItem(SAVE_KEY);
    if (raw === null) return empty;
    const d: unknown = JSON.parse(raw);
    if (!d || typeof d !== "object") throw Error("invalid");
    const s = d as Save;
    if (s.schema !== 1)
      return {
        ...empty,
        notice: "发现其他版本存档，已保留；本次暂不覆盖",
        writable: false,
      };
    const index = LEVELS.findIndex((l) => l.id === s.levelId);
    if (
      s.game_id !== "unlock-bolts-mobile" ||
      index < 0 ||
      !Array.isArray(s.moves) ||
      s.moves.length > 2000 ||
      !Array.isArray(s.completed) ||
      s.completed.some((v) => !LEVELS.some((l) => l.id === v))
    )
      throw Error("invalid");
    controller.dispatch({ type: "level", index }, 0);
    for (const pair of s.moves) {
      if (
        !Array.isArray(pair) ||
        pair.length !== 2 ||
        !pair.every((v) => typeof v === "string")
      )
        throw Error("invalid");
      if (
        controller.dispatch({ type: "bolt", id: pair[0] }, 0).reason !==
        "selected"
      )
        throw Error("invalid");
      if (
        controller.dispatch({ type: "bolt", id: pair[1] }, 0).reason !== "moved"
      )
        throw Error("invalid");
      controller.complete(controller.token);
    }
    return {
      controller,
      moves: s.moves.map((p) => [...p] as Pair),
      completed: [...new Set(s.completed)],
      notice: "已接续上次的整理",
      writable: true,
    };
  } catch {
    if (raw === null)
      return {
        ...empty,
        notice: "存储暂不可用，本局仍可游玩",
        writable: false,
      };
    try {
      let key = SAVE_KEY + ":backup";
      if (storage().getItem(key) !== null) {
        const prefix = key + ":" + Date.now();
        key = prefix;
        let n = 0;
        while (storage().getItem(key) !== null) key = prefix + ":" + ++n;
      }
      storage().setItem(key, raw);
      return {
        ...empty,
        controller: new Controller(LEVELS),
        notice: "原存档异常，已留备份并重新开始",
      };
    } catch {
      return {
        ...empty,
        controller: new Controller(LEVELS),
        notice: "原存档已保留，本次暂不覆盖",
        writable: false,
      };
    }
  }
}
export function save(
  storage: () => StoragePort,
  controller: Controller,
  moves: Pair[],
  completed: string[],
) {
  try {
    const port = storage();
    const existing = port.getItem(SAVE_KEY);
    if (existing !== null) {
      let previous: unknown;
      try {
        previous = JSON.parse(existing);
      } catch {
        /* malformed saves are backed up by load() */
      }
      if (
        previous &&
        typeof previous === "object" &&
        "schema" in previous &&
        (previous as { schema: unknown }).schema !== 1
      )
        return false;
    }
    port.setItem(
      SAVE_KEY,
      JSON.stringify({
        schema: 1,
        game_id: "unlock-bolts-mobile",
        levelId: controller.session.level.id,
        moves,
        completed,
      } satisfies Save),
    );
    return true;
  } catch {
    return false;
  }
}
