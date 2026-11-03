/**
 * The public note a setup writes beside its sealed backup, and the privacy
 * level a draft's two fields encode. The SDK writes the public note as given
 * and gives it no layout, so the client encodes it here. Screens call these
 * and never build the bytes on their own.
 */
import type { Configuration, Hex, SetupDraft } from '@kohaku-eth/social-recovery'
import { stringToHex } from 'viem'

import type { PrivacyLevel } from './types'

const SHAPE_MARK = 'kohaku-double:shape:'

/**
 * The public note of a shape-visible setup: the path's shape and wait in the
 * clear, and no member's config. The wait is written as the tagged decimal
 * string the note has always carried, so a note written before reads the same.
 */
export const shapeNoteOf = (configuration: Configuration): Hex =>
  stringToHex(
    `${SHAPE_MARK}${JSON.stringify({
      wait: { $bigint: String(configuration.wait) },
      ignoresPause: configuration.ignoresPause,
      clauses: configuration.clauses.map((clause) => ({
        threshold: clause.threshold,
        methods: clause.credentials.map((credential) => credential.method)
      }))
    })}`
  )

/**
 * The level a draft's privacy fields encode: public where the backup is clear,
 * shape-visible where the public note holds anything, private otherwise.
 */
export const privacyLevelOf = (privacy: SetupDraft['privacy']): PrivacyLevel => {
  if (privacy.backup === 'clear') {
    return 'public'
  }
  if (privacy.publicMetadata && privacy.publicMetadata !== '0x') {
    return 'shape-visible'
  }
  return 'private'
}
