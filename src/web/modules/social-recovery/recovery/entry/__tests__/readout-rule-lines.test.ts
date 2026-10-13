/**
 * The readout's rule lines for a path of one method: the single-method warning
 * always, the platform line only for a passkey, and never the offer to add a
 * method, which only the editor can act on.
 */
import i18n from '@common/config/localization'
import { previewPathOf } from '@web/modules/social-recovery/recovery/entry/readout'
import type { Address, Hex } from '@web/modules/social-recovery/sdk-interfaces'
import { addressBookOf, WALLET_RECOVERY_CHAIN } from '@web/modules/social-recovery/shared/client'

const BOOK = addressBookOf(WALLET_RECOVERY_CHAIN)
const CONTEXT = { addressBook: BOOK, ownRpIdHash: `0x${'ab'.repeat(32)}` as Hex }
const t = (key: string, params?: Record<string, unknown>): string => String(i18n.t(key, params))
const line = (slug: string): string => t(`socialRecovery.ruleLines.${slug}`)

const linesOfOne = (method: Address): string[] =>
  previewPathOf({ clauses: [{ threshold: 1, methods: [method] }] }, CONTEXT, t).ruleLines

describe('the readout of a path of one method', () => {
  it('one guardian reads the single-method warning alone, no passkey line and no offer', () => {
    expect(linesOfOne(BOOK.methods.ecdsa)).toEqual([line('singleMethod')])
  })

  it('one passkey reads the single-method warning and the platform line, no offer', () => {
    expect(linesOfOne(BOOK.methods.passkey)).toEqual([line('singleMethod'), line('platformFate')])
  })
})
