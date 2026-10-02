/**
 * The client module's exports, the mocks and the helpers the client tests share.
 *
 * - The extension's own provider is mocked as an `ethers`-shaped object of
 *   `jest.fn` members, its typed reads and its JSON-RPC `send`, answering from
 *   a `ScriptedChain`. No test reaches a network.
 * - The background is a fake request queue behind the `SignRequestPort`: a
 *   `jest.fn` dispatch, a window id, the accounts the wallet lists, and a
 *   `push` a test drives by hand with the `requests` and `signMessage`
 *   controller states the real background would push, so a test can put a
 *   foreign message between the facade's request and its result. No keystore,
 *   no action window and no background runs.
 * - The send port's background is the same kind of fake behind the
 *   `SendRequestPort`: a test pushes the `requests` state, with the action
 *   window open or closed, and the `activity` state listing the operation the
 *   wallet broadcast, and the `signAccountOp` state of the sign screen's
 *   estimation, as the real background would push them.
 * - The receipt wait runs on the extension's own provider for a plain
 *   JSON-RPC network, whose `send` answers the transactions, receipts, blocks
 *   and nonces a test scripts, as a node's JSON (`scriptedNode`), so ethers'
 *   own wait decides the receipt, the revert and the replacement.
 * - The stand-in's scripted chain (`sdkStandIn.chainFor`) is reset before each
 *   world, so one test's domain script never leaks into the next.
 * - The ceremony tab's resolver reads the wallet's records over an in-memory
 *   storage and a client of the approving side alone, built by a `jest.fn`.
 */
import { AbiCoder, id, toBeHex, toQuantity, Wallet } from 'ethers'

import type { Network } from '@ambire-common/interfaces/network'
import { AccountOpStatus } from '@ambire-common/libs/accountOp/types'

import {
  addressOf,
  MethodsOrchestratorDouble,
  PolicyManagerDouble,
  ProviderDouble,
  RecoveryActionDouble,
  RecoveryClientDouble,
  RecoveryKitBuilderDouble,
  ScriptedChain,
  SetupClientDouble
} from '@web/modules/social-recovery/sdk-doubles'
import type {
  Address,
  BlockTag,
  ClientConfiguration,
  DeploymentDescriptor,
  Hex,
  IProvider,
  IRecoveryMethod,
  PreparedCall
} from '@web/modules/social-recovery/sdk-interfaces'
import {
  addressBookOf,
  CHAIN_IDS,
  createProviderAdapter,
  createSendPort,
  createSignerFacade,
  deploymentDescriptor,
  descriptorOf,
  extensionProviderFor,
  WALLET_RECOVERY_CHAIN,
  type ApprovingClient,
  type ExtensionProvider,
  type KeyHandle,
  type ListedAccount,
  type MainStatusState,
  type RecoveryChain,
  type RecoveryClientConfiguration,
  type SendPort,
  type SendPortOptions,
  type SendRefusal,
  type SendRefusalReason,
  type SendRequestPort,
  type SendRequestUpdate,
  type SignerFacade,
  type SignAccountOpState,
  type SignerFacadeOptions,
  type SignRequestAction,
  type SignRequestPort,
  type SignRequestUpdate,
  type SubmittedOperation
} from '@web/modules/social-recovery/shared/client'
// The stand-in is not part of the barrel a screen imports; tests reach it by path.
import { sdkStandIn } from '@web/modules/social-recovery/shared/client/stand-in'
import {
  createWalletRecords,
  type RecordStorage
} from '@web/modules/social-recovery/shared/records'

export * from '@web/modules/social-recovery/shared/client'
export { sdkStandIn }

export const SEPOLIA = 11155111
export const MAINNET = 1

/** The members an SDK client configuration may carry. */
export const CLIENT_CONFIGURATION_KEYS: (keyof ClientConfiguration)[] = [
  'tokens',
  'candidateKeys',
  'creation',
  'accountImplementation',
  'blockTags',
  'logChunkWidth',
  'simulate',
  'defaultWait',
  'shortWaitBelow',
  'maximumWait',
  'requestWindow',
  'cancelWindow',
  'ruleCostBound'
]

/** Whether a member name hands a signer, a key or storage to the SDK side. */
export const namesSignerOrStorage = (name: string): boolean =>
  /signer|storage|keystore|seed|privatekey|mnemonic/i.test(name) || /^sign([A-Z]|$)/.test(name)

const SELECTOR = {
  eip712Domain: id('eip712Domain()').slice(0, 10),
  name: id('name()').slice(0, 10),
  version: id('version()').slice(0, 10)
}

const coder = AbiCoder.defaultAbiCoder()

/** What the manager's `eip712Domain()` answers, ABI-encoded from the chain's scripted domain. */
export const encodedDomain = (chain: ScriptedChain): Hex => {
  const d = chain.manager.domain
  return coder.encode(
    ['bytes1', 'string', 'string', 'uint256', 'address', 'bytes32', 'uint256[]'],
    [d.fields, d.name, d.version, d.chainId, d.verifyingContract, d.salt, d.extensions]
  ) as Hex
}

