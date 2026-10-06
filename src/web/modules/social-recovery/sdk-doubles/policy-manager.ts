/**
 * The `IPolicyManagerInteractor` double: the manager's views and its six
 * prepares over the scripted chain, and the three module views it carries for
 * the methods. Its prepares take the contract's own argument lists, encode and
 * return a call with no simulation; the client doubles validate and simulate
 * around them. The builder double never hands this part out whole (see
 * `narrowModuleReads`).
 */
import type {
  ActionState,
  Address,
  AttemptRequest,
  CancelRequest,
  Domain,
  Hex,
  IMethodModuleReads,
  IPolicyManagerInteractor,
  ModuleInfo,
  PreparedCall,
  ReadResult,
  TrustedParties
} from '@web/modules/social-recovery/sdk-interfaces'
import { zeroAddress } from 'viem'

import type { ScriptedChain } from './chain'
import { digestOfSubmission } from './encoding'
import { composeCall } from './prepared'

export class PolicyManagerDouble implements IPolicyManagerInteractor {
  constructor(private readonly chain: ScriptedChain) {}

  private get manager(): Address {
    return this.chain.descriptor.manager
  }

  // ---- the three module views ----

  async moduleInfo(module: Address): Promise<ReadResult<ModuleInfo>> {
    if (this.chain.unanswered('manager.moduleInfo', module)) {
      return { answered: false }
    }
    const declaration = this.chain.method(module)
    // A module with no declaration is an address whose views revert: an answer, not a failure.
    if (!declaration) {
      return { answered: true, value: { name: '', version: '', supportsInterface: false } }
    }
    return { answered: true, value: { ...declaration.moduleInfo } }
  }

  async paused(module: Address): Promise<ReadResult<boolean>> {
    if (this.chain.unanswered('manager.paused', module)) {
      return { answered: false }
    }
    // Two-valued: only an exact true is stopped; anything else is not stopped.
    return { answered: true, value: this.chain.method(module)?.paused === true }
  }

  async trustedParties(module: Address): Promise<ReadResult<TrustedParties>> {
    if (this.chain.unanswered('manager.trustedParties', module)) {
      return { answered: false }
    }
    const declaration = this.chain.method(module)
    // Like `moduleInfo`: a module with no declaration reverts, which is the
    // contract answering, so the read is answered with empty values and
    // `validateSetup` raises `method.no-declaration`. Only a provider that
    // failed answers `{ answered: false }`.
    if (!declaration) {
      return {
        answered: true,
        value: {
          admin: zeroAddress,
          pendingAdmin: zeroAddress,
          trustedKeys: [],
          pauseHolder: zeroAddress,
          pendingPauseHolder: zeroAddress
        }
      }
    }
    const p = declaration.trustedParties
    return { answered: true, value: { ...p, trustedKeys: [...p.trustedKeys] } }
  }

  // ---- the manager's own views ----

  async stateOf(): Promise<ActionState> {
    this.chain.guard('manager.stateOf')
    return this.chain.stateOf()
  }

  private domainFacts() {
    return {
      chainId: this.chain.manager.domain.chainId,
      manager: this.manager,
      digestVersion: this.chain.manager.domain.version
    }
  }

  /** The place's digest over the request's members; no proof at that place is needed. */
  async hashApproval(request: AttemptRequest, place: bigint): Promise<Hex> {
    this.chain.guard('manager.hashApproval')
    return digestOfSubmission(request, 'approval', this.domainFacts(), place)
  }

  async hashCancel(request: CancelRequest, place: bigint): Promise<Hex> {
    this.chain.guard('manager.hashCancel')
    return digestOfSubmission(request, 'cancellation', this.domainFacts(), place)
  }

  async eip712Domain(): Promise<Domain> {
    this.chain.guard('manager.eip712Domain')
    const d = this.chain.manager.domain
    return { ...d, extensions: [...d.extensions] }
  }

  async name(): Promise<string> {
    this.chain.guard('manager.name')
    return this.chain.manager.name
  }

  async version(): Promise<string> {
    this.chain.guard('manager.version')
    return this.chain.manager.version
  }

  async supportsInterface(): Promise<boolean> {
    this.chain.guard('manager.supportsInterface')
    return this.chain.manager.supportsInterface
  }

  // ---- the six prepares ----

  async prepareCommitSetup(
    action: Address,
    setupCommitment: Hex,
    nonce: bigint,
    publicMetadata: Hex,
    privateMetadata: Hex
  ): Promise<PreparedCall> {
    this.chain.guardRefusal('manager.prepareCommitSetup')
    return composeCall(this.chain, {
      name: 'commitSetup',
      args: [action, setupCommitment, nonce, publicMetadata, privateMetadata],
      target: this.manager,
      sender: 'account',
      block: this.chain.head,
      effect: { kind: 'commit', setupCommitment, nonce, publicMetadata, privateMetadata }
    })
  }

  async prepareClearSetup(action: Address): Promise<PreparedCall> {
    this.chain.guardRefusal('manager.prepareClearSetup')
    return composeCall(this.chain, {
      name: 'clearSetup',
      args: [action],
      target: this.manager,
      sender: 'account',
      block: this.chain.head,
      effect: { kind: 'clear' }
    })
  }

  async prepareStartAttempt(request: AttemptRequest): Promise<PreparedCall> {
    this.chain.guardRefusal('manager.prepareStartAttempt')
    return composeCall(this.chain, {
      name: 'startAttempt',
      args: [request],
      target: this.manager,
      sender: 'anyone',
      block: this.chain.head,
      effect: { kind: 'start', request }
    })
  }

  async prepareCancelByProofs(request: CancelRequest): Promise<PreparedCall> {
    this.chain.guardRefusal('manager.prepareCancelByProofs')
    return composeCall(this.chain, {
      name: 'cancelByProofs',
      args: [request],
      target: this.manager,
      sender: 'anyone',
      block: this.chain.head,
      effect: { kind: 'cancel-by-proofs', request }
    })
  }

  async prepareCancelByOwner(action: Address): Promise<PreparedCall> {
    this.chain.guardRefusal('manager.prepareCancelByOwner')
    return composeCall(this.chain, {
      name: 'cancelByOwner',
      args: [action],
      target: this.manager,
      sender: 'account',
      block: this.chain.head,
      effect: { kind: 'cancel-by-owner' }
    })
  }

  async prepareCancelByVeto(
    account: Address,
    action: Address,
    attemptId: bigint,
    method: Address
  ): Promise<PreparedCall> {
    this.chain.guardRefusal('manager.prepareCancelByVeto')
    return composeCall(this.chain, {
      name: 'cancelByVeto',
      args: [account, action, attemptId, method],
      target: this.manager,
      sender: 'anyone',
      block: this.chain.head,
      effect: { kind: 'cancel-by-veto', attemptId, method }
    })
  }
}

/** Members of `IMethodModuleReads`, the only ones `narrowModuleReads` hands out. */
export const MODULE_READ_MEMBERS = ['moduleInfo', 'paused', 'trustedParties'] as const

/**
 * The manager part seen through the module-read seam: a fresh object holding
 * the three views alone, so no prepare and no manager view reaches its holder
 * even at runtime.
 */
export const narrowModuleReads = (part: IMethodModuleReads): IMethodModuleReads => ({
  moduleInfo: (module) => part.moduleInfo(module),
  paused: (module) => part.paused(module),
  trustedParties: (module) => part.trustedParties(module)
})
