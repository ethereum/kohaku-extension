/**
 * @jest-environment jsdom
 *
 * Mounts the recovery entry's two screens with the app's own components, the
 * real en.json and real records on an in-memory double of the extension's
 * storage helper. The edges are fakes: the wallet's accounts and keystore
 * keys, the URL's search, the navigation, the name resolver and the recovery
 * client per looked-up account, whose reads each test scripts per call. The
 * settings sidebar, the logo and the avatar are stubs. jsdom has no
 * `TextEncoder`, which viem reads when it loads, so the harness sets Node's
 * before it loads the modules.
 */
import { createRoot, Root } from 'react-dom/client'
import { act } from 'react-dom/test-utils'
import { webcrypto } from 'crypto'
import { TextDecoder, TextEncoder } from 'util'

import type { Account } from '@ambire-common/interfaces/account'
import type { ThemeContextReturnType } from '@common/contexts/themeContext'
import type { ThemeProps } from '@common/styles/themeConfig'
import type {
  ActionState,
  Address,
  BlockHeader,
  Configuration,
  Gathering,
  Handover,
  Hex,
  SetupState
} from '@kohaku-eth/social-recovery'
import type {
  PrivacyLevel,
  AttemptEvents,
  AttemptScan,
  FitCheckReading,
  RecoveryKitClient,
  RemovedKeyReading
} from '@web/modules/social-recovery/shared/client'
import type { sdkStandIn as StandIn } from '@web/modules/social-recovery/shared/client/stand-in'
import type { RecoveryClientState } from '@web/modules/social-recovery/shared/client/useRecoveryClient'
import type { RecordStorage } from '@web/modules/social-recovery/shared/records'
import { deferred } from '@web/modules/social-recovery/shared/chrome/__fixtures__/deferred'
import type { Deferred } from '@web/modules/social-recovery/shared/chrome/__fixtures__/types'

// The spinner's animation needs a native module jsdom lacks; a plain view stands in.
jest.mock('@common/components/Spinner', () => {
  /* eslint-disable @typescript-eslint/no-var-requires, global-require */
  const mockReact: typeof import('react') = require('react')
  const { View: MockView }: typeof import('react-native') = require('react-native')
  /* eslint-enable @typescript-eslint/no-var-requires, global-require */
  return {
    __esModule: true,
    default: () => mockReact.createElement(MockView, { testID: 'spinner' })
  }
})

Object.assign(globalThis, { TextEncoder, TextDecoder })
// The fake node seals a backup with WebCrypto, which jsdom does not carry. Its
// work runs off the event loop on the real clock, so the harness counts each
// call still running and `settle` waits for them.
let cryptoRunning = 0
const countedSubtle = new Proxy(webcrypto.subtle, {
  get(target, name) {
    const member: unknown = Reflect.get(target, name)
    if (typeof member !== 'function') {
      return member
    }
    return (...args: unknown[]) => {
      cryptoRunning += 1
      return Promise.resolve(member.apply(target, args)).finally(() => {
        cryptoRunning -= 1
      })
    }
  }
})
Object.defineProperty(globalThis, 'crypto', {
  value: {
    getRandomValues: webcrypto.getRandomValues.bind(webcrypto),
    randomUUID: webcrypto.randomUUID.bind(webcrypto),
    subtle: countedSubtle
  },
  configurable: true
})
// React only runs effects and state updates inside act() when this flag is set.
;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true

// ---------------------------------------------------------------------------
// Test-only types
// ---------------------------------------------------------------------------

/** The client state the screen's hook hands back, with its retry. */
export type ClientState = RecoveryClientState & { retry: () => void }

/**
 * The wallet the screens read: its accounts, its keystore keys, the URL's
 * search and the router's navigation state.
 */
interface FakeWallet {
  accounts: Account[] | undefined
  keys: { addr: string; type: 'internal' }[] | undefined
  search: string
  state: unknown
}

/** The router's location the screens read; a replace navigation swaps it, as a browser's history does. */
interface FakeLocation {
  pathname: string
  search: string
  hash: string
  state: unknown
}

/** A double of the storage helper that keeps values as given and can hold or refuse its writes. */
interface StorageDouble extends RecordStorage {
  raw: Map<string, unknown>
  set: jest.Mock<Promise<null>, [string, unknown]>
  /** While set, every write waits for it. */
  hold?: Deferred<void>
  /** While true, every write rejects and stores nothing. */
  refuse: boolean
  /** While true, every removal rejects and removes nothing. */
  refuseRemove: boolean
  /** While true, every read rejects. */
  refuseGet: boolean
}

/** The looked-up account's reads, one mock each, so a test scripts each call. */
export interface KitReads {
  setupState: jest.Mock<Promise<SetupState>, []>
  isAuthorized: jest.Mock<Promise<boolean>, []>
  supportsAccount: jest.Mock<Promise<boolean>, []>
  isAuthority: jest.Mock<Promise<boolean>, [Address]>
  holdsAnyPrivilege: jest.Mock<Promise<boolean>, [Address]>
  removedKey: jest.Mock<Promise<RemovedKeyReading>, []>
  fitCheck: jest.Mock<Promise<FitCheckReading>, []>
}

