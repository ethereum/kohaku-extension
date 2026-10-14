/**
 * Mounts the fast track's routes with the app's own components and strings.
 * The edges are fakes: the background's dispatch (every action kept, in order
 * with every navigation), the controller states it answers (the keystore, the
 * account picker, the accounts, the selected account, the networks, the auth
 * status) as external stores a test pushes, the new phrase's random words,
 * the extension's `browser.storage.local` under the real records, and the
 * gas step's chain reads. jsdom has no `TextEncoder`, which viem reads when it
 * loads, so the harness sets Node's before it loads the modules.
 */
import { createRoot, Root } from 'react-dom/client'
import { act } from 'react-dom/test-utils'
import { TextDecoder, TextEncoder } from 'util'

import type { Account } from '@ambire-common/interfaces/account'
import type { Key } from '@ambire-common/interfaces/keystore'
import type { ThemeContextReturnType } from '@common/contexts/themeContext'
import type { ThemeProps } from '@common/styles/themeConfig'
import type { BackgroundServiceContextReturnType } from '@web/contexts/backgroundServiceContext/types'
import type { Address } from '@web/modules/social-recovery/sdk-interfaces'

import mockSlot from './slot.json'

Object.assign(globalThis, { TextEncoder, TextDecoder })
;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true

export type ControllerName = 'keystore' | 'accounts' | 'picker' | 'selected' | 'networks' | 'auth'

/** One thing the screens did at the edge, in the order they did it. */
export type EdgeEvent =
  | { kind: 'dispatch'; type: string; params?: Record<string, unknown> }
  | { kind: 'navigate'; to: string; replace: boolean; state?: unknown }

export interface Visit {
  path: string
  state: unknown
}

export const PHRASE = mockSlot.phrase
export const ORDINARY_KEY = mockSlot.ordinaryKey as Address
/** The key the phrase gives at the slot's index plus the smart-account offset, which the fast track never uses. */
export const OFFSET_KEY = mockSlot.offsetKey as Address
export const SMART_ACCOUNT = mockSlot.smartAccount as Address
export const LOST_ACCOUNT = mockSlot.lostAccount as Address

export const basicAccount: Account = {
  addr: ORDINARY_KEY,
  associatedKeys: [ORDINARY_KEY],
  initialPrivileges: [],
  creation: null,
  preferences: { label: 'Account 1', pfp: ORDINARY_KEY }
}

/** The smart account the wallet would build for the offset key. */
export const smartAccount: Account = {
  addr: SMART_ACCOUNT,
  associatedKeys: [OFFSET_KEY],
  initialPrivileges: [],
  creation: { factoryAddr: '0x00', bytecode: '0x00', salt: '0x00' },
  preferences: { label: 'Account 2', pfp: SMART_ACCOUNT }
}

export const internalKey = (addr: Address, dedicatedToOneSA: boolean): Key => ({
  addr,
  type: 'internal',
  label: addr,
  dedicatedToOneSA,
  meta: { createdAt: 1, fromSeedId: mockSlot.seedId },
  isExternallyStored: false
})

/** The ordinary key of the slot, as the keystore holds it once the picker added the basic account. */
export const slotKey: Key = internalKey(ORDINARY_KEY, false)

/** The offset key as the keystore holds a smart account's dedicated key. */
export const offsetKey: Key = internalKey(OFFSET_KEY, true)

/** The slot's key as an ordinary key the keystore holds with no recovery phrase behind it. */
export const seedlessKey: Key = {
  addr: ORDINARY_KEY,
  type: 'internal',
  label: ORDINARY_KEY,
  dedicatedToOneSA: false,
  meta: { createdAt: 1 },
  isExternallyStored: false
}

