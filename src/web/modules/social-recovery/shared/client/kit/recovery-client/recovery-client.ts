/**
 * The recovery client of a deployed kit, over the chain's reads: the two
 * gathering inits, the four record operations over the gathering and the
 * recovery-side state. The prepares and the events feed are not served yet
 * and refuse.
 *
 * Each init pins one block and makes its reads at it, restores the committed
 * configuration through the setup client, and checks once that the digest the
 * approvers will sign, derived here, is the digest the deployed manager
 * derives for the same request: a difference refuses the init, so no
 * approver is ever asked to sign a digest the manager would not accept.
 */
import {
  ActionCodecDouble,
  addReplyTo,
  approverRequestsOf,
  assessGathering,
  codedError,
  completeGathering,
  DEFAULT_REQUEST_WINDOW,
  digestOfSubmission,
  evaluatorOf,
  RECORD_VERSION,
  refuseWith,
  restoreRefusal,
  unansweredRead
} from '@web/modules/social-recovery/sdk-doubles'
import { deserializeOrder, serializeOrder } from '@web/modules/social-recovery/sdk-doubles/encoding'
import type { RequestRow } from '@web/modules/social-recovery/sdk-doubles/types'
import type {
  ActionState,
  Address,
  AttemptRequest,
  BlockHeader,
  CancelRequest,
  Configuration,
  ConfigurationSource,
  Gathering,
  GatheringPlace,
  GatheringPurpose,
  GatheringWindow,
  Handover,
  HandoverInput,
  Hex,
  IRecoveryClient,
  PaymentOrder,
  RecoveryState
} from '@web/modules/social-recovery/sdk-interfaces'
import { zeroAddress } from 'viem'

import { sameAddress } from '../../addresses'
import { placedCredentialsOf, readSetupBody, setupBodyOf, setupCommitmentOf } from '../formats'
import { notServedEvents, notServedRefusal, pinnedBlockOf, withNamedRevert } from '../setup-client'
import type { GatheringRequestFields, KitRecoveryContext } from './types'

/** The rule evaluation over the kit's ABI-encoded setup body. */
const evaluate = evaluatorOf(readSetupBody)