const tagOf = (tag: unknown): BlockTag =>
  typeof tag === 'string' && tag.startsWith('0x') ? Number(tag) : (tag as BlockTag)

/** The balance, estimate and price the mock node answers. */
export const NODE_ANSWERS = { balance: 10n ** 18n, gas: 21_000n, gasPrice: 7n * 10n ** 9n }

export interface EthersMock {
  getNetwork: jest.Mock
  call: jest.Mock
  getLogs: jest.Mock
  getBlock: jest.Mock
  getBalance: jest.Mock
  estimateGas: jest.Mock
  send: jest.Mock
  getCode: jest.Mock
  destroy: jest.Mock
  /** The chain id this provider answers; defaults to the chain's descriptor. */
  answeredChainId: number
}

const READ_MEMBERS = [
  'getNetwork',
  'call',
  'getLogs',
  'getBlock',
  'getBalance',
  'estimateGas',
  'send'
] as const

/** The underlying reads the client made on the mock, in order, as `[member, args]`. */
export const underlyingCalls = (mock: EthersMock): [string, unknown[]][] =>
  READ_MEMBERS.flatMap((member) =>
    mock[member].mock.calls.map((args) => [member, args] as [string, unknown[]])
  )

/** An ethers-shaped provider whose reads answer from `chain`. */
export const ethersOver = (chain: ScriptedChain): EthersMock => {
  const mock = {} as EthersMock
  mock.answeredChainId = chain.descriptor.chainId
  const ethCall = (tx: { to?: string; data?: string }): Hex => {
    const to = (tx.to ?? '').toLowerCase()
    const data = (tx.data ?? '').toLowerCase()
    if (to === chain.descriptor.manager.toLowerCase()) {
      if (data.startsWith(SELECTOR.eip712Domain)) return encodedDomain(chain)
      if (data.startsWith(SELECTOR.name)) {
        return coder.encode(['string'], [chain.manager.name]) as Hex
      }
      if (data.startsWith(SELECTOR.version)) {
        return coder.encode(['string'], [chain.manager.version]) as Hex
      }
    }
    const scripted = chain.calls.get(`${to}:${data}`)
    if (scripted && 'result' in scripted) return scripted.result
    return '0x'
  }
  const blockOf = (tag: unknown) => {
    const b = chain.blockAt(tagOf(tag))
    return { number: b.number, timestamp: b.timestamp, hash: b.hash }
  }
  mock.getNetwork = jest.fn(async () => ({ chainId: BigInt(mock.answeredChainId), name: 'mock' }))
  mock.call = jest.fn(async (tx: { to?: string; data?: string }) => ethCall(tx))
  mock.getLogs = jest.fn(async () => [])
  mock.getBlock = jest.fn(async (tag: unknown) => blockOf(tag))
  mock.getBalance = jest.fn(async () => NODE_ANSWERS.balance)
  mock.estimateGas = jest.fn(async () => NODE_ANSWERS.gas)
  mock.getCode = jest.fn(async () => '0x')
  mock.destroy = jest.fn()
  mock.send = jest.fn(async (method: string, params: unknown[]) => {
    switch (method) {
      case 'eth_chainId':
        return toBeHex(mock.answeredChainId)
      case 'eth_call':
        return ethCall(params[0] as { to?: string; data?: string })
      case 'eth_getLogs':
        return []
      case 'eth_getBlockByNumber': {
        const b = blockOf(params[0])
        return { number: toBeHex(b.number), timestamp: toBeHex(b.timestamp), hash: b.hash }
      }
      case 'eth_getBalance':
        return toBeHex(NODE_ANSWERS.balance)
      case 'eth_estimateGas':
        return toBeHex(NODE_ANSWERS.gas)
      case 'eth_gasPrice':
        return toBeHex(NODE_ANSWERS.gasPrice)
      default:
        throw new Error(`The ethers mock does not answer ${method}.`)
    }
  })
  return mock
}

/** Every underlying member rejects with `error`, whichever route the client takes. */
export const failEverything = (mock: EthersMock, error: unknown): void => {
  READ_MEMBERS.forEach((m) =>
    mock[m].mockImplementation(async () => {
      throw error
    })
  )
}

/** An ethers v6 call exception carrying the raw revert data. */
export const callException = (data: Hex): Error & { code: string; data: Hex } => {
  const error = new Error('execution reverted') as Error & { code: string; data: Hex }
  error.code = 'CALL_EXCEPTION'
  error.data = data
  return error
}

/** The node's own JSON-RPC revert error, as a provider that bypasses ethers throws it. */
export const nodeRevert = (data: Hex) => ({ code: 3, message: 'execution reverted', data })

/** The adapter over a mocked extension provider. */
export const adapterOver = (ethers: EthersMock): IProvider => createProviderAdapter(ethers)

