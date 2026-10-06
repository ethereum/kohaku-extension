import type {
  Address,
  BlockHeader,
  BlockTag,
  ClientConfiguration,
  DeploymentDescriptor,
  Hex,
  IProvider,
  ISetupClient,
  PrivacyLevel,
  RawLog,
  SetupDraft
} from '@web/modules/social-recovery/sdk-interfaces'
import type { RemovedKeyReading } from '@web/modules/social-recovery/shared/client/types'

/** One `eth_call` the fake node answered: where, what and at which block. */
export interface NodeCall {
  to: Address
  data: Hex
  block: BlockTag
}

/**
 * A node a test scripts by hand: each call answers the bytes scripted for its
 * address and data, an address with no code answers no bytes, and the logs
 * are filtered by address, topics and range as a node filters them.
 */
export interface FakeNode {
  provider: IProvider & {
    chainId: jest.Mock
    call: jest.Mock
    logs: jest.Mock
    block: jest.Mock
  }
  codeRead: { code: jest.Mock<Promise<Hex>, [Address, BlockTag?]> }
  head: BlockHeader
  answer(to: Address, data: Hex, answer: Hex | Error): void
  setCode(address: Address, code: Hex): void
  addLog(log: RawLog): void
  /** Every call answered or refused, in order. */
  calls: NodeCall[]
}

/** The setup state the fake manager answers for the world's account and action. */
export interface ScriptedState {
  setupCommitment: Hex
  setupNonce: bigint
  setupCommittedAtBlock: number
  /** The attempt's state, as the enum's index. */
  attemptState?: number
}

/** What one fake method module answers. */
export interface ScriptedMethod {
  name?: string
  version?: string
  probe?: boolean
  /** The raw `paused()` answer, or the error the call throws. */
  paused?: Hex | Error
  /** An error every view of the module throws, `paused()` aside. */
  views?: Error
}

/** What the fake action answers for the world's account. */
export interface ScriptedAction {
  /** The action's address; the world's action by default. */
  at?: Address
  supportsAccount?: boolean | Error
  authorized?: boolean
  /** The keys the action answers `isAuthority` true for; every other key answers false. */
  authorities?: Address[]
  probe?: boolean
}

/** A setup commit as its log carries it. */
export interface CommittedFields {
  action?: Address
  nonce: bigint
  setupCommitment: Hex
  publicMetadata?: Hex
  privateMetadata?: Hex
}

export interface KitWorldOptions {
  /** The account's code; none by default, the account of a fresh setup. */
  accountCode?: Hex
  config?: Partial<ClientConfiguration>
  descriptor?: Partial<DeploymentDescriptor>
  initialPrivileges?: [string, string][]
  removedKey?: RemovedKeyReading
}

/** A deployed kit's setup client over a fake node, with every contract scripted as deployed. */
export interface KitWorld {
  node: FakeNode
  descriptor: DeploymentDescriptor
  config: ClientConfiguration
  setup: ISetupClient
  removedKey: jest.Mock
  draft(level: PrivacyLevel, overrides?: Partial<SetupDraft>): SetupDraft
}
