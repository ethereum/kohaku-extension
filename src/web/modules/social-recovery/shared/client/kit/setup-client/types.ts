import type { Account } from '@ambire-common/interfaces/account'
import type {
  Address,
  ClientConfiguration,
  DeploymentDescriptor,
  Hex,
  IMethodModuleReads,
  IProvider,
  ReadResult,
  TrustedParties,
  ModuleInfo
} from '@web/modules/social-recovery/sdk-interfaces'

import type { CodeRead, WalletReads } from '../../types'
import type { SetupEvents } from '../events'
import type { ActionReads, ManagerReads } from '../reads'

/** What the deployed kit's setup client reads through, all bound to one account's deployment. */
export interface KitSetupContext {
  account: Address
  descriptor: DeploymentDescriptor
  config: ClientConfiguration
  provider: IProvider
  codeRead: CodeRead
  manager: Pick<ManagerReads, 'stateOf'>
  action: Pick<ActionReads, 'isAuthorized' | 'isAuthority' | 'supportsAccount' | 'actionInfo'>
  moduleReads: IMethodModuleReads
  events: Pick<SetupEvents, 'setupLogsOf' | 'commitOf'>
  walletReads: Pick<WalletReads, 'removedKey'>
  /** The privileges the account's creation grants, the keys of an account with no code yet. */
  initialPrivileges: Account['initialPrivileges']
}

/** The three module reads of one method a setup judges. */
export interface MethodStandingReads {
  method: Address
  moduleInfo: ReadResult<ModuleInfo>
  parties: ReadResult<TrustedParties>
  paused: ReadResult<boolean>
}

/** The `commitSetup` call a prepared save carries, decoded. */
export interface StoredCommitCall {
  setupCommitment: Hex
  nonce: bigint
}
