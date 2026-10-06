/**
 * The browser's carriers for the guardian row: the clipboard the paste reads,
 * and the file the offline block saves through a download link.
 */
import type { ChallengeFile } from './types'

/** The page's clipboard read, or null where the page has none. */
export const browserClipboard = (): (() => Promise<string>) | null =>
  typeof navigator !== 'undefined' && navigator.clipboard?.readText
    ? () => navigator.clipboard.readText()
    : null

// An object URL, revoked right after the click, so the download history never
// keeps the challenge in the file's source address.
export const saveChallengeFile = (file: ChallengeFile): void => {
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
    URL.revokeObjectURL(url)
  }
}
