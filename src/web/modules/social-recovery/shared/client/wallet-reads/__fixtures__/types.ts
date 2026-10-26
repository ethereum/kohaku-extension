import type {
  Address,
  ApproverRequest,
  ClientConfiguration,
  Hex,
  RawLog,
  Reply
} from '@kohaku-eth/social-recovery'
import type { PrivilegeAccount } from '@web/modules/social-recovery/shared/client/types'
import type { worldOf } from '@web/modules/social-recovery/shared/client/wallet-reads/__fixtures__/world'

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

/**
 * One answer of a method module's `verify` view and what the ceremony's check
 * reads for it: the case's name, the node's answer or the error the call
 * rejects with, and the check's answer.
 */
export type ReplyCheckCase = [string, () => Hex | Error, 'reverted' | 'rejected']

/** What each method module's `verify` view answers, the node's answer or the error the call rejects with; unscripted where absent. */
export interface VerifyAnswers {
  ecdsa?: () => Hex | Error
  passkey?: () => Hex | Error
}

/** A reply that does not answer the request: the case's name, and the request and reply it builds. */
export type MismatchedReplyCase = [string, () => [ApproverRequest, Reply]]

/** How a test scripts the account; each member has a default. */
export type AccountReadsWorld = {
  addr?: string
  code?: Hex
  initialPrivileges?: [string, string][]
  associatedKeys?: string[]
  creation?: PrivilegeAccount['creation']
  accountImplementation?: Address
  supportsAccount?: boolean
}

/** A case's name and the logs the chain holds for a key. */
export type LogsCase = [string, (key: Address) => RawLog[]]

/** A case's name and the key, or none. */
export type KeyCase = [string, Address | null]

/** A case's name and the number. */
export type NumberCase = [string, number]

/** A case's name and the error. */
export type ErrorCase = [string, Error]

/** A case's name and how the world fails a read. */
export type WorldFailureCase = [string, (world: ReturnType<typeof worldOf>) => void]
