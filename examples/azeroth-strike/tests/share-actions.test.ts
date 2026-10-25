import { describe, expect, it, vi } from 'vitest'
import { prepareXShare } from '../src/ui/share-actions'
import { GAME_URL, GAME_PUBLISHED } from '../src/game/publication'
import { sharePost, shareText, shareUrl } from '../src/game/share'
import { setLang } from '../src/i18n'
import type { Game } from '../src/game/game'

describe('share image handoff', () => {
  it('copies the PNG before opening the composer', async () => {
    const order: string[] = []
    const blob = new Blob(['png'], {type:'image/png'})
    const download = vi.fn()
    const outcome = await prepareXShare(blob, 'match.png', shareUrl('report'), {
      copyImage: async image => { expect(image).toBe(blob); order.push('copy') },
      download,
      openX: url => { expect(new URL(url).searchParams.get('text')).toBe('report'); order.push('open') },
    })
    expect(outcome).toBe('copied')
    expect(order).toEqual(['copy', 'open'])
    expect(download).not.toHaveBeenCalled()
  })
  it('downloads an attachable PNG when clipboard permission is unavailable', async () => {
    const order: string[] = []
    const blob = new Blob(['png'], {type:'image/png'})
    const outcome = await prepareXShare(blob, 'match.png', 'https://x.com/intent/post', {
      copyImage: async () => { throw new Error('denied') },
      download: (image, name) => { expect(image).toBe(blob); expect(name).toBe('match.png'); order.push('download') },
      openX: () => { order.push('open') },
    })
    expect(outcome).toBe('downloaded')
    expect(order).toEqual(['download', 'open'])
  })
})

describe('public game address', () => {
  it('uses the live owngame route in share text', () => {
    expect(GAME_PUBLISHED).toBe(true)
    expect(GAME_URL).toBe('https://owngame.dev/play?game=azeroth-strike')
    setLang('en')
    const text = shareText({map:'ab',result:'Victory',reason:'Won',a:1500,h:750,stats:'8 kills'})
    expect(text).toContain(`Play: ${GAME_URL}`)
    expect(text).not.toContain('127.0.0.1')
  })
  it('keeps Hyjal stats separate from the link on both language cards', () => {
    const game = {
      result:{winner:'alliance'}, opts:{map:'hyjal-alliance'},
      player:{team:'alliance',stats:{kills:107,deaths:2,damage:23456}},
      defense:{match:{wave:9,total:9,kills:128,hp:1800,maxHp:1800}},
    } as unknown as Game
    for (const language of ['zh','en'] as const) {
      setLang(language)
      const post = sharePost(game)
      expect(post.text).toContain(GAME_URL)
      expect(post.stats).toContain('107')
      expect(post.stats).not.toContain('http')
      expect(new URL(post.url).searchParams.get('text')).toBe(post.text)
      expect(post.text.length).toBeLessThan(280)
    }
  })
})
