/**
 * The save gate: Save runs only once the records loaded, every slot of the
 * path holds a method, an encrypted backup has its recovery password, the
 * client is ready, every trust list read answered, the key a recovery removes
 * is named, the action fits the account and no setup exists. The block shown
 * is the first that applies: a basic account, which this release cannot
 * recover whatever else holds; then the records' blocks (an empty slot, then
 * the missing password) before the reads' blocks (a read that did not answer,
 * an account this release cannot recover because the action does not fit it
 * or it holds more than one key, the removed key unreadable, a setup that
 * already exists). A cannot-recover answer is final, so it comes before the
 * unreadable removed key, whose retry could not change it. An untested method
 * warns beside Save and never disables it, and never shows beside a
 * cannot-recover answer.
 */
import type { Address, Clause, SetupDescription } from '@kohaku-eth/social-recovery'
import type { Enrollment } from '@web/modules/social-recovery/shared/records'
import { enrollmentOf, isEmptySlot } from '@web/modules/social-recovery/shared/records/slots'

import { ACCOUNT_READ_NAMES } from './constants'
import { trustReadsComplete } from './trust'
import type {
  AccountReadName,
  AccountReads,
  SaveBlock,
  SaveGate,
  SaveGateInput,
  UntestedCredential
} from './types'

/**
 * The credentials of the path that were never tested, each at its place in
 * the path: no enrollment, or a skipped test. A test that failed, could not
 * run or is not supported reads its own outcome on its row instead.
 */
export const untestedInPath = (
  clauses: readonly Clause[],
  enrollments: readonly Enrollment[]
): UntestedCredential[] =>
  clauses.flatMap(({ credentials }, clause) =>
    credentials.flatMap((credential, member): UntestedCredential[] => {
      if (isEmptySlot(credential)) {
        return []
      }
      const enrollment = enrollmentOf(credential, enrollments)
      return enrollment === undefined || enrollment.test === 'not-tested'
        ? [{ credential, clause, member }]
        : []
    })
  )

/** The candidate keys that hold authority over the account. */
const authoritiesOf = (description: SetupDescription): Address[] =>
  description.candidateKeys.filter(({ isAuthority }) => isAuthority).map(({ key }) => key)

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
 * removed key where it could not be named. A basic account has no removed key
 * to name, so its removed key is never read again.
 */
export const accountReadsToRetry = (reads: AccountReads, basicAccount = false): AccountReadName[] =>
  ACCOUNT_READ_NAMES.filter((name) => {
    if (name === 'removedKey' && basicAccount) {
      return false
    }
    return reads[name].status === 'failed' || (name === 'removedKey' && removedKeyUnreadable(reads))
  })

const NOT_SUPPORTED: SaveBlock = { kind: 'cannot-recover', reason: 'not-supported' }

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
  if (fitCheck.status === 'answered' && !fitCheck.value.fits) {
    return NOT_SUPPORTED
  }
  const count =
    description.status === 'answered' ? authoritiesOf(description.value).length : undefined
  if (count !== undefined && count > 1) {
    return { kind: 'cannot-recover', reason: 'key-count', count }
  }
  if (holdsSeveralKeys(input)) {
    return { kind: 'cannot-recover', reason: 'key-count' }
  }
  if (removedKeyUnreadable(input)) {
    return { kind: 'removed-key-unreadable' }
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
  const blocked = input.basicAccount ? NOT_SUPPORTED : recordsBlock ?? readsBlock
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
    notTested:
      recordsLoaded &&
      blocked?.kind !== 'cannot-recover' &&
      input.untested !== false &&
      input.untested.length > 0
        ? input.untested
        : false
  }
}
