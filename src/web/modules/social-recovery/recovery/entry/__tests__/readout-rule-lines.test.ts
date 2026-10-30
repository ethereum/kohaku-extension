/**
 * The readout's rule lines for a path of one method: the platform line only
 * for a passkey, never the warning about losing the key, which the recoverer
 * already lost, and never the offer to add a method, which only the editor
 * can act on.
 */
import i18n from '@common/config/localization'
import { previewPathOf } from '@web/modules/social-recovery/recovery/entry/readout'
import type { Address, Hex } from '@kohaku-eth/social-recovery'
import { addressBookOf, WALLET_RECOVERY_CHAIN } from '@web/modules/social-recovery/shared/client'

const BOOK = addressBookOf(WALLET_RECOVERY_CHAIN)
const CONTEXT = { addressBook: BOOK, ownRpIdHash: `0x${'ab'.repeat(32)}` as Hex }
const t = (key: string, params?: Record<string, unknown>): string => String(i18n.t(key, params))
const line = (slug: string): string => t(`socialRecovery.ruleLines.${slug}`)

const linesOfOne = (method: Address): string[] =>
  previewPathOf({ clauses: [{ threshold: 1, methods: [method] }] }, CONTEXT, t).ruleLines

describe('the readout of a path of one method', () => {
  it('one guardian reads no rule line: no lost-key warning, no passkey line and no offer', () => {
    expect(linesOfOne(BOOK.methods.ecdsa)).toEqual([])
  })

  it('one passkey reads the platform line alone, no lost-key warning and no offer', () => {
    expect(linesOfOne(BOOK.methods.passkey)).toEqual([line('platformFate')])
  })
})
