/**
 * @jest-environment jsdom
 *
 * The confirmation's fixtures and fakes. The submission runs over its real
 * steps (`submitStepsOf`), the shared write machine, the shared gas check and
 * the real records on the checklist's in-memory double of the extension's
 * storage. Only the edges are fakes, each recording what it was asked:
 *
 * - the recovery client's `assess`, `complete`, `prepareStartAttempt`,
 *   `recoveryState`, its events, and the wallet's `verifyReply` and
 *   `removedKey`;
 * - the chain reads the gas check makes (balance, estimate, gas price);
 * - the send port, which answers a hash or a refusal;
 * - the receipt wait, which answers a receipt or rejects as ethers does for a
 *   reverted transaction.
 *
 * The screen mounts whole at its route, with the wallet's hooks answered from
 * `mockWallet`. The screen keeps a run outside itself for each account, so
 * every test recovers an account of its own (`freshAccount`).
 */
import { createRoot, Root } from 'react-dom/client'
import { act } from 'react-dom/test-utils'
import { TextDecoder, TextEncoder } from 'util'

import type { Account } from '@ambire-common/interfaces/account'
import type { Key } from '@ambire-common/interfaces/keystore'
import type { ThemeContextReturnType } from '@common/contexts/themeContext'
import type { ThemeProps } from '@common/styles/themeConfig'
import type {
  Address,
  ApproverRequest,
  Attempt,
  AttemptRequest,
  Configuration,
  Gathering,
  Hex,
  KitNotification,
  PreparedCall,
  RecoveryState,
  Reply
} from '@kohaku-eth/social-recovery'
import type {
  AccountFactsResult,
  KeyHandle,
  ListedAccountFacts,
  ProviderTransactionReceipt,
  RecoveryKitClient,
  SendPort,
  SendRequestAction,
  SendRequestPort,
  SendRequestUpdate
} from '@web/modules/social-recovery/shared/client'
import type {
  RecoveryEntryRecord,
  RecoveryRoute,
  StoredSession,
  WalletRecords
} from '@web/modules/social-recovery/shared/records'
import type {
  ApprovalGathering,
  TestStorage
} from '@web/modules/social-recovery/recovery/checklist/__tests__/harness'
import type {
  SendingPlan,
  SubmitKitClient,
  SubmitSteps,
  SubmitStore
} from '@web/modules/social-recovery/recovery/submit'

Object.assign(globalThis, { TextEncoder, TextDecoder })
// React only runs effects and state updates inside act() when this flag is set.
;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true

/** What the wallet's hooks answer the mounted screen. */
export interface MockWallet {
  navigate: jest.Mock
  storage: TestStorage | null
  client: unknown
  facts: AccountFactsResult | null
  accounts: Account[]
  keys: Key[]
  ens: string | null
  port: SendPort | null
  /** The account the wallet has selected. */
  selected: Address | null
  /** The request port the screen built the send port over. */
  requests: SendRequestPort | null
}

export const mockWallet: MockWallet = {
  navigate: jest.fn(),
  storage: null,
  client: { status: 'loading' },
  facts: null,
  accounts: [],
  keys: [],
  ens: null,
  port: null,
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
jest.mock('@web/hooks/useBackgroundService', () => {
  const dispatch = () => undefined
  return { __esModule: true, default: () => ({ dispatch, windowId: undefined }) }
})
jest.mock('@web/hooks/useSelectedAccountControllerState', () => ({
  __esModule: true,
  default: () => ({ account: mockWallet.selected ? { addr: mockWallet.selected } : null })
}))
jest.mock('@web/hooks/useRequestsControllerState', () => {
  const queue = { userRequests: [] }
  return { __esModule: true, default: () => queue }
})
jest.mock('@common/hooks/useReverseLookup/useReverseLookup', () => ({
  __esModule: true,
  default: () => ({ ens: mockWallet.ens, isLoading: false })
}))
jest.mock('@web/modules/social-recovery/shared/client/useRecoveryClient', () => ({
  useRecoveryClient: () => mockWallet.client
}))
jest.mock('@web/modules/social-recovery/shared/client/useAccountFacts', () => ({
  useAccountFacts: () => mockWallet.facts
}))
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
const { MemoryRouter }: typeof import('react-router-dom') = require('react-router-dom')
const {
  ThemeContext
}: typeof import('@common/contexts/themeContext') = require('@common/contexts/themeContext')
const themeConfig: typeof import('@common/styles/themeConfig') = require('@common/styles/themeConfig')
const i18n: typeof import('@common/config/localization').default =
  require('@common/config/localization').default
const { getAddress, keccak256, zeroAddress, zeroHash }: typeof import('viem') = require('viem')
const { dedicatedToOneSAPriv } = require('@ambire-common/interfaces/keystore')
const {
  getSmartAccount
}: typeof import('@ambire-common/libs/account/account') = require('@ambire-common/libs/account/account')
const {
  accountBatchRefusal,
  providerReadFailure,
  sendRefusal
}: typeof import('@web/modules/social-recovery/shared/client') = require('@web/modules/social-recovery/shared/client')
const {
  createWalletRecords
}: typeof import('@web/modules/social-recovery/shared/records') = require('@web/modules/social-recovery/shared/records')
const checklist: typeof import('@web/modules/social-recovery/recovery/checklist/__tests__/harness') = require('@web/modules/social-recovery/recovery/checklist/__tests__/harness')
const {
  submitPathOf
}: typeof import('@web/modules/social-recovery/recovery/checklist') = require('@web/modules/social-recovery/recovery/checklist')
const submit: typeof import('@web/modules/social-recovery/recovery/submit') = require('@web/modules/social-recovery/recovery/submit')
const SubmitScreen: typeof import('@web/modules/social-recovery/recovery/submit/SubmitScreen').default =
  require('@web/modules/social-recovery/recovery/submit/SubmitScreen').default
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
  passportCredential,
  replyOf,
  requestOf,
  assessmentOf
} = checklist

