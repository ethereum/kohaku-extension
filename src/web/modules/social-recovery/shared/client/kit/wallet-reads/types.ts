import type { Address } from '@web/modules/social-recovery/sdk-interfaces'

import type { CodeRead, PrivilegeAccount, WalletReads } from '../../types'
import type { ActionReads } from '../reads/types'

/** What the wallet's two account reads take. */
export interface KitWalletReadsInput {
  /** The account with the keys the wallet knows for it: its creation privileges and its associated keys. */
  account: PrivilegeAccount
  /** Further keys the wallet holds for the account, asked about beside the account's own. */
  knownKeys?: readonly Address[]
  /** The implementation the account will deploy, where the caller names none. */
  accountImplementation?: Address
  action: Pick<ActionReads, 'isAuthority' | 'supportsAccount' | 'ambireImplementation'>
  codeRead: CodeRead
}

/** The two account reads the kit serves of the wallet's own reads. */
export type KitWalletReads = Pick<WalletReads, 'removedKey' | 'fitCheck'>