const PREPARE = /^prepare|^armingCall$|^disarmingCall$/

const prepareMembersOf = (proto: object): string[] =>
  Object.getOwnPropertyNames(proto).filter((n) => PREPARE.test(n))

/** Spies on every prepare member of every double the client could reach. */
export const spyOnPrepares = (): jest.SpyInstance[] =>
  [
    RecoveryClientDouble.prototype,
    SetupClientDouble.prototype,
    PolicyManagerDouble.prototype,
    RecoveryActionDouble.prototype
  ].flatMap((proto) =>
    prepareMembersOf(proto).map((name) =>
      jest.spyOn(proto as unknown as Record<string, () => unknown>, name)
    )
  )

export interface BuilderSpies {
  provider: jest.SpyInstance
  descriptor: jest.SpyInstance
  account: jest.SpyInstance
  action: jest.SpyInstance
  config: jest.SpyInstance
  policyManager: jest.SpyInstance
  eventManager: jest.SpyInstance
  method: jest.SpyInstance
  codec: jest.SpyInstance
  buildSetupClient: jest.SpyInstance
  buildRecoveryClient: jest.SpyInstance
  recoveryAction: jest.SpyInstance
  methodModuleReads: jest.SpyInstance
}

export const spyOnBuilder = (): BuilderSpies => {
  const proto = RecoveryKitBuilderDouble.prototype
  return {
    provider: jest.spyOn(proto, 'provider'),
    descriptor: jest.spyOn(proto, 'descriptor'),
    account: jest.spyOn(proto, 'account'),
    action: jest.spyOn(proto, 'action'),
    config: jest.spyOn(proto, 'config'),
    policyManager: jest.spyOn(proto, 'policyManager'),
    eventManager: jest.spyOn(proto, 'eventManager'),
    method: jest.spyOn(proto, 'method'),
    codec: jest.spyOn(proto, 'codec'),
    buildSetupClient: jest.spyOn(proto, 'buildSetupClient'),
    buildRecoveryClient: jest.spyOn(proto, 'buildRecoveryClient'),
    recoveryAction: jest.spyOn(proto, 'recoveryAction'),
    methodModuleReads: jest.spyOn(proto, 'methodModuleReads')
  }
}

/** The value a setter received last, the one the builder builds with. */
export const lastArg = (spy: jest.SpyInstance, index = 0): unknown => {
  const { calls } = spy.mock
  return calls.length ? calls[calls.length - 1][index] : undefined
}

export const providerDoubleReads = (): jest.SpyInstance[] =>
  (['chainId', 'call', 'logs', 'block'] as const).map((m) =>
    jest.spyOn(ProviderDouble.prototype, m)
  )

/** The prototype chain of a value, itself first, stopping before Object's and Function's. */
const chainOf = (value: object): object[] => {
  const chain: object[] = []
  let proto: object | null = value
  while (proto && proto !== Object.prototype && proto !== Function.prototype) {
    chain.push(proto)
    proto = Object.getPrototypeOf(proto)
  }
  return chain
}

/** Every function-valued member of an object, own and inherited, but not Object's. */
export const functionMembersOf = (value: object): string[] => [
  ...new Set(
    chainOf(value).flatMap((proto) =>
      Object.getOwnPropertyNames(proto).filter((n) => {
        if (n === 'constructor') return false
        const descriptor = Object.getOwnPropertyDescriptor(proto, n)
        return !!descriptor && typeof descriptor.value === 'function'
      })
    )
  )
]

/** Every member name of an object, own and inherited, but not Object's. */
export const memberNamesOf = (value: object): string[] => [
  ...new Set(
    chainOf(value).flatMap((proto) =>
      Object.getOwnPropertyNames(proto).filter((n) => n !== 'constructor')
    )
  )
]

/**
 * The keys found under `value` down to `depth`, skipping the objects in `skip`
 * (the extension's own provider, which the adapter may hold).
 */
export const keysUnder = (value: unknown, depth: number, skip: unknown[] = []): string[] => {
  if (depth < 0 || value === null || typeof value !== 'object' || skip.includes(value)) return []
  return memberNamesOf(value as object).flatMap((k) => {
    let child: unknown
    try {
      child = (value as Record<string, unknown>)[k]
    } catch {
      child = undefined
    }
    return [k, ...keysUnder(child, depth - 1, skip)]
  })
}

/** Settles a promise into the value it threw, or undefined where it resolved. */
export const thrownBy = (run: Promise<unknown>): Promise<unknown> =>
  run.then(
    () => undefined,
    (e: unknown) => e
  )

export interface World {
  /** The stand-in's scripted chain record the client is built against. */
  chain: ScriptedChain
  /** The extension's own provider, mocked. */
  ethers: EthersMock
  /** The adapter over it, the configuration's provider. */
  adapter: IProvider
  /** The client configuration for the one chain the wallet reads. */
  config: RecoveryClientConfiguration
  descriptor: DeploymentDescriptor
  account: Address
}

