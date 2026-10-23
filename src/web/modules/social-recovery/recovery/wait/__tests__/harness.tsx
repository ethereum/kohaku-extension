/**
 * @jest-environment jsdom
 *
 * The wait's fixtures and fakes. The wait runs over its real poll, its real
 * phases, the real execution run, the shared write machine, the shared gas
 * check and the real records on the checklist's in-memory double of the
 * extension's storage. Only the edges are fakes, each recording what it was
 * asked:
 *
 * - the recovery client's attempt read (`recoveryState`, with the block it is
 *   pinned to), its events, `prepareExecuteHandover`, the action's four checks
 *   and the wallet's `removedKey`, all answering from one fake chain;
 * - the chain reads the gas check makes (balance, estimate, gas price);
 * - the send port, which answers a hash or a refusal;
 * - the receipt wait, which answers a receipt, rejects as ethers does for a
 *   reverted transaction, or holds until the test releases it.
 *
 * The screen mounts whole at its route on Jest's fake clock, with the wallet's
 * hooks answered from `mockWallet`. The screen keeps the execution's run
 * outside itself for each account, so every test recovers an account of its
 * own (`freshAccount`).
 */
import { createRoot, Root } from 'react-dom/client'
import { act } from 'react-dom/test-utils'
import { TextDecoder, TextEncoder } from 'util'

import type { Account } from '@ambire-common/interfaces/account'
import type { Key } from '@ambire-common/interfaces/keystore'
import type { ThemeContextReturnType } from '@common/contexts/themeContext'
import { WEB_ROUTES } from '@common/modules/router/constants/common'
import type { ThemeProps } from '@common/styles/themeConfig'
import type {
  Address,
  Attempt,
  CancelledBy,
  Configuration,
  Gathering,
  Hex,
  KitNotification,
  PreparedCall,
  RecoveryState
} from '@kohaku-eth/social-recovery'
import type {
  AccountFactsResult,
  KeyHandle,
  ListedAccountFacts,
  ProviderTransactionReceipt,
  RecoveryKitClient,
  SendPort,
  SendRequestPort,
  TransactionKnown
} from '@web/modules/social-recovery/shared/client'
import type {
  ExecutionInFlightRecord,
  RecoveryEntryRecord,
  RecoveryRoute,
  StoredSession,
  WalletRecords
} from '@web/modules/social-recovery/shared/records'
import type { TestStorage } from '@web/modules/social-recovery/recovery/checklist/__tests__/harness'

Object.assign(globalThis, { TextEncoder, TextDecoder })
// React only runs effects and state updates inside act() when this flag is set.
;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true

/** What the wallet's hooks answer the mounted screen. */
export interface MockWallet {
  navigate: jest.Mock
  /** The background service's dispatch, recording every action the screen sent. */
  dispatch: jest.Mock
  storage: TestStorage | null
  /** The client state of each account being recovered, by lowercase address. */
  clients: Map<string, unknown>
  /** The wallet's facts of each account, by lowercase address; any other reads unavailable. */
  facts: Map<string, AccountFactsResult>
  accounts: Account[]
  keys: Key[]
  port: SendPort | null
  /** The ids of the requests the wallet's queue holds. */
  queued: string[]
  /** The operations the account's activity lists for a read of it; null where it does not answer. */
  activity: unknown[] | null
  /** The account the wallet has selected. */
  selected: Address | null
  /** The request port the screen built the send port over. */
  requests: SendRequestPort | null
}

export const mockWallet: MockWallet = {
  navigate: jest.fn(),
  dispatch: jest.fn(),
  storage: null,
  clients: new Map(),
  facts: new Map(),
  accounts: [],
  keys: [],
  port: null,
  queued: [],
  activity: null,
  selected: null,
  requests: null
}

// The chrome's account latch is the chrome's own, tested in its folder.
jest.mock('@web/modules/social-recovery/shared/chrome/useSetupAccount')

