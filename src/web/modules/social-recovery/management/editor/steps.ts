/**
 * The editor's two writes over the save's own steps and run, so each keeps
 * the save's request queue, its stored write in flight, its receipt waits and
 * its check after the landing.
 *
 * Each write's request id ends with its own mark, and a write never takes up
 * a stored write that names another: reading or losing its claim to one ends
 * the run with nothing sent, and a release of another's request removes
 * nothing, so the page that stored it keeps following it.
 *
 * The save of the changes commits the draft through the save's own prepare:
 * the kit reads the setup nonce from the chain, so the commit is the update,
 * and it cancels an attempt running against the old setup in the same act.
 * Its gas check, which every path to the send runs, and its send, after the
 * claim and before the request is handed to the wallet, read the attempt
 * again and refuse while the setup is not authorized and an attempt is open,
 * since that commit would authorize the setup again while the recovery runs,
 * and refuses an open attempt the screen did not show, so the holder sees
 * that saving cancels it before a second press sends. The new recovery
 * password seals the backup only where the edit session marks it typed, so
 * the save does what the review showed. The save's setup read becomes the read
 * of whether the setup moved past the one the edit started from: a run that
 * finds it moved at its start sends nothing, and a followed write that finds
 * it moved is checked as after its receipt. Its landing first keeps the
 * recovery password the backup is now sealed under: the one this tab sent
 * where its own write landed, and for a write it followed only a password it
 * holds that opens the landed backup. It then wipes the setup records, ends
 * the edit session and rewrites this device's opened setup with the
 * configuration and the nonce the landed commit holds.
 * Either write's landing ends this device's countdown of an attempt the
 * chain shows over: the recovery that brought the account here is done.
 *
 * The removal sends the clear and the zero write of the authorization as one
 * batch, prepared together and sent through the account's own door. Its
 * end stands once the setup is gone and the account no longer authorizes the
 * action. Its gas check and its send read the attempt again and refuse an open
 * attempt the screen did not show; a read that fails stops nothing and leaves
 * the line as the screen drew it. Its landing, and a run that finds that end
 * already standing, wipe the recovery password, the setup records, this
 * device's opened setup and the edit session.
 */
import { REMOVAL_DRAFT } from '@web/modules/social-recovery/management/overview/constants'
import {
  attemptOpenOf,
  isReadUnder
} from '@web/modules/social-recovery/management/overview/readings'
import type { SetupConfirmation, SetupState } from '@kohaku-eth/social-recovery'
import {
  accountBatchTransactionOf,
  newSendRequestId
} from '@web/modules/social-recovery/shared/client'
import {
  SETUP_RECORD_NAMES,
  recordDeploymentOf,
  setRecoveryPassword,
  wipeRecoveryPassword
} from '@web/modules/social-recovery/shared/records'
import {
  assertWriteDoor,
  checkGas,
  intentOfRequest,
  MANAGE_INTENT_MARKS,
  walletAccountRefOf
} from '@web/modules/social-recovery/shared/writes'
import type { ManageIntent } from '@web/modules/social-recovery/shared/writes'
import { callsOf, endPastCountdown, saveStepsOf } from '@web/modules/social-recovery/setup/arm'
import type { PreparedSave, SaveSteps } from '@web/modules/social-recovery/setup/arm'

import { configurationOfDraft } from './load'
import { dropNewPassword } from './session'
import type {
  AttemptRead,
  EditorStepsInput,
  EditStepsInput,
  LandedCommit,
  RemovedWipeInput
} from './types'

/** Runs every write, and fails with the first that failed once all of them ended. */
const allWrites = async (writes: readonly Promise<unknown>[]): Promise<void> => {
  const failed = (await Promise.allSettled(writes)).find(({ status }) => status === 'rejected')
  if (failed && failed.status === 'rejected') {
    throw failed.reason
  }
}