/** The registry's reads the page opens for the running attempt, one mock each, so a test scripts each call. */
export interface FakeAttemptReads {
  latestBlock: jest.Mock<Promise<BlockHeader>, []>
  stateOf: jest.Mock<Promise<ActionState>, [Address, number]>
  attemptEventsOf: jest.Mock<Promise<AttemptEvents>, [Address, bigint, AttemptScan]>
  blockTime: jest.Mock<Promise<number>, [number]>
  handoverOf: jest.Mock<Handover | undefined, [Hex]>
}

export interface Mounted {
  unmount: () => void
  byTestId: (id: string) => HTMLElement | null
  has: (id: string) => boolean
  textOf: (id: string) => string
  text: () => string
  press: (id: string) => Promise<void>
  type: (id: string, value: string) => Promise<void>
  inputOf: (id: string) => HTMLInputElement | null
  isDisabled: (id: string) => boolean
  isChecked: (id: string) => boolean
  /** Whether the first node comes after the second in the page, as a reader meets them. */
  comesAfter: (later: string, earlier: string) => boolean
  /** Whether the second node sits inside the first. */
  holds: (outer: string, inner: string) => boolean
}

/** A setup committed on the lost account's fake node, and the client built over it. */
export interface CommittedWorld {
  chain: ReturnType<typeof StandIn.nodeFor>
  client: RecoveryKitClient
}

/** A decision of the running attempt held during a later read: its name, its button, how the test arranges it, and the path it opens. */
export type HeldDecisionCase = [name: string, button: string, arrange: () => void, path: string]

/** A reason the running attempt cannot be read: its name and how the test arranges it. */
export type UnreadableCase = [name: string, arrange: () => void]

/** The parts of Jest's modern fake clock the installed typings do not declare. */
interface LiveFakeTimers {
  useFakeTimers(config: { advanceTimers: boolean }): void
  advanceTimersByTimeAsync(ms: number): Promise<void>
}

// ---------------------------------------------------------------------------
// The edges
// ---------------------------------------------------------------------------

const mockWallet: FakeWallet = { accounts: undefined, keys: undefined, search: '', state: null }
const mockDispatch = jest.fn()
const mockNavigate = jest.fn()

// The location is an external store, so a replace navigation renders the
// screen again with the history entry it left behind.
const mockLocation: { current: FakeLocation; listeners: Set<() => void> } = {
  current: { pathname: '/', search: '', hash: '', state: null },
  listeners: new Set()
}
const setMockLocation = (next: Partial<FakeLocation>) => {
  mockLocation.current = { ...mockLocation.current, ...next }
  mockLocation.listeners.forEach((listener) => listener())
}
/**
 * A replace navigation swaps the history entry for the path it names; as the wallet's own hook does, the
 * new entry's state carries the state it passes plus the location it left as `prevRoute`.
 */
const replaceEntry = (
  to: unknown,
  options?: { replace?: boolean; state?: Record<string, unknown> }
) => {
  if (options?.replace !== true || typeof to !== 'string') {
    return
  }
  const at = to.indexOf('?')
  setMockLocation({
    pathname: at === -1 ? to : to.slice(0, at),
    search: at === -1 ? '' : to.slice(at),
    state: { ...(options.state ?? {}), prevRoute: mockLocation.current }
  })
}
const mockResolveName = jest.fn<Promise<string>, [string]>()

const mockStorage: StorageDouble = {
  raw: new Map(),
  refuse: false,
  refuseRemove: false,
  refuseGet: false,
  get: async (key, defaultValue) => {
    if (mockStorage.refuseGet) {
      throw new Error('storage unavailable')
    }
    return key && mockStorage.raw.has(key) ? mockStorage.raw.get(key) : defaultValue
  },
  getAll: async () => Object.fromEntries(mockStorage.raw),
  set: jest.fn(async (key: string, value: unknown) => {
    if (mockStorage.hold) {
      await mockStorage.hold.promise
    }
    if (mockStorage.refuse) {
      throw new Error('storage full')
    }
    mockStorage.raw.set(key, value)
    return null
  }),
  setEntries: async (entries) => {
    if (mockStorage.refuse) {
      throw new Error('storage full')
    }
    Object.entries(entries).forEach(([key, value]) => mockStorage.raw.set(key, value))
  },
  remove: async (key) => {
    if (mockStorage.refuseRemove) {
      throw new Error('storage unavailable')
    }
    mockStorage.raw.delete(key)
    return null
  },
  removeKeys: async (keys) => {
    if (mockStorage.refuseRemove) {
      throw new Error('storage unavailable')
    }
    keys.forEach((key) => mockStorage.raw.delete(key))
  }
}

// The recovery client per looked-up account, as an external store, so a test
// can change one (a retry that answers) and the screen renders it.
const mockClients: {
  byAccount: Map<string, ClientState>
  ready: ClientState | null
  listeners: Set<() => void>
} = { byAccount: new Map(), ready: null, listeners: new Set() }
const mockLoading: ClientState = { status: 'loading', retry: () => {} }

// The chrome's account latch is the chrome's own, tested in its folder.
jest.mock('@web/modules/social-recovery/shared/chrome/useSetupAccount')

