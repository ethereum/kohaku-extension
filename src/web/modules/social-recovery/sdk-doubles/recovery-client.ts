/**
 * The `IRecoveryClient` double: the two gathering inits over the restore, the
 * four record operations as pure arithmetic over the gathering (requests, filing
 * with its five refusals, assessment, completion), the five prepares with
 * request validation and simulation, and the recovery-side state record.
 *
 * Validation refuses at the prepare, a stopped method among its rows
 * (`request.method-stopped`); the simulation then runs the chain's own path
 * (`verification.ts`): `ProofRejected(place, method)` for a proof that is not
 * `doubleProof(config, digest)`, `MethodStopped` for a stop that landed after
 * the reads validation made, the execute's account reverts for a dormant setup
 * or an account the action does not fit, unless a script fails it outright.
 */
import type {
  AddResult,
  Address,
  ApproverReply,
  ApproverRequest,
  Assessment,
  Attempt,
  AttemptRequest,
  BlockHeader,
  CancelRequest,
  Configuration,
  ConfigurationSource,
  DescribedCall,
  Finding,
  Gathering,
  GatheringPlace,
  GatheringPurpose,
  GatheringWindow,
  Handover,
  HandoverInput,
  Hex,
  IEventManager,
  IRecoveryClient,
  KitError,
  PaymentOrder,
  PreparedCall,
  PrepareOptions,
  RecoveryState
} from '@web/modules/social-recovery/sdk-interfaces'
import { zeroAddress } from 'viem'

import { codecFor, DEFAULT_REQUEST_WINDOW, pinBlock, restoreConfiguration } from './context'
import {
  placesOf,
  readSetupBody,
  sameAddress,
  serializeOrder,
  setupBodyOf,
  setupCommitmentOf
} from './encoding'
import {
  addReplyTo,
  approverRequestsOf,
  assessGathering,
  completeGathering,
  refuseWith,
  rowsToFindings
} from './gathering'
import { RECORD_VERSION } from './orchestrator'
import { composeCall, shouldSimulate, simulationFrom, withSimulation } from './prepared'
import { codedError, unansweredRead, validationRefusal } from './scripts'
import type { ClientContext, RequestRow, SimulatedMember } from './types'
import { acceptanceRevert, evaluateRule, executeRevert } from './verification'

export { MOMENT_SKEW_SPAN } from './gathering'

export class RecoveryClientDouble implements IRecoveryClient {
  readonly events: IEventManager

  constructor(private readonly ctx: ClientContext) {
    this.events = ctx.events
  }

  // -------------------------------------------------------------------------
  // The two inits
  // -------------------------------------------------------------------------

