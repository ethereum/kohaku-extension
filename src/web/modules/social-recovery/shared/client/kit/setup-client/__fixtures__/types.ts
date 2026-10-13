import type {
  Address,
  BlockHeader,
  BlockTag,
  ClientConfiguration,
  DeploymentDescriptor,
  Hex,
  IProvider,
  IRecoveryClient,
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
  /** Answers one exact call; a function answers it afresh on each call. */
  answer(to: Address, data: Hex, answer: Hex | Error | ((data: Hex) => Hex | Error)): void
  /** Answers every call to `to` whose selector is `selector` and has no exact answer. */
  answerWith(to: Address, selector: Hex, answer: (data: Hex) => Hex | Error): void
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
  nextAttemptId?: bigint
  attemptId?: bigint
  /** The setup nonce the attempt was judged under; the current one by default. */
  attemptSetupNonce?: bigint
  consumableAfter?: number
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
  /** The holder `trustedParties()` names for the module's stop; none by default. */
  pauseHolder?: Address
}

/** What the fake action answers for the world's account. */
export interface ScriptedAction {
  /** The action's address; the world's action by default. */
  at?: Address
  supportsAccount?: boolean | Error
  authorized?: boolean
  /** The keys the action answers `isAuthority` true for; every other key answers false. */
  authorities?: Address[]
  /** The keys the action answers `holdsAnyPrivilege` true for; every other key answers false. */
  holders?: Address[]
  /** The `KEY_VALUE()` answer, or the error the call throws; the harness's word by default. */
  keyValue?: Hex | Error
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
  /** The kit's recovery client over the same node, restoring through `setup`. */
  recovery: IRecoveryClient
  removedKey: jest.Mock
  draft(level: PrivacyLevel, overrides?: Partial<SetupDraft>): SetupDraft
}

/** The digest a fake manager answers for a request: its own derivation, or a fixed answer. */
export type ScriptedDigest = Hex | Error | 'derived'