/** A hardware wallet's key at the slot's address. */
export const hardwareKey: Key = {
  addr: ORDINARY_KEY,
  type: 'trezor',
  label: ORDINARY_KEY,
  dedicatedToOneSA: false,
  meta: {
    deviceId: 'device',
    deviceModel: 'model',
    hdPathTemplate: "m/44'/60'/0'/0/<account>",
    index: 0,
    createdAt: 1
  },
  isExternallyStored: true
}

export const SEPOLIA = {
  chainId: 11155111n,
  name: 'Sepolia',
  nativeAssetSymbol: 'ETH',
  rpcUrls: ['https://sepolia.invalid'],
  selectedRpcUrl: 'https://sepolia.invalid'
}

const freshControllers = (): Record<ControllerName, Record<string, unknown>> => ({
  keystore: {
    hasPasswordSecret: false,
    isUnlocked: false,
    hasTempSeed: false,
    keys: [],
    statuses: { addSecret: 'INITIAL' }
  },
  accounts: { accounts: [] },
  picker: { addAccountsStatus: 'INITIAL', selectNextAccountStatus: 'INITIAL', pageError: null },
  selected: { account: null },
  networks: { networks: [SEPOLIA] },
  auth: { authStatus: 'NOT_AUTHENTICATED' }
})

export const mockControllers = {
  state: freshControllers(),
  listeners: new Set<() => void>()
}

export const mockEdge = {
  events: [] as EdgeEvent[],
  /** The words each new phrase gets, in order; the last one repeats. */
  phrases: [PHRASE] as string[],
  made: 0,
  /** The phrases the step derived its keys from. */
  derived: [] as string[]
}

// The extension's `browser.storage.local`: one in-memory store, whose reads a
// test can make fail.
export const mockStorage = {
  entries: new Map<string, unknown>(),
  failReads: false
}

// The gas step's chain reads, scripted by the test.
export const mockChain = {
  gasPrice: 1_000_000_000n,
  balance: 0n,
  fail: false,
  balanceReads: [] as string[],
  destroyed: 0
}

jest.mock('@env', () => ({ DEFAULT_KEYSTORE_PASSWORD_DEV: '' }), { virtual: true })

const mockStoreHook = (name: ControllerName) => () => {
  // eslint-disable-next-line @typescript-eslint/no-var-requires, global-require
  const R: typeof import('react') = require('react')
  return R.useSyncExternalStore(
    (listener: () => void) => {
      mockControllers.listeners.add(listener)
      return () => {
        mockControllers.listeners.delete(listener)
      }
    },
    () => mockControllers.state[name]
  )
}