/**
 * A world on the chain this build reads: the client's own address book and
 * descriptor, the stand-in's scripted chain for them (reset first), the
 * extension provider mocked over it and the adapter the configuration names.
 */
export const createWorld = (overrides: Partial<RecoveryClientConfiguration> = {}): World => {
  sdkStandIn.reset()
  const account = overrides.account ?? addressOf('account')
  const addressBook = overrides.addressBook ?? addressBookOf(WALLET_RECOVERY_CHAIN)
  const chainLabel = overrides.chain ?? WALLET_RECOVERY_CHAIN
  const descriptor = descriptorOf(chainLabel, addressBook)
  const chain = sdkStandIn.chainFor(descriptor, account)
  const ethers = ethersOver(chain)
  const adapter = createProviderAdapter(ethers)
  const config: RecoveryClientConfiguration = {
    chain: chainLabel,
    account,
    addressBook,
    provider: adapter,
    ...overrides
  }
  return { chain, ethers, adapter, config, descriptor, account }
}

/** A basic account the wallet lists: an EOA whose only associated key is its own address. */
export const basicAccount = (addr: Address): ListedAccount => ({
  addr,
  associatedKeys: [addr],
  creation: null
})

/** A smart account the wallet lists, controlled by `key`. */
export const smartAccount = (addr: Address, key: Address): ListedAccount => ({
  addr,
  associatedKeys: [key],
  creation: { factoryAddr: addressOf('factory'), bytecode: '0x00', salt: `0x${'00'.repeat(32)}` }
})

/** The window id the fake port answers, the popup the request opens beside. */
export const WINDOW_ID = 7

export interface QueueWorld {
  signer: SignerFacade
  dispatch: jest.Mock
  /** The accounts the wallet lists; a test may push more. */
  accounts: ListedAccount[]
  /** Pushes one controller state to every subscribed listener, as the background does. */
  push: (update: SignRequestUpdate) => void
  /** How many listeners are subscribed now. */
  listeners: () => number
}

/**
 * The facade over a fake request queue. Nothing answers on its own: a test
 * reads the request the facade added (`addedRequest`) and pushes the
 * `requests` and `signMessage` states the background would push.
 */
export const queueOver = (
  accounts: ListedAccount[] = [],
  options: Partial<SignerFacadeOptions> = {}
): QueueWorld => {
  const listeners = new Set<(update: SignRequestUpdate) => void>()
  const world = { accounts } as QueueWorld
  world.dispatch = jest.fn()
  world.push = (update) => [...listeners].forEach((l) => l(update))
  world.listeners = () => listeners.size
  const port: SignRequestPort = {
    dispatch: world.dispatch,
    subscribe(listener) {
      listeners.add(listener)
      return () => listeners.delete(listener)
    },
    accounts: () => world.accounts,
    windowId: () => WINDOW_ID
  }
  world.signer = createSignerFacade(port, { chainId: SEPOLIA, ...options })
  return world
}

/** Every action the dispatch received, in order. */
export const dispatched = <A extends { type: string } = SignRequestAction>(
  dispatch: jest.Mock
): A[] => dispatch.mock.calls.map((c) => c[0] as A)

/** The user request the facade added to the queue, the one `ADD_USER_REQUEST` carried. */
export const addedRequest = (dispatch: jest.Mock) => {
  const add = dispatched(dispatch).find((a) => a.type === 'REQUESTS_CONTROLLER_ADD_USER_REQUEST')
  if (!add || add.type !== 'REQUESTS_CONTROLLER_ADD_USER_REQUEST') {
    throw new Error('The facade added no request to the queue.')
  }
  return add.params
}

/** The `requests` state with the given request ids queued. */
export const queued = (...requestIds: (string | number)[]): SignRequestUpdate => ({
  controller: 'requests',
  state: {
    userRequests: requestIds.map((requestId) => ({ id: requestId })),
    userRequestsWaitingAccountSwitch: []
  }
})

/** The `requests` state with some request ids queued and others waiting for an account switch. */
export const listedIn = (
  queuedIds: (string | number)[],
  waitingIds: (string | number)[]
): SignRequestUpdate => ({
  controller: 'requests',
  state: {
    userRequests: queuedIds.map((requestId) => ({ id: requestId })),
    userRequestsWaitingAccountSwitch: waitingIds.map((requestId) => ({ id: requestId }))
  }
})

/** The `signMessage` state carrying a signed message for a request id. */
export const signedFor = (requestId: string | number, signature: unknown): SignRequestUpdate => ({
  controller: 'signMessage',
  state: { signedMessage: { fromActionId: requestId, signature } as never }
})

/** A promise's state after the pending microtasks ran: pending, resolved or rejected. */
export const track = <T>(promise: Promise<T>) => {
  const seen: { status: 'pending' | 'resolved' | 'rejected'; value?: unknown } = {
    status: 'pending'
  }
  promise.then(
    (value) => {
      seen.status = 'resolved'
      seen.value = value
    },
    (error) => {
      seen.status = 'rejected'
      seen.value = error
    }
  )
  return seen
}

