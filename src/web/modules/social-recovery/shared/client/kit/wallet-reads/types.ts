import type {
  Address,
  ClientConfiguration,
  IProvider
} from '@web/modules/social-recovery/sdk-interfaces'

import type { CodeRead, PrivilegeAccount, WalletReads } from '../../types'
import type { ActionReads, MethodReads } from '../reads/types'

/** What the wallet's two account reads take. */
export interface KitWalletReadsInput {
  /** The account with the keys the wallet knows for it: its creation privileges and its associated keys. */
  account: PrivilegeAccount
  /** Further keys the wallet holds for the account, asked about beside the account's own. */
  knownKeys?: readonly Address[]
  /** The implementation the account will deploy, where the caller names none. */
  accountImplementation?: Address
  action: Pick<ActionReads, 'isAuthority' | 'supportsAccount' | 'ambireImplementation'>
  /** The method modules' `verify` view a pasted reply is judged through. */
  moduleReads: ReplyVerifyReads
  codeRead: CodeRead
  /** The provider the privilege writes and the `privileges` view of an account with no creation record are read through. */
  provider: IProvider
  /** The block tags the reads of an account with no creation record pin at. */
  blockTags?: ClientConfiguration['blockTags']
}

/** The one module view the verify of a pasted reply reads. */
export type ReplyVerifyReads = Pick<MethodReads, 'verify'>

/** The wallet's own reads the kit serves: the removed key, the fit check and the verify of a pasted reply. */
export type KitWalletReads = Pick<WalletReads, 'removedKey' | 'fitCheck' | 'verifyReply'>