/** The steps that keep a write to its own stored request. */
const ownRequestSteps = (
  intent: ManageIntent,
  save: SaveSteps
): Pick<SaveSteps, 'newRequestId' | 'readInFlight' | 'claim' | 'release' | 'releaseUnsent'> => {
  const ours = (requestId: string) => intentOfRequest(requestId) === intent
  const refuse = (requestId: string): never => {
    throw new Error(`The write in flight ${requestId} belongs to another screen.`)
  }
  return {
    newRequestId: () => `${newSendRequestId()}${MANAGE_INTENT_MARKS[intent]}`,
    async readInFlight() {
      const read = await save.readInFlight()
      if (read.status === 'present' && !ours(read.value.requestId)) {
        refuse(read.value.requestId)
      }
      return read
    },
    async claim(prepared, requestId, startBlock) {
      const claim = await save.claim(prepared, requestId, startBlock)
      if (!claim.claimed && !ours(claim.record.value.requestId)) {
        refuse(claim.record.value.requestId)
      }
      return claim
    },
    async release(requestId) {
      if (ours(requestId)) {
        await save.release(requestId)
      }
    },
    async releaseUnsent(requestId) {
      if (ours(requestId)) {
        await save.releaseUnsent(requestId)
      }
    }
  }
}

/** Reads the attempt with the setup, and tells the screen what it read. */
const readAttempt = async (input: EditorStepsInput): Promise<AttemptRead> => {
  const [state, attempt] = await Promise.all([
    input.client.setup.setupState(),
    input.client.walletReads.attemptState()
  ])
  const open = attemptOpenOf(state, attempt)
  const read = { open, dormant: open && !state.isAuthorized }
  input.onAttempt?.(read)
  return read
}

const UNSHOWN_ATTEMPT = 'An attempt opened that the screen did not show; nothing was sent.'

/** Whether the removal's end stands: no setup, and no authorization of the action. */
export const removalStands = (state: SetupState): boolean => !state.hasSetup && !state.isAuthorized

/** What this device keeps of a setup the chain no longer holds: nothing. */
export const wipeRemovedSetup = async ({
  records,
  session,
  chainId,
  account
}: RemovedWipeInput): Promise<void> => {
  wipeRecoveryPassword(chainId, account)
  dropNewPassword(chainId, account)
  const setup = records.setup(chainId, account)
  await allWrites([
    ...SETUP_RECORD_NAMES.map((name) => setup[name].wipe()),
    records.decryptedSetupCache(chainId, account).wipe(),
    session.wipe()
  ])
}

export const editStepsOf = (input: EditStepsInput): SaveSteps => {
  const { baseline, chainId, account } = input
  const sealed = input.draft.privacy.backup === 'encrypted'
  // The review shows a new password only where the session marks it; the save follows the review.
  const newPassword = baseline.password === 'changed' ? input.newPassword : undefined
  const password = sealed ? newPassword ?? input.password : undefined
  const save = saveStepsOf({
    ...input,
    setup: input.records.setup(chainId, account),
    password
  })
  // The write this tab's own prepare made; a write it follows arrives as another object.
  let own: PreparedSave | undefined
  let landed: LandedCommit | undefined

  /** Whether the backup that landed opens with a password this tab holds. */
  const opensLanded = (candidate: string): Promise<boolean> =>
    input.client.setup.getSetup({ password: candidate }).then(
      () => true,
      () => false
    )

  const keepPassword = async () => {
    const candidate = newPassword ?? input.password
    if (!landed || landed.draft.privacy.backup !== 'encrypted') {
      wipeRecoveryPassword(chainId, account)
    } else if (landed.own && password !== undefined) {
      // The landed backup is sealed under exactly the password this tab sent.
      setRecoveryPassword(chainId, account, password)
    } else if (candidate !== undefined && (await opensLanded(candidate))) {
      setRecoveryPassword(chainId, account, candidate)
    } else {
      // Another tab sealed the backup this tab followed. A password it refuses, or a read with no
      // answer, is not kept: the card asks the holder and checks the typed password itself.
      wipeRecoveryPassword(chainId, account)
    }
    dropNewPassword(chainId, account)
  }

  const guardAttempt = async () => {
    // What the screen showed when the holder pressed, before this read moves it.
    const lineShown = input.showsCancelLine?.() ?? true
    const attempt = await readAttempt(input)
    if (attempt.dormant) {
      throw new Error('This wallet does not commit a setup again while a recovery is in progress.')
    }
    // The holder confirms a save that cancels an attempt only once the screen says so.
    if (attempt.open && !lineShown) {
      throw new Error(UNSHOWN_ATTEMPT)
    }
  }

  return {
    ...save,
    ...ownRequestSteps('manageEdit', save),
    hasSetup: async () => !isReadUnder(baseline, await input.client.setup.setupState()),
    async prepare(): Promise<PreparedSave> {
      if (sealed && password === undefined) {
        throw new Error('The save seals the setup and needs the recovery password.')
      }
      own = await save.prepare()
      return own
    },
    async checkGas(prepared: PreparedSave) {
      await guardAttempt()
      return save.checkGas(prepared)
    },
    // Reads the attempt again after the claim, before the request is handed to the wallet.
    async send(...args) {
      await guardAttempt()
      return save.send(...args)
    },
    async confirm(prepared: PreparedSave): Promise<SetupConfirmation> {
      const confirmation = await save.confirm(prepared)
      if (confirmation.landed) {
        landed = { draft: prepared.draft, confirmation, own: prepared === own }
      }
      return confirmation
    },
    async wipe(): Promise<void> {
      await keepPassword()
      const cache = input.records.decryptedSetupCache(chainId, account)
      await allWrites([
        input.records.saveSetup(chainId, account),
        input.session.wipe(),
        landed
          ? cache.write({
              configuration: configurationOfDraft(landed.draft),
              setupNonce: landed.confirmation.nonce,
              setupCommitment: landed.confirmation.setupCommitment,
              deployment: recordDeploymentOf(input.client.descriptor)
            })
          : cache.wipe()
      ])
      await endPastCountdown(input)
    }
  }
}

