import { initial, restore, encode, release, State } from "./rules";
export const SAVE_KEY = "owngame:bamboo-rally:v1";
export type Settings = {
  simple: boolean;
  muted: boolean;
  wins: number[];
  counted: boolean;
};
export type StoragePort = Pick<Storage, "getItem" | "setItem">;
export function load(storage: () => StoragePort) {
  const empty = {
    state: initial(Date.now()),
    simple: false,
    muted: false,
    wins: [0, 0, 0, 0],
    counted: false,
    notice: "",
    blocked: false,
  };
  let raw: string | null = null;
  try {
    raw = storage().getItem(SAVE_KEY);
    if (raw === null) return empty;
    const data = JSON.parse(raw),
      state = restore(data.state);
    if (
      data.schema !== 1 ||
      !state ||
      typeof data.simple !== "boolean" ||
      typeof data.muted !== "boolean" ||
      typeof data.counted !== "boolean" ||
      !Array.isArray(data.wins) ||
      data.wins.length !== 4 ||
      data.wins.some(
        (n: unknown) =>
          typeof n !== "number" || !Number.isInteger(n) || n < 0 || n > 1e9,
      )
    )
      throw Error("bad save");
    release(state);
    return {
      state,
      simple: data.simple as boolean,
      muted: data.muted as boolean,
      wins: data.wins as number[],
      counted: data.counted as boolean,
      notice: "上次比分已找回 · 点继续回珠",
      blocked: false,
    };
  } catch {
    if (raw === null)
      return {
        ...empty,
        notice: "存储不可用，本局暂时无法保存",
        blocked: true,
      };
    try {
      const port = storage();
      let key = SAVE_KEY + ":backup";
      if (port.getItem(key) !== null) {
        const prefix = key + ":" + Date.now();
        key = prefix;
        let i = 0;
        while (port.getItem(key) !== null) key = prefix + ":" + ++i;
      }
      port.setItem(key, raw);
      return { ...empty, notice: "存档异常，已保留备份并开启新局" };
    } catch {
      return {
        ...empty,
        notice: "存档异常且备份失败，本局暂时无法保存",
        blocked: true,
      };
    }
  }
}
export function persist(
  storage: () => StoragePort,
  state: State,
  settings: Settings,
  blocked = false,
) {
  if (blocked) return false;
  try {
    storage().setItem(
      SAVE_KEY,
      JSON.stringify({ schema: 1, state: encode(state), simple:settings.simple,muted:settings.muted,wins:settings.wins,counted:settings.counted }),
    );
    return true;
  } catch {
    return false;
  }
}
