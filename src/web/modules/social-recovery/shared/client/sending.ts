/**
 * Which key sends a prepared call.
 *
 * Whether the extension configured a sponsor rail decides it. The first
 * release configures none, so every prepared call is sent from a key the
 * signer holds: the account's controlling key for the account's own operations
 * (a setup write, the owner's cancel, and every prepared batch, which the
 * account runs as one transaction), and the recoverer's own key for the two
 * recovery calls, the submission and the execution. The cancel by proofs is
 * not a recovery call: whoever submits it pays for it, and it is not part of
 * this release, so no key is named for it here.
 */
import type { PreparedBatch, PreparedCall } from '@web/modules/social-recovery/sdk-interfaces'

import type { KeyHandle, RecoveryCall, SendingKeys } from './types'

/** The sponsor rail this build configured: none in the first release. */
export const SPONSOR_RAIL = 'none' as const

/** The two recovery calls the recoverer's own key sends. */
export const RECOVERY_CALLS = ['submission', 'execution'] as const

/**
 * The key that sends a prepared call or batch.
 *
 * - A batch is sent by the account's key, and only a batch whose every call's
 *   sender is the account; any other batch is refused.
 * - A call whose sender is the account is sent by the account's key.
 * - A call anyone may send is sent by the recoverer's key only where the
 *   caller names it as one of the two recovery calls; any other such call
 *   (the cancel by proofs) is refused.
 *
 * Throws where the call is refused or the role's key was not given.
 */
export const sendingKeyOf = (
  prepared: PreparedCall | PreparedBatch,
  keys: SendingKeys,
  recoveryCall?: RecoveryCall
): KeyHandle => {
  if (prepared.kind === 'batch' && prepared.calls.some((call) => call.sender !== 'account')) {
    throw new Error(
      'A batch is sent by the account, and every call in it must be sent by the account.'
    )
  }
  const sender = prepared.kind === 'batch' ? 'account' : prepared.sender
  if (sender === 'anyone' && !recoveryCall) {
    throw new Error(
      'Only the submission and the execution are sent from the key of the recoverer in this release.'
    )
  }
  const key = sender === 'account' ? keys.accountKey : keys.recovererKey
  if (!key) {
    throw new Error(
      sender === 'account'
        ? 'A call the account sends needs the controlling key of the account.'
        : 'A recovery call needs the key of the recoverer in this release.'
    )
  }
  return { ...key }
}
