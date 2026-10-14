/**
 * The handover a payload carries, decoded through the action's codec, and the
 * handover rows a recovery refuses on, over the two authorities: a zero key,
 * one address named twice, a removed key that is no authority on the account,
 * a new key that already holds a privilege there. The two action reads are
 * made at the block given.
 */
import { ActionCodecDouble } from '@web/modules/social-recovery/sdk-doubles'
import type { RequestRow } from '@web/modules/social-recovery/sdk-doubles/types'
import type {
  Address,
  BlockHeader,
  Handover,
  Hex
} from '@web/modules/social-recovery/sdk-interfaces'
import { zeroAddress } from 'viem'

import { sameAddress } from '../../addresses'
import type { KitRecoveryContext } from './types'

/** The handover `payload` decodes to for `action`, or none where it does not decode. */
export const decodedHandoverOf = (action: Address, payload: Hex): Handover | undefined => {
  try {
    return new ActionCodecDouble([action]).decode(payload)
  } catch {
    return undefined
  }
}

export const handoverRowsOf = async (
  { account, action }: Pick<KitRecoveryContext, 'account' | 'action'>,
  handover: Handover,
  block: BlockHeader
): Promise<RequestRow[]> => {
  const { newAuthority, removedAuthority } = handover
  if (sameAddress(newAuthority, zeroAddress) || sameAddress(removedAuthority, zeroAddress)) {
    return [['handover.malformed', { newAuthority, removedAuthority, cause: 'zero-key' }]]
  }
  if (sameAddress(newAuthority, removedAuthority)) {
    return [['handover.same-authority', { newAuthority, removedAuthority }]]
  }
  const [isAuthority, holds] = await Promise.all([
    action.isAuthority(account, removedAuthority, block.number),
    action.holdsAnyPrivilege(account, newAuthority, block.number)
  ])
  const rows: RequestRow[] = []
  if (!isAuthority) {
    rows.push(['handover.removed-not-authority', { removedAuthority, isAuthority }])
  }
  if (holds) {
    rows.push(['handover.new-holds-privilege', { newAuthority, holdsAnyPrivilege: holds }])
  }
  return rows
}
