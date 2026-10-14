/**
 * @jest-environment jsdom
 *
 * The done screen's fixtures and fakes. The screen mounts whole at its route
 * over the real records on the checklist's in-memory double of the extension's
 * storage, with only the edges faked, each recording what it was asked:
 *
 * - the recovery client of the recovered account, answering from one fake
 *   chain: the attempt read pinned to its block, the manager's events of the
 *   account and the account's privilege events, the setup the recovery
 *   password opens, and the wallet's reads of the account's signer state
 *   (which the screen must never trust);
 * - the block time read on the extension's own provider;
 * - the wallet: its accounts list and the accounts controller's statuses,
 *   which a test changes while the screen is mounted; the background
 *   dispatch, recorded; the navigation.
 *
 * The screen mounts on Jest's fake clock, so a test runs the read's and the
 * add's limits by moving it.
 */
import { createRoot, Root } from 'react-dom/client'
import { act } from 'react-dom/test-utils'
import { TextDecoder, TextEncoder } from 'util'

import type { Account } from '@ambire-common/interfaces/account'
import type { ThemeContextReturnType } from '@common/contexts/themeContext'
import type { ThemeProps } from '@common/styles/themeConfig'
import type {
  Address,
  Attempt,
  Configuration,
  Credential,
  Hex,
  Notification,
  RecoveryState
} from '@web/modules/social-recovery/sdk-interfaces'
import type { RecoveryKitClient } from '@web/modules/social-recovery/shared/client'
import type { RecoveryRoute, WalletRecords } from '@web/modules/social-recovery/shared/records'
import type { TestStorage } from '@web/modules/social-recovery/recovery/checklist/__tests__/harness'

Object.assign(globalThis, { TextEncoder, TextDecoder })
// React only runs effects and state updates inside act() when this flag is set.
;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true

/** One action the screen dispatched to the background. */
export interface Dispatched {
  type: string
  params?: Record<string, unknown>
}

/** What the wallet's hooks answer the mounted screen; `setWallet` changes it while mounted. */
export interface MockWallet {
  navigate: jest.Mock
  dispatch: jest.Mock
  storage: TestStorage | null
  /** The client state of each account being recovered, by lowercase address. */
  clients: Map<string, unknown>
  /** The wallet's accounts, or undefined before the controller pushed them. */
  accounts: Account[] | undefined
  statuses: { addAccounts: string }
  /** The wallet's selected account, as the last select dispatched it. */
  selected: string | null
  /** While set, a dispatched select is recorded and the wallet reports no new selection until `reportSelected`. */
  holdsSelection: boolean
  /** The wallet lists each account an add dispatches at once, merging its keys into a listed one. */
  walletAdds: boolean
  /** The networks the networks controller pushes. */
  networks: { chainId: bigint; name: string; nativeAssetSymbol: string }[]
  /** The block time the extension's provider answers, by block number. */
  blockTimes: Map<number, number>
  blockReads: number[]
  /** The signer-state reads of the wallet's account facts. */
  factsReads: string[]
  version: number
  listeners: Set<() => void>
}

export const mockWallet: MockWallet = {
  navigate: jest.fn(),
  dispatch: jest.fn(),
  storage: null,
  clients: new Map(),
  accounts: [],
  statuses: { addAccounts: 'INITIAL' },
  selected: null,
  holdsSelection: false,
  walletAdds: false,
  networks: [],
  blockTimes: new Map(),
  blockReads: [],
  factsReads: [],
  version: 0,
  listeners: new Set()
}