jest.mock('@web/modules/social-recovery/shared/client/useRecoveryClient', () => ({
  useRecoveryClient: (account: string | undefined) =>
    // eslint-disable-next-line global-require
    require('react').useSyncExternalStore(
      (listener: () => void) => {
        mockClients.listeners.add(listener)
        return () => mockClients.listeners.delete(listener)
      },
      () =>
        account
          ? mockClients.byAccount.get(account.toLowerCase()) ?? mockClients.ready
          : mockLoading
    )
}))
jest.mock('@web/hooks/useAccountsControllerState', () => ({
  __esModule: true,
  default: () => ({ accounts: mockWallet.accounts })
}))
jest.mock('@web/hooks/useKeystoreControllerState', () => ({
  __esModule: true,
  default: () => ({ keys: mockWallet.keys })
}))
jest.mock('@web/hooks/useNetworksControllerState', () => ({
  __esModule: true,
  default: () => ({ networks: [] })
}))
jest.mock('@web/hooks/useBackgroundService', () => ({
  __esModule: true,
  default: () => ({ dispatch: mockDispatch })
}))
jest.mock('@web/services/provider', () => ({ getRpcProviderForUI: () => ({}) }))
jest.mock('@ambire-common/services/ensDomains', () => ({
  resolveENSDomain: (name: string) => mockResolveName(name)
}))
jest.mock('@common/hooks/useNavigation', () => ({
  __esModule: true,
  default: () => ({ navigate: mockNavigate })
}))
jest.mock('react-router-dom', () => ({
  ...jest.requireActual('react-router-dom'),
  useLocation: () =>
    // eslint-disable-next-line global-require
    require('react').useSyncExternalStore(
      (listener: () => void) => {
        mockLocation.listeners.add(listener)
        return () => mockLocation.listeners.delete(listener)
      },
      () => mockLocation.current
    )
}))
jest.mock('@web/modules/social-recovery/shared/records', () => ({
  ...jest.requireActual('@web/modules/social-recovery/shared/records'),
  extensionRecordStorage: mockStorage
}))
jest.mock('@web/modules/settings/components/Sidebar', () => ({
  __esModule: true,
  default: () => null
}))
jest.mock('@common/components/AmbireLogoHorizontal', () => ({
  __esModule: true,
  default: () => null
}))
// The avatar loads its image files, which Jest cannot read; it is drawn as a
// node that carries what it was drawn for.
jest.mock('@common/components/Avatar', () => {
  // eslint-disable-next-line @typescript-eslint/no-var-requires, global-require
  const { createElement } = require('react')
  return {
    __esModule: true,
    default: ({ pfp }: { pfp: string }) =>
      createElement('div', { 'data-testid': 'avatar', 'data-pfp': pfp })
  }
})

// The stand-in's chain answers the readout's client; no deployment variable
// from a developer's environment turns it into the deployed kit.
jest.mock('@web/modules/social-recovery/shared/client/deployment-env', () => ({
  SEPOLIA_DEPLOYMENT_VARIABLE: 'SOCIAL_RECOVERY_SEPOLIA_DEPLOYMENT',
  sepoliaDeploymentVariable: () => undefined
}))

/* eslint-disable @typescript-eslint/no-var-requires, global-require */
const React: typeof import('react') = require('react')
const { encodeErrorResult, getAddress, parseAbi }: typeof import('viem') = require('viem')
const { makeError }: typeof import('ethers') = require('ethers')
const {
  passkeyMethod,
  walletMethod
}: typeof import('@kohaku-eth/social-recovery') = require('@kohaku-eth/social-recovery')
const {
  privacyOfLevel
}: typeof import('@web/modules/social-recovery/setup/privacy/writes') = require('@web/modules/social-recovery/setup/privacy/writes')
const {
  ThemeContext
}: typeof import('@common/contexts/themeContext') = require('@common/contexts/themeContext')
const themeConfig: typeof import('@common/styles/themeConfig') = require('@common/styles/themeConfig')
const i18n: typeof import('@common/config/localization').default =
  require('@common/config/localization').default
const {
  addressBookOf,
  buildRecoveryClient,
  CHAIN_IDS,
  deploymentDescriptor,
  descriptorOf,
  WALLET_RECOVERY_CHAIN
}: typeof import('@web/modules/social-recovery/shared/client') = require('@web/modules/social-recovery/shared/client')
const {
  sdkStandIn
}: typeof import('@web/modules/social-recovery/shared/client/stand-in') = require('@web/modules/social-recovery/shared/client/stand-in')
const {
  relyingPartyOf,
  rpIdHashOf
}: typeof import('@web/modules/social-recovery/shared/ceremony') = require('@web/modules/social-recovery/shared/ceremony')
const {
  chipKey,
  renderShortAddress,
  renderValueLabel
}: typeof import('@web/modules/social-recovery/shared/display') = require('@web/modules/social-recovery/shared/display')
const {
  createWalletRecords,
  revisionOf
}: typeof import('@web/modules/social-recovery/shared/records') = require('@web/modules/social-recovery/shared/records')
const EntryScreen: typeof import('@web/modules/social-recovery/recovery/entry/EntryScreen').default =
  require('@web/modules/social-recovery/recovery/entry/EntryScreen').default
const AccountStepScreen: typeof import('@web/modules/social-recovery/recovery/entry/AccountStepScreen').default =
  require('@web/modules/social-recovery/recovery/entry/AccountStepScreen').default
const ReadoutScreen: typeof import('@web/modules/social-recovery/recovery/entry/ReadoutScreen').default =
  require('@web/modules/social-recovery/recovery/entry/ReadoutScreen').default
/* eslint-enable @typescript-eslint/no-var-requires, global-require */

