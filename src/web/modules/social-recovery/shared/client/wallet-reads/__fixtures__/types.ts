import type { Address, ClientConfiguration, Hex, RawLog } from '@kohaku-eth/social-recovery'
import type { PrivilegeAccount } from '@web/modules/social-recovery/shared/client/types'

/** An account scripted on the provider, deployed unless its code is empty, with no creation record unless one is given. */
export interface AccountWorldOptions {
  /** The account record's address as the wallet stores it; the world's account by default. */
  addr?: string
  /** The account's code; deployed code by default. */
  code?: Hex
  /** The first block at which the account has code; the manager's deployment block by default. */
  createdAt?: number
  /** The block the manager was deployed at; the harness's by default. */
  deployedAt?: number
  logs?: RawLog[]
  /** The sender each transaction hash names, or the error its read rejects with. */
  senders?: [Hex, Address | Error][]
  /** The keys the account's `privileges` view answers a value for. */
  holders?: Address[]
  /** The keys the action's `isAuthority` answers true for. */
  authorities?: Address[]
  associatedKeys?: string[]
  /** The privileges the account's creation record grants. */
  initialPrivileges?: PrivilegeAccount['initialPrivileges']
  /** The wallet's creation record of the account; none by default. */
  creation?: PrivilegeAccount['creation']
  knownKeys?: Address[]
  blockTags?: ClientConfiguration['blockTags']
  /** The implementation the account will deploy, where the caller names none. */
  accountImplementation?: Address
  /** The action's `supportsAccount` answer; true by default. */
  supportsAccount?: boolean
}