jest.mock('@web/hooks/useKeystoreControllerState', () => ({
  __esModule: true,
  default: mockStoreHook('keystore')
}))
jest.mock('@web/hooks/useAccountsControllerState', () => ({
  __esModule: true,
  default: mockStoreHook('accounts')
}))
jest.mock('@web/hooks/useAccountPickerControllerState', () => ({
  __esModule: true,
  default: mockStoreHook('picker')
}))
jest.mock('@web/hooks/useSelectedAccountControllerState', () => ({
  __esModule: true,
  default: mockStoreHook('selected')
}))
jest.mock('@web/hooks/useNetworksControllerState', () => ({
  __esModule: true,
  default: mockStoreHook('networks')
}))
jest.mock('@common/modules/auth/hooks/useAuth', () => ({
  __esModule: true,
  default: mockStoreHook('auth')
}))
jest.mock('@common/modules/auth/hooks/useOnboardingNavigation', () => ({
  __esModule: true,
  default: () => ({ goToNextRoute: () => {}, goToPrevRoute: () => {} })
}))
// The toast is stable, as the app's is: the keystore setup's effects depend on it.
jest.mock('@common/hooks/useToast', () => {
  const toast = { addToast: () => {} }
  return { __esModule: true, default: () => toast }
})
// Jest resolves no `.web` platform file, so the navigation takes the web
// build's; each navigation is kept beside the dispatches.
jest.mock('@common/hooks/useNavigation', () => {
  // eslint-disable-next-line @typescript-eslint/no-var-requires, global-require
  const R: typeof import('react') = require('react')
  const web = jest.requireActual('@common/hooks/useNavigation/useNavigation.web').default
  return {
    __esModule: true,
    default: () => {
      const navigation = web()
      const { navigate: go } = navigation
      const navigate = R.useCallback(
        (to: string, options?: { replace?: boolean; state?: unknown }) => {
          mockEdge.events.push({
            kind: 'navigate',
            to,
            replace: !!options?.replace,
            state: options?.state
          })
          return go(to, options)
        },
        [go]
      )
      return { ...navigation, navigate }
    }
  }
})
jest.mock('@ambire-common/libs/entropyGenerator/entropyGenerator', () => ({
  EntropyGenerator: class {
    // eslint-disable-next-line class-methods-use-this
    generateRandomMnemonic() {
      const phrase = mockEdge.phrases[Math.min(mockEdge.made, mockEdge.phrases.length - 1)]
      mockEdge.made += 1
      return { phrase }
    }
  }
}))
// Under jsdom the key iterator's phrase check fails across realms, so the
// step's derivation answers with the slot's key the node test derives from
// the same phrase through the library, and fails at any other index; every
// other part of the derivation is real.
jest.mock('@web/modules/social-recovery/onboarding/fast-track/derivation', () => {
  const { SLOT_INDEX } = jest.requireActual(
    '@web/modules/social-recovery/onboarding/fast-track/constants'
  )
  return {
    ...jest.requireActual('@web/modules/social-recovery/onboarding/fast-track/derivation'),
    slotKeyOf: async ({ seed }: { seed: string }, index: number = SLOT_INDEX) => {
      mockEdge.derived.push(seed)
      if (index !== SLOT_INDEX) {
        throw new Error(`The harness derives no key at index ${index}.`)
      }
      return mockSlot.ordinaryKey
    }
  }
})
jest.mock('@web/constants/browserapi', () => ({
  ...jest.requireActual('@web/constants/browserapi'),
  browser: {
    storage: {
      local: {
        get: async () => {
          if (mockStorage.failReads) {
            throw new Error('storage unavailable')
          }
          return Object.fromEntries(mockStorage.entries)
        },
        set: async (items: Record<string, unknown>) => {
          Object.entries(items).forEach(([key, value]) => mockStorage.entries.set(key, value))
        },
        remove: async (keys: string[]) => {
          keys.forEach((key) => mockStorage.entries.delete(key))
        }
      }
    }
  }
}))
jest.mock('@web/modules/social-recovery/shared/client', () => ({
  ...jest.requireActual('@web/modules/social-recovery/shared/client'),
  extensionProviderFor: () => ({
    destroy: () => {
      mockChain.destroyed += 1
    }
  }),
  createChainReads: () => ({
    gasPrice: async () => {
      if (mockChain.fail) {
        throw new Error('node down')
      }
      return mockChain.gasPrice
    },
    nativeBalance: async (address: string) => {
      mockChain.balanceReads.push(address)
      if (mockChain.fail) {
        throw new Error('node down')
      }
      return mockChain.balance
    }
  })
}))
jest.mock('@common/components/AmbireLogoHorizontal', () => ({
  __esModule: true,
  default: () => null
}))
jest.mock('@common/components/Spinner', () => ({ __esModule: true, default: () => null }))
jest.mock('@common/utils/clipboard', () => ({ setStringAsync: async () => true }))
jest.mock('react-native-keyboard-aware-scroll-view', () => ({
  KeyboardAwareScrollView: jest.requireActual('react-native').ScrollView
}))

