import zh from '../i18n/zh-CN.json'

export type Dictionary = Record<string, string>
const DICT: Dictionary = zh

/** Fixed Simplified Chinese lookup; all UI copy lives in `src/i18n/zh-CN.json` with `{name}` placeholders. */
export function translate(key: string, vars: Record<string, string | number> = {}): string {
  const text = DICT[key] ?? key
  return text.replace(/\{(\w+)\}/g, (_, name: string) => String(vars[name] ?? `{${name}}`))
}

/** Localised display name for an internal id (bot callsigns, enemy kinds, weapon sources). Falls back to the id. */
export function displayName(prefix: 'name' | 'src', id: string): string {
  return DICT[`${prefix}.${id}`] ?? id
}

export class I18n {
  readonly locale = 'zh-CN'
  constructor() {
    document.documentElement.lang = 'zh-CN'
  }
  t(key: string, vars: Record<string, string | number> = {}): string {
    return translate(key, vars)
  }
}

export const DICTIONARY_KEYS = Object.keys(zh)
