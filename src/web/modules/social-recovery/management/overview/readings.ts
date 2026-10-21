/**
 * The overview's pure readings: what it draws from the setup state, the
 * authorization and the attempt; whether this device's opened setup is the
 * committed one; what the logs since the commit say; the notice after an
 * ended attempt; and the draft a re-authorize commits again.
 */
import { isAddressEqual } from 'viem'

import type { SetupReading } from '@web/modules/social-recovery/recovery/entry/types'
import type {
  Address,
  Clause,
  Configuration,
  DeploymentDescriptor,
  KitNotification,
  SetupDraft,
  SetupState
} from '@kohaku-eth/social-recovery'
import type {
  PrivacyLevel,
  AddressBook,
  RecoveryAttemptState
} from '@web/modules/social-recovery/shared/client'
import type { DecryptedSetupCacheRecord } from '@web/modules/social-recovery/shared/records'
import { isOfDeployment } from '@web/modules/social-recovery/shared/records'
import { privacyOfLevel } from '@web/modules/social-recovery/setup/privacy/writes'
import { methodsOf } from '@web/modules/social-recovery/setup/review'
import type { AttemptEnding, WatcherRecord } from '@web/modules/social-recovery/watcher'

import type {
  EndedNotice,
  KnownFloor,
  MovedKeys,
  OverviewIntent,
  OverviewKind,
  OverviewNotices,
  PathStep
} from './types'

/** What the overview draws from the setup and the account's authorization of the action. */
export const overviewKindOf = (setup: SetupState): OverviewKind => {
  if (setup.hasSetup) {
    return setup.isAuthorized ? 'set-up' : 'dormant'
  }
  return setup.isAuthorized ? 'mirror' : 'not-set-up'
}

/**
 * Whether an attempt is open on the account, pending or ready: either read
 * saying so is enough, so a repair the wallet refuses beside a running
 * attempt is never offered on one read's word alone.
 */
export const attemptOpenOf = (setup: SetupState, attempt: RecoveryAttemptState): boolean =>
  setup.attemptActive || attempt.attempt.state === 'Waiting'

/**
 * Whether a setup held on this device was read under the setup the chain
 * holds now: its nonce, and its commitment where it names one.
 */
export const isReadUnder = (
  held: Pick<DecryptedSetupCacheRecord, 'setupNonce' | 'setupCommitment'>,
  setup: SetupState
): boolean =>
  held.setupNonce === setup.setupNonce &&
  (held.setupCommitment === undefined ||
    held.setupCommitment.toLowerCase() === setup.setupCommitment.toLowerCase())

/**
 * Whether the opened setup this device keeps is the one the chain holds now,
 * read from the manager and the action the client reads. A cache of another
 * deployment, or one that names none, is not.
 */
export const isCacheCurrent = (
  cache: DecryptedSetupCacheRecord,
  setup: SetupState,
  descriptor: Pick<DeploymentDescriptor, 'manager' | 'action'>
): boolean => isOfDeployment(cache.deployment, descriptor) && isReadUnder(cache, setup)

/**
 * What this device has seen of the account's setup at the deployment the
 * client reads. The setup nonce is the highest of the one its opened setup was
 * read under and the one the attempt the watcher last read was opened under: a
 * setup nonce never goes down at one manager, so an answer below it comes from
 * a node that lags or lost its state. The setup block is the block of the
 * watcher's last reading where that reading found a setup: an answer of no
 * setup from an earlier block comes from a node behind that reading. A record
 * of another deployment, or one that names none, says nothing of this manager
 * and gives neither.
 */
export const knownFloorOf = (
  cache: DecryptedSetupCacheRecord | undefined,
  watched: WatcherRecord | undefined,
  descriptor: Pick<DeploymentDescriptor, 'manager' | 'action'>
): KnownFloor => {
  const reading =
    watched?.reading && isOfDeployment(watched.reading.deployment, descriptor)
      ? watched.reading
      : undefined
  const setupNonce = [
    cache && isOfDeployment(cache.deployment, descriptor) ? cache.setupNonce : undefined,
    reading?.attempt?.setupNonce
  ].reduce<bigint | undefined>(
    (highest, nonce) =>
      nonce === undefined || (highest !== undefined && highest >= nonce) ? highest : nonce,
    undefined
  )
  return {
    ...(setupNonce === undefined ? {} : { setupNonce }),
    ...(reading?.hasSetup ? { setupBlock: reading.block.number } : {})
  }
}

/**
 * Whether a setup state reads below what this device has seen: a setup nonce
 * below the known one, or no setup at a block before a reading that found one.
 * A clear read at or after that reading's block stands.
 */
export const isBelowFloor = (state: SetupState, known: KnownFloor): boolean =>
  (known.setupNonce !== undefined && state.setupNonce < known.setupNonce) ||
  (!state.hasSetup && known.setupBlock !== undefined && state.block.number < known.setupBlock)