/* eslint-disable @typescript-eslint/no-var-requires, global-require */
const React: typeof import('react') = require('react')
const {
  MemoryRouter,
  Route,
  Routes,
  useLocation
}: typeof import('react-router-dom') = require('react-router-dom')
const {
  ThemeContext
}: typeof import('@common/contexts/themeContext') = require('@common/contexts/themeContext')
const themeConfig: typeof import('@common/styles/themeConfig') = require('@common/styles/themeConfig')
const {
  BackgroundServiceContext
}: typeof import('@web/contexts/backgroundServiceContext') = require('@web/contexts/backgroundServiceContext')
const eventBus: typeof import('@web/extension-services/event/eventBus').default =
  require('@web/extension-services/event/eventBus').default
const {
  BIP44_STANDARD_DERIVATION_TEMPLATE
}: typeof import('@ambire-common/consts/derivation') = require('@ambire-common/consts/derivation')
const {
  CHAIN_IDS,
  WALLET_RECOVERY_CHAIN
}: typeof import('@web/modules/social-recovery/shared/client') = require('@web/modules/social-recovery/shared/client')
const {
  createWalletRecords,
  extensionRecordStorage
}: typeof import('@web/modules/social-recovery/shared/records') = require('@web/modules/social-recovery/shared/records')
const RecoverScreen: typeof import('@web/modules/social-recovery/onboarding/recover/RecoverScreen').default =
  require('@web/modules/social-recovery/onboarding/recover/RecoverScreen').default
const FastTrackScreen: typeof import('@web/modules/social-recovery/onboarding/fast-track/FastTrackScreen').default =
  require('@web/modules/social-recovery/onboarding/fast-track/FastTrackScreen').default
const KeyStepScreen: typeof import('@web/modules/social-recovery/onboarding/fast-track/KeyStepScreen').default =
  require('@web/modules/social-recovery/onboarding/fast-track/KeyStepScreen').default
const GasStepScreen: typeof import('@web/modules/social-recovery/onboarding/fast-track/GasStepScreen').default =
  require('@web/modules/social-recovery/onboarding/fast-track/GasStepScreen').default
/* eslint-enable @typescript-eslint/no-var-requires, global-require */

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

const BACKGROUND: BackgroundServiceContextReturnType = {
  dispatch: (action) => {
    const { type, params } = action as { type: string; params?: Record<string, unknown> }
    mockEdge.events.push({ kind: 'dispatch', type, params })
  },
  windowId: undefined
}

/** Every place the router stood, the last one where it stands now. */
export const visits: Visit[] = []

const LocationProbe = () => {
  const { pathname, search, state } = useLocation()
  React.useEffect(() => {
    visits.push({ path: `${pathname}${search}`, state })
  }, [pathname, search, state])
  return null
}

export const where = (): string => visits[visits.length - 1]?.path ?? ''

export const dispatched = (type?: string) =>
  mockEdge.events.filter(
    (event): event is Extract<EdgeEvent, { kind: 'dispatch' }> =>
      event.kind === 'dispatch' && (!type || event.type === type)
  )

export const navigations = () =>
  mockEdge.events.filter(
    (event): event is Extract<EdgeEvent, { kind: 'navigate' }> => event.kind === 'navigate'
  )

/** The navigations to another path than the step's own, which only drop its history state. */
export const movesAway = () =>
  navigations().filter(
    (event) => `/${event.to}` !== visits[0]?.path && event.to !== visits[0]?.path
  )

let container: HTMLDivElement | null = null
let root: Root | null = null

export const byTestId = (id: string) =>
  container?.querySelector<HTMLElement>(`[data-testid="${id}"]`) ?? null

export const text = (): string => container?.textContent ?? ''

export const isDisabled = (id: string) => byTestId(id)?.getAttribute('aria-disabled') === 'true'

export const press = async (id: string) => {
  const node = byTestId(id)
  if (!node) {
    throw new Error(`nothing to press: ${id}`)
  }
  await act(async () => {
    node.click()
  })
}

/** Lets pending promises run, under real or fake timers. */
export const flush = async () => {
  await act(async () => {
    for (let i = 0; i < 50; i += 1) {
      // eslint-disable-next-line no-await-in-loop
      await Promise.resolve()
    }
  })
}