jest.mock('@web/modules/social-recovery/shared/records/extensionStorage', () => ({
  get extensionRecordStorage() {
    return mockWallet.storage
  }
}))
jest.mock('@common/hooks/useNavigation', () => ({
  __esModule: true,
  default: () => ({ navigate: mockWallet.navigate })
}))
jest.mock('@web/hooks/useAccountsControllerState', () => {
  const R = jest.requireActual('react')
  const subscribe = (listener: () => void) => {
    mockWallet.listeners.add(listener)
    return () => mockWallet.listeners.delete(listener)
  }
  return {
    __esModule: true,
    default: () => {
      R.useSyncExternalStore(subscribe, () => mockWallet.version)
      return { accounts: mockWallet.accounts, statuses: mockWallet.statuses }
    }
  }
})
jest.mock('@web/hooks/useBackgroundService', () => {
  const dispatch = (action: unknown) => {
    mockWallet.dispatch(action)
    const { type, params } = action as Dispatched
    if (type === 'MAIN_CONTROLLER_SELECT_ACCOUNT' && !mockWallet.holdsSelection) {
      mockWallet.selected = (params as { accountAddr: string }).accountAddr
      mockWallet.version += 1
      mockWallet.listeners.forEach((listener) => listener())
    }
    if (type === 'MAIN_CONTROLLER_ADD_VIEW_ONLY_ACCOUNTS' && mockWallet.walletAdds) {
      const [added] = (params as { accounts: Account[] }).accounts
      const existing = (mockWallet.accounts ?? []).find(
        (candidate) => candidate.addr.toLowerCase() === added.addr.toLowerCase()
      )
      mockWallet.accounts = existing
        ? (mockWallet.accounts ?? []).map((candidate) =>
            candidate === existing
              ? {
                  ...existing,
                  associatedKeys: [...existing.associatedKeys, ...added.associatedKeys]
                }
              : candidate
          )
        : [...(mockWallet.accounts ?? []), added]
      mockWallet.statuses = { addAccounts: 'SUCCESS' }
      mockWallet.version += 1
      mockWallet.listeners.forEach((listener) => listener())
    }
  }
  return { __esModule: true, default: () => ({ dispatch, windowId: undefined }) }
})
jest.mock('@web/hooks/useSelectedAccountControllerState', () => {
  const R = jest.requireActual('react')
  const subscribe = (listener: () => void) => {
    mockWallet.listeners.add(listener)
    return () => mockWallet.listeners.delete(listener)
  }
  return {
    __esModule: true,
    default: () => {
      R.useSyncExternalStore(subscribe, () => mockWallet.version)
      return { account: mockWallet.selected ? { addr: mockWallet.selected } : null }
    }
  }
})
jest.mock('@web/hooks/useNetworksControllerState', () => {
  const R = jest.requireActual('react')
  const subscribe = (listener: () => void) => {
    mockWallet.listeners.add(listener)
    return () => mockWallet.listeners.delete(listener)
  }
  return {
    __esModule: true,
    default: () => {
      R.useSyncExternalStore(subscribe, () => mockWallet.version)
      return { networks: mockWallet.networks }
    }
  }
})
jest.mock('@web/hooks/useKeystoreControllerState', () => {
  const state = { keys: [] }
  return { __esModule: true, default: () => state }
})
jest.mock('@web/modules/social-recovery/shared/client/useRecoveryClient', () => {
  const loading = { status: 'loading' }
  return {
    useRecoveryClient: (account: string) => mockWallet.clients.get(account.toLowerCase()) ?? loading
  }
})
jest.mock('@web/modules/social-recovery/shared/client/useAccountFacts', () => ({
  useAccountFacts: (account: string) => {
    mockWallet.factsReads.push(account)
    return { status: 'unavailable', cause: 'not-listed', retry: () => undefined }
  }
}))
jest.mock('@web/modules/social-recovery/shared/client', () => ({
  ...jest.requireActual('@web/modules/social-recovery/shared/client'),
  extensionProviderFor: () => ({ destroy: () => undefined }),
  createProviderAdapter: () => ({
    block: async (blockNumber: number) => {
      mockWallet.blockReads.push(blockNumber)
      const timestamp = mockWallet.blockTimes.get(blockNumber)
      if (timestamp === undefined) {
        throw new Error('no such block')
      }
      return { number: blockNumber, timestamp }
    }
  })
}))
const mockFrame = (name: string) => {
  const R = jest.requireActual('react')
  return {
    __esModule: true,
    default: ({ children }: { children?: unknown }) =>
      R.createElement('div', { 'data-testid': name }, children)
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
const { WEB_ROUTES } = require('@common/modules/router/constants/common')
const {
  encodeAbiParameters,
  getAddress,
  keccak256,
  pad,
  toHex,
  zeroAddress,
  zeroHash
}: typeof import('viem') = require('viem')
const {
  createWalletRecords
}: typeof import('@web/modules/social-recovery/shared/records') = require('@web/modules/social-recovery/shared/records')
const {
  renderShortAddress
}: typeof import('@web/modules/social-recovery/shared/display') = require('@web/modules/social-recovery/shared/display')
const checklist: typeof import('@web/modules/social-recovery/recovery/checklist/__tests__/harness') = require('@web/modules/social-recovery/recovery/checklist/__tests__/harness')
const DoneScreen: typeof import('@web/modules/social-recovery/recovery/done/DoneScreen').default =
  require('@web/modules/social-recovery/recovery/done/DoneScreen').default
/* eslint-enable @typescript-eslint/no-var-requires, global-require */

export const {
  BOOK,
  CHAIN_ID,
  GUARDIANS,
  MIXED_PATH,
  PASSWORD,
  configurationOf,
  gatheringOf,
  guardianCredential,
  makeStorage,
  passkeyCredential,
  passportCredential
} = checklist

export const t = (key: string, values?: Record<string, unknown>): string => i18n.t(key, values)

/** A guardian row's name on the done screen: its address after the guardian's words. */
export const guardianName = (index: number): string =>
  `${t('socialRecovery.done.guardianAddress')} ${renderShortAddress(GUARDIANS[index])}`

/** The used-methods line over the names the screen lists, in order. */
export const usedLine = (names: string[]): string =>
  t('socialRecovery.done.used', { methods: names.join(t('socialRecovery.done.listJoiner')) })

/** An aadhaar credential: the other identity method. */
export const aadhaarCredential = (): Credential => ({
  method: BOOK.methods.aadhaar,
  config: pad(toHex(11), { size: 32 })
})

// ---------------------------------------------------------------------------
// The chain
// ---------------------------------------------------------------------------

/** The key the recovery installed, as the consume's transaction grants it. */
export const NEW_KEY: Address = '0x00000000000000000000000000000000000abc01'
/** The key the lost device held, which the consume's transaction removes. */
export const REMOVED_KEY: Address = '0x00000000000000000000000000000000000dead1'
/** A key the signer-state reads name, which no event of the consume names. */
export const SIGNER_STATE_KEY: Address = '0x00000000000000000000000000000000000fa1e1'
/** The privilege the removed key held from the account's creation. */
export const ORIGINAL_PRIV: Hex = pad('0x7e', { size: 32 })
export const GRANT_PRIV: Hex = pad('0x01', { size: 32 })

export const CREATE_TX: Hex = `0x${'c1'.repeat(32)}`
export const START_TX: Hex = `0x${'5a'.repeat(32)}`
export const CONSUME_TX: Hex = `0x${'9c'.repeat(32)}`
export const OTHER_TX: Hex = `0x${'77'.repeat(32)}`

export const DEPLOYED_AT = 100
export const CREATION_BLOCK = 6_000_000
export const START_BLOCK = 7_000_000
export const CONSUME_BLOCK = 7_000_400
/** The chain's time of the consume's block, in seconds. */
export const CONSUME_TIME = 1_700_200_000
/** The chain's time at the block the attempt read pins, in seconds. */
export const PINNED_TIME = 1_700_900_000
/** This device's clock when a test starts, in ms. */
export const DEVICE_NOW = 1_800_000_000_000

/** The payload the landed request carried and the attempt's opening names. */
export const PAYLOAD: Hex = '0xc0ffee'
export const PAYLOAD_HASH: Hex = keccak256(PAYLOAD)

let accountSeed = 0x30000
/** An account no other test recovered. */
export const freshAccount = (): Address => {
  accountSeed += 1
  return getAddress(`0x${accountSeed.toString(16).padStart(40, '0')}`)
}

const logAt = (blockNumber: number, transactionHash: Hex, logIndex = 0) => ({
  blockNumber,
  blockHash: zeroHash,
  logIndex,
  transactionHash,
  removed: false
})

/**
 * An opening of an attempt; `payload` and `setupNonce` name another party's
 * opening where they differ from ours, and `usedMethods` the methods it names.
 */
export const attemptStarted = (
  account: Address,
  usedPlaces: number[],
  attemptId = 1n,
  blockNumber = START_BLOCK,
  {
    payload = PAYLOAD,
    setupNonce = 1n,
    usedMethods = []
  }: { payload?: Hex; setupNonce?: bigint; usedMethods?: Address[] } = {}
): Notification => ({
  kind: 'attempt-started',
  account,
  action: BOOK.action,
  attemptId,
  setupNonce,
  setupBody: '0x01',
  usedPlaces: usedPlaces.map(BigInt),
  usedMethods,
  payload,
  order: { token: zeroAddress, amount: 0n, payee: zeroAddress },
  consumableAfter: CONSUME_TIME - 10,
  at: logAt(blockNumber, START_TX)
})

export const attemptConsumed = (
  account: Address,
  attemptId = 1n,
  blockNumber = CONSUME_BLOCK,
  transactionHash: Hex = CONSUME_TX
): Notification => ({
  kind: 'attempt-consumed',
  account,
  action: BOOK.action,
  attemptId,
  at: logAt(blockNumber, transactionHash, 3)
})

export const privilegeChanged = (
  account: Address,
  addr: Address,
  priv: Hex,
  blockNumber: number,
  transactionHash: Hex,
  logIndex = 0
): Notification => ({
  kind: 'privilege-changed',
  account,
  addr,
  priv,
  at: logAt(blockNumber, transactionHash, logIndex)
})

/** The privilege events of a recovery: the creation's grant, then the consume's grant and removal. */
export const recoveryPrivileges = (
  account: Address,
  { granted = NEW_KEY, removed = REMOVED_KEY, creation = true } = {}
): Notification[] => [
  ...(creation
    ? [privilegeChanged(account, removed, ORIGINAL_PRIV, CREATION_BLOCK, CREATE_TX)]
    : []),
  privilegeChanged(account, granted, GRANT_PRIV, CONSUME_BLOCK, CONSUME_TX, 1),
  privilegeChanged(account, removed, zeroHash, CONSUME_BLOCK, CONSUME_TX, 2)
]

/** The chain the fake client reads. */
export interface FakeChain {
  attempt: Attempt
  blockNumber: number
  blockTime: number
  accountEvents: Notification[]
  privilegeEvents: Notification[]
  /** The attempt read rejects while set. */
  failing: boolean
  /** The attempt read never answers while set. */
  hanging: boolean
}

export interface Kit {
  client: RecoveryKitClient
  chain: FakeChain
  recoveryState: jest.Mock
  fetch: jest.Mock
  getSetup: jest.Mock
  /** The wallet's reads of the account's signer state, each answering another key. */
  signerReads: jest.Mock[]
}

const never = <T,>() => new Promise<T>(() => {})

/** A consumed attempt of this recovery, as the manager's record keeps it. */
export const consumedAttempt = (usedMethods: Address[] = []): Attempt => ({
  state: 'Consumed',
  attemptId: 1n,
  setupNonce: 1n,
  consumableAfter: CONSUME_TIME - 10,
  payloadHash: PAYLOAD_HASH,
  order: { token: zeroAddress, amount: 0n, payee: zeroAddress },
  usedMethods,
  ignoresPause: false
})

export const fakeKit = (account: Address, configuration: Configuration = MIXED_PATH): Kit => {
  const chain: FakeChain = {
    attempt: consumedAttempt(),
    blockNumber: CONSUME_BLOCK + 5,
    blockTime: PINNED_TIME,
    accountEvents: [attemptStarted(account, [0, 1, 3]), attemptConsumed(account)],
    privilegeEvents: recoveryPrivileges(account),
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
      removedKey: SIGNER_STATE_KEY,
      block: { number: chain.blockNumber, timestamp: chain.blockTime, hash: zeroHash }
    }
  })
  const accountFilter = jest.fn(() => ({ kind: 'account-filter' }))
  const privilegeFilter = jest.fn(() => ({ kind: 'privilege-filter' }))
  const fetch = jest.fn(async (filter: { kind: string }) =>
    filter.kind === 'privilege-filter' ? chain.privilegeEvents : chain.accountEvents
  )
  const getSetup = jest.fn(async () => configuration)
  const signer = () => jest.fn(async () => SIGNER_STATE_KEY)
  const signerReads = [signer(), signer(), signer(), signer()]
  const [removedKey, isAuthority, holdsAnyPrivilege, signers] = signerReads
  const client = {
    chain: 'sepolia',
    account,
    descriptor: { deployedAt: DEPLOYED_AT },
    recovery: {
      recoveryState,
      events: { accountFilter, privilegeFilter, fetch }
    },
    setup: { getSetup },
    walletReads: { removedKey, signers },
    action: { isAuthority, holdsAnyPrivilege }
  } as unknown as RecoveryKitClient
  return { client, chain, recoveryState, fetch, getSetup, signerReads }
}