jest.mock('@web/modules/social-recovery/shared/records/extensionStorage', () => ({
  get extensionRecordStorage() {
    return mockWallet.storage
  }
}))
jest.mock('@common/hooks/useNavigation', () => ({
  __esModule: true,
  default: () => ({ navigate: mockWallet.navigate })
}))
jest.mock('@web/hooks/useAccountsControllerState', () => ({
  __esModule: true,
  default: () => ({ accounts: mockWallet.accounts })
}))
jest.mock('@web/hooks/useKeystoreControllerState', () => ({
  __esModule: true,
  default: () => ({ keys: mockWallet.keys })
}))
jest.mock('@web/hooks/useBackgroundService', () => ({
  __esModule: true,
  default: () => ({ dispatch: mockWallet.dispatch, windowId: undefined })
}))
jest.mock('@web/hooks/useSelectedAccountControllerState', () => ({
  __esModule: true,
  default: () => ({ account: mockWallet.selected ? { addr: mockWallet.selected } : null })
}))
jest.mock('@web/hooks/useRequestsControllerState', () => ({
  __esModule: true,
  default: () => ({ userRequests: mockWallet.queued.map((id) => ({ id })) })
}))
jest.mock('@web/modules/social-recovery/shared/client/useRecoveryClient', () => {
  const loading = { status: 'loading' }
  return {
    useRecoveryClient: (account: string) => mockWallet.clients.get(account.toLowerCase()) ?? loading
  }
})
jest.mock('@web/modules/social-recovery/shared/client/useAccountFacts', () => {
  const unavailable = { status: 'unavailable', cause: 'not-listed', retry: () => undefined }
  return {
    useAccountFacts: (account: string) => mockWallet.facts.get(account.toLowerCase()) ?? unavailable
  }
})
jest.mock('@web/modules/social-recovery/shared/client', () => ({
  ...jest.requireActual('@web/modules/social-recovery/shared/client'),
  createSendPort: (requests: SendRequestPort) => {
    mockWallet.requests = requests
    return mockWallet.port
  }
}))
const mockFrame = (name: string) => {
  const R = jest.requireActual('react')
  return {
    __esModule: true,
    default: ({
      children,
      counter
    }: {
      children?: unknown
      counter?: { labelKey: string; step: number; total: number; testID?: string }
    }) => {
      const { t: translate } = jest.requireActual('@common/config/localization').default
      return R.createElement(
        'div',
        { 'data-testid': name },
        counter
          ? R.createElement(
              'div',
              { 'data-testid': counter.testID },
              translate(counter.labelKey, { step: counter.step, total: counter.total })
            )
          : null,
        children
      )
    }
  }
}
jest.mock('@web/modules/social-recovery/shared/chrome/PlainChrome', () => mockFrame('plain-chrome'))
jest.mock('@web/modules/social-recovery/shared/chrome/SetupChrome', () => mockFrame('setup-chrome'))
// The spinner's animation needs a native module jsdom lacks.
jest.mock('@common/components/Spinner', () => ({ __esModule: true, default: () => null }))
jest.mock('@common/utils/clipboard', () => ({ setStringAsync: async () => true }))
jest.mock('@common/components/Avatar', () => ({ __esModule: true, default: () => null }))

/* eslint-disable @typescript-eslint/no-var-requires, global-require */
const React: typeof import('react') = require('react')
const eventBus: typeof import('@web/extension-services/event/eventBus').default =
  require('@web/extension-services/event/eventBus').default
const { MemoryRouter, useNavigate }: typeof import('react-router-dom') = require('react-router-dom')
const {
  ThemeContext
}: typeof import('@common/contexts/themeContext') = require('@common/contexts/themeContext')
const themeConfig: typeof import('@common/styles/themeConfig') = require('@common/styles/themeConfig')
const i18n: typeof import('@common/config/localization').default =
  require('@common/config/localization').default
const {
  getAddress,
  keccak256,
  parseEther,
  zeroAddress,
  zeroHash
}: typeof import('viem') = require('viem')
const { dedicatedToOneSAPriv } = require('@ambire-common/interfaces/keystore')
const {
  getSmartAccount
}: typeof import('@ambire-common/libs/account/account') = require('@ambire-common/libs/account/account')
const {
  accountBatchRefusal,
  sendRefusal
}: typeof import('@web/modules/social-recovery/shared/client') = require('@web/modules/social-recovery/shared/client')
const {
  createWalletRecords,
  recordKeys
}: typeof import('@web/modules/social-recovery/shared/records') = require('@web/modules/social-recovery/shared/records')
const checklist: typeof import('@web/modules/social-recovery/recovery/checklist/__tests__/harness') = require('@web/modules/social-recovery/recovery/checklist/__tests__/harness')
const {
  dateOf,
  waitPathOf
}: typeof import('@web/modules/social-recovery/recovery/checklist') = require('@web/modules/social-recovery/recovery/checklist')
const WaitScreen: typeof import('@web/modules/social-recovery/recovery/wait/WaitScreen').default =
  require('@web/modules/social-recovery/recovery/wait/WaitScreen').default
const HomeRecoveryBandView: typeof import('@web/modules/social-recovery/recovery/checklist/HomeRecoveryBandView').default =
  require('@web/modules/social-recovery/recovery/checklist/HomeRecoveryBandView').default
/* eslint-enable @typescript-eslint/no-var-requires, global-require */

export const {
  BOOK,
  CHAIN_ID,
  GUARDIANS,
  MIXED_PATH,
  REMOVED,
  configurationOf,
  gatheringOf,
  guardianCredential,
  makeStorage,
  passkeyCredential,
  passportCredential
} = checklist

export { dateOf, waitPathOf }

export const t = (key: string, values?: Record<string, unknown>): string => i18n.t(key, values)

/** A path of one guardian: one approval satisfies the rule. */
export const ONE_GUARDIAN = configurationOf([
  { threshold: 1, credentials: [guardianCredential(GUARDIANS[0], 'Alice')] }
])

/** The payload this recovery's start carried: the new key and the key it removes. */
export const PAYLOAD: Hex = '0xc0ffee0000000000000000000000000000000000000000000000000000000001'
export const PAYLOAD_HASH: Hex = keccak256(PAYLOAD)
export const RIVAL_PAYLOAD: Hex =
  '0xbadbad0000000000000000000000000000000000000000000000000000000002'