export const setController = async (name: ControllerName, value: Record<string, unknown>) => {
  await act(async () => {
    mockControllers.state = {
      ...mockControllers.state,
      [name]: { ...mockControllers.state[name], ...value }
    }
    mockControllers.listeners.forEach((listener) => listener())
  })
}

export const typeInto = async (testID: string, value: string) => {
  const node = container?.querySelector<HTMLInputElement>(
    `input[data-testid="${testID}"], [data-testid="${testID}"] input`
  )
  if (!node) {
    throw new Error(`no field: ${testID}`)
  }
  await act(async () => {
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set?.call(node, value)
    node.dispatchEvent(new Event('input', { bubbles: true }))
  })
}

/** The keystore hands the page the phrase it holds, as its one-time message. */
export const keystoreSends = async (phrase: string) => {
  await act(async () => {
    eventBus.emit('receiveOneTimeData', {
      tempSeed: { seed: phrase, hdPathTemplate: BIP44_STANDARD_DERIVATION_TEMPLATE }
    })
  })
  await flush()
}

/** The wallet lists the slot's basic account, holds its key and selects it, signed in. */
export const walletListsSlot = async () => {
  await setController('keystore', { keys: [slotKey] })
  await setController('accounts', { accounts: [basicAccount] })
  await setController('selected', { account: basicAccount })
  await setController('auth', { authStatus: 'authenticated' })
}

/** The recovery entry the account step writes, with the slot's basic account receiving control by default. */
export const writeEntry = async (
  route: 'fresh-install' | 'logged-in' = 'fresh-install',
  receivingAccount: Address = ORDINARY_KEY
) => {
  await createWalletRecords({ storage: extensionRecordStorage })
    .recoveryEntry(CHAIN_IDS[WALLET_RECOVERY_CHAIN], LOST_ACCOUNT)
    .write({ account: LOST_ACCOUNT, route, receivingAccount })
}

export const resetEdge = () => {
  mockControllers.state = freshControllers()
  mockEdge.events = []
  mockEdge.phrases = [PHRASE]
  mockEdge.made = 0
  mockEdge.derived = []
  mockStorage.entries.clear()
  mockStorage.failReads = false
  Object.assign(mockChain, {
    gasPrice: 1_000_000_000n,
    balance: 0n,
    fail: false,
    balanceReads: [],
    destroyed: 0
  })
  visits.length = 0
}

export const unmount = () => {
  if (root) {
    const current = root
    act(() => current.unmount())
  }
  container?.remove()
  root = null
  container = null
}

/** A fresh tab at `path`, with the router state a navigation would carry. */
export const mount = async (path: string, state: unknown = null) => {
  unmount()
  container = document.createElement('div')
  document.body.appendChild(container)
  root = createRoot(container)
  const [pathname, search = ''] = path.split('?')
  const current = root
  await act(async () => {
    current.render(
      <MemoryRouter
        future={{ v7_startTransition: true, v7_relativeSplatPath: true }}
        initialEntries={[{ pathname, search: search ? `?${search}` : '', state }]}
      >
        <ThemeContext.Provider value={THEME_CONTEXT}>
          <BackgroundServiceContext.Provider value={BACKGROUND}>
            <LocationProbe />
            <Routes>
              <Route path="/social-recovery/recover" element={<RecoverScreen />} />
              <Route path="/social-recovery/fast-track" element={<FastTrackScreen />} />
              <Route path="/social-recovery/fast-track/key" element={<KeyStepScreen />} />
              <Route path="/social-recovery/fast-track/gas" element={<GasStepScreen />} />
              <Route path="*" element={null} />
            </Routes>
          </BackgroundServiceContext.Provider>
        </ThemeContext.Provider>
      </MemoryRouter>
    )
  })
  await flush()
}
