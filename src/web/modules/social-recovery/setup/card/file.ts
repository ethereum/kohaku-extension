/**
 * The card as a file: an A4 PDF with the card's rows and nothing else, on one
 * page or, when a value is too long for one, continued over as many pages as
 * it needs, readable offline and printable from any reader.
 */
import type { Translate } from '@web/modules/social-recovery/shared/display'

import { cardRowsOf } from './card'
import { cardPdfOf } from './pdf'
import type { CardFile, RecoveryCard } from './types'

const CARD_FILE_NAME = 'kohaku-recovery-card.pdf'
const CARD_FILE_TYPE = 'application/pdf'

export const cardFileOf = (card: RecoveryCard, t: Translate): CardFile => ({
  name: CARD_FILE_NAME,
  type: CARD_FILE_TYPE,
  ...cardPdfOf(t('socialRecovery.card.cardTitle'), cardRowsOf(card, t))
})