/** The transaction that started the attempt. */
export const START_TX: Hex = '0x5a5a2e6a0d4f3e8b7a6c5d4e3f2a1b0c9d8e7f6a5b4c3d2e1f0a9b8c7d6e5f4a'
/** The execution's transaction. */
export const TX_HASH: Hex = '0x9c1b2e6a0d4f3e8b7a6c5d4e3f2a1b0c9d8e7f6a5b4c3d2e1f0a9b8c7d6e5f4a'
export const START_BLOCK = 7_000_000
export const GWEI = 1_000_000_000n
export const SEPOLIA = { chainId: 11155111n, name: 'Sepolia', nativeAssetSymbol: 'ETH' }
/** The chain's time at the block the first poll is pinned to, in seconds. */
export const CHAIN_TIME = 1_700_000_000
/** This device's clock when a test starts, far from the chain's time, in ms. */
export const DEVICE_NOW = 1_800_000_000_000
export const HOUR = 3600

/** The prepared execution the client answers: a call anyone may send to the manager. */
export const EXECUTE_CALL: PreparedCall = {
  kind: 'call',
  target: '0x00000000000000000000000000000000000000aa',
  value: 0n,
  data: '0x5a5a0002',
  sender: 'anyone',
  block: { number: START_BLOCK, hash: zeroHash }
}

let accountSeed = 0x20000
/** An account being recovered that no other test touched, so no run another test left meets it. */
export const freshAccount = (): Address => {
  accountSeed += 1
  return getAddress(`0x${accountSeed.toString(16).padStart(40, '0')}`)
}

// ---------------------------------------------------------------------------
// The chain
// ---------------------------------------------------------------------------

/** The chain the fake client reads: the attempt, the pinned block, the events and the account's checks. */
export interface FakeChain {
  attempt: Attempt
  /** The pinned block's time, in seconds. */
  blockTime: number
  blockNumber: number
  events: KitNotification[]
  authorized: boolean
  supported: boolean
  /** Whether the key being removed still holds a key value on the account. */
  removedHolds: boolean
  /** Whether the new key already holds a privilege on the account. */
  newKeyHolds: boolean
  /** The attempt read rejects while set. */
  failing: boolean
  /** The attempt read never answers while set. */
  hanging: boolean
}

const logAt = (blockNumber: number, transactionHash: Hex = START_TX) => ({
  blockNumber,
  blockHash: zeroHash,
  logIndex: 0,
  transactionHash,
  removed: false
})

/** The manager's attempt of this recovery, under its id, nonce and payload hash. */
export const attemptOf = (account: Address, overrides: Partial<Attempt> = {}): Attempt => ({
  state: 'Waiting',
  attemptId: 1n,
  setupNonce: 1n,
  consumableAfter: CHAIN_TIME + HOUR,
  payloadHash: PAYLOAD_HASH,
  order: { token: zeroAddress, amount: 0n, payee: zeroAddress },
  usedMethods: [],
  ignoresPause: false,
  ...overrides
})

export const NO_ATTEMPT: Attempt = {
  state: 'None',
  attemptId: 0n,
  setupNonce: 1n,
  consumableAfter: 0,
  payloadHash: zeroHash,
  order: { token: zeroAddress, amount: 0n, payee: zeroAddress },
  usedMethods: [],
  ignoresPause: false
}

/** The manager's `attempt-started` event of this recovery. */
export const attemptStarted = (
  account: Address,
  payload: Hex = PAYLOAD,
  attemptId = 1n
): KitNotification => ({
  kind: 'attempt-started',
  account,
  action: checklist.BOOK.action,
  attemptId,
  setupNonce: 1n,
  setupBody: '0x01',
  usedPlaces: [],
  usedMethods: [],
  payload,
  order: { token: zeroAddress, amount: 0n, payee: zeroAddress },
  consumableAfter: CHAIN_TIME + HOUR,
  at: logAt(START_BLOCK + 2)
})

export const attemptCancelled = (account: Address, cancelledBy: CancelledBy): KitNotification => ({
  kind: 'attempt-cancelled',
  account,
  action: checklist.BOOK.action,
  attemptId: 1n,
  canceller: account,
  vetoingMethod: zeroAddress,
  cancelledBy,
  setupNonce: 1n,
  usedPlaces: [],
  at: logAt(START_BLOCK + 9, TX_HASH)
})

export const attemptConsumed = (account: Address): KitNotification => ({
  kind: 'attempt-consumed',
  account,
  action: checklist.BOOK.action,
  attemptId: 1n,
  at: logAt(START_BLOCK + 9, TX_HASH)
})

/** ethers' error from `wait()` on a transaction the chain mined and reverted. */
export const minedAndReverted = (hash: Hex = TX_HASH): Error =>
  Object.assign(new Error('transaction execution reverted'), {
    code: 'CALL_EXCEPTION',
    receipt: { hash, status: 0, blockNumber: START_BLOCK + 10, gasUsed: 51_234n },
    transaction: { hash }
  })

/** ethers' error from `wait()` on a transaction another transaction of the key replaced before it was mined. */
export const replacedByAnother = (hash: Hex = TX_HASH): Error =>
  Object.assign(new Error('transaction was replaced'), {
    code: 'TRANSACTION_REPLACED',
    reason: 'replaced',
    hash
  })

export const landedReceipt = (hash: Hex = TX_HASH): ProviderTransactionReceipt =>
  ({ hash, status: 1, blockNumber: START_BLOCK + 10 } as unknown as ProviderTransactionReceipt)

// ---------------------------------------------------------------------------
// The client
// ---------------------------------------------------------------------------