/** Lets the pending promise callbacks run. */
export const flush = async (): Promise<void> => {
  for (let i = 0; i < 20; i++) {
    // eslint-disable-next-line no-await-in-loop
    await Promise.resolve()
  }
}

/** Moves the fake clock by `ms` and lets the promise callbacks it released run. */
export const advance = async (ms: number): Promise<void> => {
  jest.advanceTimersByTime(ms)
  await flush()
}

export interface SendWorld {
  sender: SendPort
  dispatch: jest.Mock
  /** The accounts the wallet lists; a test may push more. */
  accounts: ListedAccount[]
  /** Pushes one controller state to every subscribed listener, as the background does. */
  push: (update: SendRequestUpdate) => void
  /** How many listeners are subscribed now. */
  listeners: () => number
}

/**
 * The send port over a fake request queue and activity. Nothing answers on its
 * own: a test reads the request the port added (`addedRequest`) and pushes the
 * `requests` and `activity` states the background would push.
 */
export const sendQueueOver = (
  accounts: ListedAccount[] = [],
  options: Partial<SendPortOptions> = {}
): SendWorld => {
  const listeners = new Set<(update: SendRequestUpdate) => void>()
  const world = { accounts } as SendWorld
  world.dispatch = jest.fn()
  world.push = (update) => [...listeners].forEach((l) => l(update))
  world.listeners = () => listeners.size
  const port: SendRequestPort = {
    dispatch: world.dispatch,
    subscribe(listener) {
      listeners.add(listener)
      return () => listeners.delete(listener)
    },
    accounts: () => world.accounts,
    windowId: () => WINDOW_ID
  }
  world.sender = createSendPort(port, { chainId: SEPOLIA, ...options })
  return world
}

/** The id of the action window the queue opened, as its window props carry it. */
export const ACTION_WINDOW_ID = 42

/**
 * The `requests` state with the given request ids queued, and the action
 * window open, closed, or never opened (`none`).
 */
export const queuedWith = (
  window: 'open' | 'closed' | 'none',
  ...requestIds: (string | number)[]
): SendRequestUpdate => ({
  controller: 'requests',
  state: {
    userRequests: requestIds.map((requestId) => ({ id: requestId })),
    userRequestsWaitingAccountSwitch: [],
    ...(window === 'none'
      ? {}
      : {
          actions: {
            actionWindow: { windowProps: window === 'open' ? { id: ACTION_WINDOW_ID } : null }
          }
        })
  }
})

/** The `activity` state of several sessions, each listing its operations, newest first. */
export const activityOf = (sessions: Record<string, SubmittedOperation[]>): SendRequestUpdate => ({
  controller: 'activity',
  state: {
    accountsOps: Object.fromEntries(
      Object.entries(sessions).map(([sessionId, items]) => [sessionId, { result: { items } }])
    )
  }
})

/** The `activity` state of one session, listing the operations given, newest first. */
export const activityListing = (
  sessionId: string | number,
  ...items: SubmittedOperation[]
): SendRequestUpdate => activityOf({ [String(sessionId)]: items })

/** How the wallet identifies an operation it submitted: its own transaction, or another party's. */
export type OperationKind = NonNullable<SubmittedOperation['identifiedBy']>['type']

export interface OperationFacts {
  /** The operation's transaction hash, where the wallet knows it. */
  hash?: string
  status?: AccountOpStatus
  kind?: OperationKind
}

/**
 * One operation the wallet submitted, whose calls name the requests given:
 * each with its own transaction hash (`callHash`) where the wallet sent it as
 * a transaction of its own and knows it.
 */
export const operationOf = (
  calls: { requestId: string | number; callHash?: Hex }[],
  {
    hash,
    status = AccountOpStatus.BroadcastedButNotConfirmed,
    kind = 'Transaction'
  }: OperationFacts = {}
): SubmittedOperation => ({
  status,
  identifiedBy: { type: kind },
  ...(hash !== undefined ? { txnId: hash } : {}),
  calls: calls.map(({ requestId, callHash }) => ({
    fromUserRequestId: String(requestId),
    ...(callHash !== undefined ? { txnId: callHash } : {})
  }))
})

/**
 * One operation the wallet submitted for a request: its one call names the
 * request. `callHash` is the call's own transaction hash and `hash` the
 * operation's; either may be missing while the wallet does not know it yet.
 * The wallet sent it as a transaction of the key's own unless `kind` says
 * otherwise.
 */
export const operationFor = (
  requestId: string | number,
  { callHash, ...facts }: OperationFacts & { callHash?: Hex } = {}
): SubmittedOperation => operationOf([{ requestId, callHash }], facts)

/** The wallet's sign-and-broadcast status, as the `main` controller state carries it. */
export type BroadcastStatus = NonNullable<
  NonNullable<MainStatusState['statuses']>['signAndBroadcastAccountOp']
>

