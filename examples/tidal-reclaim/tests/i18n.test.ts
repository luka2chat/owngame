import { describe, expect, it } from 'vitest'
import zh from '../src/i18n/zh-CN.json'
import { displayName, translate } from '../src/engine/i18n'
import { PERKS, STYLE_LABEL, WAVES } from '../src/game/onslaught'
import { BOT_ROSTER, WEAPONS } from '../src/game/config'

const hasChinese = (s: string) => /[\u4e00-\u9fff]/.test(s)

describe('i18n (zh-CN)', () => {
  it('fills {placeholders} and falls back to the key', () => {
    expect(translate('hud.wave', { wave: 2, waves: 8 })).toBe('第 2/8 波')
    expect(translate('does.not.exist')).toBe('does.not.exist')
  })
  it('has no empty entries and every placeholder is a word token', () => {
    for (const [key, value] of Object.entries(zh)) {
      expect(value.length, key).toBeGreaterThan(0)
      expect(value.match(/\{[^}]*\}/g) ?? [], key).toEqual((value.match(/\{\w+\}/g) ?? []))
    }
  })
  it('localises game data: waves, perks, style labels, weapons and callsigns', () => {
    for (const w of WAVES) {
      expect(hasChinese(w.title), w.title).toBe(true)
      expect(hasChinese(w.subtitle), w.subtitle).toBe(true)
    }
    for (const p of PERKS) {
      expect(hasChinese(p.name), p.id).toBe(true)
      expect(hasChinese(p.desc), p.id).toBe(true)
    }
    for (const label of Object.values(STYLE_LABEL)) expect(hasChinese(label), label).toBe(true)
    for (const w of Object.values(WEAPONS)) expect(hasChinese(w.name), w.name).toBe(true)
    for (const b of BOT_ROSTER) expect(hasChinese(displayName('name', b.name)), b.name).toBe(true)
  })
})