/** One recovery's chain and client, each edge a recording fake. */
export interface Kit {
  client: RecoveryKitClient
  chain: FakeChain
  recoveryState: jest.Mock
  fetch: jest.Mock
  prepareExecuteHandover: jest.Mock
  isAuthorized: jest.Mock
  supportsAccount: jest.Mock
  isAuthority: jest.Mock
  holdsAnyPrivilege: jest.Mock
  removedKey: jest.Mock
  reads: { nativeBalance: jest.Mock; estimateGas: jest.Mock; gasPrice: jest.Mock }
  receipts: { blockNumber: jest.Mock; wait: jest.Mock; transactionKnown: jest.Mock }
}

const never = <T,>() => new Promise<T>(() => {})

/**
 * A client over one fake chain for `account`. The attempt waits an hour past
 * the pinned block, every check passes, the events name the attempt's start,
 * the key holds plenty of gas, and a landed receipt leaves the attempt as it
 * was (a test moves the chain).
 */
export const fakeKit = (account: Address): Kit => {
  const chain: FakeChain = {
    attempt: attemptOf(account),
    blockTime: CHAIN_TIME,
    blockNumber: START_BLOCK + 5,
    events: [attemptStarted(account)],
    authorized: true,
    supported: true,
    removedHolds: true,
    newKeyHolds: false,
    failing: false,
    hanging: false
  }
  const recoveryState = jest.fn(async (): Promise<RecoveryState> => {
    if (chain.hanging) {
      return never()
    }
    if (chain.failing) {
      throw new Error('the provider did not answer')
    }
    return {
      attempt: chain.attempt,
      nextAttemptId: chain.attempt.attemptId + 1n,
      setupCommitment: zeroHash,
      setupNonce: 1n,
      removedKey: REMOVED,
      block: { number: chain.blockNumber, timestamp: chain.blockTime, hash: zeroHash }
    }
  })
  const fetch = jest.fn(async (): Promise<KitNotification[]> => chain.events)
  const accountFilter = jest.fn(() => ({ kind: 'account-filter' }))
  const prepareExecuteHandover = jest.fn(async () => EXECUTE_CALL)
  const isAuthorized = jest.fn(async () => chain.authorized)
  const supportsAccount = jest.fn(async () => chain.supported)
  const isAuthority = jest.fn(async () => chain.removedHolds)
  const holdsAnyPrivilege = jest.fn(async () => chain.newKeyHolds)
  const removedKey = jest.fn(async () => ({ kind: 'named', key: REMOVED }))
  const reads = {
    nativeBalance: jest.fn(async () => parseEther('1')),
    estimateGas: jest.fn(async () => 300_000n),
    gasPrice: jest.fn(async () => 2n * GWEI)
  }
  const receipts = {
    blockNumber: jest.fn(async () => START_BLOCK + 8),
    transactionKnown: jest.fn(async (): Promise<TransactionKnown> => 'known'),
    wait: jest.fn(async (hash: Hex) => landedReceipt(hash))
  }
  const client = {
    chain: 'sepolia',
    account,
    descriptor: { deployedAt: 100, manager: BOOK.manager, action: BOOK.action },
    recovery: {
      recoveryState,
      events: { accountFilter, fetch },
      prepareExecuteHandover
    },
    setup: { getSetup: jest.fn(async () => MIXED_PATH) },
    walletReads: { removedKey },
    action: { isAuthorized, supportsAccount, isAuthority, holdsAnyPrivilege }
  } as unknown as RecoveryKitClient
  return {
    client,
    chain,
    recoveryState,
    fetch,
    prepareExecuteHandover,
    isAuthorized,
    supportsAccount,
    isAuthority,
    holdsAnyPrivilege,
    removedKey,
    reads,
    receipts
  }
}

/** The client state the screen's client hook answers for a kit. */
export const readyClient = (kit: Kit) => ({
  status: 'ready' as const,
  client: kit.client,
  reads: kit.reads,
  receipts: kit.receipts
})

/** A send port whose sends answer `TX_HASH`, or refuse while `refusing` is set. */
export const sendPort = () => {
  const state = { refusing: false }
  const send = jest.fn(async (key: KeyHandle) => {
    if (state.refusing) {
      throw sendRefusal('refused', key)
    }
    return TX_HASH
  })
  const sendAccountBatch = jest.fn(async () => TX_HASH)
  const port = { send, sendAccountBatch } as SendPort & {
    send: jest.Mock
    sendAccountBatch: jest.Mock
  }
  return { port, state }
}

// ---------------------------------------------------------------------------
// The accounts
// ---------------------------------------------------------------------------

/** A smart account with its own controlling key, one per seed. */
export const keyedAccount = async (seed: number): Promise<{ account: Account; key: KeyHandle }> => {
  const key: KeyHandle = {
    addr: getAddress(`0x${seed.toString(16).padStart(40, '0')}`),
    type: 'internal'
  }
  const account = await getSmartAccount([{ addr: key.addr, hash: dedicatedToOneSAPriv }], [])
  account.preferences = { ...account.preferences, label: 'Travel wallet' }
  return { account, key }
}

/** A basic account, its own key. */
export const basicAccount = (addr: Address, label = 'Daily account'): Account =>
  ({
    addr,
    associatedKeys: [addr],
    initialPrivileges: [],
    creation: null,
    preferences: { label, pfp: addr }
  } as unknown as Account)

