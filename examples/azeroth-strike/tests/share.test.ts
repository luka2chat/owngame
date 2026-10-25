import zlib from 'node:zlib'
import { describe, expect, it } from 'vitest'
import { AudioEngine } from '../src/engine/audio'
import { unshuffle } from '../src/engine/loader'
import { shareText, shareUrl, type ShareInput } from '../src/game/share'
import { setLang, t } from '../src/i18n'
import { gunzipAsset, gzipShuffled } from '../tools/pack.mjs'

describe('packed assets', () => {
  it('undoes the byte shuffle the asset builder applies before gzip', () => {
    const src = Buffer.alloc(1000)
    for (let i = 0; i < src.length; i++) src[i] = (i * 17 + (i % 4) * 40) % 256
    const gz = gzipShuffled(src)
    const shuffled = zlib.gunzipSync(gz)
    const view = new Uint8Array(shuffled)
    const out = new Uint8Array(unshuffle(view.buffer.slice(view.byteOffset, view.byteOffset + view.byteLength)))
    expect(Buffer.from(out).equals(src)).toBe(true)
    expect(gunzipAsset(gz).equals(src)).toBe(true)
  })
})

describe('share post', () => {
  const input = (map: ShareInput['map']): ShareInput => ({
    map,
    result: t('end.win'),
    reason: t(map === 'wsg' ? 'result.wsgCaps' : 'result.abWin', { team: 'alliance', n: map === 'wsg' ? 3 : 1500 }),
    a: 3,
    h: 0,
    stats: t(map === 'wsg' ? 'share.stats.wsg' : 'share.stats.ab', { kills: 8, deaths: 2, damage: 1400, caps: 2, returns: 1, assaults: 4, defends: 1 }),
  })

  it('builds a localized post and an X composer link that carries the same text', () => {
    setLang('zh')
    const zh = shareText(input('wsg'))
    expect(zh).toContain('胜利')
    expect(zh).toContain('联盟 3 : 0 部落')
    expect(zh).toContain('8 击杀')
    expect(decodeURIComponent(shareUrl(zh).split('text=')[1])).toBe(zh)
    expect(shareUrl(zh).startsWith('https://x.com/intent/post?text=')).toBe(true)

    setLang('en')
    const en = shareText(input('ab'))
    expect(en).toContain('Victory')
    expect(en).toContain('Alliance 3 : 0 Horde')
    expect(en).toContain('4 assaults')
    expect(en).not.toMatch(/[\u4e00-\u9fff]/)
    expect(en.length).toBeLessThan(280)
  })
})

describe('audio mixer', () => {
  it('keeps bus levels between 0 and 1 and silence follows mute and the master bus', () => {
    const engine = new AudioEngine()
    engine.setVolume('master', 0.5)
    engine.setVolume('sfx', 0.4)
    engine.setVolume('music', 5)
    expect(engine.volumes).toEqual({ master: 0.5, sfx: 0.4, music: 1 })
    expect(engine.level('sfx')).toBeCloseTo(0.2)
    engine.setMuted(true)
    expect(engine.level('master')).toBe(0)
    expect(engine.level('music')).toBe(0)
    engine.setMuted(false)
    expect(engine.level('music')).toBeCloseTo(0.5)
  })
})
