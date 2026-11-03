import type {
  Address,
  BlockTag,
  DeploymentDescriptor,
  Hex,
  IProvider
} from '@kohaku-eth/social-recovery'

/** The recovery action's views the SDK does not read, at a block tag (`latest` by default). */
export interface ActionViews {
  manager(block?: BlockTag): Promise<Address>
  ambireImplementation(block?: BlockTag): Promise<Address>
  kitSlot(block?: BlockTag): Promise<Address>
  binding(block?: BlockTag): Promise<Hex>
  /** The privilege value a handover grants the new key. */
  keyValue(block?: BlockTag): Promise<Hex>
  /** Whether the action serves the account, any account. */
  supportsAccount(account: Address, block?: BlockTag): Promise<boolean>
}

/** What the action's construction check reads and judges against. */
export interface ActionConstantsInput {
  action: Pick<ActionViews, 'manager' | 'ambireImplementation' | 'kitSlot' | 'binding'>
  provider: Pick<IProvider, 'code'>
  descriptor: Pick<DeploymentDescriptor, 'manager' | 'action' | 'servedImplementation'>
}
