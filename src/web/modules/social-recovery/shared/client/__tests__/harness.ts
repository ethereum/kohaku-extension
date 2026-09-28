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
 * - The stand-in's scripted chain (`sdkStandIn.chainFor`) is reset before each
 *   world, so one test's domain script never leaks into the next.
 */
import { AbiCoder, id, toBeHex } from 'ethers'

import {
  addressOf,
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
  IProvider
} from '@web/modules/social-recovery/sdk-interfaces'
import {
  addressBookOf,
  createProviderAdapter,
  createSignerFacade,
  descriptorOf,
  WALLET_RECOVERY_CHAIN,
  type KeyHandle,
  type ListedAccount,
  type RecoveryClientConfiguration,
  type SignerFacade,
  type SignerFacadeOptions,
  type SignRequestAction,
  type SignRequestPort,
  type SignRequestUpdate
} from '@web/modules/social-recovery/shared/client'
// The stand-in is not part of the barrel a screen imports; tests reach it by path.
import { sdkStandIn } from '@web/modules/social-recovery/shared/client/stand-in'

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
export const dispatched = (dispatch: jest.Mock): SignRequestAction[] =>
  dispatch.mock.calls.map((c) => c[0] as SignRequestAction)

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
