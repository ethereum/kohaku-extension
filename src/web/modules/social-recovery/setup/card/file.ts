/**
 * The card as a file: one self-contained HTML page with the card's rows and
 * nothing else, readable offline and printable from any browser.
 */
import type { Translate } from '@web/modules/social-recovery/shared/display'

import { cardRowsOf } from './card'
import type { CardFile, CardRow, RecoveryCard } from './types'

const CARD_FILE_NAME = 'kohaku-recovery-card.html'
const CARD_FILE_TYPE = 'text/html'

const HTML_ESCAPES: Record<string, string> = {
  '&': '&amp;',
  '<': '&lt;',
  '>': '&gt;',
  '"': '&quot;',
  "'": '&#39;'
}

const escapeHtml = (text: string): string => text.replace(/[&<>"']/g, (char) => HTML_ESCAPES[char])

const rowHtml = (row: CardRow): string =>
  row.kind === 'value'
    ? `<div class="value"><div class="label">${escapeHtml(
        row.label
      )}</div><div class="mono">${escapeHtml(row.value)}</div></div>`
    : `<p>${escapeHtml(row.text)}</p>`

const STYLE =
  'body{font-family:system-ui,sans-serif;margin:32px;color:#111}' +
  '.card{max-width:560px;border:1px solid #999;border-radius:12px;padding:24px}' +
  'h1{font-size:13px;letter-spacing:.08em;text-transform:uppercase;margin:0 0 16px}' +
  '.value{margin-bottom:16px}.label{font-size:12px;color:#555;margin-bottom:4px}' +
  '.mono{font-family:ui-monospace,monospace;font-size:15px;white-space:pre-wrap;word-break:break-all}' +
  'p{font-size:14px;margin:8px 0}'

export const cardFileOf = (card: RecoveryCard, t: Translate): CardFile => {
  const title = escapeHtml(t('socialRecovery.card.cardTitle'))
  const rows = cardRowsOf(card, t).map(rowHtml).join('')
  return {
    name: CARD_FILE_NAME,
    type: CARD_FILE_TYPE,
    text:
      `<!doctype html><html><head><meta charset="utf-8"><title>${title}</title>` +
      `<style>${STYLE}</style></head><body><div class="card"><h1>${title}</h1>${rows}</div></body></html>`
  }
}