export const createKitRecoveryClient = (ctx: KitRecoveryContext): IRecoveryClient => {
  const { account, descriptor, config, provider, manager, action, moduleReads } = ctx
  const actionAddress = descriptor.action
  const pin = () => pinnedBlockOf(provider, config)

  /**
   * The configuration the setup client restores, checked against the setup
   * the init's own block holds. The restore pins a later block, so a setup
   * write landing between the two reads would join this init's nonce to the
   * next setup's body, and the manager would refuse every approval gathered
   * for it; the init refuses instead.
   */
  const restoredAt = async (
    source: ConfigurationSource,
    state: ActionState
  ): Promise<Configuration> => {
    const configuration = await ctx.setup.getSetup(source)
    const recomputed = setupCommitmentOf(
      account,
      actionAddress,
      state.setupNonce,
      setupBodyOf(account, configuration)
    )
    if (recomputed.toLowerCase() !== state.setupCommitment.toLowerCase()) {
      throw restoreRefusal('restore.commitment-mismatch', {
        committed: state.setupCommitment,
        recomputed
      })
    }
    return configuration
  }
  const floor = config.requestWindow?.floor ?? DEFAULT_REQUEST_WINDOW.floor

  const placeMap = (configuration: Configuration): Promise<GatheringPlace[]> =>
    Promise.all(
      placedCredentialsOf(account, configuration).map(async ({ place, credential, salt }) => {
        const [paused, parties] = await Promise.all([
          moduleReads.paused(credential.method),
          moduleReads.trustedParties(credential.method)
        ])
        // An unanswered read says nothing about the method's stop, so the init
        // refuses rather than record a default nobody read.
        if (!paused.answered) {
          throw unansweredRead('manager.paused', credential.method, place)
        }
        if (!parties.answered) {
          throw unansweredRead('manager.trustedParties', credential.method, place)
        }
        const entry: GatheringPlace = {
          place,
          method: credential.method,
          config: credential.config,
          salt,
          standing: paused.value ? 'stopped' : 'not-stopped',
          stoppable: !sameAddress(parties.value.pauseHolder, zeroAddress)
        }
        if (credential.label) {
          entry.label = credential.label
        }
        return entry
      })
    )

  const requestBlock = (block: BlockHeader) => ({
    chainId: String(descriptor.chainId),
    manager: descriptor.manager,
    // The digest version this build carries, from the descriptor the build was
    // checked against; never read from the chain live.
    digestVersion: descriptor.digestVersion,
    account,
    action: actionAddress,
    block: { number: block.number, timestamp: String(block.timestamp), hash: block.hash }
  })

  /** The handover rows over two authorities (zero keys, one address twice, the reads). */
  const handoverRows = async (handover: Handover, block: BlockHeader): Promise<RequestRow[]> => {
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

  /** The digest at place 0 of a gathering's request, derived here and by the manager, compared. */
  const crossCheck = async (gathering: Gathering): Promise<void> => {
    const r = gathering.request
    const domain = {
      chainId: BigInt(r.chainId),
      manager: r.manager,
      digestVersion: r.digestVersion
    }
    const common = {
      account: r.account,
      action: r.action,
      attemptId: BigInt(r.attemptId),
      setupNonce: BigInt(r.setupNonce),
      setupBody: r.setupBody,
      validUntil: Number(r.validUntil),
      proofs: []
    }
    let derived: Hex
    let answered: Hex
    if (gathering.purpose === 'approval') {
      const request: AttemptRequest = {
        ...common,
        payload: r.payload ?? '0x',
        order: r.order
          ? deserializeOrder(r.order)
          : { token: zeroAddress, amount: 0n, payee: zeroAddress }
      }
      derived = digestOfSubmission(request, 'approval', domain, 0)
      answered = await manager.hashApproval(request, 0n)
    } else {
      const request: CancelRequest = common
      derived = digestOfSubmission(request, 'cancellation', domain, 0)
      answered = await manager.hashCancel(request, 0n)
    }
    if (derived.toLowerCase() !== answered.toLowerCase()) {
      throw codedError('digest.mismatch', {
        purpose: gathering.purpose,
        derived,
        manager: answered
      })
    }
  }

  const checked = async (gathering: Gathering): Promise<Gathering> => {
    await crossCheck(gathering)
    return gathering
  }

  const gatheringOf = async (
    purpose: GatheringPurpose,
    block: BlockHeader,
    configuration: Configuration,
    request: GatheringRequestFields
  ): Promise<Gathering> =>
    checked({
      kind: 'gathering',
      version: RECORD_VERSION,
      purpose,
      request: {
        ...requestBlock(block),
        setupBody: setupBodyOf(account, configuration),
        ...request
      },
      places: await placeMap(configuration),
      replies: []
    })

  return {
    events: notServedEvents('recovery'),

    initRecoveryGathering(
      source: ConfigurationSource,
      handover: HandoverInput,
      order: PaymentOrder,
      window: GatheringWindow
    ): Promise<Gathering> {
      return withNamedRevert(async () => {
        const block = await pin()
        const state = await manager.stateOf(account, actionAddress, block.number)
        if (state.attempt.state === 'Waiting') {
          refuseWith([
            'request.attempt-active',
            {
              attemptId: state.attempt.attemptId,
              consumableAfter: state.attempt.consumableAfter,
              ownGathering: false
            }
          ])
        }
        const configuration = await restoredAt(source, state)

        let { removedAuthority } = handover
        if (!removedAuthority) {
          const reading = await ctx.walletReads.removedKey()
          if (reading.kind === 'unavailable') {
            refuseWith([
              'handover.removed-unknown',
              { account, creationTriple: !!config.creation, cause: reading.cause }
            ])
          } else {
            removedAuthority = reading.key
          }
        }
        const performed: Handover = {
          newAuthority: handover.newAuthority,
          removedAuthority: removedAuthority as Address
        }
        const rows = await handoverRows(performed, block)
        if (rows.length) {
          refuseWith(...rows)
        }

        return gatheringOf('approval', block, configuration, {
          attemptId: state.nextAttemptId.toString(),
          setupNonce: state.setupNonce.toString(),
          payload: new ActionCodecDouble([actionAddress]).encode(performed),
          order: serializeOrder(order),
          validUntil: String(block.timestamp + window.window)
        })
      })
    },

    initCancelGathering(source: ConfigurationSource, window: GatheringWindow): Promise<Gathering> {
      return withNamedRevert(async () => {
        const block = await pin()
        const state = await manager.stateOf(account, actionAddress, block.number)
        if (state.attempt.state !== 'Waiting') {
          refuseWith([
            'request.no-active-attempt',
            { action: actionAddress, state: state.attempt.state }
          ])
        }
        const configuration = await restoredAt(source, state)
        return gatheringOf('cancellation', block, configuration, {
          attemptId: state.attempt.attemptId.toString(),
          setupNonce: state.setupNonce.toString(),
          validUntil: String(block.timestamp + window.window),
          consumableAfter: String(state.attempt.consumableAfter)
        })
      })
    },

    getApproverRequests: approverRequestsOf,

    addApproverReply: addReplyTo,

    assess(gathering, now) {
      return assessGathering(gathering, now, { floor, evaluate })
    },

    complete(gathering, selection, now) {
      return completeGathering(gathering, selection, now, evaluate)
    },

    prepareStartAttempt: () => Promise.reject(notServedRefusal('recovery.prepareStartAttempt')),
    prepareCancelByProofs: () => Promise.reject(notServedRefusal('recovery.prepareCancelByProofs')),
    prepareCancelByOwner: () => Promise.reject(notServedRefusal('recovery.prepareCancelByOwner')),
    prepareCancelByVeto: () => Promise.reject(notServedRefusal('recovery.prepareCancelByVeto')),
    prepareExecuteHandover: () =>
      Promise.reject(notServedRefusal('recovery.prepareExecuteHandover')),

    recoveryState(): Promise<RecoveryState> {
      return withNamedRevert(async () => {
        const block = await pin()
        const [state, removed] = await Promise.all([
          manager.stateOf(account, actionAddress, block.number),
          ctx.walletReads.removedKey()
        ])
        return {
          attempt: state.attempt,
          nextAttemptId: state.nextAttemptId,
          setupCommitment: state.setupCommitment,
          setupNonce: state.setupNonce,
          // `RecoveryState.removedKey` has no value for a replay that names no key or
          // several, so both read as 'no-creation-triple'; the wallet reads'
          // `removedKey()` names the cause.
          removedKey: removed.kind === 'named' ? removed.key : 'no-creation-triple',
          block
        }
      })
    }
  }
}