/** The wallet's facts for a listed account, with its key. */
export const factsOf = (account: Account, key?: KeyHandle): ListedAccountFacts => ({
  account,
  state: {
    accountAddr: account.addr,
    isDeployed: true,
    isEOA: !account.creation,
    isV2: true,
    nonce: 0n
  } as unknown as ListedAccountFacts['state'],
  network: SEPOLIA as unknown as ListedAccountFacts['network'],
  deployed: true,
  ...(key ? { key } : {}),
  ...(account.creation
    ? {
        creation: {
          factory: account.creation.factoryAddr as Address,
          bytecode: account.creation.bytecode as Hex,
          salt: account.creation.salt as Hex,
          block: 0
        }
      }
    : {})
})

export const readyFacts = (facts: ListedAccountFacts): AccountFactsResult => ({
  status: 'ready',
  facts,
  retry: () => undefined
})

/**
 * The keystore of a fresh install: the receiving basic account's key as an
 * ordinary key of the recovery phrase the fast track made.
 */
export const seedSlotKeys = (ordinaryKey: Address): Key[] =>
  [
    { addr: ordinaryKey, type: 'internal', dedicatedToOneSA: false, meta: { fromSeedId: 'seed-1' } }
  ] as unknown as Key[]

// ---------------------------------------------------------------------------
// The records
// ---------------------------------------------------------------------------

export const recordsOn = (storage: TestStorage): WalletRecords => createWalletRecords({ storage })

/** The gathering of `account` with this recovery's payload, as the submission held it. */
export const submittedGathering = (
  account: Address,
  configuration: Configuration,
  attempt = 1
): Gathering => {
  const opened = gatheringOf(configuration, attempt, account)
  return { ...opened, request: { ...opened.request, payload: PAYLOAD } }
}

/** Lands a recovery's live session, so the countdown's record is all the session keeps. */
export const landCountdown = async (
  records: WalletRecords,
  account: Address,
  configuration: Configuration,
  attempt = 1
): Promise<void> => {
  const live = await records
    .recoverySession(CHAIN_ID, account)
    .write(submittedGathering(account, configuration, attempt), null)
  await records.landSubmission(CHAIN_ID, account, live.revision)
}

/**
 * Stores the countdown as a wallet stored it before the landing kept the
 * landed attempt: the account alone, with no attempt id, setup number or
 * payload hash.
 */
export const storeCountdownWithoutAttempt = async (
  storage: TestStorage,
  account: Address
): Promise<void> => {
  const key = recordKeys.recoverySession(CHAIN_ID, account)
  const stored = (await storage.get(key)) as StoredSession
  if (stored.value.state !== 'landed') {
    throw new Error('no landed session')
  }
  const { attemptId, setupNonce, payloadHash, ...older } = stored.value
  await storage.set(key, { ...stored, value: older })
}

/** A manager this build no longer reads. */
export const RETIRED_MANAGER: Address = '0x00000000000000000000000000000000000Dead1'

/** Moves the stored countdown of the account onto a retired manager, all else kept. */
export const storeCountdownOnRetiredManager = async (
  storage: TestStorage,
  account: Address
): Promise<void> => {
  const key = recordKeys.recoverySession(CHAIN_ID, account)
  const stored = (await storage.get(key)) as StoredSession
  if (stored.value.state !== 'landed') {
    throw new Error('no landed session')
  }
  await storage.set(key, {
    ...stored,
    value: {
      ...stored.value,
      deployment: { manager: RETIRED_MANAGER, action: BOOK.action }
    }
  })
}

/** The request id under which another page claims the execution. */
export const OTHER_REQUEST = 'social-recovery-sender:another-page'
/** The hash another page's execution went out under. */
export const OTHER_TX_HASH: Hex =
  '0x7e7e2e6a0d4f3e8b7a6c5d4e3f2a1b0c9d8e7f6a5b4c3d2e1f0a9b8c7d6e5f4a'
/** The block another page read before its claim. */
export const CLAIM_BLOCK = START_BLOCK + 20

/** The execution in flight the countdown holds, or undefined where it holds none or no countdown is stored. */
export const executionOf = async (
  records: WalletRecords,
  account: Address
): Promise<ExecutionInFlightRecord | undefined> => {
  const read = await records.countdown(CHAIN_ID, account).read()
  return read.status === 'present' ? read.value.execution : undefined
}

/**
 * Writes another page's claim of the execution on the countdown, as that page
 * writes it before its send, and its hash where it has one.
 */
export const claimElsewhere = async (
  records: WalletRecords,
  account: Address,
  { claimedAt = Date.now(), transactionHash }: { claimedAt?: number; transactionHash?: Hex } = {}
): Promise<void> => {
  const countdown = records.countdown(CHAIN_ID, account)
  const read = await countdown.read()
  if (read.status !== 'present') {
    throw new Error('no countdown')
  }
  const written = await countdown.claimExecution(
    { requestId: OTHER_REQUEST, startBlock: CLAIM_BLOCK, claimedAt },
    read.revision
  )
  if (transactionHash) {
    await countdown.setExecutionHash(OTHER_REQUEST, transactionHash, written.record.revision)
  }
}

