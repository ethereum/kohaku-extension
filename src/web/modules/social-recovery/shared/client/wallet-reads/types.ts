import type {
  Address,
  BlockTags,
  DeploymentDescriptor,
  IActionCodec,
  IEventManager,
  IPolicyManagerInteractor,
  IProvider,
  IRecoveryActionInteractor,
  KitNotification
} from '@kohaku-eth/social-recovery'

import type { ActionViews } from '../deployment-checks/types'
import type { PrivilegeAccount, RemovedKeyReading, WalletReads } from '../types'

/** What the wallet's own reads take, every SDK part bound to the account and the descriptor's action. */
export interface WalletReadsInput {
  /** The account with the keys the wallet knows for it: its creation privileges and its associated keys. */
  account: PrivilegeAccount
  /** Further keys the wallet holds for the account, asked about beside the account's own. */
  knownKeys?: readonly Address[]
  /** The implementation the account will deploy, where the caller names none. */
  accountImplementation?: Address
  provider: IProvider
  descriptor: DeploymentDescriptor
  /** The tag the reads pin at. */
  blockTags: BlockTags
  /** The widest block range one log query asks for. */
  logChunkSize: number
  policyManager: Pick<IPolicyManagerInteractor, 'stateOf'>
  action: Pick<IRecoveryActionInteractor, 'isAuthority' | 'supportsAccount'>
  actionViews: Pick<ActionViews, 'ambireImplementation'>
  events: Pick<IEventManager, 'accountFilter' | 'privilegeFilter' | 'decodeLog'>
  /** The action's payload layout, through which a consumed handover's new key is read. */
  codec: IActionCodec
}

/** What the attempt state is read through: the manager part bound to the account and the action. */
export interface AttemptStateReadInput {
  provider: IProvider
  blockTags: BlockTags
  policyManager: Pick<IPolicyManagerInteractor, 'stateOf'>
}

/** What the verify of a pasted reply reads through: the provider the module's `verify` view is called on. */
export type ReplyVerifyProvider = Pick<IProvider, 'call'>

/**
 * The removed key as the wallet reads it. Where the node refused the code
 * reads at blocks older than the pinned one, the privilege writes were
 * scanned from the manager's deployment block, which `privilegeScanBoundedAt`
 * names; a key written before it and never written again is then unseen, so
 * such a scan that finds no key fails with the node's refusal instead of
 * answering.
 */
export type BoundedRemovedKeyReading = RemovedKeyReading & { privilegeScanBoundedAt?: number }

/** The wallet's own reads, with the bound of a removed-key scan the node's history limited. */
export interface BoundedWalletReads extends Omit<WalletReads, 'removedKey'> {
  removedKey(): Promise<BoundedRemovedKeyReading>
}

/** A setup commit as the event manager decodes it. */
export type SetupCommittedLog = Extract<KitNotification, { kind: 'setup-committed' }>

/**
 * The block the privilege writes are read from. A node that refused older
 * reads bounds it at the manager's deployment block, and the refusal is kept
 * so that a bounded scan that finds no key fails with it.
 */
export type PrivilegeScanStart =
  | { from: number; bounded: false }
  | { from: number; bounded: true; refusal: unknown }
