/**
 * The action part double: `IRecoveryActionInteractor` and `IRecoveryActionArming`
 * over the scripted chain, bound to its account. The arming seam goes to the
 * setup client alone; the builder double hands the part out through
 * `narrowActionInteractor`, which carries no `armingCall`.
 */
import type {
  ActionInfo,
  Address,
  IRecoveryActionArming,
  IRecoveryActionInteractor,
  PreparedCall
} from '@web/modules/social-recovery/sdk-interfaces'
import { zeroHash } from 'viem'

import type { ScriptedChain } from './chain'
import { hashOf } from './encoding'
import { composeCall } from './prepared'

export class RecoveryActionDouble implements IRecoveryActionInteractor, IRecoveryActionArming {
  constructor(private readonly chain: ScriptedChain) {}

  /**
   * The contract's `supportsAccount(account)`: an address with no code is a no,
   * the same answer as an implementation the action does not serve.
   */
  async supportsAccount(): Promise<boolean> {
    this.chain.guard('action.supportsAccount')
    return this.chain.hasCode && this.chain.supportsAccount
  }

  async isAuthority(key: Address): Promise<boolean> {
    this.chain.guard('action.isAuthority')
    return this.chain.isAuthority(key)
  }

  async isAuthorized(): Promise<boolean> {
    this.chain.guard('action.isAuthorized')
    return this.chain.authorized
  }

  async holdsAnyPrivilege(candidate: Address): Promise<boolean> {
    this.chain.guard('action.holdsAnyPrivilege')
    return this.chain.holdsAnyPrivilege(candidate)
  }

  async actionInfo(): Promise<ActionInfo> {
    this.chain.guard('action.actionInfo')
    return { ...this.chain.actionInfo }
  }

  /** `setAddrPrivilege(KIT_SLOT, 0)` on the account, sent by the account. */
  async disarmingCall(): Promise<PreparedCall> {
    this.chain.guardRefusal('action.disarmingCall')
    return composeCall(this.chain, {
      name: 'setAddrPrivilege',
      args: [this.chain.kitSlot, zeroHash],
      target: this.chain.account,
      sender: 'account',
      block: this.chain.head,
      effect: { kind: 'disarm' }
    })
  }

  /** `setAddrPrivilege(KIT_SLOT, binding)` on the account, sent by the account. */
  async armingCall(): Promise<PreparedCall> {
    this.chain.guardRefusal('action.armingCall')
    return composeCall(this.chain, {
      name: 'setAddrPrivilege',
      args: [this.chain.kitSlot, hashOf({ binding: this.chain.action.toLowerCase() })],
      target: this.chain.account,
      sender: 'account',
      block: this.chain.head,
      effect: { kind: 'arm' }
    })
  }
}

/** Members of `IRecoveryActionInteractor`, the only ones `narrowActionInteractor` hands out. */
export const ACTION_INTERACTOR_MEMBERS = [
  'supportsAccount',
  'isAuthority',
  'isAuthorized',
  'holdsAnyPrivilege',
  'actionInfo',
  'disarmingCall'
] as const

/**
 * The action part seen through `IRecoveryActionInteractor` alone: a fresh object
 * with the six members, so `armingCall` is absent at runtime as well as in the
 * type: the arming call reaches the setup client alone.
 */
export const narrowActionInteractor = (
  part: IRecoveryActionInteractor
): IRecoveryActionInteractor => ({
  supportsAccount: () => part.supportsAccount(),
  isAuthority: (key) => part.isAuthority(key),
  isAuthorized: () => part.isAuthorized(),
  holdsAnyPrivilege: (candidate) => part.holdsAnyPrivilege(candidate),
  actionInfo: () => part.actionInfo(),
  disarmingCall: () => part.disarmingCall()
})
