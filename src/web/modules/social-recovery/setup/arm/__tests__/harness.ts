/**
 * The fixtures and fakes the save's tests share. The save runs over its real
 * steps (`saveStepsOf`): the client's prepare and check, the writes lane's gas
 * check and batch drive, the account library's batch transaction. Only the
 * edges are fakes, each recording what it was asked:
 *
 * - the recovery client's `prepareCommitSetup` and `confirmSetup`;
 * - the chain reads the gas check makes (balance, estimate, gas price);
 * - the send port, which answers a hash or the port's own refusal;
 * - the receipt wait, which answers a receipt or rejects as ethers does for a
 *   reverted or replaced transaction;
 * - the draft write-back;
 * - the wallet's queue and the account's activity, as a page that did not
 *   queue the save reads them.
 *
 * The records' wipe and the save in flight are the records lane's own over an
 * in-memory storage, which several saves may share as the pages of one device.
 *
 * The account is the account library's own smart account, controlled by `KEY`,
 * so the batch's transaction is the one the library builds. Nothing reaches a
 * network and nothing imports the SDK doubles.
 */
import { getAddress, zeroAddress, zeroHash } from 'viem'

import { Session } from '@ambire-common/classes/session'
import type { Account } from '@ambire-common/interfaces/account'
import { dedicatedToOneSAPriv } from '@ambire-common/interfaces/keystore'
import type { Network } from '@ambire-common/interfaces/network'
import type { SignUserRequest } from '@ambire-common/interfaces/userRequest'
import { getSmartAccount } from '@ambire-common/libs/account/account'
import { AccountOpStatus } from '@ambire-common/libs/accountOp/types'
import { parse, stringify } from '@ambire-common/libs/richJson/richJson'
import en from '@common/config/localization/translations/en.json'
import type {
  Address,
  Clause,
  Credential,
  Hex,
  PreparedBatch,
  PreparedCall,
  SetupConfirmation,
  SetupDescription,
  SetupDraft,
  SetupState
} from '@web/modules/social-recovery/sdk-interfaces'
import {
  accountBatchRefusal,
  addressBookOf,
  CHAIN_IDS,
  deploymentDescriptor,
  providerReadFailure,
  SEND_REFUSAL_REASONS
} from '@web/modules/social-recovery/shared/client'
import type {
  AccountFactsReading,
  ChainReads,
  EstimationListener,
  FeeOption,
  FeeReading,
  FitCheckReading,
  KeyHandle,
  ListedAccountFacts,
  ProviderTransactionReceipt,
  ReceiptReads,
  RemovedKeyReading,
  SendPort,
  SendRefusalReason,
  SendRequestAction,
  SendRequestPort,
  SendRequestUpdate,
  SubmittedOperation
} from '@web/modules/social-recovery/shared/client'
import { createWalletRecords } from '@web/modules/social-recovery/shared/records'
import type {
  ChainId,
  RecordStorage,
  SaveInFlightAccessor
} from '@web/modules/social-recovery/shared/records'
import { emptySlot } from '@web/modules/social-recovery/shared/records/slots'
import { saveGateOf, trustRowsOf } from '@web/modules/social-recovery/setup/review'
import type { AccountReads, SaveGate } from '@web/modules/social-recovery/setup/review'

import {
  arrivalOf,
  CONFIRM_REREAD_BLOCKS,
  createArmStore,
  isSaved,
  saveStepsOf,
  startSave
} from '@web/modules/social-recovery/setup/arm'
import type {
  ArmClientStatus,
  ArmEvent,
  ArmKitClient,
  ArmLoad,
  ArmState,
  Arrival,
  ArmStore,
  SaveSteps
} from '@web/modules/social-recovery/setup/arm'

export const S = en.socialRecovery

export const CHAIN_ID: ChainId = CHAIN_IDS.sepolia
export const DESCRIPTOR = deploymentDescriptor('sepolia')
export const BOOK = addressBookOf('sepolia')

/** The account's controlling key, which sends the save and pays its gas. */
export const KEY: KeyHandle = {
  addr: '0x6c482af19b7d03e5c1a684fb27d05e93a8c410b7',
  type: 'internal'
}
export const REMOVED_KEY: Address = getAddress('0x5e5e5e5e5e5e5e5e5e5e5e5e5e5e5e5e5e5e5e5e')
export const TX_HASH: Hex = '0x9c1b2e6a0d4f3e8b7a6c5d4e3f2a1b0c9d8e7f6a5b4c3d2e1f0a9b8c7d6e5f4a'
export const SECOND_HASH: Hex = '0x2222222222222222222222222222222222222222222222222222222222222222'
export const BLOCK = { number: 7_000_000, hash: zeroHash }
export const START_BLOCK = 7_000_000
export const PASSWORD = 'tide lantern orchid'
export const SEPOLIA = {
  chainId: 11155111n,
  name: 'Sepolia',
  nativeAssetSymbol: 'ETH'
} as Network
export const GWEI = 1_000_000_000n