export const t = (key: string, values?: Record<string, unknown>): string => i18n.t(key, values)

export const CHAIN_ID = CHAIN_IDS[WALLET_RECOVERY_CHAIN]
export const DESCRIPTOR = deploymentDescriptor(WALLET_RECOVERY_CHAIN)
/** The recovery module the no-setup sentence names, checksummed as the screens draw it. */
export const MODULE: Address = getAddress(DESCRIPTOR.action)
/** The manager and the action this build reads, as the records it writes name them. */
export const DEPLOYMENT = { manager: DESCRIPTOR.manager, action: DESCRIPTOR.action }
/** The network the screens name: the wallet lists no network record, so the chain's own name. */
export const NETWORK = 'Sepolia'

/** A basic account of the wallet, whose key is the account itself. */
export const BASIC: Address = getAddress('0xa11ce00000000000000000000000000000000001')
/** A smart account of the wallet. */
export const SMART: Address = getAddress('0x5a1a000000000000000000000000000000000002')
/** The key the wallet holds for the smart account. */
export const SMART_KEY: Address = getAddress('0xc0de000000000000000000000000000000000003')
/** An account the wallet only watches: the keystore holds none of its keys. */
export const VIEW_ONLY: Address = getAddress('0x7ee0000000000000000000000000000000000004')
/** The account the holder recovers. */
export const LOST: Address = getAddress('0x1057000000000000000000000000000000000005')
/** The key a recovery of the lost account would remove. */
export const LOST_KEY: Address = getAddress('0xdead000000000000000000000000000000000006')

export const basicAccount = (addr: Address, label: string): Account => ({
  addr,
  associatedKeys: [addr],
  initialPrivileges: [],
  creation: null,
  preferences: { label, pfp: addr }
})

export const smartAccount = (addr: Address, key: Address, label: string): Account => ({
  addr,
  associatedKeys: [key],
  initialPrivileges: [[key, '0x01']],
  creation: {
    factoryAddr: getAddress('0xfac0000000000000000000000000000000000007'),
    bytecode: '0x00',
    salt: '0x00'
  },
  preferences: { label, pfp: addr }
})

export const DAILY = basicAccount(BASIC, 'Daily')
export const VAULT = smartAccount(SMART, SMART_KEY, 'Vault')
export const WATCHED = basicAccount(VIEW_ONLY, 'Watched')

export const keyOf = (addr: Address) => ({ addr, type: 'internal' as const })

// ---------------------------------------------------------------------------
// The name resolver's failures
// ---------------------------------------------------------------------------

/** The custom errors the name service's universal resolver reverts with. */
const RESOLVER_ERRORS = parseAbi([
  'error ResolverNotFound(bytes name)',
  'error ResolverNotContract(bytes name, address resolver)',
  'error ResolverError(bytes errorData)',
  'error UnsupportedResolverProfile(bytes4 selector)',
  'error HttpError(uint16 status, string message)'
])
/** `lost.eth` as the resolver encodes a name. */
const LOST_NAME_DNS = '0x046c6f73740365746800'

/** The revert data of each resolver error. */
export const REVERTS = {
  resolverNotFound: encodeErrorResult({
    abi: RESOLVER_ERRORS,
    errorName: 'ResolverNotFound',
    args: [LOST_NAME_DNS]
  }),
  resolverNotContract: encodeErrorResult({
    abi: RESOLVER_ERRORS,
    errorName: 'ResolverNotContract',
    args: [LOST_NAME_DNS, LOST_KEY]
  }),
  resolverError: encodeErrorResult({
    abi: RESOLVER_ERRORS,
    errorName: 'ResolverError',
    args: ['0x']
  }),
  unsupportedProfile: encodeErrorResult({
    abi: RESOLVER_ERRORS,
    errorName: 'UnsupportedResolverProfile',
    args: ['0x3b3b57de']
  }),
  httpError: encodeErrorResult({
    abi: RESOLVER_ERRORS,
    errorName: 'HttpError',
    args: [503, 'gateway down']
  })
}

const RESOLVER_CALL = { to: LOST_KEY, data: '0x9061b923' }

/** The error a provider that reads the chain itself throws for a call that reverted with the data. */
export const revertedCall = (data: string): Error =>
  makeError('execution reverted (unknown custom error)', 'CALL_EXCEPTION', {
    action: 'call',
    data,
    reason: null,
    transaction: RESOLVER_CALL,
    invocation: null,
    revert: null
  })

/**
 * The error the page's provider throws: it forwards the call to the background
 * and gets back only the background's error message, so the error carries no
 * data of its own.
 */
export const forwardedCall = (message: string): Error =>
  makeError('missing revert data', 'CALL_EXCEPTION', {
    action: 'call',
    data: null,
    reason: null,
    transaction: RESOLVER_CALL,
    invocation: null,
    revert: null,
    info: { error: { code: -32603, message } }
  })

/** An off-chain lookup that failed for the reason ethers gives. */
export const offchainFault = (message: string, reason: string): Error =>
  makeError(message, 'OFFCHAIN_FAULT', { reason })

/** A request the provider gave up on. */
export const timedOut = (): Error =>
  Object.assign(new Error('request timeout (code=TIMEOUT, version=6.17.0)'), { code: 'TIMEOUT' })

