/**
 * The social recovery writes that share the submitting and failed states and
 * the gas check: every owner-signed write and both recovery calls.
 *
 * Which key pays follows from the write: the account's own operations (a
 * setup save, an edit, any other setup write, the owner's cancel) are sent by
 * the account's controlling key, and the two recovery calls anyone may send
 * (the submission, the execution) by the recoverer's own key, since the first
 * release configures no sponsor (shared/client `sending.ts`).
 */
import type { PreparedBatch, PreparedCall } from '@web/modules/social-recovery/sdk-interfaces'

import type { OwnerWrite, Payer, RecoveryCall, WriteKind } from './types'

/**
 * The writes, by the copy they need:
 *
 * - `save`: the setup save, the batch that arms the recovery setup;
 * - `edit`: the editor's save, the recovery password's change among them;
 * - `ownerWrite`: any other setup write the account's key sends, the removal
 *   among them, with no reverted sentence of its own;
 * - `cancel`: the owner's cancel of a running recovery attempt;
 * - `submission`: the start of a recovery;
 * - `execution`: the execution at execution due.
 */
export const WRITE_KINDS = [
  'save',
  'edit',
  'ownerWrite',
  'cancel',
  'submission',
  'execution'
] as const

/** The writes the account's controlling key sends and pays for. */
export const OWNER_WRITES = ['save', 'edit', 'ownerWrite', 'cancel'] as const

/** The two recovery calls the recoverer's own key sends and pays for in the first release. */
export const RECOVERY_CALLS = ['submission', 'execution'] as const

/**
 * Who pays the gas of a write: the account's controlling key, or the sending
 * key of a recovery (the recoverer's own key).
 */
export const PAYERS = ['accountKey', 'sendingKey'] as const

export const isOwnerWrite = (write: WriteKind): write is OwnerWrite =>
  (OWNER_WRITES as readonly string[]).includes(write)

export const isRecoveryCall = (write: WriteKind): write is RecoveryCall =>
  (RECOVERY_CALLS as readonly string[]).includes(write)

/** The key that pays the gas of a write. */
export const payerOf = (write: WriteKind): Payer =>
  isOwnerWrite(write) ? 'accountKey' : 'sendingKey'

/**
 * Checks that a prepared write comes through the door its kind names: an owner
 * write is a call whose sender is the account, or a batch, which the account
 * runs as one transaction; a recovery call is a call anyone may send. Throws a
 * TypeError otherwise, so no screen names the wrong key as the payer.
 */
export const assertWriteDoor = (write: WriteKind, prepared: PreparedCall | PreparedBatch): void => {
  const sender = prepared.kind === 'batch' ? 'account' : prepared.sender
  const expected = isOwnerWrite(write) ? 'account' : 'anyone'
  if (sender !== expected) {
    throw new TypeError(
      `A ${write} is a call whose sender is ${
        expected === 'account' ? 'the account' : 'anyone'
      }, but the prepared ${prepared.kind} names ${
        sender === 'account' ? 'the account' : 'anyone'
      }.`
    )
  }
}
