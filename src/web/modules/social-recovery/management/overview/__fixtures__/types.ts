import type { OverviewIntent } from '@web/modules/social-recovery/management/overview/types'
import type { Address } from '@kohaku-eth/social-recovery'
import type {
  ReceiptReads,
  RecoveryKitClient,
  SendPort
} from '@web/modules/social-recovery/shared/client'
import type { sdkStandIn as StandIn } from '@web/modules/social-recovery/shared/client/stand-in'
import type { RecoveryClientState } from '@web/modules/social-recovery/shared/client/useRecoveryClient'
import type { ChainId, WalletRecords } from '@web/modules/social-recovery/shared/records'
import type { WatcherStorage } from '@web/modules/social-recovery/watcher'

/** The client state the screen's hook hands back, with its retry. */
export type ClientState = RecoveryClientState & { retry: () => void }

/** A setup committed on the account's fake node, the client built over it and records in memory. */
export interface World {
  chain: ReturnType<typeof StandIn.nodeFor>
  client: RecoveryKitClient
  records: WalletRecords
}

export interface ReadsProbeProps {
  client: ClientState
  records: WalletRecords
  watcherStorage?: WatcherStorage
  chainId: ChainId
  /** The account's keys the wallet holds, where the test names them. */
  heldKeys?: readonly Address[]
  onOpen: (intent: OverviewIntent) => void
}

/** The receipt waits of a write step's test, each a mock. */
export type StepReceipts = ReceiptReads & {
  blockNumber: jest.Mock
  transactionKnown: jest.Mock
  wait: jest.Mock
}

/** Jest's modern fake timers, whose config the repository's Jest types do not declare. */
export interface AdvancingFakeTimers {
  useFakeTimers(config: { advanceTimers: boolean }): void
}

/** The send port of a write step's test, each send a mock. */
export type StepSendPort = SendPort & { send: jest.Mock; sendAccountBatch: jest.Mock }

/** The keys the mocked keystore lists; unread while undefined. */
export type KeystoreMock = { keys: { addr: string; type: string }[] | undefined }

/** What the overview's mocked hooks answer; a test sets each member. */
export type OverviewMocks = {
  account: string | undefined
  facts: unknown
  client: unknown
  port: SendPort | null
  storage: unknown
  watched: unknown
}

/** An action a test sees dispatched, read by its type. */
export type DispatchedAction = { type: string }

/** The props of a stand-in that renders only its children. */
export type ChildrenProps = { children: unknown }

/** What the mocked hooks answer: the account facts and the send port. */
export type WriteStepMocks = { facts: unknown; port: SendPort | null }
