import { describe, expect, it } from 'vitest'
import { botName, KEYS, lang, setLang, t, tm } from '../src/i18n'

const sample = {
  ground: 5, air: 2, incoming: 3, left: 5, hp: 1500, max: 1800, team: 'alliance', flag: 'horde', node: 'farm', gy: 'gy_farm', map: 'wsg', name: 'X', n: 3, s: 5, wave: 30, a: 1, h: 2,
  status: 'ok', view: 'third', weapon: 'sniper', home: 1, done: 1.5, total: 13.2, result: 'Victory', reason: 'because',
  stats: 'stats', kills: 4, deaths: 2, damage: 900, caps: 1, returns: 1, assaults: 2, defends: 3, d: 240,
}

describe('i18n', () => {
  it('translates every key in both languages without leaking key names', () => {
    for (const l of ['zh', 'en'] as const) {
      setLang(l)
      for (const k of KEYS) {
        const s = t(k, sample)
        expect(s, k).not.toContain('undefined')
        expect(s, k).not.toMatch(/(team|node|gy|weapon|map|hud)\.[a-z_]+/)
        if (l === 'en') expect(s, k).not.toMatch(/[\u4e00-\u9fff]/)
      }
    }
  })

  it('switches text live', () => {
    setLang('zh')
    expect(t('banner.view', { view: 'third' })).toBe('视角：第三人称')
    expect(tm({ key: 'banner.capture', params: { name: 'A', flag: 'horde', team: 'alliance' } })).toBe('A 夺取了部落的旗帜！联盟得分')
    expect(t('feed.weapon', { weapon: 'dagger' })).toBe('破旧匕首')
    expect(botName('horde', 0)).toBe('萨尔')
    setLang('en')
    expect(lang()).toBe('en')
    expect(t('banner.view', { view: 'third' })).toBe('Camera: Third person')
    expect(tm({ key: 'banner.capture', params: { name: 'A', flag: 'horde', team: 'alliance' } })).toBe('A captured the Horde flag! Alliance scores')
    expect(t('feed.weapon', { weapon: 'dagger' })).toBe('Worn Dagger')
    expect(botName('horde', 0)).toBe('Thrall')
  })
})