  private async placeMap(configuration: Configuration): Promise<GatheringPlace[]> {
    const { chain, manager } = this.ctx
    const placed = placesOf(chain.account, configuration)
    return Promise.all(
      placed.map(async ({ place, credential, salt }) => {
        const [paused, parties] = await Promise.all([
          manager.paused(credential.method),
          manager.trustedParties(credential.method)
        ])
        // An unanswered read says nothing about the method's stop, so the init
        // refuses rather than record a default nobody read. An undeclared
        // module does answer, with empty values, and is not refused.
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
  }

  private requestBlock(block: BlockHeader) {
    const { chain, actionAddress } = this.ctx
    return {
      chainId: String(chain.descriptor.chainId),
      manager: chain.descriptor.manager,
      // The digest version this build carries, from the descriptor the build was
      // checked against; never read from the chain live.
      digestVersion: chain.descriptor.digestVersion,
      account: chain.account,
      action: actionAddress,
      block: { number: block.number, timestamp: String(block.timestamp), hash: block.hash }
    }
  }

  /** The handover rows over two authorities (zero keys, one address twice, the reads). */
  private async handoverRows(handover: Handover): Promise<RequestRow[]> {
    const { action } = this.ctx
    const { newAuthority, removedAuthority } = handover
    if (sameAddress(newAuthority, zeroAddress) || sameAddress(removedAuthority, zeroAddress)) {
      return [['handover.malformed', { newAuthority, removedAuthority, cause: 'zero-key' }]]
    }
    if (sameAddress(newAuthority, removedAuthority)) {
      return [['handover.same-authority', { newAuthority, removedAuthority }]]
    }
    const rows: RequestRow[] = []
    const [isAuthority, holds] = await Promise.all([
      action.isAuthority(removedAuthority),
      action.holdsAnyPrivilege(newAuthority)
    ])
    if (!isAuthority) {
      rows.push(['handover.removed-not-authority', { removedAuthority, isAuthority }])
    }
    if (holds) {
      rows.push(['handover.new-holds-privilege', { newAuthority, holdsAnyPrivilege: holds }])
    }
    return rows
  }

  async initRecoveryGathering(
    source: ConfigurationSource,
    handover: HandoverInput,
    order: PaymentOrder,
    window: GatheringWindow
  ): Promise<Gathering> {
    const { chain, manager, config, actionAddress } = this.ctx
    chain.guardRefusal('recovery.initRecoveryGathering')
    const block = await pinBlock(this.ctx)
    const state = await manager.stateOf()
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
    const configuration = await restoreConfiguration(this.ctx, source, block)

    let removedAuthority = handover.removedAuthority
    if (!removedAuthority) {
      const reading = chain.removedKeyReading(!!config.creation)
      if (reading.kind === 'unavailable') {
        refuseWith([
          'handover.removed-unknown',
          { account: chain.account, creationTriple: !!config.creation, cause: reading.cause }
        ])
      } else {
        removedAuthority = reading.key
      }
    }
    const performed: Handover = {
      newAuthority: handover.newAuthority,
      removedAuthority: removedAuthority as Address
    }
    const rows = await this.handoverRows(performed)
    if (rows.length) {
      refuseWith(...rows)
    }

    const codec = codecFor(this.ctx, actionAddress)
    if (!codec) {
      throw codedError('action.no-codec', { action: actionAddress })
    }
    const payload = codec.encode(performed)

    return {
      kind: 'gathering',
      version: RECORD_VERSION,
      purpose: 'approval',
      request: {
        ...this.requestBlock(block),
        attemptId: state.nextAttemptId.toString(),
        setupNonce: state.setupNonce.toString(),
        setupBody: setupBodyOf(chain.account, configuration),
        payload,
        order: serializeOrder(order),
        validUntil: String(block.timestamp + window.window)
      },
      places: await this.placeMap(configuration),
      replies: []
    }
  }

  async initCancelGathering(
    source: ConfigurationSource,
    window: GatheringWindow
  ): Promise<Gathering> {
    const { chain, manager, actionAddress } = this.ctx
    chain.guardRefusal('recovery.initCancelGathering')
    const block = await pinBlock(this.ctx)
    const state = await manager.stateOf()
    if (state.attempt.state !== 'Waiting') {
      refuseWith([
        'request.no-active-attempt',
        { action: actionAddress, state: state.attempt.state }
      ])
    }
    const configuration = await restoreConfiguration(this.ctx, source, block)
    return {
      kind: 'gathering',
      version: RECORD_VERSION,
      purpose: 'cancellation',
      request: {
        ...this.requestBlock(block),
        attemptId: state.attempt.attemptId.toString(),
        setupNonce: state.setupNonce.toString(),
        setupBody: setupBodyOf(chain.account, configuration),
        validUntil: String(block.timestamp + window.window),
        consumableAfter: String(state.attempt.consumableAfter)
      },
      places: await this.placeMap(configuration),
      replies: []
    }
  }

  // -------------------------------------------------------------------------
  // The four record operations
  // -------------------------------------------------------------------------

  getApproverRequests(gathering: Gathering): ApproverRequest[] {
    return approverRequestsOf(gathering)
  }

  addApproverReply(gathering: Gathering, reply: ApproverReply): AddResult {
    if (this.ctx.chain.addRefusal) {
      return { gathering, reason: { kind: 'add-refusal', cause: this.ctx.chain.addRefusal } }
    }
    return addReplyTo(gathering, reply)
  }

  assess(gathering: Gathering, now: number): Assessment {
    const floor = this.ctx.config.requestWindow?.floor ?? DEFAULT_REQUEST_WINDOW.floor
    return assessGathering(gathering, now, { floor, evaluate: evaluateRule })
  }

  complete(
    gathering: Gathering,
    selection: number[] | undefined,
    now: number
  ): AttemptRequest | CancelRequest {
    this.ctx.chain.guardRefusal('recovery.complete')
    return completeGathering(gathering, selection, now, evaluateRule)
  }

  // -------------------------------------------------------------------------
  // Request validation and the prepares
  // -------------------------------------------------------------------------

  /**
   * The request validation the two submission prepares run: the stored
   * attempt and setup, the window, the order of places, the rule over the proof
   * array, each named method's stop, and on an opening request the handover.
   * Returns the errors; the prepare refuses while any stands.
   */
  private async validateRequest(
    request: AttemptRequest | CancelRequest,
    purpose: GatheringPurpose,
    now: number
  ): Promise<Finding[]> {
    const { chain, manager } = this.ctx
    const isApproval = purpose === 'approval'
    const state = await manager.stateOf()
    const rows: RequestRow[] = []
    if (now > request.validUntil) {
      rows.push(['request.expired', { validUntil: request.validUntil, now }])
    }
    if (isApproval) {
      if (state.attempt.state === 'Waiting') {
        rows.push([
          'request.attempt-active',
          {
            attemptId: state.attempt.attemptId,
            consumableAfter: state.attempt.consumableAfter,
            ownGathering: state.attempt.attemptId === request.attemptId
          }
        ])
      } else if (request.attemptId !== state.nextAttemptId) {
        rows.push([
          'request.attempt-id',
          { attemptId: request.attemptId, expected: state.nextAttemptId }
        ])
      }
    } else if (state.attempt.state !== 'Waiting') {
      rows.push([
        'request.no-active-attempt',
        { action: request.action, state: state.attempt.state }
      ])
    } else {
      if (request.attemptId !== state.attempt.attemptId) {
        rows.push([
          'request.attempt-id',
          { attemptId: request.attemptId, expected: state.attempt.attemptId }
        ])
      }
      if (state.attempt.setupNonce !== state.setupNonce) {
        rows.push([
          'request.stale-attempt',
          { judgedUnder: state.attempt.setupNonce, currentNonce: state.setupNonce }
        ])
      }
    }
    const recomputed = setupCommitmentOf(
      chain.account,
      request.action,
      request.setupNonce,
      request.setupBody
    )
    if (request.setupNonce !== state.setupNonce || recomputed !== state.setupCommitment) {
      rows.push(['request.body-mismatch', { recomputed, committed: state.setupCommitment }])
    }
    for (let i = 1; i < request.proofs.length; i++) {
      if (request.proofs[i].place <= request.proofs[i - 1].place) {
        rows.push(['proof.places-unordered', { place: request.proofs[i].place }])
        break
      }
    }
    const rule = evaluateRule(
      request.setupBody,
      request.proofs.map((p) => Number(p.place))
    )
    if (!rule.satisfied) {
      const failing = rule.clauses.find((c) => c.clause === rule.failingClause)
      rows.push([
        'request.rule-unsatisfied',
        { clause: rule.failingClause, filled: failing?.filled, threshold: failing?.threshold }
      ])
    }
    let ignoresPause = false
    try {
      ignoresPause = readSetupBody(request.setupBody).ignoresPause
    } catch {
      ignoresPause = false
    }
    if (!ignoresPause) {
      const stops = await Promise.all(request.proofs.map((p) => manager.paused(p.method)))
      request.proofs.forEach((p, i) => {
        const stop = stops[i]
        // As at the inits: an unanswered stop read refuses, never reads as not stopped.
        if (!stop.answered) {
          throw unansweredRead('manager.paused', p.method, Number(p.place))
        }
        if (stop.value) {
          rows.push(['request.method-stopped', { place: p.place, method: p.method, ignoresPause }])
        }
      })
    }
    if (isApproval) {
      const codec = codecFor(this.ctx, request.action)
      let handover: Handover | undefined
      try {
        handover = codec?.decode((request as AttemptRequest).payload) as Handover | undefined
      } catch {
        handover = undefined
      }
      if (!handover) {
        rows.push([
          'handover.malformed',
          { payload: (request as AttemptRequest).payload, cause: 'undecodable' }
        ])
      } else {
        rows.push(...(await this.handoverRows(handover)))
      }
    }
    return [...rowsToFindings(rows), ...chain.appendedFindings('recovery.validateRequest').errors]
  }

  private finish(
    call: PreparedCall,
    member: SimulatedMember,
    block: BlockHeader,
    options: PrepareOptions | undefined,
    computed: KitError | undefined
  ): PreparedCall {
    const { chain, config } = this.ctx
    const pinned = { ...call, block: { number: block.number, hash: block.hash } }
    if (!shouldSimulate(options, config.simulate)) {
      return pinned
    }
    const error = chain.simulationFailure(member) ?? computed
    return withSimulation(pinned, simulationFrom(chain, call.sender, options), error)
  }

  async prepareStartAttempt(
    request: AttemptRequest,
    now: number,
    options?: PrepareOptions
  ): Promise<PreparedCall> {
    this.ctx.chain.guardRefusal('recovery.prepareStartAttempt')
    const block = await pinBlock(this.ctx)
    const errors = await this.validateRequest(request, 'approval', now)
    if (errors.length) {
      throw validationRefusal({ errors, warnings: [] })
    }
    const call = await this.ctx.manager.prepareStartAttempt(request)
    return this.finish(
      call,
      'recovery.prepareStartAttempt',
      block,
      options,
      acceptanceRevert(this.ctx.chain, request, 'approval')
    )
  }

  async prepareCancelByProofs(
    request: CancelRequest,
    now: number,
    options?: PrepareOptions
  ): Promise<PreparedCall> {
    this.ctx.chain.guardRefusal('recovery.prepareCancelByProofs')
    const block = await pinBlock(this.ctx)
    const errors = await this.validateRequest(request, 'cancellation', now)
    if (errors.length) {
      throw validationRefusal({ errors, warnings: [] })
    }
    const call = await this.ctx.manager.prepareCancelByProofs(request)
    return this.finish(
      call,
      'recovery.prepareCancelByProofs',
      block,
      options,
      acceptanceRevert(this.ctx.chain, request, 'cancellation')
    )
  }

  async prepareCancelByOwner(): Promise<PreparedCall> {
    const { chain, manager, actionAddress } = this.ctx
    chain.guardRefusal('recovery.prepareCancelByOwner')
    const block = await pinBlock(this.ctx)
    const call = await manager.prepareCancelByOwner(actionAddress)
    return this.finish(
      call,
      'recovery.prepareCancelByOwner',
      block,
      undefined,
      chain.revertOf({ kind: 'cancel-by-owner' })
    )
  }

  async prepareCancelByVeto(method: Address, options?: PrepareOptions): Promise<PreparedCall> {
    const { chain, manager, actionAddress } = this.ctx
    chain.guardRefusal('recovery.prepareCancelByVeto')
    const block = await pinBlock(this.ctx)
    const state = await manager.stateOf()
    if (state.attempt.state !== 'Waiting') {
      refuseWith([
        'request.no-active-attempt',
        { action: actionAddress, state: state.attempt.state }
      ])
    }
    const call = await manager.prepareCancelByVeto(
      chain.account,
      actionAddress,
      state.attempt.attemptId,
      method
    )
    return this.finish(
      call,
      'recovery.prepareCancelByVeto',
      block,
      options,
      chain.revertOf({ kind: 'cancel-by-veto', attemptId: state.attempt.attemptId, method })
    )
  }

  async prepareExecuteHandover(
    attempt: Attempt,
    payload: Hex,
    options?: PrepareOptions
  ): Promise<PreparedCall> {
    const { chain, actionAddress } = this.ctx
    chain.guardRefusal('recovery.prepareExecuteHandover')
    const block = await pinBlock(this.ctx)
    const codec = codecFor(this.ctx, actionAddress)
    let handover: Handover | undefined
    try {
      handover = codec?.decode(payload) as Handover | undefined
    } catch {
      handover = undefined
    }
    const describe = (name: string, args: unknown, to: Address): DescribedCall => ({
      to,
      value: 0n,
      data: composeCall(chain, { name, args, target: to, sender: 'anyone', block }).data
    })
    // The batch the action will run, for a screen and never for signing: the
    // consume, the grant and the revoke the payload decodes to, and the payment
    // where the order carries an amount. An undecodable payload describes no
    // grant and no revoke, and its simulation names `MalformedHandover`.
    const describes: DescribedCall[] = [
      describe('consume', [attempt.attemptId], chain.descriptor.manager)
    ]
    if (handover) {
      describes.push(describe('setAddrPrivilege', [handover.newAuthority, 'key'], chain.account))
      describes.push(
        describe('setAddrPrivilege', [handover.removedAuthority, 'none'], chain.account)
      )
    }
    if (attempt.order.amount > 0n) {
      // An open payee pays whoever executes. `PreparedCall` has no field for a
      // warning, so the `payment.open-payee` warning is not carried.
      const payee = sameAddress(attempt.order.payee, zeroAddress)
        ? simulationFrom(chain, 'anyone', options)
        : attempt.order.payee
      describes.push(describe('transfer', [payee, attempt.order.amount], attempt.order.token))
    }
    const call = composeCall(chain, {
      name: 'executeHandover',
      args: [chain.account, payload],
      target: actionAddress,
      sender: 'anyone',
      block,
      effect: { kind: 'execute', attemptId: attempt.attemptId, payload },
      describes
    })
    return this.finish(
      call,
      'recovery.prepareExecuteHandover',
      block,
      options,
      executeRevert(chain, attempt.attemptId, payload)
    )
  }

  // -------------------------------------------------------------------------
  // The recovery-side state record
  // -------------------------------------------------------------------------

  async recoveryState(): Promise<RecoveryState> {
    const { chain, manager, config } = this.ctx
    chain.guard('recovery.recoveryState')
    const block = await pinBlock(this.ctx)
    const state = await manager.stateOf()
    const removed = chain.removedKeyReading(!!config.creation)
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
  }
}