/** The `main` state with the wallet's sign-and-broadcast status. */
export const mainStatus = (status: BroadcastStatus): SendRequestUpdate => ({
  controller: 'main',
  state: { statuses: { signAndBroadcastAccountOp: status } }
})

/** The `requests` state with the given request ids waiting for an account switch, none queued. */
export const waitingForSwitch = (...requestIds: (string | number)[]): SendRequestUpdate => ({
  controller: 'requests',
  state: {
    userRequests: [],
    userRequestsWaitingAccountSwitch: requestIds.map((requestId) => ({ id: requestId }))
  }
})

/** A smart account the wallet lists, as the wallet holds its address: checksummed. */
export const SMART_ACCOUNT = new Wallet(`0x${'33'.repeat(32)}`).address as Address

/** The smart account's controlling key, which the wallet does not list as an account. */
export const CONTROLLING_KEY = new Wallet(`0x${'44'.repeat(32)}`).address as Address

/** A batch the smart account runs on itself: a call that carries value, then one that does not. */
export const BATCH: readonly PreparedCall[] = [
  {
    kind: 'call',
    target: SMART_ACCOUNT,
    value: 3n,
    data: '0xaaaa0001',
    sender: 'account',
    block: { number: 7_000_000, hash: `0x${'0b'.repeat(32)}` }
  },
  {
    kind: 'call',
    target: '0x5FbDB2315678afecb367f032d93F642f64180aa3',
    value: 0n,
    data: '0xbbbb0002',
    sender: 'account',
    block: { number: 7_000_000, hash: `0x${'0b'.repeat(32)}` }
  }
]

/** The `signAccountOp` state the background pushes while the sign screen holds an operation. */
export const signAccountOpPush = (state: SignAccountOpState): SendRequestUpdate => ({
  controller: 'signAccountOp',
  state
})

/** A send the port was asked for, its state read after the pending microtasks ran. */
export type TrackedSend = ReturnType<typeof track>

/**
 * One way to ask the send port for a transaction: a key's own transaction, or
 * the batch an account runs. The refusals behave the same for each, so the
 * tests that read them run over every subject.
 */
export interface SendSubject {
  title: string
  /** The address every refusal message names. */
  names: Address
  /** Starts one send over a queue listing the sender, and answers the request id the port queued. */
  sending: (options?: Partial<SendPortOptions>) => { q: SendWorld; send: TrackedSend; id: string }
  /** The port settled with a refusal for `reason`, naming what it was asked to send. */
  expectRefusal: (seen: TrackedSend, reason: SendRefusalReason) => void
}

export interface SendSubjectParts {
  title: string
  names: Address
  /** The accounts the wallet lists for this subject's sender. */
  accounts: () => ListedAccount[]
  /** Asks the port for the subject's transaction. */
  start: (sender: SendPort) => Promise<Hex>
  /** Checks that a refusal names what the port was asked to send. */
  expectNamed: (refusal: SendRefusal) => void
}

export const sendSubject = ({
  title,
  names,
  accounts,
  start,
  expectNamed
}: SendSubjectParts): SendSubject => ({
  title,
  names,
  sending: (options = {}) => {
    const q = sendQueueOver(accounts(), options)
    const send = track(start(q.sender))
    const requestId = addedRequest(q.dispatch).userRequest.id
    return { q, send, id: String(requestId) }
  },
  expectRefusal: (seen, reason) => {
    expect(seen.status).toBe('rejected')
    expect(seen.value).toBeInstanceOf(Error)
    const refusal = seen.value as SendRefusal
    expect(refusal.name).toBe('SendRefusal')
    expect(refusal.reason).toBe(reason)
    expectNamed(refusal)
  }
})

/** One transaction the scripted node knows: pending while it carries no block. */
export interface NodeTransaction {
  hash: Hex
  from: Address
  to: Address
  nonce: number
  data: Hex
  value: bigint
  blockNumber?: number
}

/** One receipt the scripted node answers. */
export interface NodeReceipt {
  hash: Hex
  from: Address
  to: Address
  blockNumber: number
  status: 0 | 1
  gasUsed: bigint
  gasPrice: bigint
}

/** What the scripted node holds; a test changes it between calls. */
export interface NodeScript {
  blockNumber: number
  /** The transactions the node answers by hash; a mined one also fills its block. */
  transactions: NodeTransaction[]
  /** Transactions the node no longer answers by hash, though a block may still hold them. */
  forgotten: Hex[]
  receipts: NodeReceipt[]
  /** The transaction count of each sender, by lower-case address. */
  nonces: Record<string, number>
}

const blockHashOf = (blockNumber: number): Hex => toBeHex(blockNumber + 0xb10c, 32) as Hex

