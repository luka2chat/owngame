import { SOURCE_URL } from '../game/publication'
import { t } from '../i18n'

/** Shared source link for the main menu and every battleground result. */
export function githubLink(): string {
  return `<a class="github-link" href="${SOURCE_URL}" target="_blank" rel="noopener noreferrer" aria-label="${t('github.source')}" title="${t('github.source')}"><svg viewBox="0 0 24 24" width="22" height="22" fill="currentColor" aria-hidden="true" focusable="false"><path d="M12 .75a11.25 11.25 0 0 0-3.56 21.92c.56.1.77-.24.77-.54v-2.1c-3.13.68-3.79-1.33-3.79-1.33-.51-1.3-1.25-1.65-1.25-1.65-1.02-.7.08-.68.08-.68 1.13.08 1.72 1.16 1.72 1.16 1.01 1.72 2.64 1.22 3.29.93.1-.73.4-1.22.72-1.5-2.5-.28-5.13-1.25-5.13-5.56 0-1.23.44-2.23 1.16-3.02-.12-.28-.5-1.43.11-2.98 0 0 .95-.3 3.09 1.15A10.8 10.8 0 0 1 12 6.17c.96 0 1.92.13 2.82.38 2.15-1.45 3.09-1.15 3.09-1.15.61 1.55.23 2.7.11 2.98.73.79 1.16 1.79 1.16 3.02 0 4.32-2.63 5.27-5.14 5.55.41.35.77 1.03.77 2.08v3.1c0 .3.2.65.78.54A11.25 11.25 0 0 0 12 .75Z"/></svg></a>`
}
