/**
 * The browser's carriers: the file saved through a download link, and the
 * page printed while the print view hides everything but the card.
 */
import type { CardCarriers, CardFile } from './types'

/** The id of the print view's root, a direct child of the page's body. */
export const PRINT_VIEW_ID = 'recovery-card-print'

/**
 * On screen the print view never shows; in print it is the only thing that
 * does. The print carries its own colours whatever the theme: dark text and a
 * visible border on white, the same as the downloaded file.
 */
export const PRINT_VIEW_CSS =
  `#${PRINT_VIEW_ID}{display:none}` +
  '@media print{' +
  'html,body{background:#fff!important}' +
  `body>*:not(#${PRINT_VIEW_ID}){display:none!important}` +
  `#${PRINT_VIEW_ID}{display:block!important;background:#fff!important;padding:32px}` +
  `#${PRINT_VIEW_ID} *{color:#111!important;background-color:transparent!important}` +
  `#${PRINT_VIEW_ID} [data-testid="print-card"]{max-width:560px;border:1px solid #999!important;` +
  'border-radius:12px!important;padding:24px!important}' +
  '}'

// The browser takes the blob only after the click's task ends, so the object
// URL lives a little longer than the click. It is then revoked, so the
// browser's download history never keeps the card's text in the file's source
// address.
export const REVOKE_DELAY_MS = 40000

const downloadFile = (file: CardFile): void => {
  const url = URL.createObjectURL(new Blob([file.text], { type: file.type }))
  const link = document.createElement('a')
  link.href = url
  link.download = file.name
  link.rel = 'noopener'
  document.body.appendChild(link)
  try {
    link.click()
  } finally {
    link.remove()
    setTimeout(() => URL.revokeObjectURL(url), REVOKE_DELAY_MS)
  }
}

export const BROWSER_CARRIERS: CardCarriers = {
  download: downloadFile,
  print: () => window.print()
}