export const readyClient = (kit: Kit) => ({ status: 'ready' as const, client: kit.client })

// ---------------------------------------------------------------------------
// The clock
// ---------------------------------------------------------------------------

interface AsyncFakeTimers {
  advanceTimersByTimeAsync(ms: number): Promise<void>
}

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

export const useDoneClock = () => {
  beforeEach(() => {
    jest.useFakeTimers('modern')
    jest.setSystemTime(DEVICE_NOW)
  })
  afterEach(() => {
    jest.useRealTimers()
  })
}

// ---------------------------------------------------------------------------
// The wallet
// ---------------------------------------------------------------------------

/** Changes what the wallet's accounts controller pushes, while the screen is mounted. */
export const setWallet = async (
  change: Partial<Pick<MockWallet, 'accounts' | 'statuses' | 'networks'>>
) => {
  await act(async () => {
    Object.assign(mockWallet, change)
    mockWallet.version += 1
    mockWallet.listeners.forEach((listener) => listener())
  })
  await tick(0)
}

/** The wallet reports `addr` as its selected account, as the selected account controller pushes it. */
export const reportSelected = async (addr: string | null) => {
  await act(async () => {
    mockWallet.selected = addr
    mockWallet.version += 1
    mockWallet.listeners.forEach((listener) => listener())
  })
  await tick(0)
}

