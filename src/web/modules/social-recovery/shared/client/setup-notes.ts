/**
 * The public note a setup writes beside its sealed backup, and the privacy
 * level a draft's two fields encode. Whether the extension or the SDK writes the
 * public note at prepare is still open; until that is settled the client
 * encodes it here. Screens call these and never build the bytes on their own.
 */
import type {
  Configuration,
  Hex,
  PrivacyLevel,
  SetupDraft
} from '@web/modules/social-recovery/sdk-interfaces'
import { levelOfFields, shapeNote } from '@web/modules/social-recovery/sdk-doubles/encoding'

/**
 * The public note of a shape-visible setup: the path's shape and wait in the
 * clear, and no member's config.
 */
export const shapeNoteOf = (configuration: Configuration): Hex => shapeNote(configuration)

/**
 * The level a draft's privacy fields encode: public where the backup is clear,
 * shape-visible where the public note holds anything, private otherwise.
 */
export const privacyLevelOf = (privacy: SetupDraft['privacy']): PrivacyLevel =>
  levelOfFields(privacy.publicMetadata, privacy.backup === 'clear')
