import type { Address, Hex } from '@web/modules/social-recovery/sdk-interfaces'

/** What the deployed manager's domain and the deployed action's constants answer, each a value or an error. */
export interface ScriptedDeployment {
  chainId?: number
  domain?: Partial<ScriptedDomain> | Error
  manager?: Address | Error
  implementation?: Address | Error
  kitSlot?: Address | Error
  binding?: Hex | Error
  /** Whether the manager and the action hold code; both do by default. */
  managerCode?: boolean
  actionCode?: boolean
}

/** The manager's `eip712Domain()` answer. */
export interface ScriptedDomain {
  fields: Hex
  name: string
  version: string
  chainId: bigint
  verifyingContract: Address
}