/** The network the extension holds for the recovery chain. */
export const SEPOLIA = { chainId: 11155111n, name: 'Sepolia', nativeAssetSymbol: 'ETH' }

/** A listed account at `addr`, with a label, signed for by `keys` (its own address by default). */
export const listedAccount = (addr: Address, label: string, keys: Address[] = [addr]): Account =>
  ({
    addr,
    associatedKeys: keys,
    initialPrivileges: [],
    creation: null,
    preferences: { label, pfp: addr }
  } as unknown as Account)

/** The actions the screen dispatched, by type. */
export const dispatchedOf = (type: string): Dispatched[] =>
  mockWallet.dispatch.mock.calls.map((call) => call[0] as Dispatched).filter((a) => a.type === type)

export const ADD_ACTION = 'MAIN_CONTROLLER_ADD_VIEW_ONLY_ACCOUNTS'
export const SETUP_COMPLETE_ACTION = 'SET_IS_SETUP_COMPLETE'

/** The account the add dispatched, the first one of its `n`th dispatch. */
export const addedAccountOf = (n = 0): Account & { domainName: string | null } => {
  const action = dispatchedOf(ADD_ACTION)[n]
  if (!action) {
    throw new Error(`no add number ${n}`)
  }
  return (action.params as { accounts: (Account & { domainName: string | null })[] }).accounts[0]
}

