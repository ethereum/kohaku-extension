/**
 * Opening the checklist over the records: the setup's configuration from the
 * decrypted cache or the recovery password held in memory, the stored session
 * read first, and a new gathering only where none is live. A live session is
 * never replaced: of two tabs that open together, one writes and the other
 * reads the winner's session.
 */
import type {
  Address,
  Configuration,
  Gathering,
  RestoreCause,
  RestoreRefusal
} from '@web/modules/social-recovery/sdk-interfaces'
import { RESTORE_CAUSES } from '@web/modules/social-recovery/sdk-interfaces'
import { REQUEST_WINDOW_SECONDS } from '@web/modules/social-recovery/shared/client'
import { isSessionRevisionConflict } from '@web/modules/social-recovery/shared/records'
import type { ExpectedRevision, SessionRead } from '@web/modules/social-recovery/shared/records'

import { NO_PAYMENT_ORDER } from './constants'
import type {
  ConfigurationInput,
  ConfigurationReading,
  GatherAgainInput,
  OpenInput,
  OpenResult
} from './types'

/**
 * The setup's configuration: the decrypted cache where this device holds it,
 * else the one the recovery password held in memory opens. With neither, the
 * holder unlocks the setup at the readout.
 */
export const configurationOf = async (input: ConfigurationInput): Promise<ConfigurationReading> => {
  const cached = await input.records.decryptedSetupCache(input.chainId, input.account).read()
  if (cached.status === 'present') {
    return { kind: 'configuration', configuration: cached.value.configuration, source: 'cache' }
  }
  if (input.password === undefined) {
    return { kind: 'none' }
  }
  const configuration: Configuration = await input.client.setup.getSetup({
    password: input.password
  })
  return { kind: 'configuration', configuration, source: 'password' }
}

/** The restore cause a thrown value carries, where it is a restore refusal. */
const restoreCauseOf = (error: unknown): RestoreCause | undefined => {
  if (typeof error !== 'object' || error === null || !('cause' in error)) {
    return undefined
  }
  const { cause } = error as Partial<RestoreRefusal>
  if (typeof cause !== 'object' || cause === null) {
    return undefined
  }
  return RESTORE_CAUSES.find((known) => known === cause.code)
}

/** A stored session as what opening found. */
export const resultOfRead = (read: SessionRead): OpenResult | null => {
  if (read.status !== 'present') {
    return null
  }
  const { value, revision, savedAt } = read
  if (value.state === 'live') {
    return { kind: 'live', session: value, revision, savedAt }
  }
  if (value.state === 'wiped') {
    return { kind: 'wiped', session: value, revision }
  }
  return { kind: 'landed' }
}

/**
 * A gathering opened over a configuration, for the destination key and the
 * key the recovery removes.
 */
const initOver = async (
  input: OpenInput,
  destination: Address,
  configuration: Configuration
): Promise<Gathering> => {
  const removed = await input.client.walletReads.removedKey()
  return input.client.recovery.initRecoveryGathering(
    configuration,
    {
      newAuthority: destination,
      ...(removed.kind === 'named' ? { removedAuthority: removed.key } : {})
    },
    NO_PAYMENT_ORDER,
    { window: REQUEST_WINDOW_SECONDS }
  )
}

/**
 * Opens a new gathering over the configuration, the handover naming the
 * destination key and the key the recovery removes, and writes it as the live
 * session under the revision the caller read: none, or the wiped session it
 * replaces. A setup the chain no longer commits, whether from the cache or
 * from an earlier read with the password, is read again with the recovery
 * password held in memory; with none held, the holder unlocks it at the
 * readout. Where another tab wrote first, its session is the one this tab
 * reads.
 */
const startGathering = async (
  input: OpenInput,
  destination: Address,
  expected: ExpectedRevision
): Promise<OpenResult> => {
  let { configuration } = input
  let fresh: Configuration | undefined
  let gathering: Gathering
  try {
    gathering = await initOver(input, destination, configuration)
  } catch (error: unknown) {
    if (restoreCauseOf(error) !== 'restore.commitment-mismatch') {
      throw error
    }
    if (input.password === undefined) {
      return { kind: 'needs-password' }
    }
    configuration = await input.client.setup.getSetup({ password: input.password })
    fresh = configuration
    gathering = await initOver(input, destination, configuration)
  }
  const accessor = input.records.recoverySession(input.chainId, input.account)
  try {
    const stored = await accessor.write(gathering, expected)
    if (stored.value.state !== 'live') {
      throw new Error('The session write stored no live session')
    }
    return {
      kind: 'live',
      session: stored.value,
      revision: stored.revision,
      savedAt: stored.savedAt,
      ...(fresh ? { configuration: fresh } : {})
    }
  } catch (error: unknown) {
    if (!isSessionRevisionConflict(error)) {
      throw error
    }
    const winner = resultOfRead(await accessor.read())
    if (!winner) {
      throw error
    }
    return winner
  }
}

/**
 * What the checklist opens on: a stored live, wiped or landed session, and
 * otherwise a new gathering once the destination key is known. The line the
 * recoverer's own abandon leaves is no reason to show: it counts as no session,
 * and the new gathering replaces it.
 */
export const openChecklist = async (input: OpenInput): Promise<OpenResult> => {
  const read = await input.records.recoverySession(input.chainId, input.account).read()
  const found = resultOfRead(read)
  const abandoned =
    found?.kind === 'wiped' && found.session.reason === 'recoverer-abandoned' ? found : null
  if (found && !abandoned) {
    return found
  }
  if (!input.destination) {
    return { kind: 'needs-destination' }
  }
  return startGathering(input, input.destination, abandoned ? abandoned.revision : null)
}

/**
 * Gathers again after a wipe: the new gathering opens first and replaces the
 * wiped line in one write, so a failed open keeps the reason on screen.
 */
export const gatherAgain = async (input: GatherAgainInput): Promise<OpenResult> => {
  if (!input.destination) {
    return { kind: 'needs-destination' }
  }
  return startGathering(input, input.destination, input.revision)
}