const transactionJson = (tx: NodeTransaction) => ({
  hash: tx.hash,
  type: '0x2',
  from: tx.from,
  to: tx.to,
  nonce: toQuantity(tx.nonce),
  input: tx.data,
  value: toQuantity(tx.value),
  gas: toQuantity(90_000),
  maxFeePerGas: toQuantity(3n * 10n ** 9n),
  maxPriorityFeePerGas: toQuantity(10n ** 9n),
  chainId: toQuantity(SEPOLIA),
  accessList: [],
  blockHash: tx.blockNumber === undefined ? null : blockHashOf(tx.blockNumber),
  blockNumber: tx.blockNumber === undefined ? null : toQuantity(tx.blockNumber),
  transactionIndex: tx.blockNumber === undefined ? null : '0x0',
  v: '0x0',
  yParity: '0x0',
  r: `0x${'11'.repeat(32)}`,
  s: `0x${'22'.repeat(32)}`
})

const receiptJson = (receipt: NodeReceipt) => ({
  transactionHash: receipt.hash,
  transactionIndex: '0x0',
  blockHash: blockHashOf(receipt.blockNumber),
  blockNumber: toQuantity(receipt.blockNumber),
  from: receipt.from,
  to: receipt.to,
  cumulativeGasUsed: toQuantity(receipt.gasUsed),
  gasUsed: toQuantity(receipt.gasUsed),
  effectiveGasPrice: toQuantity(receipt.gasPrice),
  contractAddress: null,
  logs: [],
  logsBloom: `0x${'00'.repeat(256)}`,
  status: toQuantity(receipt.status),
  type: '0x2'
})

/** What the scripted node answers a JSON-RPC request, as a node's JSON. */
const nodeAnswer = (script: NodeScript, method: string, params: readonly unknown[]): unknown => {
  const byHash = <T extends { hash: Hex }>(items: T[]) =>
    items.find((item) => item.hash.toLowerCase() === String(params[0]).toLowerCase())
  switch (method) {
    case 'eth_chainId':
      return toQuantity(SEPOLIA)
    case 'eth_blockNumber':
      return toQuantity(script.blockNumber)
    case 'eth_getTransactionByHash': {
      const tx = byHash(script.transactions)
      return tx && !script.forgotten.includes(tx.hash) ? transactionJson(tx) : null
    }
    case 'eth_getTransactionReceipt': {
      const receipt = byHash(script.receipts)
      return receipt ? receiptJson(receipt) : null
    }
    case 'eth_getTransactionCount':
      return toQuantity(script.nonces[String(params[0]).toLowerCase()] ?? 0)
    case 'eth_getBlockByNumber': {
      const blockNumber = Number(params[0])
      if (blockNumber > script.blockNumber) return null
      return {
        hash: blockHashOf(blockNumber),
        parentHash: blockHashOf(blockNumber - 1),
        number: toQuantity(blockNumber),
        timestamp: toQuantity(1_790_000_000 + blockNumber * 12),
        nonce: '0x0000000000000000',
        difficulty: '0x0',
        gasLimit: toQuantity(30_000_000),
        gasUsed: '0x0',
        miner: `0x${'00'.repeat(20)}`,
        extraData: '0x',
        baseFeePerGas: '0x7',
        transactions: script.transactions
          .filter((tx) => tx.blockNumber === blockNumber)
          .map(transactionJson)
      }
    }
    default:
      throw new Error(`The scripted node does not answer ${method}.`)
  }
}

/** A network record the extension reads over plain JSON-RPC; no request leaves the test. */
export const PLAIN_RPC_NETWORK = {
  chainId: BigInt(SEPOLIA),
  name: 'Sepolia',
  rpcUrls: ['http://127.0.0.1:1'],
  selectedRpcUrl: 'http://127.0.0.1:1',
  rpcProvider: 'rpc'
} as Network

export interface ScriptedNode {
  /** The extension's own provider for the network, built as the hook builds it. */
  provider: ExtensionProvider
  /** What the node holds; a test may change it between calls. */
  script: NodeScript
  /** How many times the node was asked `method`. */
  asked: (method: string) => number
}

/**
 * The extension's own provider for a plain JSON-RPC network, with its `send`
 * answering from a script as a node would: ethers' typed reads and its own
 * wait build each request and read each answer. The provider polls for new
 * blocks on its own interval, so a test on fake timers moves the node's block
 * number and the clock together. Destroy the provider after the test.
 */
export const scriptedNode = (script: Partial<NodeScript> = {}): ScriptedNode => {
  const provider = extensionProviderFor(PLAIN_RPC_NETWORK)
  const node = {
    provider,
    script: { blockNumber: 0, transactions: [], forgotten: [], receipts: [], nonces: {}, ...script }
  } as ScriptedNode
  const send = jest
    .spyOn(provider, 'send')
    .mockImplementation(async (method: string, params: unknown[]) =>
      nodeAnswer(node.script, method, params)
    )
  node.asked = (method) => send.mock.calls.filter(([asked]) => asked === method).length
  return node
}

/** The interval at which the extension's provider polls for a new block. */
export const BLOCK_POLL_MS = 4000

