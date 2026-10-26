import type { Game } from './game'
import { t, tm } from '../i18n'
import { GAME_URL, GAME_PUBLISHED } from './publication'

export type ShareInput = {
  map: Game['opts']['map']
  result: string
  reason: string
  a: number
  h: number
  stats: string
}

/** The post body, in the current language. */
export function shareText(input: ShareInput): string {
  return `${t('share.post', input)}\n${t(GAME_PUBLISHED ? 'share.playLink' : 'share.soonLink')} ${GAME_URL}`
}

/** Opens the X composer with the text filled in. Images cannot be attached through this URL. */
export function shareUrl(text: string): string {
  return `https://x.com/intent/post?text=${encodeURIComponent(text)}`
}

export function sharePost(game: Game): { text: string; url: string; stats: string } {
  const result = game.result
  if (!result) throw new Error('no result')
  const player = game.player
  const score = game.wsg
    ? { a: game.wsg.score.alliance, h: game.wsg.score.horde }
    : { a: game.ab?.resources.alliance ?? 0, h: game.ab?.resources.horde ?? 0 }
  const title = t(result.winner === null ? 'end.draw' : result.winner === player.team ? 'end.win' : 'end.lose')
  const stats = game.wsg
    ? t('share.stats.wsg', { kills: player.stats.kills, deaths: player.stats.deaths, damage: Math.round(player.stats.damage), caps: player.stats.caps, returns: player.stats.returns })
    : t('share.stats.ab', {
        kills: player.stats.kills,
        deaths: player.stats.deaths,
        damage: Math.round(player.stats.damage),
        assaults: player.stats.assaults,
        defends: player.stats.defends,
      })
  if (game.defense) {
    const m = game.defense.match
    const stats = t('hyjal.stats', {kills:player.stats.kills,deaths:player.stats.deaths,damage:Math.round(player.stats.damage)})
    const text = `${t('title')} · ${t(`map.${game.opts.map}`)}${m.endless?` · ${t('hyjal.unlimitedFire')}`:''}\n${title} · ${t('hyjal.summary',{n:m.wave,total:m.totalLabel,kills:m.kills,hp:Math.ceil(m.hp),max:m.maxHp})}\n${stats}\n${t(GAME_PUBLISHED ? 'share.playLink' : 'share.soonLink')} ${GAME_URL}`
    return {text, url:shareUrl(text), stats}
  }
  const text = shareText({ map: game.opts.map, result: title, reason: tm(result.reason), a: score.a, h: score.h, stats })
  return { text, url: shareUrl(text), stats }
}
