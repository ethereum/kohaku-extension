/**
 * The recovery client of a deployed kit, over the chain's reads: the two
 * gathering inits, the four record operations over the gathering and the
 * recovery-side state, and the five prepares. The events feed is not served
 * yet and refuses.
 *
 * Each init pins one block and makes its reads at it, restores the committed
 * configuration through the setup client, and checks once that the digest the
 * approvers will sign, derived here, is the digest the deployed manager
 * derives for the same request: a difference refuses the init, so no
 * approver is ever asked to sign a digest the manager would not accept.
 *
 * Each prepare pins one block, makes its reads at it and carries it. The start
 * and the cancellation by proofs refuse while the request validation names an
 * error. No prepare runs a simulation, so `simulate` is not read: a revert
 * surfaces at the gas estimate the sending step makes before any send. The
 * execute prepare reads `from` only to name the executor an open payee pays.
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
  RECORD_VERSION,
  refuseWith,
  restoreRefusal,
  unansweredRead,
  validationRefusal
} from '@web/modules/social-recovery/sdk-doubles'
import { deserializeOrder, serializeOrder } from '@web/modules/social-recovery/sdk-doubles/encoding'
import { ARBITRARY_SENDER } from '@web/modules/social-recovery/sdk-doubles/prepared'
import type {
  ActionState,
  Address,
  Attempt,
  AttemptRequest,
  BlockHeader,
  CancelRequest,
  Configuration,
  ConfigurationSource,
  DescribedCall,
  Gathering,
  GatheringPlace,
  GatheringPurpose,
  GatheringWindow,
  Handover,
  HandoverInput,
  Hex,
  IRecoveryClient,
  PaymentOrder,
  PrepareOptions,
  PreparedCall,
  RecoveryState
} from '@web/modules/social-recovery/sdk-interfaces'
import { keccak256, zeroAddress, zeroHash } from 'viem'

import { sameAddress } from '../../addresses'
import {
  cancelByOwnerData,
  cancelByProofsData,
  cancelByVetoData,
  consumeData,
  executeHandoverData,
  placedCredentialsOf,
  privilegeData,
  setupBodyOf,
  setupCommitmentOf,
  startAttemptData,
  transferData
} from '../formats'
import { accountCallOf, notServedEvents, pinnedBlockOf, withNamedRevert } from '../setup-client'
import { decodedHandoverOf, handoverRowsOf } from './handover'
import type { GatheringRequestFields, KitRecoveryContext } from './types'
import { evaluateBody, requestFindingsOf } from './validation'

/** One call anyone may send to `target`, carrying no value, pinned at `block`. */
const anyoneCallOf = (target: Address, data: Hex, block: BlockHeader): PreparedCall => ({
  kind: 'call',
  target,
  value: 0n,
  data,
  sender: 'anyone',
  block: { number: block.number, hash: block.hash }
})

const describedCall = (to: Address, data: Hex): DescribedCall => ({ to, value: 0n, data })

export const createKitRecoveryClient = (ctx: KitRecoveryContext): IRecoveryClient => {
  const { account, descriptor, config, provider, manager, moduleReads } = ctx
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
        const rows = await handoverRowsOf(ctx, performed, block)
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
      return assessGathering(gathering, now, { floor, evaluate: evaluateBody })
    },

    complete(gathering, selection, now) {
      return completeGathering(gathering, selection, now, evaluateBody)
    },

    prepareStartAttempt(request: AttemptRequest, now: number): Promise<PreparedCall> {
      return withNamedRevert(async () => {
        const block = await pin()
        const errors = await requestFindingsOf(ctx, request, 'approval', now, block)
        if (errors.length) {
          throw validationRefusal({ errors, warnings: [] })
        }
        return anyoneCallOf(descriptor.manager, startAttemptData(request), block)
      })
    },

    prepareCancelByProofs(request: CancelRequest, now: number): Promise<PreparedCall> {
      return withNamedRevert(async () => {
        const block = await pin()
        const errors = await requestFindingsOf(ctx, request, 'cancellation', now, block)
        if (errors.length) {
          throw validationRefusal({ errors, warnings: [] })
        }
        return anyoneCallOf(descriptor.manager, cancelByProofsData(request), block)
      })
    },

    prepareCancelByOwner(): Promise<PreparedCall> {
      return withNamedRevert(async () =>
        accountCallOf(descriptor.manager, cancelByOwnerData(actionAddress), await pin())
      )
    },

    prepareCancelByVeto(method: Address): Promise<PreparedCall> {
      return withNamedRevert(async () => {
        const block = await pin()
        const state = await manager.stateOf(account, actionAddress, block.number)
        if (state.attempt.state !== 'Waiting') {
          refuseWith([
            'request.no-active-attempt',
            { action: actionAddress, state: state.attempt.state }
          ])
        }
        return anyoneCallOf(
          descriptor.manager,
          cancelByVetoData(account, actionAddress, state.attempt.attemptId, method),
          block
        )
      })
    },

    prepareExecuteHandover(
      attempt: Attempt,
      payload: Hex,
      options?: PrepareOptions
    ): Promise<PreparedCall> {
      return withNamedRevert(async () => {
        const block = await pin()
        // The calls the action will run, for a screen and never for signing:
        // the consume, the grant and the revoke the payload decodes to, and the
        // payment where the order carries an amount. An undecodable payload
        // describes no grant and no revoke; the chain refuses it at the estimate.
        const describes: DescribedCall[] = [
          describedCall(
            descriptor.manager,
            consumeData(actionAddress, attempt.attemptId, keccak256(payload))
          )
        ]
        const handover = decodedHandoverOf(actionAddress, payload)
        if (handover) {
          const keyValue = await ctx.action.keyValue()
          describes.push(
            describedCall(account, privilegeData(handover.newAuthority, keyValue)),
            describedCall(account, privilegeData(handover.removedAuthority, zeroHash))
          )
        }
        if (attempt.order.amount > 0n) {
          // An open payee is described as paid to the executor: the sender the
          // call simulates as, the given `from` or else the arbitrary sender.
          // The zero token is the native coin, sent as value with no data.
          const { token, amount } = attempt.order
          const payee = sameAddress(attempt.order.payee, zeroAddress)
            ? options?.from ?? ARBITRARY_SENDER
            : attempt.order.payee
          describes.push(
            sameAddress(token, zeroAddress)
              ? { to: payee, value: amount, data: '0x' }
              : describedCall(token, transferData(payee, amount))
          )
        }
        return {
          ...anyoneCallOf(actionAddress, executeHandoverData(account, payload), block),
          describes
        }
      })
    },

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
