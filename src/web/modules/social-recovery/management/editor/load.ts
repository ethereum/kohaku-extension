/**
 * A committed configuration loaded into the setup records, so the setup's own
 * editor, waiting period and privacy steps edit it: the clauses become the
 * draft and the path, each committed row an enrollment, the wait the waiting
 * period, and the level the draft's privacy fields with the password-set flag
 * at a hidden level. The draft read back gives the configuration again.
 *
 * A committed row is already part of the setup on chain, so its enrollment
 * reads as live; a test run on it in the edit moves it to that test's verdict.
 */
import {
  isReadUnder,
  reauthorizeDraftOf
} from '@web/modules/social-recovery/management/overview/readings'
import type { Configuration, SetupDraft } from '@kohaku-eth/social-recovery'
import type { PrivacyLevel } from '@web/modules/social-recovery/shared/client'
import { PASSWORD_SET } from '@web/modules/social-recovery/shared/records'
import type { Enrollment, SetupRecords } from '@web/modules/social-recovery/shared/records'

import type { EditSession, LoadedRecords, OpenEditInput } from './types'

export const recordsOfConfiguration = (
  configuration: Configuration,
  level: PrivacyLevel
): LoadedRecords => {
  const copied: Configuration = {
    ...configuration,
    clauses: configuration.clauses.map(({ threshold, credentials }) => ({
      threshold,
      credentials: credentials.map((credential) => ({ ...credential }))
    }))
  }
  const setupDraft = reauthorizeDraftOf(copied, level)
  const enrollments: Enrollment[] = setupDraft.clauses.flatMap(({ credentials }) =>
    credentials.map((credential) => ({ credential, test: 'live' as const }))
  )
  return {
    setupDraft,
    enrollments,
    waitingPeriod: setupDraft.wait,
    hidden: level !== 'public'
  }
}

/** The configuration a draft commits: its clauses, its wait and its pause choice. */
export const configurationOfDraft = ({
  clauses,
  wait,
  ignoresPause
}: SetupDraft): Configuration => ({ clauses, wait, ignoresPause })

/**
 * Writes the loaded records over whatever the setup records hold: the draft
 * and the path together first, then the enrollments, the waiting period and
 * the password-set flag. The inventory is a setup wizard's answer and is
 * removed.
 */
export const writeLoadedRecords = async (
  setup: SetupRecords,
  loaded: LoadedRecords
): Promise<void> => {
  await setup.writeDraftAndPath(loaded.setupDraft)
  await Promise.all([
    setup.enrollments.write(loaded.enrollments),
    setup.waitingPeriod.write(loaded.waitingPeriod),
    loaded.hidden ? setup.passwordSet.write(PASSWORD_SET) : setup.passwordSet.wipe(),
    setup.inventory.wipe()
  ])
}

/**
 * Opens the edit of the committed setup: an edit session read under the setup
 * the chain holds now, whose setup draft the records still hold, is taken up
 * as it stands, with the records it left; any other loads the committed
 * configuration into the setup records and starts a new session over it.
 */
export const openEditSession = async ({
  setup,
  session,
  state,
  configuration,
  level
}: OpenEditInput): Promise<EditSession> => {
  const held = await session.read()
  if (held && isReadUnder(held, state) && (await setup.setupDraft.read()).status === 'present') {
    return held
  }
  await writeLoadedRecords(setup, recordsOfConfiguration(configuration, level))
  const opened: EditSession = {
    configuration,
    setupNonce: state.setupNonce,
    setupCommitment: state.setupCommitment,
    level,
    password: 'kept'
  }
  await session.write(opened)
  return opened
}
