import type {
  Address,
  ClientConfiguration,
  DeploymentDescriptor,
  IEventManager,
  IProvider
} from '@web/modules/social-recovery/sdk-interfaces'

import type {
  CodeRead,
  PrivilegeAccount,
  RemovedKeyReading,
  TransactionRead,
  WalletReads
} from '../../types'
import type { ActionReads, ManagerReads, MethodReads } from '../reads/types'

/** What the wallet's two account reads take. */
export interface KitWalletReadsInput {
  /** The account with the keys the wallet knows for it: its creation privileges and its associated keys. */
  account: PrivilegeAccount
  /** Further keys the wallet holds for the account, asked about beside the account's own. */
  knownKeys?: readonly Address[]
  /** The implementation the account will deploy, where the caller names none. */
  accountImplementation?: Address
  action: Pick<ActionReads, 'isAuthority' | 'supportsAccount' | 'ambireImplementation'>
  /** The manager's state view the attempt state is read through. */
  manager: Pick<ManagerReads, 'stateOf'>
  /** The method modules' `verify` view a pasted reply is judged through. */
  moduleReads: ReplyVerifyReads
  codeRead: CodeRead
  /** The provider the privilege writes and the `privileges` view of a deployed account are read through. */
  provider: IProvider
  /** The block tags the removed-key reads pin at. */
  blockTags?: ClientConfiguration['blockTags']
  /** The widest block range one privilege log query asks for. */
  logChunkWidth?: ClientConfiguration['logChunkWidth']
  /** The deployment whose manager and action name the account's keys, and the block its scans start at. */
  descriptor: Pick<DeploymentDescriptor, 'manager' | 'action' | 'deployedAt'>
  /** The account's events feed, for its latest setup commit and its attempts at the action. */
  events: Pick<IEventManager, 'accountFilter' | 'fetch'>
  /** The sender of the transaction that carried a setup commit. */
  transactionRead: TransactionRead
}

/** What the attempt state is read through: the manager's state view for one account and one action. */
export interface AttemptStateReadInput {
  provider: IProvider
  /** The block tags the read pins at. */
  blockTags?: ClientConfiguration['blockTags']
  manager: Pick<ManagerReads, 'stateOf'>
  account: Address
  action: Address
}

/** The one module view the verify of a pasted reply reads. */
export type ReplyVerifyReads = Pick<MethodReads, 'verify'>

/**
 * The removed key as the kit reads it. Where the node refused the code reads
 * at blocks older than the pinned one, the privilege writes were scanned from
 * the manager's deployment block, which `privilegeScanBoundedAt` names; a
 * key written before it and never written again is then unseen, so such a
 * scan that finds no key fails with the node's refusal instead of answering.
 */
export type KitRemovedKeyReading = RemovedKeyReading & { privilegeScanBoundedAt?: number }

/**
 * The block the privilege writes are read from. A node that refused older
 * reads bounds it at the manager's deployment block, and the refusal is kept
 * so that a bounded scan that finds no key fails with it.
 */
export type PrivilegeScanStart =
  | { from: number; bounded: false }
  | { from: number; bounded: true; refusal: unknown }

/**
 * The wallet's own reads the kit serves: the removed key, the attempt state,
 * the fit check and the verify of a pasted reply.
 */
export interface KitWalletReads
  extends Pick<WalletReads, 'attemptState' | 'fitCheck' | 'verifyReply'> {
  removedKey(): Promise<KitRemovedKeyReading>
}
