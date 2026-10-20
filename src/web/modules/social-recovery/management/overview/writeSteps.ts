/**
 * The overview's three writes over the save's own steps and run: the
 * re-authorize commits the same body again through the save's prepare, and
 * the two removals prepare the clear or the zero write of the authorization
 * in its place. Every write keeps the save's request queue, its stored write
 * in flight, its receipt waits and its check after the landing.
 *
 * The save's setup read becomes the read of whether the write's end already
 * stands on the chain: a run that finds it at its start sends nothing, and a
 * followed write that finds it landed is checked as after its receipt. A
 * removal's check agrees once the read finds the removal's end.
 *
 * The re-authorize reads the attempt again before it prepares and before
 * every gas check, the deposit step's continuation and the recheck after a
 * short estimation included, and once more after it wins the claim, right
 * before the send, and refuses while one is open, since the wallet
 * keeps the cancel and the repair apart; it tells its step, so the overview
 * reads the chain again and draws why.
 *
 * The cache takes the re-authorized path under the nonce and the commitment
 * the run's own check agreed on, never under a later read, so a setup another
 * device committed meanwhile never makes the old path read as current. The
 * wipe releases and caches only a stored write of this same intent.
 */
import type {
  PreparedBatch,
  PreparedCall,
  SetupConfirmation
} from '@web/modules/social-recovery/sdk-interfaces'
import { accountBatchTransactionOf } from '@web/modules/social-recovery/shared/client'
import {
  assertWriteDoor,
  checkGas,
  intentOfRequest,
  requestIdOf,
  walletAccountRefOf
} from '@web/modules/social-recovery/shared/writes'
import { callsOf, saveStepsOf } from '@web/modules/social-recovery/setup/arm'
import type { PreparedSave, SaveSteps } from '@web/modules/social-recovery/setup/arm'

import { attemptOpenOf, goalStands } from './readings'
import type { OverviewStepsInput } from './types'

export const overviewStepsOf = (input: OverviewStepsInput): SaveSteps => {
  const { intent, client, facts, key } = input
  const save = saveStepsOf({ ...input, setup: input.records.setup(input.chainId, input.account) })
  const inFlight = input.records.saveInFlight(input.chainId, input.account)
  // The confirmation the run's check agreed on, which the wipe stamps the cache with.
  let agreed: SetupConfirmation | undefined

  const refuseWhileAttemptOpen = async (): Promise<void> => {
    const [state, attempt] = await Promise.all([
      client.setup.setupState(),
      client.walletReads.attemptState()
    ])
    if (attemptOpenOf(state, attempt)) {
      input.onAttemptOpen()
      throw new Error('This wallet does not re-authorize while a recovery is in progress.')
    }
  }

  const prepareRemoval = async (): Promise<PreparedSave> => {
    const prepared: PreparedCall | PreparedBatch =
      intent === 'clear'
        ? await client.setup.prepareClearSetup()
        : await client.setup.prepareRemoveAuthorization()
    assertWriteDoor('ownerWrite', prepared)
    return { draft: input.draft, prepared, calls: callsOf(prepared) }
  }

  const removalConfirmation = async (): Promise<SetupConfirmation> => {
    const state = await client.setup.setupState()
    const ended = goalStands(intent, state)
    return {
      landed: ended,
      isAuthorized: ended,
      nonce: state.setupNonce,
      setupCommitment: state.setupCommitment
    }
  }

  return {
    ...save,
    hasSetup: async () => goalStands(intent, await client.setup.setupState()),
    newRequestId: () => requestIdOf(intent),
    async prepare(): Promise<PreparedSave> {
      if (intent !== 'reauthorize') {
        return prepareRemoval()
      }
      // A run that follows a stored write needs no draft; a new one commits only the path it read.
      if (input.draft.clauses.length === 0) {
        throw new Error('The re-authorize has no path to commit again.')
      }
      if (input.draft.privacy.backup === 'encrypted' && input.password === undefined) {
        throw new Error('The re-authorize seals the setup again and needs the recovery password.')
      }
      await refuseWhileAttemptOpen()
      return save.prepare()
    },
    checkGas:
      intent === 'reauthorize'
        ? async (prepared) => {
            await refuseWhileAttemptOpen()
            return save.checkGas(prepared)
          }
        : ({ prepared, calls }) =>
            checkGas({
              write: 'ownerWrite',
              prepared,
              key,
              reads: input.reads,
              network: facts.network,
              transaction: accountBatchTransactionOf(facts, key, calls),
              operates: walletAccountRefOf(facts)
            }),
    // An attempt may open while the claim waits: a won claim releases and refuses on one.
    claim:
      intent === 'reauthorize'
        ? async (prepared, requestId, startBlock) => {
            const claim = await save.claim(prepared, requestId, startBlock)
            if (claim.claimed) {
              try {
                await refuseWhileAttemptOpen()
              } catch (error: unknown) {
                await save.release(requestId).catch(() => undefined)
                throw error
              }
            }
            return claim
          }
        : save.claim,
    confirm:
      intent === 'reauthorize'
        ? async (prepared) => {
            const confirmation = await save.confirm(prepared)
            agreed = confirmation
            return confirmation
          }
        : removalConfirmation,
    async wipe(): Promise<void> {
      const read = await inFlight.read()
      const held =
        read.status === 'present' && intentOfRequest(read.value.requestId) === intent
          ? read.value
          : undefined
      if (held) {
        await inFlight.release(held.requestId)
      }
      const cache = input.records.decryptedSetupCache(input.chainId, input.account)
      if (intent === 'clear') {
        await cache.wipe()
        return
      }
      // The cache takes the path the landed write committed, the stored write's own;
      // a run with no path of its own leaves the cache as it stands.
      const committed = held ? held.draft : input.draft
      if (intent === 'reauthorize' && agreed && committed.clauses.length > 0) {
        await cache.write({
          configuration: {
            clauses: committed.clauses,
            wait: committed.wait,
            ignoresPause: committed.ignoresPause
          },
          setupNonce: agreed.nonce,
          setupCommitment: agreed.setupCommitment
        })
      }
    }
  }
}
