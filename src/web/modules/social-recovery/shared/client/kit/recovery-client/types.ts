import type {
  Address,
  ClientConfiguration,
  DeploymentDescriptor,
  Gathering,
  IEventManager,
  IMethodModuleReads,
  IProvider,
  ISetupClient
} from '@web/modules/social-recovery/sdk-interfaces'

import type { WalletReads } from '../../types'
import type { ActionReads, ManagerReads } from '../reads'

/** What the deployed kit's recovery client reads through, all bound to one account's deployment. */
export interface KitRecoveryContext {
  account: Address
  descriptor: DeploymentDescriptor
  config: ClientConfiguration
  provider: IProvider
  manager: Pick<ManagerReads, 'stateOf' | 'hashApproval' | 'hashCancel'>
  action: Pick<ActionReads, 'isAuthority' | 'holdsAnyPrivilege' | 'keyValue'>
  moduleReads: IMethodModuleReads
  /** The restore of the committed configuration the gatherings are built over. */
  setup: Pick<ISetupClient, 'getSetup'>
  /** The removed key, and the attempt state the recovery state is built on. */
  walletReads: Pick<WalletReads, 'removedKey' | 'attemptState'>
  /** The events feed the client serves as its own. */
  eventManager: IEventManager
}

/** The members of a gathering's request that differ between an approval and a cancellation. */
export type GatheringRequestFields = Pick<
  Gathering['request'],
  'attemptId' | 'setupNonce' | 'validUntil' | 'payload' | 'order' | 'consumableAfter'
>
