import type {
  Address,
  ClientConfiguration,
  DeploymentDescriptor,
  IProvider
} from '@web/modules/social-recovery/sdk-interfaces'

import type {
  AddressBook,
  CodeRead,
  DeploymentFacts,
  PrivilegeAccount,
  RecoveryChain
} from '../../types'
import type { ActionReads, ManagerReads } from '../reads'

/** What the action's construction check reads and judges against. */
export interface ActionConstantsInput {
  action: Pick<ActionReads, 'manager' | 'ambireImplementation' | 'kitSlot' | 'binding'>
  codeRead: CodeRead
  descriptor: Pick<DeploymentDescriptor, 'manager' | 'action' | 'servedImplementation'>
}

/** What a deployed kit's client is built from, once its construction checks passed. */
export interface KitClientInput {
  chain: RecoveryChain
  account: Address
  descriptor: DeploymentDescriptor
  /** The deployment's facts, which tell the identity methods it serves. */
  facts: DeploymentFacts
  /** The address book the method slugs are read from. */
  addressBook: AddressBook
  config: ClientConfiguration
  provider: IProvider
  codeRead: CodeRead
  manager: ManagerReads
  action: ActionReads
  /** The account with the keys the wallet knows for it. */
  privilegeAccount: PrivilegeAccount
}
