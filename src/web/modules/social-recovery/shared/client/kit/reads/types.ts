import type {
  ActionInfo,
  ActionState,
  Address,
  BlockTag,
  Domain,
  Hex,
  IProvider,
  ModuleInfo,
  TrustedParties
} from '@web/modules/social-recovery/sdk-interfaces'

import type { CodeRead } from '../../types'

/** The chain the action's reads go through: the provider adapter and the code read beside it. */
export interface ActionReadsChain {
  provider: IProvider
  codeRead: CodeRead
}

/**
 * The manager's views. A revert rejects with a `RevertedCall` carrying its
 * data; a read the provider could not make, or an answer that does not decode,
 * rejects with a `ProviderReadFailure`.
 */
export interface ManagerReads {
  /** The manager's record for an account and an action; every address has one. */
  stateOf(account: Address, action: Address, block?: BlockTag): Promise<ActionState>
  eip712Domain(): Promise<Domain>
  name(): Promise<string>
  version(): Promise<string>
  supportsInterface(interfaceId: Hex): Promise<boolean>
}

/**
 * The action's views, failing as the manager's do. The three reads the action
 * refuses for an address with no code read the code first and answer false
 * for such an account, with no call.
 */
export interface ActionReads {
  manager(): Promise<Address>
  ambireImplementation(): Promise<Address>
  kitSlot(): Promise<Address>
  binding(): Promise<Hex>
  keyValue(): Promise<Hex>
  isAuthorized(account: Address, block?: BlockTag): Promise<boolean>
  isAuthority(account: Address, key: Address, block?: BlockTag): Promise<boolean>
  holdsAnyPrivilege(account: Address, candidate: Address, block?: BlockTag): Promise<boolean>
  supportsAccount(account: Address, block?: BlockTag): Promise<boolean>
  name(): Promise<string>
  version(): Promise<string>
  supportsInterface(interfaceId: Hex): Promise<boolean>
  /** The name, the version and the policy-action interface probe. */
  actionInfo(): Promise<ActionInfo>
}

/** One method module's views, failing as the manager's do, except `paused`. */
export interface MethodReads {
  name(module: Address): Promise<string>
  version(module: Address): Promise<string>
  supportsInterface(module: Address, interfaceId: Hex): Promise<boolean>
  /** The name, the version and the method interface probe. */
  moduleInfo(module: Address): Promise<ModuleInfo>
  trustedParties(module: Address): Promise<TrustedParties>
  /** The module's answer over one proof: the magic value where it accepts it. */
  verify(module: Address, config: Hex, digest: Hex, proof: Hex): Promise<Hex>
  /**
   * Whether the module is stopped, read as the manager reads it: only a
   * 32-byte answer equal to 1 is true; a revert, an empty answer or any other
   * word is false. A read the provider could not make still rejects.
   */
  paused(module: Address): Promise<boolean>
}