/** The wallet lists the account the add dispatched, as the accounts controller does once it is added. */
export const walletAddsIt = async () => {
  await setWallet({ statuses: { addAccounts: 'LOADING' } })
  await setWallet({
    accounts: [...(mockWallet.accounts ?? []), addedAccountOf(dispatchedOf(ADD_ACTION).length - 1)],
    statuses: { addAccounts: 'SUCCESS' }
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
  /** Every element whose test id starts with `prefix`. */
  allByTestIdPrefix: (prefix: string) => HTMLElement[]
  text: () => string
  textOf: (id: string) => string
  has: (id: string) => boolean
  press: (id: string) => Promise<void>
  /** Every path the screen navigated to, in order. */
  paths: () => string[]
  /** Whether the element `a` comes before the element `b` in the document. */
  before: (a: string, b: string) => boolean
}

export const donePathOf = (account?: string): string =>
  account
    ? `/${WEB_ROUTES.socialRecoveryRecoveryDone}?account=${account}`
    : `/${WEB_ROUTES.socialRecoveryRecoveryDone}`

/** Mounts the done screen at its route for `account`, with the wallet as `mockWallet` holds it. */
export const mountDone = async (account?: string): Promise<Mounted> => {
  mockWallet.navigate = jest.fn()
  const container = document.createElement('div')
  document.body.appendChild(container)
  const root: Root = createRoot(container)
  const byTestId = (id: string) => container.querySelector<HTMLElement>(`[data-testid="${id}"]`)
  await act(async () => {
    root.render(
      <ThemeContext.Provider value={THEME_CONTEXT}>
        <MemoryRouter
          initialEntries={[donePathOf(account)]}
          future={{ v7_startTransition: true, v7_relativeSplatPath: true }}
        >
          <DoneScreen />
        </MemoryRouter>
      </ThemeContext.Provider>
    )
  })
  await tick(0)
  return {
    unmount: () => {
      act(() => root.unmount())
      container.remove()
    },
    byTestId,
    allByTestIdPrefix: (prefix) =>
      Array.from(container.querySelectorAll<HTMLElement>(`[data-testid^="${prefix}"]`)),
    text: () => container.textContent ?? '',
    textOf: (id) => byTestId(id)?.textContent ?? '',
    has: (id) => !!byTestId(id),
    press: async (id) => {
      const node = byTestId(id)
      if (!node) {
        throw new Error(`nothing to press: ${id}`)
      }
      await act(async () => {
        node.click()
      })
      await tick(0)
    },
    paths: () => mockWallet.navigate.mock.calls.map((call) => call[0]),
    before: (a, b) => {
      const first = byTestId(a)
      const second = byTestId(b)
      if (!first || !second) {
        throw new Error(`missing ${first ? b : a}`)
      }
      // eslint-disable-next-line no-bitwise
      return !!(first.compareDocumentPosition(second) & Node.DOCUMENT_POSITION_FOLLOWING)
    }
  }
}

// ---------------------------------------------------------------------------
// The world a test opens on
// ---------------------------------------------------------------------------

export interface World {
  account: Address
  storage: TestStorage
  records: WalletRecords
  kit: Kit
  configuration: Configuration
  /** The account whose key receives control on the logged-in route. */
  receiving: Account
}

type RecordsOf = Pick<World, 'records' | 'account' | 'configuration'>

/** What a gathering's request names: its attempt id, its setup number and its payload. */
interface GatheringOptions {
  attempt?: number
  setupNonce?: number
  payload?: Hex
}

/** Opens a live gathering of `attempt` under `setupNonce` with `payload`, as the checklist of a new recovery does. */
export const openGathering = async (
  { records, account, configuration }: RecordsOf,
  { attempt = 1, setupNonce = 1, payload = PAYLOAD }: GatheringOptions = {}
) => {
  const opened = gatheringOf(configuration, attempt, account)
  return records
    .recoverySession(CHAIN_ID, account)
    .write(
      { ...opened, request: { ...opened.request, setupNonce: String(setupNonce), payload } },
      null
    )
}

/** Lands a countdown of the attempt `options` names, as the submission of that attempt does. */
export const landCountdown = async (world: RecordsOf, options: GatheringOptions = {}) => {
  const live = await openGathering(world, options)
  await world.records.landSubmission(CHAIN_ID, world.account, live.revision)
}

/** Ends the stored countdown, as another tab's last act does. */
export const endStoredCountdown = async ({ records, account }: RecordsOf) => {
  const read = await records.countdown(CHAIN_ID, account).read()
  if (read.status !== 'present') {
    throw new Error('no countdown to end')
  }
  await records.endCountdown(CHAIN_ID, account, read.revision)
}

/** The fresh install's slot: its smart account and its basic account, neither the recovered one. */
export const SLOT_SMART: Address = '0x00000000000000000000000000000000005a0001'
export const SLOT_BASIC: Address = '0x00000000000000000000000000000000005a0002'
export const RECEIVING_ADDR: Address = '0x00000000000000000000000000000000005a0003'

/**
 * A recovery whose attempt executed: its entry record on `route`, its
 * countdown's record, the recovery password held in memory, the decrypted
 * setup cache when `cache` is set. The wallet does not list the recovered account unless
 * `listed` is set: `true` lists it with the granted key, `'without-key'` with
 * another key only. With `walletAdds` the wallet lists each account the
 * screen adds as soon as the add is dispatched.
 */
export const openWorld = async ({
  route = 'fresh-install',
  configuration = MIXED_PATH,
  cache = true,
  countdown = true,
  entry = true,
  listed = false,
  walletAdds = false,
  attempt = 1
}: {
  route?: RecoveryRoute
  configuration?: Configuration
  cache?: boolean
  countdown?: boolean
  entry?: boolean
  listed?: boolean | 'without-key'
  walletAdds?: boolean
  /** The attempt id the countdown's record landed. */
  attempt?: number
} = {}): Promise<World> => {
  const account = freshAccount()
  const storage = makeStorage()
  const records = createWalletRecords({ storage })
  const kit = fakeKit(account, configuration)
  const receiving = listedAccount(RECEIVING_ADDR, 'Daily account')
  const slot = [listedAccount(SLOT_SMART, 'Account 1'), listedAccount(SLOT_BASIC, 'Account 2')]
  mockWallet.accounts = [
    ...(route === 'fresh-install' ? slot : [receiving]),
    ...(listed
      ? [
          listedAccount(
            account,
            'Recovered account',
            listed === 'without-key' ? [SIGNER_STATE_KEY] : [NEW_KEY]
          )
        ]
      : [])
  ]
  mockWallet.walletAdds = walletAdds
  mockWallet.networks = [SEPOLIA]
  mockWallet.statuses = { addAccounts: 'INITIAL' }
  mockWallet.selected = null
  mockWallet.holdsSelection = false
  mockWallet.dispatch = jest.fn()
  mockWallet.blockTimes = new Map([[CONSUME_BLOCK, CONSUME_TIME]])
  mockWallet.blockReads = []
  mockWallet.factsReads = []
  mockWallet.listeners = new Set()
  if (entry) {
    await records.recoveryEntry(CHAIN_ID, account).write({
      account,
      route,
      receivingAccount: route === 'fresh-install' ? SLOT_SMART : RECEIVING_ADDR
    })
  }
  if (cache) {
    await records.decryptedSetupCache(CHAIN_ID, account).write({ configuration, setupNonce: 1n })
  }
  if (countdown) {
    await landCountdown({ records, account, configuration }, { attempt })
  }
  mockWallet.storage = storage
  mockWallet.clients = new Map([[account.toLowerCase(), readyClient(kit)]])
  return { account, storage, records, kit, configuration, receiving }
}

/**
 * Lands a countdown whose record does not name the attempt it landed, as one
 * stored before the record kept the attempt's id, setup number and payload
 * hash: its request carries no payload. The world must open with no countdown.
 */
export const landRecordWithoutAttempt = async ({ records, account, configuration }: World) => {
  const live = await records
    .recoverySession(CHAIN_ID, account)
    .write(gatheringOf(configuration, 1, account), null)
  await records.landSubmission(CHAIN_ID, account, live.revision)
}

// Registered only when Jest runs this file itself: a suite that imports the
// harness does not run its checks again.
const runningHarnessItself = expect.getState().testPath === __filename

const describeHarness = runningHarnessItself ? describe : () => undefined

describeHarness('the done harness', () => {
  it('answers the account events and the privilege events apart, from one chain', async () => {
    const account = freshAccount()
    const kit = fakeKit(account)
    const { events } = kit.client.recovery
    const range = { from: 0, to: 1 }
    const ofAccount = await events.fetch(events.accountFilter(), range)
    const ofPrivileges = await events.fetch(events.privilegeFilter(), range)
    expect(ofAccount.map((notice) => notice.kind)).toEqual(['attempt-started', 'attempt-consumed'])
    expect(ofPrivileges.every((notice) => notice.kind === 'privilege-changed')).toBe(true)
  })

  it('builds credentials the address book names', () => {
    expect(passportCredential().method).toBe(BOOK.methods.zkpassport)
    expect(aadhaarCredential().method).toBe(BOOK.methods.aadhaar)
    expect(guardianCredential(GUARDIANS[0]).config).toBe(
      encodeAbiParameters([{ type: 'address' }], [GUARDIANS[0]])
    )
  })
})