export const removalStepsOf = (input: EditorStepsInput): SaveSteps => {
  const { client, chainId, account, facts, key } = input
  const save = saveStepsOf({
    ...input,
    setup: input.records.setup(chainId, account),
    draft: REMOVAL_DRAFT,
    password: undefined
  })

  const guardAttempt = async () => {
    const lineShown = input.showsCancelLine?.() ?? true
    // The removal removes whatever stands; an attempt it could not read leaves the line as it was.
    const attempt = await readAttempt(input).catch(() => undefined)
    // The holder confirms a removal that cancels an attempt only once the screen says so.
    if (attempt?.open && !lineShown) {
      throw new Error(UNSHOWN_ATTEMPT)
    }
  }

  return {
    ...save,
    ...ownRequestSteps('manageRemove', save),
    hasSetup: async () => removalStands(await client.setup.setupState()),
    async prepare(): Promise<PreparedSave> {
      const prepared = await client.setup.prepareRemoveSetup()
      assertWriteDoor('ownerWrite', prepared)
      return { draft: REMOVAL_DRAFT, prepared, calls: callsOf(prepared) }
    },
    // Reads the attempt again after the claim, before the request is handed to the wallet.
    async send(...args) {
      await guardAttempt()
      return save.send(...args)
    },
    async checkGas({ prepared, calls }: PreparedSave) {
      await guardAttempt()
      return checkGas({
        write: 'ownerWrite',
        prepared,
        key,
        reads: input.reads,
        network: facts.network,
        transaction: accountBatchTransactionOf(facts, key, calls),
        operates: walletAccountRefOf(facts)
      })
    },
    async confirm(): Promise<SetupConfirmation> {
      const state = await client.setup.setupState()
      const ended = removalStands(state)
      return {
        landed: ended,
        ...(ended ? {} : { cause: 'no-event' as const }),
        isAuthorized: ended,
        nonce: state.setupNonce,
        setupCommitment: state.setupCommitment
      }
    },
    async wipe(): Promise<void> {
      wipeRecoveryPassword(chainId, account)
      dropNewPassword(chainId, account)
      await allWrites([
        input.records.saveSetup(chainId, account),
        input.records.decryptedSetupCache(chainId, account).wipe(),
        input.session.wipe()
      ])
      await endPastCountdown(input)
    }
  }
}