/** Whether two reads of the setup state name the same committed setup: its nonce and its commitment. */
export const isSameSetup = (read: SetupState, earlier: SetupState): boolean =>
  read.setupNonce === earlier.setupNonce &&
  read.setupCommitment.toLowerCase() === earlier.setupCommitment.toLowerCase()

/**
 * What the logs since the commit hold: each method's latest key update, and
 * every attempt a cancel ended. A log a reorganization removed counts for
 * neither.
 */
export const noticesOf = (found: readonly KitNotification[]): OverviewNotices => {
  const moved = new Map<string, MovedKeys>()
  const cancelledAttempts: bigint[] = []
  found.forEach((notification) => {
    if (notification.at.removed) {
      return
    }
    if (notification.kind === 'method-keys-updated') {
      const key = notification.method.toLowerCase()
      const held = moved.get(key)
      if (!held || held.at.blockNumber <= notification.at.blockNumber) {
        moved.set(key, { method: notification.method, at: notification.at })
      }
    }
    if (notification.kind === 'attempt-cancelled') {
      cancelledAttempts.push(notification.attemptId)
    }
  })
  return { moved: [...moved.values()], cancelledAttempts }
}

/** The moved methods the path uses, in the order the logs named them. */
export const movedInPath = (
  moved: readonly MovedKeys[],
  methods: readonly Address[]
): MovedKeys[] => moved.filter(({ method }) => methods.some((used) => isAddressEqual(used, method)))

/** The clauses of the path as far as this device reads them: the whole path, or its shape alone. */
export const clausesOfPath = (path: PathStep): readonly Clause[] => {
  if (path.kind === 'readable') {
    return path.configuration.clauses
  }
  if (path.kind === 'locked' && path.shape) {
    return path.shape.clauses.map(({ threshold, methods }) => ({
      threshold,
      credentials: methods.map((method) => ({ method, config: '0x' }))
    }))
  }
  return []
}

/** The method contracts the path uses, each once; none where this device cannot read the path. */
export const pathMethodsOf = (path: PathStep, addressBook: AddressBook): Address[] =>
  methodsOf(clausesOfPath(path), addressBook)

/**
 * The notice after an ended attempt, from the watcher's last ending: after
 * the owner's cancel or after a setup write, while the current setup was
 * committed no later than that ending, which holds where the cancel's log
 * sits in the blocks from the commit on. Any other road, an ending whose time
 * is not read yet, or an ending before the commit draws none.
 */
export const endedNoticeOf = (
  ending: AttemptEnding | undefined,
  cancelledSinceCommit: readonly bigint[]
): EndedNotice | null => {
  if (!ending || ending.road !== 'cancelled' || ending.at === undefined) {
    return null
  }
  if (!cancelledSinceCommit.includes(ending.attemptId)) {
    return null
  }
  if (ending.cancelledBy === 'cancelByOwner') {
    return { road: 'ownerCancel', at: ending.at }
  }
  if (ending.cancelledBy === 'setupWrite') {
    return { road: 'setupWrite', at: ending.at }
  }
  return null
}

/** The privacy level a setup read before the password answers, or null where it names none. */
export const levelOfReading = (reading: SetupReading): PrivacyLevel | null => {
  switch (reading.kind) {
    case 'readable':
      return 'public'
    case 'shape-readable':
      return 'shape-visible'
    case 'sealed':
      return 'private'
    default:
      return null
  }
}

/**
 * The draft a re-authorize commits: the committed configuration's clauses,
 * wait and pause choice, at the committed level with that level's own backup
 * form and public note.
 */
export const reauthorizeDraftOf = (
  configuration: Configuration,
  level: PrivacyLevel
): SetupDraft => {
  const body = {
    wait: configuration.wait,
    clauses: configuration.clauses,
    ignoresPause: configuration.ignoresPause
  }
  const offered = level === 'public' || level === 'private' ? level : 'shape-visible'
  return {
    ...body,
    privacy: privacyOfLevel(
      { ...body, privacy: { publicMetadata: '0x', backup: 'encrypted' } },
      offered
    )
  }
}

/** Whether the level hides the setup behind the recovery password. */
export const needsPassword = (level: PrivacyLevel): boolean => level !== 'public'

/**
 * The end each write leaves on the chain: the setup committed and authorized,
 * no setup, or no authorization.
 */
export const goalStands = (intent: OverviewIntent, setup: SetupState): boolean => {
  switch (intent) {
    case 'reauthorize':
      return setup.hasSetup && setup.isAuthorized
    case 'clear':
      return !setup.hasSetup
    case 'removeAuthorization':
    default:
      return !setup.isAuthorized
  }
}