/** The library's smart account controlled by `KEY`, built once per file. */
let built: Account | undefined
export const smartAccount = async (): Promise<Account> => {
  if (!built) {
    built = await getSmartAccount([{ addr: KEY.addr, hash: dedicatedToOneSAPriv }], [])
  }
  return built
}

/**
 * A smart account of its own with its own controlling key, one per seed, for a
 * test that must not share the account's held save with another test.
 */
export const keyedAccount = async (seed: number): Promise<{ account: Account; key: KeyHandle }> => {
  const key: KeyHandle = { addr: `0x${seed.toString(16).padStart(40, '0')}`, type: 'internal' }
  const account = await getSmartAccount([{ addr: key.addr, hash: dedicatedToOneSAPriv }], [])
  return { account, key }
}

/** The account's facts as the wallet reads them, with or without code, and with or without its key. */
export const factsOf = (
  account: Account,
  { deployed = true, key = KEY }: { deployed?: boolean; key?: KeyHandle | null } = {}
): ListedAccountFacts => ({
  account,
  state: {
    accountAddr: account.addr,
    isDeployed: deployed,
    isEOA: false,
    isV2: true,
    nonce: 0n
  } as unknown as ListedAccountFacts['state'],
  network: SEPOLIA,
  deployed,
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

// ---------------------------------------------------------------------------
// The draft and the prepared save
// ---------------------------------------------------------------------------

export const PASSKEY: Credential = {
  method: BOOK.methods.passkey,
  config: '0x0102030405060708',
  label: 'MacBook passkey'
}
export const PATH: Clause[] = [{ threshold: 1, credentials: [PASSKEY] }]

export const draftOf = (
  backup: SetupDraft['privacy']['backup'] = 'encrypted',
  publicMetadata: Hex = '0x',
  clauses: Clause[] = PATH
): SetupDraft => ({
  wait: 172800n,
  clauses,
  ignoresPause: true,
  privacy: { backup, publicMetadata }
})

/** The kit's authorization write: the account grants the audited action its slot. */
export const armingCallOf = (account: Address): PreparedCall => ({
  kind: 'call',
  target: account,
  value: 0n,
  data: '0xaaaa0001',
  sender: 'account',
  block: BLOCK
})

/** The setup commit at the manager, sent by the account. */
export const COMMIT: PreparedCall = {
  kind: 'call',
  target: DESCRIPTOR.manager,
  value: 0n,
  data: '0xbbbb0002',
  sender: 'account',
  block: BLOCK
}

/** What the client prepares: the commit alone where the account already authorized the action, else both. */
export const preparedOf = (account: Address, authorized: boolean): PreparedCall | PreparedBatch =>
  authorized
    ? COMMIT
    : { kind: 'batch', calls: [armingCallOf(account), COMMIT], atomic: true, block: BLOCK }

export const confirmation = (landed: boolean, isAuthorized: boolean): SetupConfirmation => ({
  landed,
  nonce: 1n,
  setupCommitment: zeroHash,
  isAuthorized
})

export const codedError = (code: string): Error => Object.assign(new Error(code), { code })

/** ethers' error from `wait()` on a transaction the chain mined and reverted. */
export const minedAndReverted = (hash: Hex = TX_HASH): Error =>
  Object.assign(new Error('transaction execution reverted'), {
    code: 'CALL_EXCEPTION',
    receipt: { hash, status: 0, blockNumber: START_BLOCK + 1, gasUsed: 51_234n },
    transaction: { hash }
  })

/** ethers' `TRANSACTION_REPLACED`: another transaction took the save's place before it ran. */
export const replacedTransaction = (): Error =>
  Object.assign(new Error('transaction was replaced'), {
    code: 'TRANSACTION_REPLACED',
    reason: 'replaced',
    cancelled: true,
    hash: TX_HASH,
    replacement: { hash: SECOND_HASH },
    receipt: { hash: SECOND_HASH, status: 1, blockNumber: START_BLOCK + 2 }
  })

export const landedReceipt = (hash: Hex = TX_HASH): ProviderTransactionReceipt =>
  ({ hash, status: 1, blockNumber: START_BLOCK + 1 } as unknown as ProviderTransactionReceipt)

// ---------------------------------------------------------------------------
// The script of one save
// ---------------------------------------------------------------------------

export const GAS_CASES = ['enough', 'deposit', 'read-fails'] as const
export const RECEIPT_CASES = ['landed', 'reverted', 'replaced'] as const
export const CONFIRM_CASES = [
  'agreed',
  'unauthorized',
  'never-landed',
  'not-landed-then-agreed',
  'agreed-on-last-read',
  'mismatch',
  'throws',
  'no-answer'
] as const
export const SEND_CASES = ['sent', ...SEND_REFUSAL_REASONS] as const
export const SETUP_CASES = ['none', 'set-up', 'throws'] as const

export type GasCase = typeof GAS_CASES[number]
export type ReceiptCase = typeof RECEIPT_CASES[number]
export type ConfirmCase = typeof CONFIRM_CASES[number]
export type SendCase = 'sent' | SendRefusalReason
/** What the setup read at the start of a run answers: no setup, a setup, or a throw. */
export type SetupCase = typeof SETUP_CASES[number]

/** How each edge of one save answers. */
export interface SaveScript {
  /** Whether the account already authorized the action, so the client prepares the commit alone. */
  authorized: boolean
  /** Whether the account has code on the chain. */
  deployed: boolean
  /** What the setup read answers; no setup where left out. */
  setup?: SetupCase
  /** Whether the prepare answers or refuses. */
  prepare: 'answers' | 'refuses'
  gas: GasCase
  send: SendCase
  /** The sign screen's estimation the port reports before it answers, where it reports one. */
  estimation?: FeeReading
  receipt: ReceiptCase
  confirm: ConfirmCase
  backup?: SetupDraft['privacy']['backup']
  publicMetadata?: Hex
  password?: string
}

export const HAPPY: Omit<SaveScript, 'authorized' | 'deployed'> = {
  prepare: 'answers',
  gas: 'enough',
  send: 'sent',
  receipt: 'landed',
  confirm: 'agreed'
}

/** The confirmation reads each case answers, read after read; the last repeats. */
const confirmAnswers = (confirm: ConfirmCase): (() => Promise<SetupConfirmation>)[] => {
  switch (confirm) {
    case 'agreed':
      return [async () => confirmation(true, true)]
    case 'unauthorized':
      return [async () => confirmation(true, false)]
    case 'never-landed':
      return [async () => confirmation(false, true)]
    case 'not-landed-then-agreed':
      return [async () => confirmation(false, true), async () => confirmation(true, true)]
    case 'agreed-on-last-read':
      return [
        ...Array.from(
          { length: CONFIRM_REREAD_BLOCKS },
          () => async () => confirmation(false, true)
        ),
        async () => confirmation(true, true)
      ]
    case 'mismatch':
      return [
        async () => {
          throw codedError('confirm.commitment-mismatch')
        }
      ]
    case 'throws':
      return [
        async () => {
          throw new Error('the node did not answer')
        }
      ]
    default:
      return [() => new Promise<SetupConfirmation>(() => {})]
  }
}

/** Whether the script's check, read again while it does not find the setup, agrees. */
export const confirmAgrees = (confirm: ConfirmCase): boolean =>
  confirm === 'agreed' || confirm === 'not-landed-then-agreed' || confirm === 'agreed-on-last-read'

/** How many times the script's check is read where the batch landed: every read up to the deciding one. */
export const confirmReadsOf = (confirm: ConfirmCase): number => {
  switch (confirm) {
    case 'never-landed':
    case 'agreed-on-last-read':
      return 1 + CONFIRM_REREAD_BLOCKS
    case 'not-landed-then-agreed':
      return 2
    default:
      return 1
  }
}

export type MockChainReads = ChainReads & {
  nativeBalance: jest.Mock
  estimateGas: jest.Mock
  gasPrice: jest.Mock
}

export const chainReadsFor = (gas: GasCase): MockChainReads => ({
  nativeBalance: jest.fn(async () => {
    if (gas === 'read-fails') {
      throw providerReadFailure('nativeBalance', new Error('node down'))
    }
    return gas === 'deposit' ? 0n : 10n ** 18n
  }),
  estimateGas: jest.fn(async () => 300_000n),
  gasPrice: jest.fn(async () => 2n * GWEI)
})

/** One fee option of the sign screen, paid by `KEY` in the chain's native token. */
export const feeOption = (available: boolean): FeeOption => ({
  paidBy: KEY.addr,
  token: { address: zeroAddress, symbol: 'ETH', decimals: 18 },
  balance: available ? 10n ** 18n : 0n,
  amount: 10n ** 15n,
  available,
  selected: true
})

/** The sign screen's estimation as the port reports it: its options and, where it has one, its error. */
export const feeReading = ({
  available = true,
  error = false
}: { available?: boolean; error?: boolean } = {}): FeeReading => ({
  options: [feeOption(available)],
  ...(error
    ? { error: { title: 'Insufficient funds to cover the fee', code: 'insufficient-funds' } }
    : {})
})

/** An error of the node while it waits for a receipt: it names no receipt and no replacement. */
export const nodeError = (): Error =>
  Object.assign(new Error('could not coalesce error'), { code: 'UNKNOWN_ERROR' })

export const sendPortFor = (send: SendCase, account: Address, estimation?: FeeReading) => {
  const sendAccountBatch = jest.fn(
    async (
      _account: Address,
      _calls: readonly PreparedCall[],
      onEstimation?: EstimationListener
    ): Promise<Hex> => {
      if (estimation && onEstimation) {
        onEstimation(estimation)
      }
      if (send !== 'sent') {
        throw accountBatchRefusal(send, account)
      }
      return TX_HASH
    }
  )
  const port: SendPort & { send: jest.Mock; sendAccountBatch: jest.Mock } = {
    send: jest.fn(async () => {
      throw new Error('the save never sends from a key alone')
    }),
    sendAccountBatch
  }
  return port
}

export const receiptsFor = (
  receipt: ReceiptCase
): ReceiptReads & { blockNumber: jest.Mock; wait: jest.Mock; transactionKnown: jest.Mock } => ({
  blockNumber: jest.fn(async () => START_BLOCK),
  transactionKnown: jest.fn(async () => 'known' as const),
  wait: jest.fn(async (hash: Hex) => {
    if (receipt === 'reverted') {
      throw minedAndReverted(hash)
    }
    if (receipt === 'replaced') {
      throw replacedTransaction()
    }
    return landedReceipt(hash)
  })
})

export const setupStateOf = (hasSetup: boolean): SetupState => ({
  isAuthorized: hasSetup,
  hasSetup,
  setupCommitment: zeroHash,
  setupNonce: 0n,
  setupCommittedAtBlock: 0,
  attemptActive: false,
  block: { number: 1, timestamp: 1, hash: zeroHash }
})

/** One save wired over its real steps, with every edge a recording fake. */
export interface WiredSave {
  steps: SaveSteps
  facts: ListedAccountFacts
  account: Address
  draft: SetupDraft
  prepared: PreparedCall | PreparedBatch
  setupState: jest.Mock
  prepareCommitSetup: jest.Mock
  confirmSetup: jest.Mock
  reads: MockChainReads
  port: ReturnType<typeof sendPortFor>
  receipts: ReturnType<typeof receiptsFor>
  /** The records' after-save removal, which also takes the stored save in flight. */
  saveSetup: jest.Mock
  writeDraftAndPath: jest.Mock
  /** The save in flight stored for the account, over the save's own storage. */
  inFlight: SaveInFlightAccessor
  requests: RequestsFake
  storage: MemoryStorage
}

/** A page over a save's storage: its wiring, its store, and its arrival. */
export interface Page {
  wired: WiredSave
  store: ArmStore
  arrive: () => Promise<void>
}

export type MemoryStorage = RecordStorage & { raw: Map<string, string> }

/** What a save is wired over beside its script: the device's storage and the wallet's queue and activity. */
export interface WireOptions {
  /** One storage for several saves stands for one device with several pages. */
  storage?: MemoryStorage
  requests?: RequestsFake
}

/**
 * The wallet's queue and the account's activity as another page reads them:
 * the queue holds the ids in `queued`; the activity answers each page asked
 * with the operations in `activity`, on one page, or never where it is null.
 */
export interface RequestsFake extends SendRequestPort {
  dispatch: jest.Mock
  queued: string[]
  activity: SubmittedOperation[] | null
  /** Pushes the queue as it stands now, as the background pushes a change of it. */
  pushQueue(): void
}

/** Starts work the test does not wait for; where it ends shows in the state the test reads. */
export const unawaited = (work: Promise<unknown>): void => {
  work.catch(() => undefined)
}

/** The ways an operation the wallet submitted carries the save's request. */
export interface OperationFacts {
  hash?: Hex
  status?: AccountOpStatus
  /** Another party's operation, which the wallet cannot follow. */
  untracked?: boolean
}

/** The operation the activity lists for the request `requestId`. */
export const operationFor = (
  requestId: string,
  {
    hash,
    status = AccountOpStatus.BroadcastedButNotConfirmed,
    untracked = false
  }: OperationFacts = {}
): SubmittedOperation => ({
  status,
  identifiedBy: { type: untracked ? 'UserOperation' : 'Transaction' },
  ...(hash ? { txnId: hash } : {}),
  calls: [{ fromUserRequestId: requestId }]
})

/** A request of the wallet's queue under `id`; the reads of the save look at its id only. */
const queuedRequestOf = (id: string): SignUserRequest => ({
  id,
  action: { kind: 'calls', calls: [] },
  session: new Session(),
  meta: { isSignAction: true, accountAddr: zeroAddress, chainId: BigInt(CHAIN_ID) }
})

export const requestsFake = (): RequestsFake => {
  const listeners = new Set<(update: SendRequestUpdate) => void>()
  const push = (update: SendRequestUpdate) => listeners.forEach((listener) => listener(update))
  const fake: RequestsFake = {
    queued: [],
    activity: [],
    dispatch: jest.fn((action: SendRequestAction) => {
      if (action.type !== 'MAIN_CONTROLLER_ACTIVITY_SET_ACC_OPS_FILTERS') {
        return
      }
      const items = fake.activity
      if (items === null) {
        return
      }
      const { sessionId, pagination } = action.params
      unawaited(
        Promise.resolve().then(() =>
          push({
            controller: 'activity',
            state: {
              accountsOps: {
                [String(sessionId)]: {
                  result: { items, currentPage: pagination?.fromPage ?? 0, maxPages: 1 }
                }
              }
            }
          })
        )
      )
    }),
    subscribe(listener) {
      listeners.add(listener)
      return () => {
        listeners.delete(listener)
      }
    },
    accounts: () => [],
    queue: () => ({ userRequests: fake.queued.map(queuedRequestOf) }),
    windowId: () => undefined,
    pushQueue: () =>
      push({ controller: 'requests', state: { userRequests: fake.queued.map(queuedRequestOf) } })
  }
  return fake
}

/** The extension's storage helper in memory, with the raw entries a test reads. */
export const memoryStorage = (): MemoryStorage => {
  const raw = new Map<string, string>()
  return {
    raw,
    get: async (key, defaultValue) => {
      const stored = key && raw.get(key)
      return stored ? parse(stored) : defaultValue
    },
    set: async (key, value) => {
      raw.set(key, typeof value === 'string' ? value : stringify(value))
      return null
    },
    remove: async (key) => {
      raw.delete(key)
      return null
    },
    setEntries: async (entries) => {
      Object.entries(entries).forEach(([key, value]) => raw.set(key, stringify(value)))
    },
    removeKeys: async (keys) => {
      keys.forEach((key) => raw.delete(key))
    }
  }
}

export const wireSave = (
  account: Account,
  script: SaveScript,
  { storage = memoryStorage(), requests = requestsFake() }: WireOptions = {}
): WiredSave => {
  const address = account.addr as Address
  const facts = factsOf(account, { deployed: script.deployed })
  const draft = draftOf(script.backup, script.publicMetadata)
  const prepared = preparedOf(address, script.authorized)
  const prepareCommitSetup = jest.fn(async () => {
    if (script.prepare === 'refuses') {
      throw codedError('setup.password-missing')
    }
    return prepared
  })
  const answers = confirmAnswers(script.confirm)
  let reads = 0
  const confirmSetup = jest.fn(() => {
    const answer = answers[Math.min(reads, answers.length - 1)]
    reads += 1
    return answer()
  })
  const setupState = jest.fn(async () => {
    if (script.setup === 'throws') {
      throw new Error('the node did not answer the setup read')
    }
    return setupStateOf(script.setup === 'set-up')
  })
  const client: ArmKitClient = {
    descriptor: DESCRIPTOR,
    setup: { setupState, prepareCommitSetup, confirmSetup }
  }
  const chainReads = chainReadsFor(script.gas)
  const port = sendPortFor(script.send, address, script.estimation)
  const receipts = receiptsFor(script.receipt)
  const writeDraftAndPath = jest.fn(async () => ({ draft, path: null }))
  const records = createWalletRecords({ storage })
  const saveSetup = jest.fn((chainId: ChainId, owner: Address) => records.saveSetup(chainId, owner))
  const { saveInFlight } = records
  const steps = saveStepsOf({
    client,
    reads: chainReads,
    receipts,
    port,
    requests,
    records: { saveSetup, saveInFlight },
    setup: { writeDraftAndPath } as never,
    chainId: CHAIN_ID,
    account: address,
    facts,
    key: KEY,
    draft,
    password: script.password ?? PASSWORD
  })
  return {
    steps,
    facts,
    account: address,
    draft,
    prepared,
    setupState,
    prepareCommitSetup,
    confirmSetup,
    reads: chainReads,
    port,
    receipts,
    saveSetup,
    writeDraftAndPath,
    inFlight: saveInFlight(CHAIN_ID, address),
    requests,
    storage
  }
}

/** A promise that never settles: the edge that answers it never does, or its page went away. */
export const pending = <T>(): Promise<T> => new Promise<T>(() => {})

/**
 * One way a run ends and what it leaves of the stored save in flight: still
 * there, claimed and gone (released, or removed with the setup records), or
 * never claimed.
 */
export interface Ending {
  named: string
  overrides: Partial<SaveScript>
  record: 'kept' | 'gone' | 'absent'
  arrange?: (wired: WiredSave) => void
}

export const ENDINGS: Ending[] = [
  ...SEND_REFUSAL_REASONS.filter((send) => send !== 'not-a-transaction').map(
    (send): Ending => ({
      named: `a refusal of the port (${send})`,
      overrides: { send },
      record: 'gone'
    })
  ),
  {
    named: 'a refusal that may still land',
    overrides: { send: 'not-a-transaction' },
    record: 'kept'
  },
  { named: 'a replaced transaction', overrides: { receipt: 'replaced' }, record: 'gone' },
  { named: 'a reverted transaction', overrides: { receipt: 'reverted' }, record: 'gone' },
  ...(['unauthorized', 'mismatch', 'never-landed'] as const).map(
    (confirm): Ending => ({
      named: `a landed save whose check disagreed (${confirm})`,
      overrides: { confirm },
      record: 'gone'
    })
  ),
  { named: 'a landed save whose check agreed', overrides: {}, record: 'gone' },
  ...(['throws', 'no-answer'] as const).map(
    (confirm): Ending => ({
      named: `a landed save whose check did not answer (${confirm})`,
      overrides: { confirm },
      record: 'kept'
    })
  ),
  {
    named: 'a receipt wait past its limit',
    overrides: {},
    record: 'kept',
    arrange: (wired) => wired.receipts.wait.mockImplementation(() => pending())
  },
  {
    named: 'a receipt wait that failed twice',
    overrides: {},
    record: 'kept',
    arrange: (wired) => wired.receipts.wait.mockRejectedValue(nodeError())
  },
  {
    named: 'a sign window the page left open',
    overrides: {},
    record: 'kept',
    arrange: (wired) => wired.port.sendAccountBatch.mockImplementation(() => pending())
  },
  { named: 'a key short of gas', overrides: { gas: 'deposit' }, record: 'absent' },
  { named: 'a gas check that could not read', overrides: { gas: 'read-fails' }, record: 'absent' },
  { named: 'a refusal of the prepare', overrides: { prepare: 'refuses' }, record: 'absent' },
  { named: 'a setup already on the account', overrides: { setup: 'set-up' }, record: 'absent' }
]

/** How long a check that never answers is given before it reads as unanswered, in the tests. */
export const SHORT_TIMEOUT_MS = 15

/** Jest's fake clock as its runtime offers it, beyond the typings this repository carries. */
export interface AsyncFakeTimers {
  advanceTimersByTimeAsync(ms: number): Promise<void>
}

/** Advances Jest's fake clock by `ms`, running the promises each timer settles before the next timer. */
export const advanceTimers = (ms: number): Promise<void> =>
  (jest as unknown as AsyncFakeTimers).advanceTimersByTimeAsync(ms)

/** Runs one save to its end over a fresh store, as the screen starts it. */
export const runSave = async (
  steps: SaveSteps,
  store: ArmStore = createArmStore()
): Promise<ArmStore> => {
  await startSave(store, steps, { timeoutMs: SHORT_TIMEOUT_MS })
  return store
}

// ---------------------------------------------------------------------------
// The arrival
// ---------------------------------------------------------------------------

export const descriptionOf = (
  candidateKeys: SetupDescription['candidateKeys'] = [{ address: REMOVED_KEY, isAuthority: true }]
): SetupDescription => ({
  rule: null,
  wait: { seconds: 172800n, defaultSeconds: 172800n },
  failureDomains: null,
  parties: null,
  methodStanding: null,
  passkeyDomains: null,
  candidateKeys,
  removedKey: REMOVED_KEY,
  privacy: null,
  backup: null,
  reveals: null,
  cancel: null,
  upgrade: null,
  pause: null
})

/** The ways the review's gate answers, each from the reads or the records that raise it. */
export const GATE_CASES = [
  'passes',
  'unavailable',
  'removed-key-unreadable',
  'does-not-fit',
  'key-count',
  'several-keys',
  'already-set-up',
  'empty-slot',
  'password-not-set'
] as const
export type GateCase = typeof GATE_CASES[number]

export const FACTS_CASES = [
  'loading',
  'not-listed',
  'no-network',
  'state-unread',
  'view-only',
  'ready'
] as const
export type FactsCase = typeof FACTS_CASES[number]

export const CLIENT_CASES: readonly ArmClientStatus[] = [
  'loading',
  'ready',
  'update-the-wallet',
  'failed'
]

const ANSWERED_READS: AccountReads = {
  removedKey: { status: 'answered', value: { kind: 'named', key: REMOVED_KEY } },
  fitCheck: { status: 'answered', value: { basis: 'deployed-code', fits: true } },
  setupState: { status: 'answered', value: setupStateOf(false) },
  description: { status: 'answered', value: descriptionOf() }
}

const trustRows = (answered: boolean) =>
  trustRowsOf({
    clauses: PATH,
    enrollments: [],
    reads: {
      [BOOK.methods.passkey.toLowerCase()]: {
        trustedParties: {
          answered: true,
          value: {
            admin: zeroAddress,
            pendingAdmin: zeroAddress,
            trustedKeys: [],
            pauseHolder: zeroAddress,
            pendingPauseHolder: zeroAddress
          }
        },
        moduleInfo: {
          answered: true,
          value: { name: 'method', version: '1.0.0', supportsInterface: true }
        },
        paused: answered ? { answered: true, value: false } : { answered: false }
      }
    },
    shippedMethods: DESCRIPTOR.shippedMethods,
    addressBook: BOOK
  })

/** The reads and records each gate case stands for. */
const gateInputOf = (gate: GateCase) => {
  const reads: AccountReads = { ...ANSWERED_READS }
  let clauses: Clause[] = PATH
  let passwordSet = true
  let rows = trustRows(true)
  switch (gate) {
    case 'unavailable':
      rows = trustRows(false)
      break
    case 'removed-key-unreadable':
      reads.removedKey = {
        status: 'answered',
        value: { kind: 'unavailable', cause: 'no-creation-record' }
      }
      break
    case 'does-not-fit':
      reads.fitCheck = { status: 'answered', value: { basis: 'deployed-code', fits: false } }
      break
    case 'key-count':
      reads.description = {
        status: 'answered',
        value: descriptionOf([
          { address: REMOVED_KEY, isAuthority: true },
          { address: KEY.addr, isAuthority: true }
        ])
      }
      break
    case 'several-keys':
      reads.removedKey = {
        status: 'answered',
        value: { kind: 'unavailable', cause: 'several-key-entries' }
      }
      break
    case 'already-set-up':
      reads.setupState = { status: 'answered', value: setupStateOf(true) }
      break
    case 'empty-slot':
      clauses = [{ threshold: 1, credentials: [emptySlot('passkey')] }]
      break
    case 'password-not-set':
      passwordSet = false
      break
    default:
      break
  }
  return { reads, clauses, passwordSet, rows }
}

/** The review's gate as the save runs it again, over the reads and records of a case. */
export const gateFor = (gate: GateCase, clientReady = true): SaveGate => {
  const { reads, clauses, passwordSet, rows } = gateInputOf(gate)
  return saveGateOf({
    recordsLoaded: true,
    clientReady,
    trustRows: rows,
    untested: false,
    clauses,
    backup: 'encrypted',
    passwordSet,
    ...reads
  })
}

export const factsReadingFor = (facts: FactsCase, account: Account): AccountFactsReading => {
  switch (facts) {
    case 'loading':
      return { status: 'loading' }
    case 'not-listed':
    case 'no-network':
    case 'state-unread':
      return { status: 'unavailable', cause: facts }
    case 'view-only':
      return { status: 'ready', facts: factsOf(account, { key: null }) }
    default:
      return { status: 'ready', facts: factsOf(account) }
  }
}

export const loadedOf = (draft: SetupDraft): ArmLoad => ({
  status: 'loaded',
  draft,
  enrollments: [],
  passwordSet: true
})

export interface ArrivalCase {
  gate: GateCase
  facts: FactsCase
  client: ArmClientStatus
  passwordHeld: boolean
}

/** The read of a stored save in flight as the arrival takes it: not started, reading, none, or failed. */
export const IN_FLIGHT_CASES = [undefined, 'reading', 'none', 'failed'] as const
export type InFlightCase = typeof IN_FLIGHT_CASES[number]

export const arrivalFor = (
  input: ArrivalCase,
  account: Account,
  { inFlight }: { inFlight: InFlightCase } = { inFlight: 'none' }
): Arrival =>
  arrivalOf({
    facts: factsReadingFor(input.facts, account),
    client: input.client,
    load: loadedOf(draftOf('encrypted')),
    gate: gateFor(input.gate, input.client === 'ready'),
    setupState: { status: 'answered', value: setupStateOf(input.gate === 'already-set-up') },
    passwordHeld: input.passwordHeld,
    inFlight
  })

/** Whether the holder starts the save a second time, and what the setup read answers then. */
export const RETRIES = ['none', 'no-setup', 'set-up'] as const
export type Retry = typeof RETRIES[number]

/** One row of the combination table: how the save arrives, how its run answers, and its second start. */
export interface Row {
  arrival: ArrivalCase
  script: SaveScript
  retry: Retry
}

// ---------------------------------------------------------------------------
// The reducer's walk
// ---------------------------------------------------------------------------

/** A state the walk reached, the runs its history landed and agreed, and one path to it. */
export interface Node {
  state: ArmState
  landed: readonly number[]
  agreed: readonly number[]
  path: readonly ArmEvent[]
}

export interface Walk {
  nodes: Node[]
  /** Each step from a reached node: the node, the event and the state it led to. */
  steps: { from: Node; event: ArmEvent; to: Node }[]
}

// ---------------------------------------------------------------------------
// The screen
// ---------------------------------------------------------------------------

/** How the chain and the client answer in one test of the mounted screen. */
export interface Chain {
  removedKey: RemovedKeyReading
  fitCheck: FitCheckReading
  setupState: SetupState
  paused: { answered: true; value: boolean } | { answered: false }
  confirm: SetupConfirmation | Error
  send: 'sent' | 'refused' | 'not-a-transaction' | 'other-request-pending'
  estimation?: FeeReading
}

/** Every combination of the given dimensions, in order. */
export const crossProduct = <T extends Record<string, readonly unknown[]>>(
  dimensions: T
): { [K in keyof T]: T[K][number] }[] =>
  Object.entries(dimensions).reduce<Record<string, unknown>[]>(
    (rows, [name, values]) =>
      rows.flatMap((row) => values.map((value) => ({ ...row, [name]: value }))),
    [{}]
  ) as { [K in keyof T]: T[K][number] }[]

// Jest runs every file under __tests__, this one included; its own check runs
// only when Jest runs this file, never from a file that imports the harness.
if (expect.getState().testPath === __filename) {
  describe('harness', () => {
    it('crosses every value of every dimension once', () => {
      const rows = crossProduct({ a: [1, 2], b: ['x', 'y', 'z'] })
      expect(rows).toHaveLength(6)
      expect(new Set(rows.map(({ a, b }) => `${a}${b}`)).size).toBe(6)
    })

    it('raises each gate block from the reads or records it names', () => {
      expect(gateFor('passes')).toEqual({ canSave: true, blocked: null, notTested: false })
      const kinds = GATE_CASES.filter((gate) => gate !== 'passes').map(
        (gate) => gateFor(gate).blocked?.kind
      )
      expect(kinds).toEqual([
        'unavailable',
        'removed-key-unreadable',
        'cannot-recover',
        'cannot-recover',
        'cannot-recover',
        'already-set-up',
        'empty-slot',
        'password-missing'
      ])
    })

    it('runs a scripted save to the saved state over the real steps', async () => {
      const account = await smartAccount()
      const wired = wireSave(account, { ...HAPPY, authorized: false, deployed: true })
      const store = await runSave(wired.steps)
      expect(isSaved(store.state())).toBe(true)
      expect(wired.port.sendAccountBatch).toHaveBeenCalledTimes(1)
    })
  })
}
