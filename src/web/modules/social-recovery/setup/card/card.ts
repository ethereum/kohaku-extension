/**
 * What the card carries, and nothing else: the account address whole, the
 * recovery password at the hidden level, the guide to starting recovery on any
 * device, and the three lines on what the card can and cannot do. It names no
 * method, no guardian, no threshold and no waiting period, so a photograph of
 * the card alone names nothing to phish.
 */
import type { BackupForm } from '@web/modules/social-recovery/sdk-interfaces'
import {
  renderFullAddress,
  renderPasswordName,
  renderValueLabel
} from '@web/modules/social-recovery/shared/display'
import type { Translate } from '@web/modules/social-recovery/shared/display'

import type { CardLevel, CardRow, RecoveryCard } from './types'

const CARD_LEVELS: readonly CardLevel[] = ['hidden', 'public']

/** The card's fixed lines, in the order the card prints them. */
export const CARD_LINE_KEYS = [
  'socialRecovery.card.lines.guide',
  'socialRecovery.card.lines.cannotMoveFunds',
  'socialRecovery.card.lines.keepAway',
  'socialRecovery.card.lines.photograph'
] as const

/**
 * The level of a stored backup: an encrypted backup needs the recovery
 * password, a clear or an empty one sets none.
 */
export const levelOfBackup = (backup: BackupForm): CardLevel =>
  backup === 'encrypted' ? 'hidden' : 'public'

/** The level the save names in the route's search, `?level=hidden|public`, or null. */
export const levelFromSearch = (search: string): CardLevel | null => {
  const level = new URLSearchParams(search).get('level')
  return CARD_LEVELS.find((known) => known === level) ?? null
}

/** The card's rows, the address first, the password at the hidden level, then the lines. */
export const cardRowsOf = (card: RecoveryCard, t: Translate): CardRow[] => [
  {
    kind: 'value',
    label: renderValueLabel('account', t),
    value: renderFullAddress(card.account)
  },
  ...(card.level === 'hidden'
    ? [
        {
          kind: 'value' as const,
          label: renderPasswordName('recoveryPassword', t),
          value: card.password ?? ''
        }
      ]
    : []),
  ...CARD_LINE_KEYS.map((key) => ({ kind: 'line' as const, text: t(key) }))
]