/** Writes the hash of another page's claim, as that page does once the wallet sent it. */
export const hashElsewhere = async (
  records: WalletRecords,
  account: Address,
  transactionHash: Hex = OTHER_TX_HASH
): Promise<void> => {
  const countdown = records.countdown(CHAIN_ID, account)
  const read = await countdown.read()
  if (read.status !== 'present') {
    throw new Error('no countdown')
  }
  await countdown.setExecutionHash(OTHER_REQUEST, transactionHash, read.revision)
}

// ---------------------------------------------------------------------------
// The clock
// ---------------------------------------------------------------------------

interface AsyncFakeTimers {
  advanceTimersByTimeAsync(ms: number): Promise<void>
}

/** Advances Jest's fake clock by `ms`, running the promises each timer settles before the next timer. */
export const advanceTimers = (ms: number): Promise<void> =>
  (jest as unknown as AsyncFakeTimers).advanceTimersByTimeAsync(ms)

/** Advances the fake clock by `ms` inside act, then lets what the timers started settle. */
export const tick = (ms = 0) =>
  act(async () => {
    await advanceTimers(ms)
    for (let round = 0; round < 12; round += 1) {
      // eslint-disable-next-line no-await-in-loop
      await advanceTimers(0)
    }
  })

/** Moves the device's wall clock alone: no timer fires. */
export const moveDeviceClock = (ms: number) => {
  jest.setSystemTime(Date.now() + ms)
}

/** Puts the tab out of view or back into it, as the browser does, then lets what the page started settle. */
export const showTab = async (state: 'visible' | 'hidden') => {
  await act(async () => {
    Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => state })
    document.dispatchEvent(new Event('visibilitychange'))
  })
  await tick(0)
}

/** Gives the tab's visibility back to jsdom. */
export const resetTab = () => {
  Reflect.deleteProperty(document, 'visibilityState')
}

/** Fake timers with the device's clock far from the chain's. */
export const useWaitClock = () => {
  beforeEach(() => {
    jest.useFakeTimers('modern')
    jest.setSystemTime(DEVICE_NOW)
  })
  afterEach(() => {
    jest.useRealTimers()
  })
}

// ---------------------------------------------------------------------------
// The mount
// ---------------------------------------------------------------------------

const THEME = Object.fromEntries(
  Object.entries(themeConfig.default).map(([name, byType]) => [
    name,
    byType[themeConfig.THEME_TYPES.LIGHT]
  ])
) as ThemeProps

const THEME_CONTEXT: ThemeContextReturnType = {
  theme: THEME,
  themeType: themeConfig.THEME_TYPES.LIGHT,
  selectedThemeType: themeConfig.THEME_TYPES.LIGHT,
  setThemeType: () => {}
}

export interface Mounted {
  unmount: () => void
  byTestId: (id: string) => HTMLElement | null
  text: () => string
  textOf: (id: string) => string
  press: (id: string) => Promise<void>
  /** Presses twice before the screen renders again. */
  pressTwice: (id: string) => Promise<void>
  /** Presses the pressable that shows exactly `text`. */
  pressText: (text: string) => Promise<void>
  /** Whether a pressable shows exactly `text`. */
  hasButton: (text: string) => boolean
  isDisabled: (id: string) => boolean
  /** Every path the screen navigated to, in order. */
  paths: () => string[]
}

/**
 * The background the screen dispatches to: it answers each read of the
 * account's activity with `mockWallet.activity` over the event bus, as the
 * background pushes it, and nothing where that is null, and each ask for the
 * sign screen's state with none open.
 */
const background = (action: { type: string; params?: unknown }) => {
  if (action.type === 'INIT_CONTROLLER_STATE') {
    Promise.resolve()
      .then(() => eventBus.emit('signAccountOp', null))
      .catch(() => undefined)
    return
  }
  const items = mockWallet.activity
  if (action.type !== 'MAIN_CONTROLLER_ACTIVITY_SET_ACC_OPS_FILTERS' || items === null) {
    return
  }
  const { sessionId, pagination } = action.params as {
    sessionId: string
    pagination?: { fromPage: number }
  }
  Promise.resolve()
    .then(() =>
      eventBus.emit('activity', {
        accountsOps: {
          [sessionId]: { result: { items, currentPage: pagination?.fromPage ?? 0, maxPages: 1 } }
        }
      })
    )
    .catch(() => undefined)
}

const mountElement = async (element: ReturnType<typeof React.createElement>): Promise<Mounted> => {
  mockWallet.navigate = jest.fn()
  mockWallet.dispatch = jest.fn(background)
  const container = document.createElement('div')
  document.body.appendChild(container)
  const root: Root = createRoot(container)
  const byTestId = (id: string) => container.querySelector<HTMLElement>(`[data-testid="${id}"]`)
  const buttonOf = (text: string) =>
    Array.from(container.querySelectorAll<HTMLElement>('[tabindex]')).find(
      (candidate) => candidate.textContent === text
    )
  const click = async (node: HTMLElement) => {
    await act(async () => {
      node.click()
    })
    await tick(0)
  }
  await act(async () => {
    root.render(<ThemeContext.Provider value={THEME_CONTEXT}>{element}</ThemeContext.Provider>)
  })
  await tick(0)
  return {
    unmount: () => {
      act(() => root.unmount())
      container.remove()
    },
    byTestId,
    text: () => container.textContent ?? '',
    textOf: (id) => byTestId(id)?.textContent ?? '',
    press: async (id) => {
      const node = byTestId(id)
      if (!node) {
        throw new Error(`nothing to press: ${id}`)
      }
      await click(node)
    },
    pressTwice: async (id) => {
      const node = byTestId(id)
      if (!node) {
        throw new Error(`nothing to press: ${id}`)
      }
      await act(async () => {
        node.click()
        node.click()
      })
      await tick(0)
    },
    pressText: async (text) => {
      const node = buttonOf(text)
      if (!node) {
        throw new Error(`no button reads ${text}`)
      }
      await click(node)
    },
    hasButton: (text) => !!buttonOf(text),
    isDisabled: (id) => byTestId(id)?.getAttribute('aria-disabled') === 'true',
    paths: () => mockWallet.navigate.mock.calls.map((call) => call[0])
  }
}