export { submit }

export const t = (key: string, values?: Record<string, unknown>): string => i18n.t(key, values)

/** The payload this recovery's request carries: the new key and the key it removes. */
export const PAYLOAD: Hex = '0xc0ffee0000000000000000000000000000000000000000000000000000000001'
export const PAYLOAD_HASH: Hex = keccak256(PAYLOAD)
export const RIVAL_PAYLOAD: Hex =
  '0xbadbad0000000000000000000000000000000000000000000000000000000002'
export const TX_HASH: Hex = '0x9c1b2e6a0d4f3e8b7a6c5d4e3f2a1b0c9d8e7f6a5b4c3d2e1f0a9b8c7d6e5f4a'
export const START_BLOCK = 7_000_000
export const GWEI = 1_000_000_000n
export const SEPOLIA = { chainId: 11155111n, name: 'Sepolia', nativeAssetSymbol: 'ETH' }

/** The prepared start the client answers: a call anyone may send to the manager. */
export const START_CALL: PreparedCall = {
  kind: 'call',
  target: '0x00000000000000000000000000000000000000aa',
  value: 0n,
  data: '0x5a5a0001',
  sender: 'anyone',
  block: { number: START_BLOCK, hash: zeroHash }
}

let accountSeed = 0x10000
/** An account being recovered that no other test touched, so no run another test left meets it. */
export const freshAccount = (): Address => {
  accountSeed += 1
  return getAddress(`0x${accountSeed.toString(16).padStart(40, '0')}`)
}

/** The gathering of `account` over a configuration, with replies at `replied` and this recovery's payload. */
export const submitGathering = (
  account: Address,
  configuration: Configuration,
  replied: number[],
  order?: { amount: string }
): ApprovalGathering => {
  const opened = gatheringOf(configuration, 1, account)
  return {
    ...opened,
    request: {
      ...opened.request,
      payload: PAYLOAD,
      ...(order ? { order: { token: zeroAddress, payee: zeroAddress, amount: order.amount } } : {})
    },
    replies: replied.map((place) => replyOf(opened, place))
  }
}

/**
 * The session as the records keep it once this gathering's submission landed:
 * the account, the request's attempt id, setup nonce and payload hash, when
 * the attempt becomes executable as `attemptOf` reads it, and the manager and
 * action it names.
 */
export const landedSession = (account: Address, gathering: Gathering) => ({
  state: 'landed' as const,
  account,
  attemptId: gathering.request.attemptId,
  setupNonce: gathering.request.setupNonce,
  payloadHash: keccak256('payload' in gathering.request ? gathering.request.payload : '0x'),
  executableAt: 0,
  deployment: { manager: gathering.request.manager, action: gathering.request.action }
})