/** The wallet a test runs against; the screen reads it when it renders. */
export const setWallet = (wallet: Partial<FakeWallet>) => {
  Object.assign(mockWallet, wallet)
  setMockLocation({ search: mockWallet.search, state: mockWallet.state })
}

/** The history entry the browser holds now: its path, its search and its navigation state. */
export const historyEntry = () => mockLocation.current

export const navigate = mockNavigate

/** The screen's navigations, leaving out the replace that drops the acknowledgment from the history entry. */
export const navigationsAway = () =>
  mockNavigate.mock.calls.filter(([, options]) => options?.replace !== true)
export const dispatch = mockDispatch
export const chip = (name: 'notActive' | 'cannotRecover') => t(chipKey('recovery', name))
export const valueLabel = renderValueLabel
export const resolveName = mockResolveName
export const storage = mockStorage
export const records = () => createWalletRecords({ storage: mockStorage })

// ---------------------------------------------------------------------------
// The recovery session
// ---------------------------------------------------------------------------

/** An approval gathering for the account, the body of a live session. */
export const gatheringFor = (account: Address): Gathering => ({
  kind: 'gathering',
  version: 1,
  purpose: 'approval',
  request: {
    chainId: CHAIN_ID.toString(),
    manager: DESCRIPTOR.manager,
    digestVersion: '1',
    account,
    action: DESCRIPTOR.action,
    attemptId: '7',
    setupNonce: '1',
    setupBody: '0x00',
    validUntil: '1800086400',
    block: { number: 1, timestamp: '1800000000', hash: '0x01' },
    payload: '0xabcdef',
    order: {
      token: '0x0000000000000000000000000000000000000000',
      amount: '0',
      payee: '0x0000000000000000000000000000000000000000'
    }
  },
  places: [],
  replies: []
})

/** Stores a recovery entry for the account with a live session beside it. */
export const storeLiveRecovery = async (
  account: Address,
  entry: { route: 'logged-in' | 'fresh-install'; receivingAccount: Address }
) => {
  const held = records()
  await held.recoveryEntry(CHAIN_ID, account).write({ account, ...entry, deployment: DEPLOYMENT })
  await held.recoverySession(CHAIN_ID, account).write(gatheringFor(account), null)
}

/** Stores a recovery entry for the account whose session a wipe ended. */
export const storeEndedRecovery = async (
  account: Address,
  entry: { route: 'logged-in' | 'fresh-install'; receivingAccount: Address }
) => {
  await storeLiveRecovery(account, entry)
  const held = records()
  const read = await held.recoverySession(CHAIN_ID, account).read()
  await held.wipeRecoverySession(CHAIN_ID, account, 'deadline-passed', revisionOf(read))
}

/** The stored recovery entry of the account, or null where none is stored. */
export const storedEntry = async (account: Address) => {
  const read = await records().recoveryEntry(CHAIN_ID, account).read()
  return read.status === 'present' ? read.value : null
}

// ---------------------------------------------------------------------------
// The looked-up account's client
// ---------------------------------------------------------------------------

export const setupStateOf = (overrides: Partial<SetupState> = {}): SetupState => ({
  isAuthorized: true,
  hasSetup: true,
  setupCommitment: `0x${'ab'.repeat(32)}`,
  setupNonce: 1n,
  setupCommittedAtBlock: 100,
  attemptActive: false,
  block: { number: 200, timestamp: 1_800_000_000, hash: `0x${'cd'.repeat(32)}` },
  ...overrides
})

/** Every read answers the way a recoverable account does: a setup, authorized, fitting, one key. */
export const kit: KitReads = {
  setupState: jest.fn(),
  isAuthorized: jest.fn(),
  supportsAccount: jest.fn(),
  isAuthority: jest.fn(),
  holdsAnyPrivilege: jest.fn(),
  removedKey: jest.fn(),
  fitCheck: jest.fn()
}

/** Holds the next removed-key read open; the returned call answers it whenever the test likes. */
export const holdRemovedKeyOnce = () => {
  let answer: (reading: RemovedKeyReading) => void = () => undefined
  kit.removedKey.mockImplementationOnce(
    () =>
      new Promise<RemovedKeyReading>((resolve) => {
        answer = resolve
      })
  )
  return (reading: RemovedKeyReading) => answer(reading)
}

const answerAsRecoverable = () => {
  Object.values(kit).forEach((read) => read.mockReset())
  kit.setupState.mockImplementation(async () => setupStateOf())
  kit.isAuthorized.mockImplementation(async () => true)
  kit.supportsAccount.mockImplementation(async () => true)
  kit.isAuthority.mockImplementation(async (address) => address === LOST_KEY)
  kit.holdsAnyPrivilege.mockImplementation(async () => false)
  kit.removedKey.mockImplementation(async () => ({ kind: 'named', key: LOST_KEY }))
  kit.fitCheck.mockImplementation(async () => ({ basis: 'deployed-code', fits: true }))
}

const readyState = (): ClientState =>
  ({
    status: 'ready',
    client: {
      descriptor: DESCRIPTOR,
      setup: { setupState: () => kit.setupState() },
      action: {
        isAuthorized: () => kit.isAuthorized(),
        supportsAccount: () => kit.supportsAccount(),
        isAuthority: (address: Address) => kit.isAuthority(address),
        holdsAnyPrivilege: (address: Address) => kit.holdsAnyPrivilege(address)
      },
      walletReads: {
        removedKey: () => kit.removedKey(),
        fitCheck: () => kit.fitCheck()
      }
    },
    reads: {},
    receipts: {},
    retry: () => {}
  } as unknown as ClientState)