/** Mounts the wait at its route for `account`, with the wallet as `mockWallet` holds it. */
export const mountWait = (account: Address): Promise<Mounted> =>
  mountElement(
    <MemoryRouter
      initialEntries={[waitPathOf(account)]}
      future={{ v7_startTransition: true, v7_relativeSplatPath: true }}
    >
      <WaitScreen />
    </MemoryRouter>
  )

/** A wait mounted at its route with no account, and the router's own move to another path. */
export interface RoutedWait extends Mounted {
  goTo: (path: string) => Promise<void>
}

/**
 * Mounts the wait at its route with no account in the search. `goTo` moves the
 * router itself, as a link in the page would, so the same screen stays mounted
 * across the move.
 */
export const mountWaitWithNoAccount = async (): Promise<RoutedWait> => {
  let routerNavigate: (path: string) => void = () => {
    throw new Error('the router has not rendered')
  }
  const RouterHandle = () => {
    const navigate = useNavigate()
    routerNavigate = (path) => navigate(path)
    return null
  }
  const mounted = await mountElement(
    <MemoryRouter
      initialEntries={[`/${WEB_ROUTES.socialRecoveryRecoveryWait}`]}
      future={{ v7_startTransition: true, v7_relativeSplatPath: true }}
    >
      <RouterHandle />
      <WaitScreen />
    </MemoryRouter>
  )
  return {
    ...mounted,
    goTo: async (path) => {
      await act(async () => {
        routerNavigate(path)
      })
      await tick(0)
    }
  }
}

/**
 * The libraries both pages share, as one browser holds them: everything else
 * loads again for the other page, so its runs and its records' queues are its
 * own, as another tab's are.
 */
const SHARED_LIBRARIES = [
  'react',
  'react/jsx-runtime',
  'react-dom',
  'react-native-web',
  'react-router',
  'react-router-dom',
  '@common/contexts/themeContext',
  '@common/config/localization'
]

/**
 * Mounts the wait at its route for `account` as another page of the same
 * wallet: another tab, or this tab after a reload. It shares only the
 * extension's storage and the wallet's edges with the first page.
 */
export const mountWaitInAnotherPage = (account: Address): Promise<Mounted> => {
  /* eslint-disable @typescript-eslint/no-var-requires, global-require, import/no-dynamic-require */
  const shared = SHARED_LIBRARIES.map((name) => [name, require(name)] as const)
  let OtherWaitScreen: typeof WaitScreen = WaitScreen
  jest.isolateModules(() => {
    shared.forEach(([name, library]) => jest.doMock(name, () => library))
    OtherWaitScreen = require('@web/modules/social-recovery/recovery/wait/WaitScreen').default
  })
  /* eslint-enable @typescript-eslint/no-var-requires, global-require, import/no-dynamic-require */
  return mountElement(
    <MemoryRouter
      initialEntries={[waitPathOf(account)]}
      future={{ v7_startTransition: true, v7_relativeSplatPath: true }}
    >
      <OtherWaitScreen />
    </MemoryRouter>
  )
}

/** Mounts the home band over `records`, with no live session's headline. */
export const mountBand = (records: WalletRecords): Promise<Mounted> =>
  mountElement(
    <HomeRecoveryBandView
      records={records}
      chainId={CHAIN_ID}
      deployment={{ manager: BOOK.manager, action: BOOK.action }}
      navigate={(path: string) => mockWallet.navigate(path)}
      timeZone="UTC"
      useHeadline={() => null}
    />
  )

/**
 * The world one test opens on: a recovery of a fresh account whose
 * submission landed on a route, its entry and its countdown's record on a
 * fresh storage, its client over a fake chain and its receiving account's
 * facts. On the logged-in route the receiving account is a basic account whose
 * own key sends; `receiving: 'smart'` makes it a smart account that sends its
 * own batch. On the fresh install the receiving account is the basic account
 * the fast track added, whose key the recovery installs and which sends.
 */
export interface World {
  account: Address
  storage: TestStorage
  records: WalletRecords
  kit: Kit
  port: ReturnType<typeof sendPort>['port']
  refusing: ReturnType<typeof sendPort>['state']
  /** The key the recovery installs. */
  newKey: Address
  /** The key that sends the execution and pays its gas. */
  sendingKey: Address
  entry: RecoveryEntryRecord
}

let keySeed = 0xb1000

