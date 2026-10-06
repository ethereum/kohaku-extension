/**
 * The save gate: Save runs only once the records loaded, every slot of the
 * path holds a method, an encrypted backup has its recovery password, the
 * client is ready, every trust list read answered, the key a recovery removes
 * is named, the action fits the account and no setup exists. The block shown
 * is the first that applies: the records' blocks (an empty slot, then the
 * missing password) before the reads' blocks (a read that did not answer, the
 * removed key unreadable, an account this release cannot recover because the
 * action does not fit it or it holds more than one key, a setup that already
 * exists). An untested method warns beside Save and never disables it.
 */
import type { Clause } from '@web/modules/social-recovery/sdk-interfaces'
import type { Enrollment } from '@web/modules/social-recovery/shared/records'
import { isEmptySlot } from '@web/modules/social-recovery/shared/records/slots'

import { ACCOUNT_READ_NAMES } from './constants'
import { authoritiesOf } from './doors'
import { enrollmentOf } from './lead'
import { trustReadsComplete } from './trust'
import type { AccountReadName, AccountReads, SaveBlock, SaveGate, SaveGateInput } from './types'

/**
 * Whether a credential of the path was never tested: it has no enrollment, or
 * its test was skipped. A test that failed, could not run or is not supported
 * reads its own outcome on its row instead.
 */
export const untestedInPath = (
  clauses: readonly Clause[],
  enrollments: readonly Enrollment[]
): boolean =>
  clauses
    .flatMap(({ credentials }) => credentials)
    .some((credential) => {
      if (isEmptySlot(credential)) {
        return false
      }
      const enrollment = enrollmentOf(credential, enrollments)
      return enrollment === undefined || enrollment.test === 'not-tested'
    })

/** Whether a member of any clause of the path is a slot no method fills. */
const hasEmptySlot = (clauses: readonly Clause[]): boolean =>
  clauses.some(({ credentials }) => credentials.some(isEmptySlot))

/** Whether the account holds several keys, so no single key is the one a recovery removes. */
const holdsSeveralKeys = ({ removedKey }: AccountReads): boolean =>
  removedKey.status === 'answered' &&
  removedKey.value.kind === 'unavailable' &&
  removedKey.value.cause === 'several-key-entries'

/** Whether the key a recovery would remove could not be named, other than for holding several keys. */
const removedKeyUnreadable = (reads: AccountReads): boolean =>
  reads.removedKey.status === 'failed' ||
  (reads.removedKey.status === 'answered' &&
    reads.removedKey.value.kind === 'unavailable' &&
    !holdsSeveralKeys(reads))

/**
 * The account's reads a retry runs again: every read that threw, and the
 * removed key where it could not be named.
 */
export const accountReadsToRetry = (reads: AccountReads): AccountReadName[] =>
  ACCOUNT_READ_NAMES.filter(
    (name) =>
      reads[name].status === 'failed' || (name === 'removedKey' && removedKeyUnreadable(reads))
  )

/**
 * The block on screen, once every read it depends on settled: until then no
 * block shows, so one does not flash and give way to another.
 */
const blockOf = (input: SaveGateInput): SaveBlock | null => {
  const { trustRows, removedKey, fitCheck, setupState, description } = input
  if (
    trustRows.some(({ contract }) => contract.status === 'pending') ||
    [removedKey, fitCheck, setupState, description].some(({ status }) => status === 'pending')
  ) {
    return null
  }
  if (
    trustRows.some(({ contract }) => contract.status === 'unavailable') ||
    fitCheck.status === 'failed' ||
    setupState.status === 'failed'
  ) {
    return { kind: 'unavailable' }
  }
  if (removedKeyUnreadable(input)) {
    return { kind: 'removed-key-unreadable' }
  }
  if (fitCheck.status === 'answered' && !fitCheck.value.fits) {
    return { kind: 'cannot-recover', reason: 'not-supported' }
  }
  const count =
    description.status === 'answered' ? authoritiesOf(description.value).length : undefined
  if (count !== undefined && count > 1) {
    return { kind: 'cannot-recover', reason: 'key-count', count }
  }
  if (holdsSeveralKeys(input)) {
    return { kind: 'cannot-recover', reason: 'key-count' }
  }
  if (setupState.status === 'answered' && setupState.value.hasSetup) {
    return { kind: 'already-set-up' }
  }
  return null
}

/** The block the setup records alone decide, whatever the reads answer. */
const recordsBlockOf = ({ clauses, backup, passwordSet }: SaveGateInput): SaveBlock | null => {
  if (hasEmptySlot(clauses)) {
    return { kind: 'empty-slot' }
  }
  if (backup === 'encrypted' && !passwordSet) {
    return { kind: 'password-missing' }
  }
  return null
}

export const saveGateOf = (input: SaveGateInput): SaveGate => {
  const { recordsLoaded, clientReady, trustRows, removedKey, fitCheck, setupState } = input
  const recordsBlock = recordsLoaded ? recordsBlockOf(input) : null
  const readsBlock = recordsLoaded && clientReady ? blockOf(input) : null
  const blocked = recordsBlock ?? readsBlock
  const everyRead =
    trustReadsComplete(trustRows) &&
    removedKey.status === 'answered' &&
    fitCheck.status === 'answered' &&
    setupState.status === 'answered' &&
    // The key count comes from the description, so Save waits for it to settle;
    // a description that could not be read never blocks.
    input.description.status !== 'pending'
  return {
    canSave: recordsLoaded && clientReady && everyRead && blocked === null,
    blocked,
    notTested: recordsLoaded && input.untested
  }
}