/** A new ready client over the same scripted reads, as a rebuilt client hands the screen. */
export const readyClient = readyState

/** Sets the client state the screen gets for an account, and renders it. */
export const setClient = (account: Address, state: ClientState | null) => {
  act(() => {
    if (state) {
      mockClients.byAccount.set(account.toLowerCase(), state)
    } else {
      mockClients.byAccount.delete(account.toLowerCase())
    }
    mockClients.listeners.forEach((listener) => listener())
  })
}

/** A client that failed for the account; its retry hands the ready client. */
export const failedClient = (account: Address): ClientState => ({
  status: 'failed',
  error: new Error('rpc down'),
  retry: () => setClient(account, null)
})

/** A client the digest version refused for the account. */
export const refusedClient = (): ClientState =>
  ({
    status: 'update-the-wallet',
    refusal: {},
    retry: () => {
      throw new Error('a refused client is not retried')
    }
  } as unknown as ClientState)

/** Puts every edge back: the wallet with a basic and a smart account, empty storage, recoverable reads. */
export const resetEdges = () => {
  setMockLocation({ pathname: '/', hash: '' })
  setWallet({
    accounts: [DAILY, VAULT, WATCHED],
    keys: [keyOf(BASIC), keyOf(SMART_KEY)],
    search: '',
    state: null
  })
  mockNavigate.mockReset()
  mockNavigate.mockImplementation(replaceEntry)
  mockDispatch.mockReset()
  mockResolveName.mockReset()
  mockResolveName.mockImplementation(async () => '')
  mockStorage.raw.clear()
  mockStorage.set.mockClear()
  mockStorage.hold = undefined
  mockStorage.refuse = false
  mockStorage.refuseRemove = false
  mockStorage.refuseGet = false
  mockClients.byAccount.clear()
  mockClients.ready = readyState()
  answerAsRecoverable()
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

const tick = (ms = 0) =>
  new Promise((resolve) => {
    setTimeout(resolve, ms)
  })

/**
 * Lets the pending reads and writes settle, then renders what they changed.
 * The fakes answer in microtasks, which all run before a timer fires; a
 * backup's sealing or opening runs on the real clock, and is waited out.
 */
export const settle = () =>
  act(async () => {
    await tick()
    for (let round = 0; round < 500 && cryptoRunning > 0; round += 1) {
      // eslint-disable-next-line no-await-in-loop
      await tick(10)
      if (cryptoRunning === 0) {
        // eslint-disable-next-line no-await-in-loop
        await tick()
      }
    }
  })

/** Fake timers that still move with real time, so the harness's own waits keep running. */
export const useLiveFakeClock = () => {
  ;(jest as unknown as LiveFakeTimers).useFakeTimers({ advanceTimers: true })
}

/** Advances the fake clock by `ms` inside act, running what each timer settles. */
export const advanceClock = (ms: number) =>
  act(async () => {
    await (jest as unknown as LiveFakeTimers).advanceTimersByTimeAsync(ms)
  })

/** Runs a change from outside the screen, such as a held read that answers, and renders it. */
export const outside = async (change: () => unknown) => {
  await act(async () => {
    change()
  })
  await settle()
}

const mount = async (element: React.ReactElement): Promise<Mounted> => {
  const container = document.createElement('div')
  document.body.appendChild(container)
  const root: Root = createRoot(container)

  const byTestId = (id: string) => container.querySelector<HTMLElement>(`[data-testid="${id}"]`)
  const inputOf = (id: string) => {
    const node = byTestId(id)
    if (!node) {
      return null
    }
    return node instanceof HTMLInputElement ? node : node.querySelector('input')
  }

  await act(async () => {
    root.render(<ThemeContext.Provider value={THEME_CONTEXT}>{element}</ThemeContext.Provider>)
  })
  await settle()

  return {
    unmount: () => {
      act(() => root.unmount())
      container.remove()
    },
    byTestId,
    has: (id) => byTestId(id) !== null,
    textOf: (id) => byTestId(id)?.textContent ?? '',
    text: () => container.textContent ?? '',
    press: async (id) => {
      const node = byTestId(id)
      if (!node) {
        throw new Error(`nothing to press: ${id}`)
      }
      act(() => node.click())
      await settle()
    },
    type: async (id, value) => {
      const field = inputOf(id)
      if (!field) {
        throw new Error(`nothing to type into: ${id}`)
      }
      const setValue = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set
      act(() => {
        setValue?.call(field, value)
        field.dispatchEvent(new Event('input', { bubbles: true }))
      })
      await settle()
    },
    inputOf,
    isDisabled: (id) => byTestId(id)?.getAttribute('aria-disabled') === 'true',
    isChecked: (id) => byTestId(id)?.getAttribute('aria-checked') === 'true',
    comesAfter: (later, earlier) => {
      const after = byTestId(later)
      const before = byTestId(earlier)
      return (
        !!after &&
        !!before &&
        !before.contains(after) &&
        // eslint-disable-next-line no-bitwise
        (before.compareDocumentPosition(after) & Node.DOCUMENT_POSITION_FOLLOWING) !== 0
      )
    },
    holds: (outer, inner) => {
      const node = byTestId(inner)
      return !!node && !!byTestId(outer)?.contains(node)
    }
  }
}

const ENTRY_PATH = '/social-recovery/recovery'

/** The logged-in entry's route, with the navigation state the screen before passed; by default none. */
export const mountEntry = (state: unknown = null) => {
  setMockLocation({ pathname: ENTRY_PATH })
  setWallet({ search: '', state })
  return mount(<EntryScreen />)
}

/** Mounts the logged-in entry again on the history entry the browser holds now, as a reload does. */
export const reloadEntry = () => mount(<EntryScreen />)

const ACCOUNT_STEP_PATH = '/social-recovery/recovery/account'

/** The navigation state a screen passes once the holder acknowledged the warning. */
export const ACKNOWLEDGED = { acknowledged: true }

/**
 * The account step's route, with the URL's search and the navigation state;
 * by default the holder arrives from a screen where they acknowledged the
 * warning.
 */
export const mountAccountStep = (search: string, state: unknown = ACKNOWLEDGED) => {
  setMockLocation({ pathname: ACCOUNT_STEP_PATH })
  setWallet({ search, state })
  return mount(<AccountStepScreen />)
}

/** Mounts the account step again on the history entry the browser holds now, as a reload does. */
export const reloadAccountStep = () => mount(<AccountStepScreen />)

export const searchOf = (route: string, to: string) => `?route=${route}&to=${to}`

/**
 * Looks up an account on a mounted account step: types it, presses the
 * lookup, and lets the reads settle.
 */
export const lookUp = async (screen: Mounted, value: string) => {
  await screen.type('entry-account-input', value)
  await screen.press('entry-account-look-up')
}

/** Looks up the lost account and confirms it as the holder's. */
export const confirmLost = async (screen: Mounted) => {
  await lookUp(screen, LOST.toLowerCase())
  await screen.press('entry-confirm-mine')
}

// ---------------------------------------------------------------------------
// The readout
// ---------------------------------------------------------------------------

/** The readout's route for an account. */
export const readoutSearchOf = (account: string) => `?account=${account}`

/** The readout's route, with the URL's search. */
export const mountReadout = (search: string) => {
  setWallet({ search, state: null })
  return mount(<ReadoutScreen />)
}

/** Stores the recovery entry the account step writes for the lost account. */
export const storeEntry = async (
  route: 'logged-in' | 'fresh-install',
  receivingAccount: Address = BASIC
) => {
  await records().recoveryEntry(CHAIN_ID, LOST).write({ account: LOST, route, receivingAccount })
}

/** The recovery password printed on the lost account's Recovery Card. */
export const CARD_PASSWORD = 'ember-harbor-quiet-71'

/** The guardians of the committed setup. */
export const GUARDIANS: Address[] = [
  getAddress('0x9a4d000000000000000000000000000000000011'),
  getAddress('0x9b4d000000000000000000000000000000000012'),
  getAddress('0x9c4d000000000000000000000000000000000013')
]

const ADDRESS_BOOK = addressBookOf(WALLET_RECOVERY_CHAIN)
// Checksummed, as the SDK opens a method address from a backup.
const PASSKEY_METHOD = getAddress(ADDRESS_BOOK.methods.passkey)
const GUARDIAN_METHOD = getAddress(ADDRESS_BOOK.methods.ecdsa)

/** A guardian's config: the address whose signature answers for it. */
export const guardianConfigOf = (guardian: Address): Hex =>
  walletMethod().codec.encodeConfig({ signer: guardian })

/** A passkey config whose committed origin hash is this page's own, or another origin's. */
export const passkeyConfig = (origin: 'this' | 'other') =>
  passkeyMethod().codec.encodeConfig({
    x: BigInt(`0x${'11'.repeat(32)}`),
    y: BigInt(`0x${'22'.repeat(32)}`),
    rpIdHash:
      origin === 'this'
        ? relyingPartyOf(window.location).rpIdHash
        : rpIdHashOf('chrome-extension://another-kohaku-build')
  })

/**
 * The lost account's setup: a required passkey created under this origin and
 * a group where two of three guardians answer, with a five-day wait.
 */
export const LOST_SETUP: Configuration = {
  clauses: [
    {
      threshold: 1,
      credentials: [{ method: PASSKEY_METHOD, config: passkeyConfig('this') }]
    },
    {
      threshold: 2,
      credentials: GUARDIANS.map((guardian) => ({
        method: GUARDIAN_METHOD,
        config: guardianConfigOf(guardian)
      }))
    }
  ],
  wait: 432_000,
  ignoresPause: false
}

/** A setup whose one passkey was created under another origin. */
export const OTHER_ORIGIN_SETUP: Configuration = {
  clauses: [
    {
      threshold: 1,
      credentials: [{ method: PASSKEY_METHOD, config: passkeyConfig('other') }]
    }
  ],
  wait: 432_000,
  ignoresPause: false
}

/** A method module this build does not know. */
export const UNKNOWN_METHOD: Address = getAddress('0x0dd0000000000000000000000000000000000021')

/** A setup whose one method is a module this build does not know. */
export const UNKNOWN_METHOD_SETUP: Configuration = {
  clauses: [{ threshold: 1, credentials: [{ method: UNKNOWN_METHOD, config: '0x01' }] }],
  wait: 432_000,
  ignoresPause: false
}

/** A setup whose group of two, needing both, holds a passkey of another origin and a guardian. */
export const SHORT_GROUP_SETUP: Configuration = {
  clauses: [
    {
      threshold: 2,
      credentials: [
        { method: PASSKEY_METHOD, config: passkeyConfig('other') },
        { method: GUARDIAN_METHOD, config: guardianConfigOf(GUARDIANS[0]) }
      ]
    }
  ],
  wait: 432_000,
  ignoresPause: false
}

/** A setup whose group of two, needing one, holds a passkey of another origin and a guardian. */
export const ONE_ANSWERABLE_SETUP: Configuration = {
  clauses: [
    {
      threshold: 1,
      credentials: [
        { method: PASSKEY_METHOD, config: passkeyConfig('other') },
        { method: GUARDIAN_METHOD, config: guardianConfigOf(GUARDIANS[0]) }
      ]
    }
  ],
  wait: 432_000,
  ignoresPause: false
}

/** A recovery client for the lost account built over its fake node. */
const clientOver = (chain: CommittedWorld['chain']) =>
  buildRecoveryClient({
    chain: WALLET_RECOVERY_CHAIN,
    account: LOST,
    addressBook: ADDRESS_BOOK,
    provider: sdkStandIn.providerFor(chain)
  })

/** The ready state of the screen's hook over a built client. */
export const readyOver = (client: RecoveryKitClient): ClientState =>
  ({ status: 'ready', client, reads: {}, receipts: {}, retry: () => {} } as unknown as ClientState)

/**
 * Commits a setup for the lost account at a privacy level on its fake node,
 * builds the recovery client over it, and hands it to the screen.
 */
export const commitLostSetup = async (
  level: PrivacyLevel,
  configuration: Configuration = LOST_SETUP
): Promise<CommittedWorld> => {
  sdkStandIn.reset()
  const chain = sdkStandIn.nodeFor(descriptorOf(WALLET_RECOVERY_CHAIN, ADDRESS_BOOK), LOST)
  await chain.commitSetup(
    configuration,
    privacyOfLevel({ ...configuration, privacy: { publicMetadata: '0x', backup: 'empty' } }, level),
    level === 'public' ? undefined : CARD_PASSWORD
  )
  const client = await clientOver(chain)
  setClient(LOST, readyOver(client))
  return { chain, client }
}

/** Builds a new client over the same chain and hands it to the screen, as a rebuilt client would. */
export const rebuildClient = async (world: CommittedWorld): Promise<CommittedWorld> => {
  const client = await clientOver(world.chain)
  setClient(LOST, readyOver(client))
  return { chain: world.chain, client }
}

/** The value a restore refuses with: a cause and the values the refusal carries. */
export const restoreRefusal = (code: string, values: Record<string, unknown> = {}): Error =>
  Object.assign(new Error(`The restore refused: ${code}`), {
    name: 'KitRefusalError',
    restoreCause: { code, subject: 'restore', values }
  })

/** A guardian's address as a row draws it. */
export const shortAddress = (address: Address) => renderShortAddress(address)

/** The opened setup this device keeps for the lost account, or null where none is kept. */
export const storedCache = async (account: Address = LOST) => {
  const read = await records().decryptedSetupCache(CHAIN_ID, account).read()
  return read.status === 'present' ? read.value : null
}

// Registered only when Jest runs this file itself: a suite that imports the
// harness does not run its checks again.
const runningHarnessItself = expect.getState().testPath === __filename

const describeHarness = runningHarnessItself ? describe : () => undefined

describeHarness('the recovery entry harness', () => {
  beforeEach(resetEdges)

  it('hands the screen the ready client for an account until a test sets another', async () => {
    const screen = await mountAccountStep(searchOf('logged-in', BASIC))
    await lookUp(screen, LOST.toLowerCase())
    expect(kit.setupState).toHaveBeenCalledTimes(1)
    setClient(LOST, failedClient(LOST))
    await settle()
    expect(screen.has('entry-lookup-read-failed')).toBe(true)
    screen.unmount()
  })

  it('stores a live recovery, and one whose session a wipe ended with its entry kept', async () => {
    await storeLiveRecovery(LOST, { route: 'logged-in', receivingAccount: BASIC })
    const live = await records().recoverySession(CHAIN_ID, LOST).read()
    expect(live.status === 'present' && live.value.state).toBe('live')
    await storeEndedRecovery(SMART, { route: 'logged-in', receivingAccount: BASIC })
    const ended = await records().recoverySession(CHAIN_ID, SMART).read()
    expect(ended.status === 'present' && ended.value.state).not.toBe('live')
    expect(await storedEntry(SMART)).not.toBeNull()
  })

  it('holds a write until released, then stores it', async () => {
    mockStorage.hold = deferred<void>()
    const writing = mockStorage.set('key', 'value')
    await Promise.resolve()
    expect(mockStorage.raw.has('key')).toBe(false)
    mockStorage.hold.resolve()
    await writing
    expect(mockStorage.raw.get('key')).toBe('value')
  })
})

/** A case's name, the search the route opens with, and where it sends the page. */
export type RedirectCase = [string, string, string]

/** A case's name and the text it uses. */
export type NamedText = [string, string]

/** A case's name and the error a read fails with. */
export type ErrorCase = [string, () => Error]

/** A case's name, what brings it about and the state the screen shows. */
export type BlockCase = [string, () => void, string]