export const openWorld = async ({
  route = 'logged-in',
  receiving = 'basic',
  configuration = MIXED_PATH,
  cache = false,
  countdown = true,
  lettered = false
}: {
  route?: RecoveryRoute
  receiving?: 'smart' | 'basic'
  configuration?: Configuration
  /** Whether this device holds the decrypted setup. */
  cache?: boolean
  /** Whether the submission landed; without it the storage holds no session. */
  countdown?: boolean
  /** Whether the account's address has letters, so its checksummed and lowercase spellings differ. */
  lettered?: boolean
} = {}): Promise<World> => {
  const account = lettered ? getAddress(`0xabcdef${freshAccount().slice(8)}`) : freshAccount()
  const storage = makeStorage()
  const records = recordsOn(storage)
  const kit = fakeKit(account)
  const { port, state: refusing } = sendPort()
  keySeed += 2
  let receivingAccount: Account
  let facts: ListedAccountFacts
  let newKey: Address
  let sendingKey: Address
  mockWallet.accounts = []
  mockWallet.queued = []
  mockWallet.activity = null
  mockWallet.keys = []
  if (receiving === 'basic' || route === 'fresh-install') {
    receivingAccount = basicAccount(getAddress(`0x${keySeed.toString(16).padStart(40, '0')}`))
    facts = factsOf(receivingAccount, { addr: receivingAccount.addr as Address, type: 'internal' })
    newKey = receivingAccount.addr as Address
    sendingKey = newKey
    if (route === 'fresh-install') {
      mockWallet.accounts = [receivingAccount]
      mockWallet.keys = seedSlotKeys(newKey)
    }
  } else {
    const smart = await keyedAccount(keySeed)
    receivingAccount = smart.account
    facts = factsOf(smart.account, smart.key)
    newKey = smart.key.addr
    sendingKey = smart.key.addr
  }
  const entry: RecoveryEntryRecord = {
    account,
    route,
    receivingAccount: receivingAccount.addr as Address
  }
  await records.recoveryEntry(CHAIN_ID, account).write(entry)
  if (cache) {
    await records.decryptedSetupCache(CHAIN_ID, account).write({
      configuration,
      setupNonce: 1n,
      deployment: { manager: BOOK.manager, action: BOOK.action }
    })
  }
  if (countdown) {
    await landCountdown(records, account, configuration)
  }
  mockWallet.storage = storage
  mockWallet.clients = new Map([[account.toLowerCase(), readyClient(kit)]])
  mockWallet.facts = new Map([[receivingAccount.addr.toLowerCase(), readyFacts(facts)]])
  mockWallet.port = port
  mockWallet.selected = null
  mockWallet.requests = null
  return {
    account,
    storage,
    records,
    kit,
    port,
    refusing,
    newKey,
    sendingKey,
    entry
  }
}

/**
 * Holds the account's batch while the wallet selects another account, as the
 * send port does. Once the test lands the selection, the port asks the run's
 * gate: where it allows the add, the request is added and the batch answers
 * `TX_HASH`; otherwise nothing is added and the batch ends with the port's
 * timeout.
 */
export const batchAwaitingSelection = (world: World) => {
  const added: string[] = []
  const held: { land?: () => Promise<void> } = {}
  world.port.sendAccountBatch.mockImplementation(
    (...[account, , , , requestId, options]: Parameters<SendPort['sendAccountBatch']>) =>
      new Promise<Hex>((resolve, reject) => {
        held.land = async () => {
          if (options?.canAdd && (await options.canAdd())) {
            added.push(String(requestId))
            resolve(TX_HASH)
            return
          }
          reject(accountBatchRefusal('timeout', account))
        }
      })
  )
  const selectAccount = async () => {
    if (!held.land) {
      throw new Error('no batch waits for the selection')
    }
    await held.land()
  }
  return { selectAccount, added: () => [...added] }
}

/** Puts the pinned block at the attempt's end, so the wait reads elapsed. */
export const elapse = (kit: Kit) => {
  const { chain } = kit
  chain.blockTime = chain.attempt.consumableAfter
  chain.blockNumber += 300
}

/** Ends the attempt as an executed one of this recovery, with its consume event. */
export const consume = (kit: Kit, account: Address) => {
  const { chain } = kit
  chain.attempt = { ...chain.attempt, state: 'Consumed' }
  chain.events = [...chain.events, attemptConsumed(account)]
}

/** The time the wait shows for `seconds` left. */
export const waiting = (seconds: number): string => {
  const pad = (n: number) => String(n).padStart(2, '0')
  const time = `${pad(Math.floor(seconds / 3600))}:${pad(Math.floor((seconds % 3600) / 60))}:${pad(
    seconds % 60
  )}`
  return t('socialRecovery.display.countdownWaiting', { time })
}

// Registered only when Jest runs this file itself: a suite that imports the
// harness does not run its checks again.
const runningHarnessItself = expect.getState().testPath === __filename

const describeHarness = runningHarnessItself ? describe : () => undefined

describeHarness('the wait harness', () => {
  it('answers the attempt read from the fake chain, pinned to its block', async () => {
    const account = freshAccount()
    const kit = fakeKit(account)
    elapse(kit)
    const state = await kit.recoveryState()
    expect(state.attempt).toEqual(attemptOf(account))
    expect(state.block.timestamp).toBe(state.attempt.consumableAfter)
  })
})
