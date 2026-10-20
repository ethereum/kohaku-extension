/**
 * The wallet's own reads: the reads the wallet needs that no SDK member makes.
 * They are not SDK members, so this interface is the extension's own, scripted
 * here so every screen that needs them builds against one shape. `shared/client`
 * wraps it; no screen imports it.
 *
 * - `verifyReply`: the verify per pasted reply, the claim run through the
 *   credential's module, the static call the manager runs at submission, so a
 *   reply reads as verified before any gas is spent.
 * - `removedKey`: the key a recovery would remove, or the reason it cannot name
 *   one, since the setup save is blocked on that reason. An account with no
 *   creation record is read from its deployed privilege table, so an account
 *   the wallet does not list still names its key.
 * - `fitCheck`: the fit check against the code the account will carry, so a
 *   fresh account with no code yet is judged by the implementation it deploys.
 *
 * Beside them, `attemptState` reads the manager's state alone, the recovery
 * state without the removed key, for a surface that never shows that key, and
 * `commitmentOf` computes the commitment of a configuration at a nonce in the
 * stand-in chain's own encoding, which reads no chain.
 *
 * Every read throws when it could not be made, and never answers empty.
 */
import type {
  Address,
  ApproverReply,
  ApproverRequest,
  Configuration,
  Hex,
  RecoveryState,
  RemovedKey,
  Verdict
} from '@web/modules/social-recovery/sdk-interfaces'

import type { ScriptedChain } from './chain'
import { DEFAULT_BLOCK_TAGS } from './context'
import {
  digestOfRequest,
  doubleProof,
  sameAddress,
  setupBodyOf,
  setupCommitmentOf
} from './encoding'
import { replyReadable, requestReadable } from './orchestrator'
import type {
  FitCheckReading,
  IWalletReadsDouble,
  RemovedKeyReading,
  WalletReadsConfiguration
} from './types'

/**
 * Why the removed key cannot be named: no source names a key, the keys the
 * sources name hold none, or more than one key holds authority. The last is
 * the wallet's own rule, stricter than the SDK, which names one of them.
 */
export const REMOVED_KEY_UNAVAILABLE_CAUSES = [
  'no-source',
  'not-a-key',
  'several-key-entries'
] as const

/**
 * The reading as the SDK's removed-key value. Several keys holding authority
 * leave no one key named, which the SDK's values read as no source.
 */
export const removedKeyOfReading = (reading: RemovedKeyReading): RemovedKey => {
  if (reading.kind === 'named') {
    return reading.key
  }
  return reading.cause === 'several-key-entries' ? 'no-source' : reading.cause
}

export class WalletReadsDouble implements IWalletReadsDouble {
  constructor(
    private readonly chain: ScriptedChain,
    private readonly config: WalletReadsConfiguration = {}
  ) {}

  /**
   * A malformed paste never throws: a reply or request that fails the record
   * shape checks `addApproverReply` and the orchestrator use (`replyReadable`,
   * `requestReadable`: every field present with its type, the digest and the
   * proof among them), or whose values make no digest, answers `rejected`. Only
   * a read scripted to fail throws.
   */
  async verifyReply(request: ApproverRequest, reply: ApproverReply): Promise<Verdict> {
    this.chain.guard('walletReads.verifyReply')
    if (this.chain.verdict) {
      return this.chain.verdict
    }
    if (!replyReadable(reply) || !requestReadable(request)) {
      return 'rejected'
    }
    if (
      reply.place !== request.place ||
      !sameAddress(reply.method, request.method) ||
      reply.config.toLowerCase() !== request.config.toLowerCase()
    ) {
      return 'rejected'
    }
    try {
      const expected = doubleProof(request.config, digestOfRequest(request))
      return reply.proof.toLowerCase() === expected.toLowerCase() ? 'satisfied' : 'rejected'
    } catch {
      return 'rejected'
    }
  }

  async removedKey(): Promise<RemovedKeyReading> {
    this.chain.guard('walletReads.removedKey')
    return this.chain.removedKeyReading(!!this.config.creation)
  }

  /**
   * The manager's state at the pinned block, as the recovery state reads it,
   * without the removed key. Only a block read or a state read scripted to
   * fail throws.
   */
  async attemptState(): Promise<Omit<RecoveryState, 'removedKey'>> {
    this.chain.guard('provider.block')
    const block = this.chain.blockAt(DEFAULT_BLOCK_TAGS.read)
    this.chain.guard('manager.stateOf')
    const state = this.chain.stateOf()
    return {
      attempt: state.attempt,
      nextAttemptId: state.nextAttemptId,
      setupCommitment: state.setupCommitment,
      setupNonce: state.setupNonce,
      block
    }
  }

  commitmentOf(nonce: bigint, configuration: Configuration): Hex {
    const { account, action } = this.chain
    return setupCommitmentOf(account, action, nonce, setupBodyOf(account, configuration))
  }

  async fitCheck(accountImplementation?: Address): Promise<FitCheckReading> {
    this.chain.guard('walletReads.fitCheck')
    if (this.chain.hasCode) {
      return { basis: 'deployed-code', fits: this.chain.supportsAccount }
    }
    const implementation = accountImplementation ?? this.config.accountImplementation
    if (!implementation) {
      return { basis: 'no-code', fits: false }
    }
    return {
      basis: 'code-to-be',
      implementation,
      fits: sameAddress(implementation, this.chain.descriptor.servedImplementation)
    }
  }
}