/**
 * Jest's own `advanceTimersByTimeAsync`: it moves the fake clock and lets the
 * promises each timer released run before the next timer fires. The
 * repository's Jest typings predate it, so it is reached through its shape.
 */
export const advanceTimersAsync = (ms: number): Promise<void> =>
  (
    jest as unknown as { advanceTimersByTimeAsync(ms: number): Promise<void> }
  ).advanceTimersByTimeAsync(ms)

/**
 * Moves the node on by `blocks` new blocks and the fake clock by `ms`, letting
 * the provider's poll and every promise it released run.
 */
export const mineAndWait = async (node: ScriptedNode, blocks: number, ms = BLOCK_POLL_MS) => {
  const { script } = node
  script.blockNumber += blocks
  await advanceTimersAsync(ms)
}

/** The member of ethers' transaction response a test watches. */
export interface EthersWait {
  wait(confirms?: number, timeout?: number): Promise<unknown>
}

/**
 * Every promise ethers' own `wait()` returned on the node's transactions from
 * now on, to compare with what the receipt wait answered. The extension's
 * provider runs on ambire-common's own copy of ethers, so the class watched is
 * the one of a response that provider builds for `hash`.
 */
export const watchEthersWaits = async (
  node: ScriptedNode,
  hash: Hex
): Promise<Promise<unknown>[]> => {
  const response = await node.provider.getTransaction(hash)
  if (!response) throw new Error(`The scripted node does not answer ${hash}.`)
  const proto = Object.getPrototypeOf(response) as EthersWait
  const { wait } = proto
  const settled: Promise<unknown>[] = []
  jest
    .spyOn(proto, 'wait')
    .mockImplementation(function watched(
      this: EthersWait,
      ...args: Parameters<EthersWait['wait']>
    ) {
      const run = wait.apply(this, args)
      settled.push(run)
      return run
    })
  return settled
}

/** The network record the extension holds for a recovery chain, as `getRpcProvider` reads it. */
export const networkRecord = (chain: RecoveryChain, overrides: Partial<Network> = {}): Network =>
  ({
    chainId: BigInt(CHAIN_IDS[chain]),
    name: chain,
    rpcUrls: [`https://rpc.example/${chain}`],
    selectedRpcUrl: `https://rpc.example/${chain}`,
    rpcProvider: 'rpc',
    ...overrides
  } as Network)

/**
 * The wallet's records over one in-memory storage: what a caller writes, the
 * tab reads. The records stamp each write with `clock.t`.
 */
export const recordsInMemory = (clock: { t: number } = { t: Date.now() }) => {
  const entries = new Map<string, unknown>()
  const storage: RecordStorage = {
    get: async (key, defaultValue) => (key && entries.has(key) ? entries.get(key) : defaultValue),
    set: async (key, value) => {
      entries.set(key, value)
      return null
    },
    remove: async (key) => {
      entries.delete(key)
      return null
    },
    setEntries: async (items) => {
      Object.entries(items).forEach(([key, value]) => entries.set(key, value))
    },
    removeKeys: async (keys) => {
      keys.forEach((key) => entries.delete(key))
    }
  }
  return { entries, storage, clock, records: createWalletRecords({ storage, now: () => clock.t }) }
}

export interface FakeApprovingClient extends ApprovingClient {
  methodFor: jest.Mock<IRecoveryMethod | undefined, [string]>
}

/**
 * The approving side of a client that serves the methods of `served` by slug,
 * and no other, with the descriptor of the chain this build reads unless one
 * is given.
 */
export const fakeApprovingClient = (
  served: Record<string, IRecoveryMethod> = {},
  descriptor: DeploymentDescriptor = deploymentDescriptor(WALLET_RECOVERY_CHAIN)
): FakeApprovingClient => {
  const methods = new Map(Object.entries(served))
  return {
    approving: new MethodsOrchestratorDouble(new Map(), []),
    methodFor: jest.fn((slug: string) => methods.get(slug)),
    descriptor
  }
}

export type { KeyHandle }

// Jest runs every file under __tests__, this one included; its own check runs
// only when Jest runs this file, never from a file that imports the harness.
if (expect.getState().testPath === __filename) {
  describe('harness', () => {
    it('answers the manager domain ABI-encoded from the scripted chain', async () => {
      const chain = new ScriptedChain()
      const ethers = ethersOver(chain)
      const answer = await ethers.call({
        to: chain.descriptor.manager,
        data: SELECTOR.eip712Domain
      })
      const decoded = coder.decode(
        ['bytes1', 'string', 'string', 'uint256', 'address', 'bytes32', 'uint256[]'],
        answer
      )
      expect(decoded[2]).toBe(chain.descriptor.digestVersion)
      expect(Number(decoded[3])).toBe(chain.descriptor.chainId)
    })

    it('builds a world whose scripted chain carries the client descriptor', () => {
      const world = createWorld()
      expect(world.chain.descriptor).toEqual(world.descriptor)
      expect(world.chain).toBe(sdkStandIn.chainFor(world.descriptor, world.account))
    })
  })
}