/** The manager's attempt record of this gathering's start, under its id, nonce and payload hash. */
export const attemptOf = (gathering: Gathering, overrides: Partial<Attempt> = {}): Attempt => ({
  state: 'Waiting',
  attemptId: BigInt(gathering.request.attemptId),
  setupNonce: BigInt(gathering.request.setupNonce),
  consumableAfter: 0,
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

export const recoveryStateOf = (attempt: Attempt, block = START_BLOCK + 5): RecoveryState => ({
  attempt,
  nextAttemptId: attempt.attemptId + 1n,
  setupCommitment: zeroHash,
  setupNonce: 1n,
  removedKey: REMOVED,
  block: { number: block, timestamp: '0', hash: zeroHash } as unknown as RecoveryState['block']
})

/** The manager's `attempt-started` event of this gathering's start. */
export const attemptStarted = (gathering: Gathering, payload: Hex = PAYLOAD): KitNotification =>
  ({
    kind: 'attempt-started',
    account: gathering.request.account,
    action: gathering.request.action,
    attemptId: BigInt(gathering.request.attemptId),
    setupNonce: BigInt(gathering.request.setupNonce),
    setupBody: gathering.request.setupBody,
    usedPlaces: [],
    usedMethods: [],
    payload,
    order: { token: zeroAddress, amount: 0n, payee: zeroAddress },
    consumableAfter: 0,
    at: { blockNumber: START_BLOCK + 2, removed: false }
  } as unknown as KitNotification)

/** ethers' error from `wait()` on a transaction the chain mined and reverted. */
export const minedAndReverted = (hash: Hex = TX_HASH): Error =>
  Object.assign(new Error('transaction execution reverted'), {
    code: 'CALL_EXCEPTION',
    receipt: { hash, status: 0, blockNumber: START_BLOCK + 1, gasUsed: 51_234n },
    transaction: { hash }
  })

export const landedReceipt = (hash: Hex = TX_HASH): ProviderTransactionReceipt =>
  ({ hash, status: 1, blockNumber: START_BLOCK + 1 } as unknown as ProviderTransactionReceipt)

/** The prepare's refusal where the manager already runs another attempt on the account. */
export const attemptActiveRefusal = (): Error =>
  Object.assign(new Error('the request does not validate'), {
    name: 'ValidationRefusal',
    findings: { errors: [{ code: 'request.attempt-active', severity: 'error', values: {} }] }
  })

// ---------------------------------------------------------------------------
// The client
// ---------------------------------------------------------------------------

/** One recovery's chain and client, each edge a recording fake. */
export interface Kit {
  client: SubmitKitClient
  assess: jest.Mock
  complete: jest.Mock
  prepareStartAttempt: jest.Mock
  recoveryState: jest.Mock
  fetch: jest.Mock
  accountFilter: jest.Mock
  verifyReply: jest.Mock
  removedKey: jest.Mock
  getApproverRequests: jest.Mock
  reads: { nativeBalance: jest.Mock; estimateGas: jest.Mock; gasPrice: jest.Mock }
  receipts: { blockNumber: jest.Mock; wait: jest.Mock; transactionKnown: jest.Mock }
  /** The attempt the manager holds; a landed receipt starts this gathering's own. */
  chain: { attempt: Attempt }
}

/**
 * A client over one configuration and gathering. `complete` carries the places
 * of `chosen`, the smallest set the SDK picks; the key holds plenty of gas; a
 * landed receipt starts the gathering's attempt on the fake chain, which the
 * attempt read then answers.
 */
export const fakeKit = (
  configuration: Configuration,
  gathering: Gathering,
  chosen: number[]
): Kit => {
  const chain = { attempt: NO_ATTEMPT }
  const assess = jest.fn((open: Gathering) => assessmentOf(configuration, open))
  const getApproverRequests = jest.fn((open: Gathering): ApproverRequest[] =>
    open.places.map((place) => requestOf(open, place.place))
  )
  const complete = jest.fn(
    (open: Gathering): AttemptRequest => ({
      account: open.request.account,
      action: open.request.action,
      attemptId: BigInt(open.request.attemptId),
      setupNonce: BigInt(open.request.setupNonce),
      setupBody: open.request.setupBody,
      payload: 'payload' in open.request ? open.request.payload : '0x',
      order: { token: zeroAddress, amount: 0n, payee: zeroAddress },
      validUntil: Number(open.request.validUntil),
      proofs: chosen.map((place) => ({
        place,
        method: open.places[place].method,
        config: open.places[place].config,
        salt: open.places[place].salt,
        proof: '0x01'
      }))
    })
  )
  const prepareStartAttempt = jest.fn(async () => START_CALL)
  const recoveryState = jest.fn(async () => recoveryStateOf(chain.attempt))
  const accountFilter = jest.fn(() => ({ kind: 'account-filter' }))
  const fetch = jest.fn(async (): Promise<KitNotification[]> => [])
  const verifyReply = jest.fn(
    async (request: ApproverRequest, reply: Reply): Promise<string> =>
      request.place === reply.place ? 'satisfied' : 'rejected'
  )
  const removedKey = jest.fn(async () => ({ kind: 'named', key: REMOVED }))
  const reads = {
    nativeBalance: jest.fn(async () => 1_000_000_000_000_000_000n),
    estimateGas: jest.fn(async () => 300_000n),
    gasPrice: jest.fn(async () => 2n * GWEI)
  }
  const receipts = {
    blockNumber: jest.fn(async () => START_BLOCK),
    transactionKnown: jest.fn(async () => 'known' as const),
    wait: jest.fn(async (hash: Hex) => {
      chain.attempt = attemptOf(gathering)
      return landedReceipt(hash)
    })
  }
  const client = {
    recovery: {
      assess,
      getApproverRequests,
      complete,
      prepareStartAttempt,
      recoveryState,
      events: { accountFilter, fetch }
    },
    setup: { getSetup: jest.fn(async () => configuration) },
    walletReads: { verifyReply, removedKey },
    action: {},
    descriptor: { manager: BOOK.manager, action: BOOK.action }
  } as unknown as SubmitKitClient
  return {
    client,
    assess,
    complete,
    prepareStartAttempt,
    recoveryState,
    fetch,
    accountFilter,
    verifyReply,
    removedKey,
    getApproverRequests,
    reads,
    receipts,
    chain
  }
}

/** The client state the screen's client hook answers for a kit. */
export const readyClient = (kit: Kit) => ({
  status: 'ready' as const,
  client: kit.client as unknown as RecoveryKitClient,
  reads: kit.reads,
  receipts: kit.receipts
})

/** A send port whose sends answer `TX_HASH`, or the refusal `refuse` names. */
export const sendPort = (refuse?: 'refused') => {
  const send = jest.fn(async (key: KeyHandle) => {
    if (refuse) {
      throw sendRefusal(refuse, key)
    }
    return TX_HASH
  })
  const sendAccountBatch = jest.fn(async (account: Address) => {
    if (refuse) {
      throw accountBatchRefusal(refuse, account)
    }
    return TX_HASH
  })
  return { send, sendAccountBatch } as SendPort & { send: jest.Mock; sendAccountBatch: jest.Mock }
}

export { providerReadFailure }

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

export const entryOf = (
  account: Address,
  route: RecoveryRoute,
  receivingAccount: Address
): RecoveryEntryRecord => ({ account, route, receivingAccount })

/** Seeds the entry, the decrypted setup and the live session of a recovery. */
export const seedRecovery = async (
  records: WalletRecords,
  entry: RecoveryEntryRecord,
  configuration: Configuration,
  gathering: Gathering
): Promise<StoredSession> => {
  await records.recoveryEntry(CHAIN_ID, entry.account).write(entry)
  await records.decryptedSetupCache(CHAIN_ID, entry.account).write({
    configuration,
    setupNonce: 1n,
    deployment: { manager: BOOK.manager, action: BOOK.action }
  })
  return records.recoverySession(CHAIN_ID, entry.account).write(gathering, null)
}

export const recordsOn = (storage: TestStorage): WalletRecords => createWalletRecords({ storage })

/**
 * The gathering a recoverer opens again for the same account after abandoning
 * `gathering`: the same attempt, a later deadline, and the payload `payload`
 * (the same new key where it is left out).
 */
export const regathered = (gathering: ApprovalGathering, payload: Hex = PAYLOAD): Gathering => ({
  ...gathering,
  request: {
    ...gathering.request,
    validUntil: String(Number(gathering.request.validUntil) + 3_600),
    payload
  }
})

/**
 * What another tab does on `records`: abandons the live session (which ends
 * the entry record too), writes the entry again where one is given, and
 * stores `next` as the new live session.
 */
export const gatherAgain = async (
  records: WalletRecords,
  account: Address,
  next: Gathering,
  entry?: RecoveryEntryRecord
): Promise<StoredSession> => {
  const accessor = records.recoverySession(CHAIN_ID, account)
  const read = await accessor.read()
  if (read.status !== 'present') {
    throw new Error('no session stored')
  }
  await records.wipeRecoverySession(CHAIN_ID, account, 'recoverer-abandoned', read.revision)
  if (entry) {
    await records.recoveryEntry(CHAIN_ID, account).write(entry)
  }
  const wiped = await accessor.read()
  return accessor.write(next, wiped.status === 'present' ? wiped.revision : null)
}

/** The stored session's record as the records read it, or null where none is stored. */
export const sessionOf = async (records: WalletRecords, account: Address) => {
  const read = await records.recoverySession(CHAIN_ID, account).read()
  return read.status === 'present' ? read.value : null
}

/** Every stored value as text, so a test can look for what the storage still holds. */
export const rawStorage = async (storage: TestStorage): Promise<string> => {
  if (!storage.getAll) {
    throw new Error('the storage double lists no entries')
  }
  return JSON.stringify(await storage.getAll(), (_key, value) =>
    typeof value === 'bigint' ? value.toString() : value
  )
}

// ---------------------------------------------------------------------------
// The run over its steps
// ---------------------------------------------------------------------------

/** A request queue that holds nothing, beside a wallet with no sign screen open. */
const noRequests = (): SendRequestPort => {
  const listeners = new Set<(update: SendRequestUpdate) => void>()
  return {
    dispatch: (action) => {
      if (action.type === 'INIT_CONTROLLER_STATE') {
        Promise.resolve()
          .then(() =>
            listeners.forEach((listener) => listener({ controller: 'signAccountOp', state: {} }))
          )
          .catch(() => undefined)
      }
    },
    subscribe: (listener) => {
      listeners.add(listener)
      return () => {
        listeners.delete(listener)
      }
    },
    accounts: () => [],
    queue: () => ({}),
    selectedAccount: () => undefined,
    windowId: () => undefined
  }
}

/** The key the pages of a device send from. */
export const DEVICE_PLAN: SendingPlan = {
  kind: 'key',
  key: { addr: '0x00000000000000000000000000000000000b0b01', type: 'internal' }
}

/** The request id of the claim a page that went away left behind. */
export const LEFT_CLAIM = 'page-that-went'

/** What a page that did not queue a request reads of it: still queued, sent under a hash, or neither. */
export type QueueAnswer =
  | { status: 'queued' }
  | { status: 'broadcast'; hash: Hex }
  | { status: 'gone' }

/**
 * The wallet's request queue and the account's activity as the send port
 * reads them, answering for the requests under `ids` as `answer` says: a queued
 * request sits in the queue; a broadcast one is listed in the activity under
 * its hash; a gone one is in neither.
 */
export const requestQueue = (initial: QueueAnswer, ids: string[] = [LEFT_CLAIM]) => {
  const queue = { answer: initial, ids }
  const listeners = new Set<
    (update: Parameters<Parameters<SendRequestPort['subscribe']>[0]>[0]) => void
  >()
  const port: SendRequestPort = {
    dispatch: (action) => {
      if (action.type === 'INIT_CONTROLLER_STATE') {
        queueMicrotask(() =>
          listeners.forEach((listener) => listener({ controller: 'signAccountOp', state: {} }))
        )
        return
      }
      if (action.type !== 'MAIN_CONTROLLER_ACTIVITY_SET_ACC_OPS_FILTERS') {
        return
      }
      const { sessionId, pagination } = action.params as {
        sessionId: string
        pagination: { fromPage: number }
      }
      const { answer } = queue
      const items =
        answer.status === 'broadcast'
          ? queue.ids.map((id) => ({
              identifiedBy: { type: 'Transaction' },
              status: 'pending',
              txnId: answer.hash,
              calls: [{ fromUserRequestId: id, txnId: answer.hash }]
            }))
          : []
      queueMicrotask(() =>
        listeners.forEach((listener) =>
          listener({
            controller: 'activity',
            state: {
              accountsOps: {
                [sessionId]: { result: { currentPage: pagination.fromPage, items, maxPages: 1 } }
              }
            }
          } as unknown as Parameters<typeof listener>[0])
        )
      )
    },
    subscribe: (listener) => {
      listeners.add(listener)
      return () => {
        listeners.delete(listener)
      }
    },
    // The device's key is itself a basic account the wallet lists, as its own send needs.
    accounts: () => [
      { addr: DEVICE_PLAN.key.addr, associatedKeys: [DEVICE_PLAN.key.addr], creation: null }
    ],
    queue: () =>
      (queue.answer.status === 'queued'
        ? { userRequests: queue.ids.map((id) => ({ id })) }
        : {}) as ReturnType<SendRequestPort['queue']>,
    selectedAccount: () => undefined,
    windowId: () => undefined
  }
  return { port, queue }
}

/**
 * One wallet several pages share: it lists `listed`, selects another account
 * until a test moves the selection, answers every activity read empty and
 * pushes what a test hands it to every page's listeners. `realSendPort` is the
 * client's own send port, which the screens' mock replaces.
 */
export const selectionWallet = (listed: Account) => {
  const listeners = new Set<(update: SendRequestUpdate) => void>()
  const wallet = {
    selected: '0x3333333333333333333333333333333333333333',
    dispatch: jest.fn<void, [SendRequestAction]>(),
    push: (update: SendRequestUpdate) => listeners.forEach((listener) => listener(update))
  }
  wallet.dispatch.mockImplementation((action) => {
    if (action.type === 'INIT_CONTROLLER_STATE') {
      queueMicrotask(() => wallet.push({ controller: 'signAccountOp', state: {} }))
      return
    }
    if (action.type !== 'MAIN_CONTROLLER_ACTIVITY_SET_ACC_OPS_FILTERS') {
      return
    }
    const { sessionId, pagination } = action.params as {
      sessionId: string
      pagination: { fromPage: number }
    }
    queueMicrotask(() =>
      wallet.push({
        controller: 'activity',
        state: {
          accountsOps: {
            [sessionId]: { result: { currentPage: pagination.fromPage, items: [], maxPages: 1 } }
          }
        }
      } as unknown as SendRequestUpdate)
    )
  })
  const port: SendRequestPort = {
    dispatch: wallet.dispatch,
    subscribe(listener) {
      listeners.add(listener)
      return () => {
        listeners.delete(listener)
      }
    },
    accounts: () => [listed],
    queue: () => ({}),
    selectedAccount: () => wallet.selected,
    windowId: () => undefined
  }
  const selectListed = () => {
    wallet.selected = listed.addr
    wallet.push({ controller: 'selectedAccount', state: { account: { addr: listed.addr } } })
  }
  /** The ids of the requests the pages added, in order. */
  const adds = (): string[] =>
    wallet.dispatch.mock.calls.flatMap(([action]) =>
      action.type === 'REQUESTS_CONTROLLER_ADD_USER_REQUEST'
        ? [String((action.params as { userRequest: { id: string } }).userRequest.id)]
        : []
    )
  const realSendPort = (): SendPort => {
    const { createSendPort }: typeof import('@web/modules/social-recovery/shared/client') =
      jest.requireActual('@web/modules/social-recovery/shared/client')
    return createSendPort(port, { chainId: CHAIN_ID })
  }
  return { wallet, port, selectListed, adds, realSendPort }
}

/** The submission's real steps over a kit, a port, and records on a storage. */
export const stepsOf = (input: {
  kit: Kit
  port: SendPort
  records: WalletRecords
  account: Address
  gathering: ApprovalGathering
  plan: SendingPlan
  chosen: ReadonlySet<number>
  now?: () => number
  requests?: SendRequestPort
}): SubmitSteps =>
  submit.submitStepsOf({
    client: input.kit.client,
    reads: input.kit.reads,
    receipts: input.kit.receipts,
    port: input.port,
    requests: input.requests ?? noRequests(),
    records: input.records,
    chainId: CHAIN_ID,
    account: input.account,
    gathering: input.gathering,
    plan: input.plan,
    network: { name: SEPOLIA.name, nativeAssetSymbol: SEPOLIA.nativeAssetSymbol },
    chosen: input.chosen,
    now: input.now ?? (() => Date.now())
  })

/**
 * The steps of a page the browser froze once its claim was written: its reads
 * of the session hold until `thaw`.
 */
export const frozenAfterClaim = (steps: SubmitSteps): { steps: SubmitSteps; thaw: () => void } => {
  let thaw: () => void = () => undefined
  const thawed = new Promise<void>((resolve) => {
    thaw = resolve
  })
  let claimed = false
  return {
    steps: {
      ...steps,
      claim: async (claim) => {
        const answer = await steps.claim(claim)
        claimed = true
        return answer
      },
      readSession: async () => {
        if (claimed) {
          await thawed
        }
        return steps.readSession()
      }
    },
    thaw: () => thaw()
  }
}

/** Lets every pending answer settle: the fakes answer in microtasks, which run before a timer. */
export const drain = async (rounds = 12): Promise<void> => {
  for (let round = 0; round < rounds; round += 1) {
    // eslint-disable-next-line no-await-in-loop
    await new Promise((resolve) => {
      setTimeout(resolve, 0)
    })
  }
}

/** A page holding a store over its steps, as the screen holds one. */
export const pageOf = (steps: SubmitSteps): SubmitStore => {
  const store = submit.createSubmitStore()
  submit.attachSteps(store, steps)
  return store
}

interface AsyncFakeTimers {
  advanceTimersByTimeAsync(ms: number): Promise<void>
}

/** Advances Jest's fake clock by `ms`, running the promises each timer settles before the next timer. */
export const advanceTimers = (ms: number): Promise<void> =>
  (jest as unknown as AsyncFakeTimers).advanceTimersByTimeAsync(ms)

/** Lets what the fake clock's zero-delay timers and the fakes' microtasks started settle. */
export const flushTimers = async (): Promise<void> => {
  for (let round = 0; round < 16; round += 1) {
    // eslint-disable-next-line no-await-in-loop
    await advanceTimers(0)
  }
}

/** The clock every page of a device reads, in ms. */
export const CLAIM_NOW = 1_800_000_000_000

/** One device: a recovery's live session on one storage, the chain's kit, and the records each page opens. */
export interface Device {
  account: Address
  gathering: ApprovalGathering
  kit: Kit
  /** The records each page opens over the device's one storage. */
  records: () => WalletRecords
}

export const openDevice = async (): Promise<Device> => {
  const account = freshAccount()
  const storage = makeStorage()
  const gathering = submitGathering(account, MIXED_PATH, [0, 1, 2, 3])
  const kit = fakeKit(MIXED_PATH, gathering, [0, 1, 2, 3])
  await recordsOn(storage).recoverySession(CHAIN_ID, account).write(gathering, null)
  return { account, gathering, kit, records: () => recordsOn(storage) }
}

/** One page of a device: its own records, its own port, its store over its real steps. */
export const pageOn = (
  device: Device,
  now: () => number = () => CLAIM_NOW,
  { plan = DEVICE_PLAN, requests }: { plan?: SendingPlan; requests?: SendRequestPort } = {}
) => {
  const records = device.records()
  const port = sendPort()
  const steps = stepsOf({
    kit: device.kit,
    port,
    records,
    account: device.account,
    gathering: device.gathering,
    plan,
    chosen: new Set([0, 1, 2, 3]),
    now,
    ...(requests ? { requests } : {})
  })
  const store = pageOf(steps)
  return { records, port, steps, store }
}

/**
 * Writes a claim with no hash, as a page that went away before its send
 * answered leaves it; with `hash`, the hash that page stored after its send.
 */
export const leaveClaim = async (device: Device, claimedAt: number, hash?: Hex): Promise<void> => {
  const accessor = device.records().recoverySession(CHAIN_ID, device.account)
  const read = await accessor.read()
  if (read.status !== 'present') {
    throw new Error('no session stored')
  }
  const claimed = await accessor.claimSubmission(
    { requestId: LEFT_CLAIM, startBlock: START_BLOCK, claimedAt },
    read.revision
  )
  if (hash && claimed.claimed) {
    await accessor.setSubmissionHash(LEFT_CLAIM, hash, claimed.record.revision)
  }
}

/** The claim the stored session carries now, or null where it carries none or is not live. */
export const claimOf = async (device: Device) => {
  const stored = await sessionOf(device.records(), device.account)
  return stored?.state === 'live' ? stored.submission ?? null : null
}

/** The plan of a smart account that sends the start as its own batch, with its key as payer. */
export const batchPlanOf = (smart: { account: Account; key: KeyHandle }): SendingPlan => ({
  kind: 'account-batch',
  key: smart.key,
  facts: factsOf(smart.account, smart.key),
  account: getAddress(smart.account.addr)
})

/** The plan of a fresh smart account, one per seed, that sends the start as its own batch. */
export const batchPlan = async (seed: number): Promise<SendingPlan> =>
  batchPlanOf(await keyedAccount(seed))

/** A decoded kit error the wallet read from a reverted start. */
export const kitError = (name: string) => ({
  known: true as const,
  source: 'manager' as const,
  name,
  selector: '0x12345678' as Hex,
  args: {}
})

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
  allByTestId: (id: string) => HTMLElement[]
  text: () => string
  textOf: (id: string) => string
  press: (id: string) => Promise<void>
  pressText: (text: string) => Promise<void>
  isDisabled: (id: string) => boolean
  /** Every path the screen navigated to, in order. */
  paths: () => string[]
}

/** Renders what the pending answers changed, after they settled. */
export const settle = (rounds = 12) =>
  act(async () => {
    await drain(rounds)
  })

/** Advances the fake clock by `ms` inside act, then lets what the timers started settle. */
export const tick = (ms: number) =>
  act(async () => {
    await advanceTimers(ms)
    for (let round = 0; round < 12; round += 1) {
      // eslint-disable-next-line no-await-in-loop
      await advanceTimers(0)
    }
  })

/** Mounts the confirmation at its route for `account`, with the wallet as `mockWallet` holds it. */
export const mountSubmit = async (
  account: Address,
  { useTimers = false } = {}
): Promise<Mounted> => {
  mockWallet.navigate = jest.fn()
  const container = document.createElement('div')
  document.body.appendChild(container)
  const root: Root = createRoot(container)
  const byTestId = (id: string) => container.querySelector<HTMLElement>(`[data-testid="${id}"]`)
  await act(async () => {
    root.render(
      <ThemeContext.Provider value={THEME_CONTEXT}>
        <MemoryRouter
          initialEntries={[submitPathOf(account)]}
          future={{ v7_startTransition: true, v7_relativeSplatPath: true }}
        >
          <SubmitScreen />
        </MemoryRouter>
      </ThemeContext.Provider>
    )
  })
  if (useTimers) {
    await tick(0)
  } else {
    await settle()
  }
  const click = async (node: HTMLElement) => {
    await act(async () => {
      node.click()
    })
    if (useTimers) {
      await tick(0)
    } else {
      await settle()
    }
  }
  return {
    unmount: () => {
      act(() => root.unmount())
      container.remove()
    },
    byTestId,
    allByTestId: (id) =>
      Array.from(container.querySelectorAll<HTMLElement>(`[data-testid="${id}"]`)),
    text: () => container.textContent ?? '',
    textOf: (id) => byTestId(id)?.textContent ?? '',
    press: async (id) => {
      const node = byTestId(id)
      if (!node) {
        throw new Error(`nothing to press: ${id}`)
      }
      await click(node)
    },
    pressText: async (text) => {
      const node = Array.from(container.querySelectorAll<HTMLElement>('[tabindex]')).find(
        (candidate) => candidate.textContent === text
      )
      if (!node) {
        throw new Error(`no button reads ${text}`)
      }
      await click(node)
    },
    isDisabled: (id) => byTestId(id)?.getAttribute('aria-disabled') === 'true',
    paths: () => mockWallet.navigate.mock.calls.map((call) => call[0])
  }
}

/** Whether a pressable shows exactly this text. */
export const hasButton = (view: Mounted, text: string): boolean =>
  view.text().includes(text) &&
  Array.from(document.querySelectorAll<HTMLElement>('[tabindex]')).some(
    (candidate) => candidate.textContent === text
  )

/**
 * The world one screen test opens on: a recovery of a fresh account on a
 * route, its records seeded on a fresh storage, its client and its receiving
 * account's facts. On the logged-in route the receiving account is a smart
 * account whose own key sends; `receiving: 'basic'` makes it a basic account.
 * On the fresh install the receiving account is the basic account the fast
 * track added, whose key the recovery installs and which sends.
 */
export interface World {
  account: Address
  storage: TestStorage
  records: WalletRecords
  kit: Kit
  port: ReturnType<typeof sendPort>
  gathering: ApprovalGathering
  configuration: Configuration
  receiving: Account
  /** The key the recovery installs. */
  newKey: Address
  /** The key that sends the submission and pays its gas. */
  sendingKey: Address
  entry: RecoveryEntryRecord
}

let keySeed = 0xa1000

export const openWorld = async ({
  route = 'logged-in',
  receiving = 'smart',
  configuration = MIXED_PATH,
  replied = [0, 1, 2, 3, 4],
  chosen = [0, 1, 2, 3],
  order,
  seed = true
}: {
  route?: RecoveryRoute
  receiving?: 'smart' | 'basic'
  configuration?: Configuration
  replied?: number[]
  chosen?: number[]
  order?: { amount: string }
  seed?: boolean
} = {}): Promise<World> => {
  const account = freshAccount()
  const storage = makeStorage()
  const records = recordsOn(storage)
  const gathering = submitGathering(account, configuration, replied, order)
  const kit = fakeKit(configuration, gathering, chosen)
  const port = sendPort()
  keySeed += 2
  let receivingAccount: Account
  let facts: ListedAccountFacts
  let newKey: Address
  let sendingKey: Address
  mockWallet.accounts = []
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
  const entry = entryOf(account, route, receivingAccount.addr as Address)
  if (seed) {
    await seedRecovery(records, entry, configuration, gathering)
  }
  mockWallet.storage = storage
  mockWallet.client = readyClient(kit)
  mockWallet.facts = readyFacts(facts)
  mockWallet.ens = null
  mockWallet.port = port
  mockWallet.selected = null
  mockWallet.requests = null
  return {
    account,
    storage,
    records,
    kit,
    port,
    gathering,
    configuration,
    receiving: receivingAccount,
    newKey,
    sendingKey,
    entry
  }
}

// Registered only when Jest runs this file itself: a suite that imports the
// harness does not run its checks again.
const runningHarnessItself = expect.getState().testPath === __filename

const describeHarness = runningHarnessItself ? describe : () => undefined

describeHarness('the submission harness', () => {
  it('starts the attempt of the gathering on the fake chain once a receipt lands', async () => {
    const account = freshAccount()
    const gathering = submitGathering(account, MIXED_PATH, [0, 1, 2, 3])
    const kit = fakeKit(MIXED_PATH, gathering, [0, 1, 2, 3])
    expect((await kit.recoveryState()).attempt.state).toBe('None')
    await kit.receipts.wait(TX_HASH, START_BLOCK)
    expect((await kit.recoveryState()).attempt).toEqual(attemptOf(gathering))
  })
})

/** One page of the submission: its store and its steps. */
export type SubmitPage = { store: SubmitStore; steps: ReturnType<typeof stepsOf> }

/** A removed-key read that names a key. */
export type NamedKeyRead = { kind: 'named'; key: string }

/** A reply check's request, read by its place. */
export type PlacedRequest = { place: number }
