/**
 * @jest-environment jsdom
 *
 * The save's route mounted whole: the settings chrome, the real records over
 * an in-memory `browser.storage.local`, the real recovery password holder, the
 * review's own reads and gate, and the save's real steps. The account's facts,
 * the recovery client and the send port are the three seams the test hands
 * in: the facts are the library's own smart account, the client a fake whose
 * reads and writes answer as each test sets them, and the port a recording
 * fake.
 *
 * The route is reached the ways the wallet reaches it: by the review's push,
 * or by a reload, a typed address, back or forward, which the router reads as
 * a pop. A reload is a fresh mount at the route with the password holder
 * emptied, as a new tab starts it. An account switch remounts the step.
 *
 * The screen holds a save in progress outside itself, one per chain and
 * account, for as long as the screen is away from it. So each test runs on an
 * account of its own, and no test meets a save another test left behind.
 */
import { createRoot, Root } from 'react-dom/client'
import { act } from 'react-dom/test-utils'
import { TextDecoder, TextEncoder } from 'util'

import type { Account } from '@ambire-common/interfaces/account'
import type { ThemeContextReturnType } from '@common/contexts/themeContext'
import type { ThemeProps } from '@common/styles/themeConfig'
import type {
  Clause,
  SetupConfirmation,
  SetupDraft
} from '@web/modules/social-recovery/sdk-interfaces'
import type {
  KeyHandle,
  SendPort,
  SendRequestAction,
  SubmittedOperation
} from '@web/modules/social-recovery/shared/client'
import type { ArmKitClient } from '@web/modules/social-recovery/setup/arm'
import type { Chain } from '@web/modules/social-recovery/setup/arm/__tests__/harness'

Object.assign(globalThis, { TextEncoder, TextDecoder })
;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true

const mockSelected: {
  current: { addr: string; preferences: { label: string } } | null
  listeners: Set<() => void>
} = { current: null, listeners: new Set() }
const mockFacts = new Map<string, unknown>()
const mockClient: { current: unknown } = { current: { status: 'loading' } }
const mockPort: { current: SendPort | null } = { current: null }

jest.mock('@web/hooks/useSelectedAccountControllerState', () => ({
  __esModule: true,
  default: () => {
    const { useSyncExternalStore } = jest.requireActual<typeof import('react')>('react')
    const account = useSyncExternalStore(
      (listener: () => void) => {
        mockSelected.listeners.add(listener)
        return () => {
          mockSelected.listeners.delete(listener)
        }
      },
      () => mockSelected.current
    )
    return { account }
  }
}))
jest.mock('@web/hooks/useKeystoreControllerState', () => ({
  __esModule: true,
  default: () => ({
    hasPasswordSecret: true,
    statuses: { unlockWithSecret: 'INITIAL' },
    errorMessage: ''
  })
}))
jest.mock('@web/hooks/useAccountsControllerState', () => ({
  __esModule: true,
  default: () => ({ accounts: [] })
}))
const mockQueue: { current: { userRequests: { id: string }[] }; listeners: Set<() => void> } = {
  current: { userRequests: [] },
  listeners: new Set()
}
jest.mock('@web/hooks/useRequestsControllerState', () => ({
  __esModule: true,
  default: () => {
    const { useSyncExternalStore } = jest.requireActual<typeof import('react')>('react')
    return useSyncExternalStore(
      (listener: () => void) => {
        mockQueue.listeners.add(listener)
        return () => {
          mockQueue.listeners.delete(listener)
        }
      },
      () => mockQueue.current
    )
  }
}))
jest.mock('@web/modules/social-recovery/shared/client/useAccountFacts', () => ({
  useAccountFacts: (account: string | undefined) =>
    mockFacts.get(account?.toLowerCase() ?? '') ?? mockFacts.get('loading')
}))
jest.mock('@web/modules/social-recovery/shared/client/useRecoveryClient', () => ({
  useRecoveryClient: () => mockClient.current
}))
const mockPortOptions: unknown[] = []
jest.mock('@web/modules/social-recovery/shared/client', () => ({
  ...jest.requireActual('@web/modules/social-recovery/shared/client'),
  createSendPort: (_requests: unknown, options: unknown) => {
    mockPortOptions.push(options)
    return mockPort.current
  }
}))
const mockEntries = new Map<string, unknown>()
const mockRemovals: string[][] = []
const mockOnRemove: { current: ((keys: string[]) => void) | null } = { current: null }
/** Where set, the next storage read waits for it, then reads the entries as they stand then. */
const mockReadHold: { current: Promise<void> | null } = { current: null }
jest.mock('@web/constants/browserapi', () => ({
  ...jest.requireActual('@web/constants/browserapi'),
  browser: {
    storage: {
      local: {
        get: async () => {
          const hold = mockReadHold.current
          if (hold) {
            mockReadHold.current = null
            await hold
          }
          return Object.fromEntries(mockEntries)
        },
        set: async (items: Record<string, unknown>) => {
          Object.entries(items).forEach(([key, value]) => mockEntries.set(key, value))
        },
        remove: async (keys: string[]) => {
          mockRemovals.push(keys)
          keys.forEach((key) => mockEntries.delete(key))
          mockOnRemove.current?.(keys)
        }
      }
    }
  }
}))
// Jest's config transforms neither images nor these packages' ES modules.
jest.mock('@web/assets/kohaku-horizontal.png', () => 'kohaku-horizontal.png')
jest.mock('react-native-keyboard-aware-scroll-view', () => ({
  KeyboardAwareScrollView: jest.requireActual('react-native').ScrollView
}))
jest.mock('@common/utils/clipboard', () => ({ setStringAsync: async () => true }))
// The spinner's animation needs a native module jsdom lacks.
jest.mock('@common/components/Spinner', () => ({ __esModule: true, default: () => null }))
// Jest resolves no `.web` platform file, so the navigation takes the web build's.
jest.mock('@common/hooks/useNavigation', () =>
  jest.requireActual('@common/hooks/useNavigation/useNavigation.web')
)

/* eslint-disable @typescript-eslint/no-var-requires, global-require */
const React: typeof import('react') = require('react')
const {
  MemoryRouter,
  Route,
  Routes,
  useLocation,
  useNavigate,
  useNavigationType
}: typeof import('react-router-dom') = require('react-router-dom')
const {
  WEB_ROUTES
}: typeof import('@common/modules/router/constants/common') = require('@common/modules/router/constants/common')
const { t }: { t: (key: string, options?: object) => string } =
  require('@common/config/localization').default
const {
  ThemeContext
}: typeof import('@common/contexts/themeContext') = require('@common/contexts/themeContext')
const themeConfig: typeof import('@common/styles/themeConfig') = require('@common/styles/themeConfig')
const {
  BackgroundServiceContext
}: typeof import('@web/contexts/backgroundServiceContext') = require('@web/contexts/backgroundServiceContext')
const {
  emptySlot,
  readRecoveryPassword,
  setRecoveryPassword,
  wipeRecoveryPassword
}: typeof import('@web/modules/social-recovery/shared/records') = require('@web/modules/social-recovery/shared/records')
const {
  createArmStore,
  FOLLOW_REREAD_MS,
  GONE_GRACE_MS,
  RECEIPT_WAIT_MS,
  saveStepsOf,
  startSave
}: typeof import('@web/modules/social-recovery/setup/arm') = require('@web/modules/social-recovery/setup/arm')
const eventBus: typeof import('@web/extension-services/event/eventBus').default =
  require('@web/extension-services/event/eventBus').default
const ArmScreen: typeof import('@web/modules/social-recovery/setup/arm/ArmScreen').default =
  require('@web/modules/social-recovery/setup/arm/ArmScreen').default
const harness: typeof import('@web/modules/social-recovery/setup/arm/__tests__/harness') = require('@web/modules/social-recovery/setup/arm/__tests__/harness')
/* eslint-enable @typescript-eslint/no-var-requires, global-require */

const {
  CHAIN_ID,
  chainReadsFor,
  confirmation,
  DESCRIPTOR,
  descriptionOf,
  draftOf,
  factsOf,
  feeReading,
  keyedAccount,
  landedReceipt,
  nodeError,
  PASSWORD,
  preparedOf,
  receiptsFor,
  REMOVED_KEY,
  sendPortFor,
  setupStateOf
} = harness

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

/** The operations the account's activity lists for a page that reads it; null where it does not answer. */
const activity: { current: SubmittedOperation[] | null } = { current: [] }

/**
 * The background the route sends its requests through: the send port the test
 * hands in replaces the sends, and the activity answers each page a reading
 * asks for over the event bus, as the background pushes it.
 */
const backgroundDispatch = jest.fn((action: SendRequestAction) => {
  const items = activity.current
  if (action.type !== 'MAIN_CONTROLLER_ACTIVITY_SET_ACC_OPS_FILTERS' || items === null) {
    return
  }
  const { sessionId, pagination } = action.params
  harness.unawaited(
    Promise.resolve().then(() =>
      eventBus.emit('activity', {
        accountsOps: {
          [String(sessionId)]: {
            result: { items, currentPage: pagination?.fromPage ?? 0, maxPages: 1 }
          }
        }
      })
    )
  )
})
const BACKGROUND = { dispatch: backgroundDispatch, windowId: undefined } as never

/** The wallet's queue now holds the ids given; the screen's hook and the queue's push both carry it. */
const setQueue = (ids: string[]) =>
  act(() => {
    mockQueue.current = { userRequests: ids.map((id) => ({ id })) }
    mockQueue.listeners.forEach((listener) => listener())
    eventBus.emit('requests', mockQueue.current)
  })

const REVIEW_PATH = `/${WEB_ROUTES.socialRecoverySetupReview}`
const SAVE_PATH = `/${WEB_ROUTES.socialRecoverySetupSave}`
const CARD_PATH = `/${WEB_ROUTES.socialRecoverySetupCard}`

/** Where the router stands, and its navigation, as the probe last read them. */
const router: {
  pathname: string
  search: string
  hash: string
  state: unknown
  type: string
  navigate: ((to: string | number) => void) | null
  push: ((to: string, state: unknown) => void) | null
} = { pathname: '', search: '', hash: '', state: null, type: '', navigate: null, push: null }

const RouterProbe = () => {
  const { pathname, search, hash, state } = useLocation()
  const navigate = useNavigate()
  router.pathname = pathname
  router.search = search
  router.hash = hash
  router.state = state
  router.type = useNavigationType()
  router.push = (to, held) => navigate(to, { state: held })
  router.navigate = (to) => {
    if (typeof to === 'number') {
      navigate(to)
    } else {
      navigate(to)
    }
  }
  return null
}

const DECLARATION = {
  answered: true as const,
  value: {
    admin: '0x0000000000000000000000000000000000000000' as const,
    pendingAdmin: '0x0000000000000000000000000000000000000000' as const,
    trustedKeys: [],
    pauseHolder: '0x0000000000000000000000000000000000000000' as const,
    pendingPauseHolder: '0x0000000000000000000000000000000000000000' as const
  }
}

const CHAIN: Chain = {
  removedKey: { kind: 'named', key: REMOVED_KEY },
  fitCheck: { basis: 'deployed-code', fits: true },
  setupState: setupStateOf(false),
  paused: { answered: true, value: false },
  confirm: confirmation(true, true),
  send: 'sent'
}

let container: HTMLDivElement
let root: Root
let seed = 0x51a7e
let account: Account
let key: KeyHandle
let address: `0x${string}`
let other: Account
let otherKey: KeyHandle
let chain: Chain
let port: ReturnType<typeof sendPortFor>
let prepareCommitSetup: jest.Mock
let confirmSetup: jest.Mock
let setupState: jest.Mock
let reads: ReturnType<typeof chainReadsFor>
let receipts: ReturnType<typeof receiptsFor>

const settle = () =>
  act(async () => {
    for (let round = 0; round < 8; round += 1) {
      // eslint-disable-next-line no-await-in-loop
      await new Promise((resolve) => {
        setTimeout(resolve, 0)
      })
    }
  })

/** The stored saves in flight on this device. */
const storedSaves = () =>
  [...mockEntries.keys()].filter((entry) => entry.includes(':saveInFlight:'))

/** The wipes after an agreed check: one removal of the six setup records with the save in flight. */
const wipes = () =>
  mockRemovals.filter(
    (keys) => keys.length > 1 && keys.some((entry) => entry.includes(':saveInFlight:'))
  ).length

const byTestId = (id: string) => container.querySelector<HTMLElement>(`[data-testid="${id}"]`)
const pageText = () => container.textContent ?? ''
const press = async (id: string) => {
  const node = byTestId(id)
  if (!node) {
    throw new Error(`nothing to press: ${id}`)
  }
  await act(async () => {
    node.click()
  })
  await settle()
}

/** Presses the pressable that shows exactly this text. */
const pressText = async (text: string) => {
  const node = Array.from(container.querySelectorAll<HTMLElement>('[tabindex]')).find(
    (candidate) => candidate.textContent === text
  )
  if (!node) {
    throw new Error(`no button reads ${text}`)
  }
  await act(async () => {
    node.click()
  })
  await settle()
}

/** A promise the test settles by hand, for an edge that must hold a run at one step. */
const held = <T,>() => {
  let release: (value: T) => void = () => {}
  const promise = new Promise<T>((resolve) => {
    release = resolve
  })
  return { promise, release }
}

const writeRecords = async (draft: SetupDraft, passwordSet = true, owner: string = address) => {
  const { createWalletRecords, extensionRecordStorage } = jest.requireActual<
    typeof import('@web/modules/social-recovery/shared/records')
  >('@web/modules/social-recovery/shared/records')
  const setup = createWalletRecords({ storage: extensionRecordStorage }).setup(
    CHAIN_ID,
    owner as `0x${string}`
  )
  await setup.setupDraft.write(draft)
  await setup.enrollments.write([])
  if (passwordSet) {
    await setup.passwordSet.write('password-set')
  }
}

const wireClient = (facts: 'ready' | 'loading' | 'view-only' | 'state-unread', deployed = true) => {
  port = sendPortFor(chain.send === 'sent' ? 'sent' : chain.send, address, chain.estimation)
  mockPort.current = port
  prepareCommitSetup = jest.fn(async () => preparedOf(address, false))
  confirmSetup = jest.fn(async () => {
    if (chain.confirm instanceof Error) {
      throw chain.confirm
    }
    return chain.confirm
  })
  setupState = jest.fn(async () => chain.setupState)
  reads = chainReadsFor('enough')
  receipts = receiptsFor('landed')
  const kit = {
    chain: 'sepolia',
    descriptor: DESCRIPTOR,
    moduleReads: {
      trustedParties: async () => DECLARATION,
      moduleInfo: async () => ({
        answered: true,
        value: { name: 'method', version: '1.0.0', supportsInterface: true }
      }),
      paused: async () => chain.paused
    },
    setup: {
      setupState,
      describeSetup: async () => descriptionOf(),
      prepareCommitSetup,
      confirmSetup
    },
    walletReads: {
      removedKey: async () => chain.removedKey,
      fitCheck: async () => chain.fitCheck
    }
  }
  mockClient.current = { status: 'ready', client: kit, reads, receipts, retry: jest.fn() }
  const retry = jest.fn()
  mockFacts.set(
    address.toLowerCase(),
    facts === 'ready'
      ? { status: 'ready', facts: factsOf(account, { deployed, key }), retry }
      : facts === 'view-only'
      ? { status: 'ready', facts: factsOf(account, { key: null }), retry }
      : facts === 'state-unread'
      ? { status: 'unavailable', cause: 'state-unread', retry }
      : { status: 'loading', retry }
  )
  mockFacts.set(other.addr.toLowerCase(), {
    status: 'ready',
    facts: factsOf(other, { key: otherKey }),
    retry
  })
}

const select = (owner: string, label = 'Account 1') =>
  act(() => {
    mockSelected.current = { addr: owner, preferences: { label } }
    mockSelected.listeners.forEach((listener) => listener())
  })

const tree = (entries: string[], index: number) => (
  <MemoryRouter initialEntries={entries} initialIndex={index}>
    <ThemeContext.Provider value={THEME_CONTEXT}>
      <BackgroundServiceContext.Provider value={BACKGROUND}>
        <Routes>
          <Route path={SAVE_PATH} element={<ArmScreen />} />
          <Route path="*" element={null} />
        </Routes>
        <RouterProbe />
      </BackgroundServiceContext.Provider>
    </ThemeContext.Provider>
  </MemoryRouter>
)

const mountAt = async (entries: string[], index = entries.length - 1) => {
  act(() => root.unmount())
  root = createRoot(container)
  await act(async () => {
    root.render(tree(entries, index))
  })
  await settle()
}

const go = async (to: string | number) => {
  await act(async () => {
    router.navigate?.(to)
  })
  await settle()
}

/** The review's Save: an in-app push to the route. */
const openByPush = async () => {
  await mountAt([REVIEW_PATH])
  await go(SAVE_PATH)
}

/** The route's address typed into a tab that still holds the recovery password. */
const openByAddress = () => mountAt([SAVE_PATH])

/** A new tab: the password held in memory is gone, and the screen mounts afresh at the route. */
const reload = async () => {
  wipeRecoveryPassword(CHAIN_ID, address)
  await mountAt([SAVE_PATH])
}

/** Away to another account and back, which remounts the step at the same entry. */
const switchAway = async () => {
  await select(other.addr)
  await settle()
  await select(address)
  await settle()
}

beforeEach(async () => {
  container = document.createElement('div')
  document.body.appendChild(container)
  root = createRoot(container)
  mockEntries.clear()
  mockRemovals.length = 0
  mockOnRemove.current = null
  mockReadHold.current = null
  mockPortOptions.length = 0
  mockFacts.clear()
  mockQueue.current = { userRequests: [] }
  activity.current = []
  mockFacts.set('loading', { status: 'loading', retry: jest.fn() })
  chain = { ...CHAIN }
  seed += 2
  ;({ account, key } = await keyedAccount(seed))
  ;({ account: other, key: otherKey } = await keyedAccount(seed + 1))
  address = account.addr as `0x${string}`
  mockSelected.current = { addr: address, preferences: { label: 'Account 1' } }
  setRecoveryPassword(CHAIN_ID, address, PASSWORD)
})

afterEach(() => {
  act(() => root.unmount())
  container.remove()
  wipeRecoveryPassword(CHAIN_ID, address)
  wipeRecoveryPassword(CHAIN_ID, other.addr as `0x${string}`)
})

describe('the start of the save', () => {
  it('starts once where the review pushed the route, replaces the push, and after the agreed check wipes the records and shows the saved screen', async () => {
    await writeRecords(draftOf('encrypted'))
    wireClient('ready')
    await openByPush()

    expect(port.sendAccountBatch).toHaveBeenCalledTimes(1)
    expect(port.sendAccountBatch.mock.calls[0][0]).toBe(address)
    expect(router.pathname).toBe(SAVE_PATH)
    expect(router.type).toBe('REPLACE')
    expect(byTestId('arm-saved')).not.toBeNull()
    expect(pageText()).toContain(t('socialRecovery.arm.title'))
    expect(mockEntries.size).toBe(0)
    expect(readRecoveryPassword(CHAIN_ID, address)).toBe(PASSWORD)

    await press('arm-saved-continue')
    expect(router.pathname).toBe(CARD_PATH)
    expect(router.search).toBe('?level=hidden')
  })

  it('does not start a second save when the route renders again after the save ended', async () => {
    chain.send = 'refused'
    await writeRecords(draftOf('encrypted'))
    wireClient('ready')
    await openByPush()
    expect(byTestId('arm-write-failedNotSent')).not.toBeNull()

    await select(address, 'Renamed')
    await settle()

    expect(port.sendAccountBatch).toHaveBeenCalledTimes(1)
    expect(byTestId('arm-write-failedNotSent')).not.toBeNull()
    expect(mockEntries.size).toBeGreaterThan(0)
  })

  it('does not start again on a remount at the entry the push started, and shows the Save button instead', async () => {
    chain.send = 'refused'
    await writeRecords(draftOf('encrypted'))
    wireClient('ready')
    await openByPush()
    expect(port.sendAccountBatch).toHaveBeenCalledTimes(1)

    await switchAway()

    expect(router.type).toBe('REPLACE')
    expect(port.sendAccountBatch).toHaveBeenCalledTimes(1)
    expect(byTestId('arm-write-failedNotSent')).toBeNull()
    expect(byTestId('arm-save')).not.toBeNull()
  })

  it("replaces the push at once while the account's facts load, and starts that save by itself once they read ready", async () => {
    await writeRecords(draftOf('encrypted'))
    wireClient('loading')
    await openByPush()

    expect(router.type).toBe('REPLACE')
    expect(router.pathname).toBe(SAVE_PATH)
    expect(byTestId('arm-save')).toBeNull()
    expect(prepareCommitSetup).not.toHaveBeenCalled()
    expect(port.sendAccountBatch).not.toHaveBeenCalled()

    mockFacts.set(address.toLowerCase(), {
      status: 'ready',
      facts: factsOf(account, { key }),
      retry: jest.fn()
    })
    await select(address)
    await settle()

    expect(port.sendAccountBatch).toHaveBeenCalledTimes(1)
    expect(port.sendAccountBatch.mock.calls[0][0]).toBe(address)
    expect(byTestId('arm-saved')).not.toBeNull()
  })

  it("starts nothing for another account selected while the pushed account's facts load, and shows it the summary with the Save button", async () => {
    await writeRecords(draftOf('encrypted'))
    await writeRecords(draftOf('clear'), true, other.addr)
    wireClient('loading')
    await openByPush()
    expect(port.sendAccountBatch).not.toHaveBeenCalled()

    await select(other.addr)
    await settle()

    expect(router.type).toBe('REPLACE')
    expect(prepareCommitSetup).not.toHaveBeenCalled()
    expect(port.sendAccountBatch).not.toHaveBeenCalled()
    expect(byTestId('arm-save')?.textContent).toBe(t('socialRecovery.review.save'))
    expect(byTestId('arm-removed-key')).not.toBeNull()
    expect(byTestId('arm-cost-line')).not.toBeNull()

    await press('arm-save')

    expect(port.sendAccountBatch).toHaveBeenCalledTimes(1)
    expect(port.sendAccountBatch.mock.calls[0][0]).toBe(other.addr)
  })

  const POPS: [string, SetupDraft['privacy']['backup'], () => Promise<void>][] = [
    ['a reload', 'clear', reload],
    ['a typed address', 'encrypted', openByAddress],
    [
      'forward',
      'encrypted',
      async () => {
        await mountAt([REVIEW_PATH, SAVE_PATH], 0)
        await go(1)
      }
    ],
    [
      'back',
      'encrypted',
      async () => {
        await mountAt([SAVE_PATH, CARD_PATH], 1)
        await go(-1)
      }
    ]
  ]

  POPS.forEach(([named, backup, open]) =>
    it(`shows the summary with the Save button after ${named}, sends nothing by itself, and the button starts the save once`, async () => {
      await writeRecords(draftOf(backup))
      wireClient('ready')
      await open()

      expect(router.pathname).toBe(SAVE_PATH)
      expect(router.type).toBe('POP')
      expect(byTestId('arm-save')?.textContent).toBe(t('socialRecovery.review.save'))
      expect(byTestId('arm-removed-key')).not.toBeNull()
      expect(byTestId('arm-cost-line')).not.toBeNull()
      expect(prepareCommitSetup).not.toHaveBeenCalled()
      expect(port.sendAccountBatch).not.toHaveBeenCalled()

      await press('arm-save')

      expect(port.sendAccountBatch).toHaveBeenCalledTimes(1)
      expect(byTestId('arm-saved')).not.toBeNull()
      expect(byTestId('arm-save')).toBeNull()
    })
  )

  it('starts once on a double press of the Save button', async () => {
    await writeRecords(draftOf('encrypted'))
    wireClient('ready')
    await openByAddress()
    const button = byTestId('arm-save')
    expect(button).not.toBeNull()

    await act(async () => {
      button?.click()
      button?.click()
    })
    await settle()

    expect(prepareCommitSetup).toHaveBeenCalledTimes(1)
    expect(port.sendAccountBatch).toHaveBeenCalledTimes(1)
  })

  it('reads the setup when the button starts the save, and ends as already set up where another tab saved meanwhile', async () => {
    await writeRecords(draftOf('encrypted'))
    wireClient('ready')
    await openByAddress()
    expect(byTestId('arm-save')).not.toBeNull()
    const arrivalReads = setupState.mock.calls.length
    chain.setupState = setupStateOf(true)

    await press('arm-save')

    expect(setupState.mock.calls.length).toBe(arrivalReads + 1)
    expect(byTestId('review-blocked-already-set-up')).not.toBeNull()
    expect(prepareCommitSetup).not.toHaveBeenCalled()
    expect(port.sendAccountBatch).not.toHaveBeenCalled()
    expect(mockEntries.size).toBeGreaterThan(0)
  })

  it('reads the setup on the start the push made, and ends as already set up where one landed after the arrival read', async () => {
    await writeRecords(draftOf('encrypted'))
    wireClient('ready')
    setupState.mockImplementationOnce(async () => {
      chain.setupState = setupStateOf(true)
      return setupStateOf(false)
    })
    await openByPush()

    expect(byTestId('review-blocked-already-set-up')).not.toBeNull()
    expect(prepareCommitSetup).not.toHaveBeenCalled()
    expect(port.sendAccountBatch).not.toHaveBeenCalled()
  })
})

describe('a save in progress across remounts', () => {
  const LIVE: [string, string, () => () => void][] = [
    [
      'while the gas check runs',
      'arm-write-checkingGas',
      () => {
        const gate = held<bigint>()
        reads.nativeBalance.mockImplementationOnce(() => gate.promise)
        return () => gate.release(10n ** 18n)
      }
    ],
    [
      'while the batch is submitting',
      'arm-write-submitting',
      () => {
        const gate = held<`0x${string}`>()
        port.sendAccountBatch.mockImplementationOnce(() => gate.promise)
        return () => gate.release(harness.TX_HASH)
      }
    ],
    [
      'while the check after the landing runs',
      'arm-confirming',
      () => {
        const gate = held<SetupConfirmation>()
        confirmSetup.mockImplementationOnce(() => gate.promise)
        return () => gate.release(confirmation(true, true))
      }
    ]
  ]

  LIVE.forEach(([named, shown, hold]) =>
    it(`takes up the save ${named} on a remount, sends nothing more, and saves once it ends`, async () => {
      await writeRecords(draftOf('encrypted'))
      wireClient('ready')
      const release = hold()
      await openByPush()
      expect(byTestId(shown)).not.toBeNull()

      await select(other.addr)
      await settle()
      expect(byTestId(shown)).toBeNull()
      await select(address)
      await settle()

      expect(byTestId(shown)).not.toBeNull()
      expect(byTestId('arm-save')).toBeNull()
      expect(prepareCommitSetup).toHaveBeenCalledTimes(1)

      await act(async () => {
        release()
      })
      await settle()

      expect(byTestId('arm-saved')).not.toBeNull()
      expect(port.sendAccountBatch).toHaveBeenCalledTimes(1)
      expect(prepareCommitSetup).toHaveBeenCalledTimes(1)
      expect(confirmSetup).toHaveBeenCalledTimes(1)
      expect(mockEntries.size).toBe(0)
    })
  )

  it("keeps another account's save apart: its own button, its own batch, and the first save still held", async () => {
    await writeRecords(draftOf('encrypted'))
    await writeRecords(draftOf('clear'), true, other.addr)
    wireClient('ready')
    const gate = held<`0x${string}`>()
    port.sendAccountBatch.mockImplementationOnce(() => gate.promise)
    await openByPush()
    expect(byTestId('arm-write-submitting')).not.toBeNull()

    await select(other.addr)
    await settle()
    expect(byTestId('arm-write-submitting')).toBeNull()
    expect(byTestId('arm-save')).not.toBeNull()
    await press('arm-save')
    expect(port.sendAccountBatch).toHaveBeenCalledTimes(2)
    expect(port.sendAccountBatch.mock.calls[1][0]).toBe(other.addr)

    await select(address)
    await settle()
    expect(byTestId('arm-write-submitting')).not.toBeNull()
    await act(async () => {
      gate.release(harness.TX_HASH)
    })
    await settle()
    expect(byTestId('arm-saved')).not.toBeNull()
    expect(port.sendAccountBatch).toHaveBeenCalledTimes(2)
  })

  /** How a save ended, what it showed, whether its batch left a setup on the account, and what the next arrival shows. */
  const ENDED: {
    named: string
    arrange: () => void
    ended: string
    setUp: boolean
    arrival: string
  }[] = [
    {
      named: 'saved',
      arrange: () => {},
      ended: 'arm-saved',
      setUp: true,
      arrival: 'review-blocked-already-set-up'
    },
    {
      named: 'already set up',
      arrange: () => {
        setupState.mockImplementationOnce(async () => {
          chain.setupState = setupStateOf(true)
          return setupStateOf(false)
        })
      },
      ended: 'review-blocked-already-set-up',
      setUp: true,
      arrival: 'review-blocked-already-set-up'
    },
    {
      named: 'never sent',
      arrange: () => {
        port.sendAccountBatch.mockRejectedValueOnce(new Error('the window closed'))
      },
      ended: 'arm-write-failedNotSent',
      setUp: false,
      arrival: 'arm-save'
    },
    {
      named: 'short of gas',
      arrange: () => {
        reads.nativeBalance.mockResolvedValueOnce(0n)
      },
      ended: 'arm-gas-blocker',
      setUp: false,
      arrival: 'arm-save'
    },
    {
      named: 'disagreed',
      arrange: () => {
        chain.confirm = confirmation(true, false)
      },
      ended: 'arm-disagreed-authorization',
      setUp: true,
      arrival: 'review-blocked-already-set-up'
    }
  ]

  ENDED.forEach(({ named, arrange, ended, setUp, arrival }) =>
    it(`reads the account again from the start on a remount after a save that ended ${named}`, async () => {
      await writeRecords(draftOf('encrypted'))
      wireClient('ready')
      arrange()
      await openByPush()
      expect(byTestId(ended)).not.toBeNull()
      const sends = port.sendAccountBatch.mock.calls.length
      const setupReads = setupState.mock.calls.length
      chain.setupState = setupStateOf(setUp)

      await switchAway()

      if (ended !== arrival) {
        expect(byTestId(ended)).toBeNull()
      }
      expect(byTestId(arrival)).not.toBeNull()
      expect(setupState.mock.calls.length).toBeGreaterThan(setupReads)
      expect(port.sendAccountBatch).toHaveBeenCalledTimes(sends)
    })
  )

  it('keeps a refusal whose operation may still land across a remount whose arrival reads no setup: no Save button, no retry, nothing sent', async () => {
    chain.send = 'not-a-transaction'
    await writeRecords(draftOf('encrypted'))
    wireClient('ready')
    await openByPush()
    expect(byTestId('arm-write-failedNotSent')).not.toBeNull()

    await switchAway()

    expect(byTestId('arm-write-failedNotSent')).not.toBeNull()
    expect(byTestId('arm-save')).toBeNull()
    // The one control is check again, which reads the setup; nothing retries the save.
    expect(pageText()).toContain(t('socialRecovery.arm.mayStillLand'))
    expect(pageText()).not.toContain(t('socialRecovery.writes.tryAgain'))
    expect(byTestId('arm-check-setup')?.textContent).toBe(t('socialRecovery.arm.checkAgain'))
    expect(byTestId('review-blocked-already-set-up')).toBeNull()
    expect(prepareCommitSetup).toHaveBeenCalledTimes(1)
    expect(port.sendAccountBatch).toHaveBeenCalledTimes(1)
  })

  it('runs the check on a kept refusal whose operation may still land where the arrival reads a setup, and saves with one wipe', async () => {
    chain.send = 'not-a-transaction'
    await writeRecords(draftOf('encrypted'))
    wireClient('ready')
    await openByPush()
    expect(byTestId('arm-write-failedNotSent')).not.toBeNull()
    chain.setupState = setupStateOf(true)

    await switchAway()

    expect(byTestId('arm-write-failedNotSent')).toBeNull()
    expect(byTestId('arm-saved')).not.toBeNull()
    // No page followed a hash, so the saved screen shows none.
    expect(byTestId('arm-saved-explorer')).toBeNull()
    expect(confirmSetup).toHaveBeenCalledTimes(1)
    expect(confirmSetup).toHaveBeenCalledWith(draftOf('encrypted'), preparedOf(address, false))
    expect(mockEntries.size).toBe(0)
    expect(prepareCommitSetup).toHaveBeenCalledTimes(1)
    expect(port.sendAccountBatch).toHaveBeenCalledTimes(1)

    // The saved run is gone with the screen: a later arrival reads the setup on the account.
    await switchAway()

    expect(byTestId('review-blocked-already-set-up')).not.toBeNull()
    expect(byTestId('arm-save')).toBeNull()
    expect(confirmSetup).toHaveBeenCalledTimes(1)
    expect(port.sendAccountBatch).toHaveBeenCalledTimes(1)
  })

  it("runs the check on a kept refusal whose operation may still land where the arrival reads a setup before the account's facts load, and saves with one wipe", async () => {
    chain.send = 'not-a-transaction'
    await writeRecords(draftOf('encrypted'))
    wireClient('ready')
    await openByPush()
    expect(byTestId('arm-write-failedNotSent')).not.toBeNull()
    chain.setupState = setupStateOf(true)
    const setupReads = setupState.mock.calls.length
    const ready = mockFacts.get(address.toLowerCase())
    mockFacts.set(address.toLowerCase(), { status: 'loading', retry: jest.fn() })

    await switchAway()

    expect(setupState.mock.calls.length).toBeGreaterThan(setupReads)
    expect(confirmSetup).not.toHaveBeenCalled()

    mockFacts.set(address.toLowerCase(), ready)
    await select(address)
    await settle()

    expect(byTestId('arm-write-failedNotSent')).toBeNull()
    expect(byTestId('arm-saved')).not.toBeNull()
    expect(confirmSetup).toHaveBeenCalledTimes(1)
    expect(port.sendAccountBatch).toHaveBeenCalledTimes(1)
    expect(mockEntries.size).toBe(0)
  })

  it('keeps an unanswered check across a remount, and its retry reads again and saves and wipes once', async () => {
    chain.confirm = new Error('the node did not answer')
    await writeRecords(draftOf('encrypted'))
    wireClient('ready')
    await openByPush()
    expect(byTestId('arm-unread')).not.toBeNull()
    const checks = confirmSetup.mock.calls.length
    chain.setupState = setupStateOf(true)

    await switchAway()

    expect(byTestId('arm-unread')).not.toBeNull()
    expect(byTestId('review-blocked-already-set-up')).toBeNull()
    expect(mockEntries.size).toBeGreaterThan(0)

    chain.confirm = confirmation(true, true)
    await press('arm-unread-retry')

    expect(confirmSetup).toHaveBeenCalledTimes(checks + 1)
    expect(byTestId('arm-saved')).not.toBeNull()
    expect(mockEntries.size).toBe(0)
    expect(port.sendAccountBatch).toHaveBeenCalledTimes(1)
    expect(prepareCommitSetup).toHaveBeenCalledTimes(1)
  })
})

describe('a receipt wait that failed after the batch was sent', () => {
  it('shows check again under the submitting state, keeps the records, and saves once checking again finds the receipt', async () => {
    await writeRecords(draftOf('encrypted'))
    wireClient('ready')
    receipts.wait.mockRejectedValueOnce(nodeError()).mockRejectedValueOnce(nodeError())
    await openByPush()

    expect(byTestId('arm-write-submitting')).not.toBeNull()
    expect(byTestId('arm-check-again')?.textContent).toBe(t('socialRecovery.arm.checkAgain'))
    expect(pageText()).not.toContain(t('socialRecovery.writes.tryAgain'))
    expect(confirmSetup).not.toHaveBeenCalled()
    expect(mockEntries.size).toBeGreaterThan(0)
    expect(byTestId('arm-saved')).toBeNull()

    receipts.wait.mockImplementation(async (hash: `0x${string}`) => landedReceipt(hash))
    await press('arm-check-again')

    expect(receipts.wait).toHaveBeenCalledTimes(3)
    expect(byTestId('arm-saved')).not.toBeNull()
    expect(port.sendAccountBatch).toHaveBeenCalledTimes(1)
    expect(mockEntries.size).toBe(0)
  })

  it('shows check again once one more wait runs past its limit, and saves once on a receipt that arrives after it', async () => {
    jest.useFakeTimers()
    const tick = (ms: number) => act(() => harness.advanceTimers(ms))
    try {
      await writeRecords(draftOf('encrypted'))
      wireClient('ready')
      const late = held<ReturnType<typeof landedReceipt>>()
      receipts.wait.mockRejectedValueOnce(nodeError()).mockImplementationOnce(() => late.promise)
      act(() => root.unmount())
      root = createRoot(container)
      await act(async () => {
        root.render(tree([REVIEW_PATH], 0))
      })
      await tick(100)
      await act(async () => {
        router.navigate?.(SAVE_PATH)
      })
      await tick(100)

      expect(byTestId('arm-write-submitting')).not.toBeNull()
      expect(byTestId('arm-check-again')).toBeNull()

      await tick(RECEIPT_WAIT_MS)

      expect(byTestId('arm-write-submitting')).not.toBeNull()
      expect(byTestId('arm-check-again')).not.toBeNull()
      expect(confirmSetup).not.toHaveBeenCalled()
      expect(mockEntries.size).toBeGreaterThan(0)

      await act(async () => {
        late.release(landedReceipt(harness.TX_HASH))
      })
      await tick(100)

      expect(byTestId('arm-saved')).not.toBeNull()
      expect(confirmSetup).toHaveBeenCalledTimes(1)
      expect(port.sendAccountBatch).toHaveBeenCalledTimes(1)
      expect(mockEntries.size).toBe(0)
    } finally {
      jest.useRealTimers()
    }
  })
})

describe('a first receipt wait that does not settle', () => {
  /** Opens the save by the review's push over Jest's fake clock, with the first receipt wait held. */
  const openWithFirstWaitHeld = async () => {
    const tick = (ms: number) => act(() => harness.advanceTimers(ms))
    await writeRecords(draftOf('encrypted'))
    wireClient('ready')
    const first = held<ReturnType<typeof landedReceipt>>()
    receipts.wait.mockImplementationOnce(() => first.promise)
    act(() => root.unmount())
    root = createRoot(container)
    await act(async () => {
      root.render(tree([REVIEW_PATH], 0))
    })
    await tick(100)
    await act(async () => {
      router.navigate?.(SAVE_PATH)
    })
    await tick(100)
    return { tick, first }
  }

  it('shows check again under the submitting state once the wait runs its limit, and takes the receipt it brings later once', async () => {
    jest.useFakeTimers()
    try {
      const { tick, first } = await openWithFirstWaitHeld()
      expect(byTestId('arm-write-submitting')).not.toBeNull()

      await tick(RECEIPT_WAIT_MS - 300)
      expect(byTestId('arm-check-again')).toBeNull()
      await tick(300)

      expect(byTestId('arm-write-submitting')).not.toBeNull()
      expect(byTestId('arm-check-again')?.textContent).toBe(t('socialRecovery.arm.checkAgain'))
      expect(receipts.wait).toHaveBeenCalledTimes(1)
      expect(confirmSetup).not.toHaveBeenCalled()
      expect(mockEntries.size).toBeGreaterThan(0)

      await act(async () => {
        first.release(landedReceipt(harness.TX_HASH))
      })
      await tick(100)

      expect(byTestId('arm-saved')).not.toBeNull()
      expect(byTestId('arm-check-again')).toBeNull()
      expect(receipts.wait).toHaveBeenCalledTimes(1)
      expect(confirmSetup).toHaveBeenCalledTimes(1)
      expect(port.sendAccountBatch).toHaveBeenCalledTimes(1)
      expect(mockEntries.size).toBe(0)
    } finally {
      jest.useRealTimers()
    }
  })

  it('takes up the first wait on check again while it still runs, opening no other, and checks and wipes once when it lands', async () => {
    jest.useFakeTimers()
    try {
      const { tick, first } = await openWithFirstWaitHeld()
      await tick(RECEIPT_WAIT_MS)

      await act(async () => {
        byTestId('arm-check-again')?.click()
      })
      await tick(100)

      expect(receipts.wait).toHaveBeenCalledTimes(1)
      expect(byTestId('arm-check-again')).toBeNull()
      expect(byTestId('arm-write-submitting')).not.toBeNull()

      await tick(RECEIPT_WAIT_MS)
      expect(byTestId('arm-check-again')).not.toBeNull()
      await act(async () => {
        byTestId('arm-check-again')?.click()
      })
      await tick(100)
      expect(receipts.wait).toHaveBeenCalledTimes(1)

      await act(async () => {
        first.release(landedReceipt(harness.TX_HASH))
      })
      await tick(100)

      expect(byTestId('arm-saved')).not.toBeNull()
      expect(receipts.wait).toHaveBeenCalledTimes(1)
      expect(confirmSetup).toHaveBeenCalledTimes(1)
      expect(port.sendAccountBatch).toHaveBeenCalledTimes(1)
      expect(prepareCommitSetup).toHaveBeenCalledTimes(1)
      expect(mockEntries.size).toBe(0)
    } finally {
      jest.useRealTimers()
    }
  })
})

describe('a save the wallet did not send', () => {
  it('shows a refusal as not a transaction with no failure title, its one line and check again: no retry, no Save, no back', async () => {
    chain.send = 'not-a-transaction'
    await writeRecords(draftOf('encrypted'))
    wireClient('ready')
    await openByPush()

    expect(byTestId('arm-write-failedNotSent')).not.toBeNull()
    expect(pageText()).not.toContain(t('socialRecovery.review.after.failedTitle'))
    expect(pageText()).not.toContain(t('socialRecovery.writes.notSent'))
    expect(pageText()).not.toContain(t('socialRecovery.review.after.notSent'))
    expect(byTestId('arm-save')).toBeNull()
    expect(byTestId('arm-back')).toBeNull()
    expect(pageText()).toContain(t('socialRecovery.arm.mayStillLand'))
    expect(byTestId('arm-check-setup')?.textContent).toBe(t('socialRecovery.arm.checkAgain'))
    expect(pageText()).not.toContain(t('socialRecovery.writes.tryAgain'))
    expect(port.sendAccountBatch).toHaveBeenCalledTimes(1)
    expect(storedSaves()).toHaveLength(1)
  })

  it('runs the check where check again finds the setup after a refusal as not a transaction, and saves with one wipe and nothing more sent', async () => {
    chain.send = 'not-a-transaction'
    await writeRecords(draftOf('encrypted'))
    wireClient('ready')
    await openByPush()
    const setupReads = setupState.mock.calls.length
    chain.setupState = setupStateOf(true)

    await press('arm-check-setup')

    expect(setupState).toHaveBeenCalledTimes(setupReads + 1)
    expect(byTestId('arm-saved')).not.toBeNull()
    expect(byTestId('arm-write-failedNotSent')).toBeNull()
    expect(byTestId('review-blocked-already-set-up')).toBeNull()
    expect(prepareCommitSetup).toHaveBeenCalledTimes(1)
    expect(port.sendAccountBatch).toHaveBeenCalledTimes(1)
    expect(confirmSetup).toHaveBeenCalledTimes(1)
    expect(mockEntries.size).toBe(0)
  })

  it('keeps a refusal as not a transaction where check again finds no setup: no retry, no Save button, nothing sent', async () => {
    chain.send = 'not-a-transaction'
    await writeRecords(draftOf('encrypted'))
    wireClient('ready')
    await openByPush()
    const setupReads = setupState.mock.calls.length

    await press('arm-check-setup')

    expect(setupState).toHaveBeenCalledTimes(setupReads + 1)
    expect(byTestId('arm-write-failedNotSent')).not.toBeNull()
    expect(byTestId('arm-check-setup')).not.toBeNull()
    expect(byTestId('arm-save')).toBeNull()
    expect(byTestId('review-blocked-already-set-up')).toBeNull()
    expect(prepareCommitSetup).toHaveBeenCalledTimes(1)
    expect(port.sendAccountBatch).toHaveBeenCalledTimes(1)
  })

  it('keeps a refusal as not a transaction where the setup read of check again throws, and check again can be pressed again', async () => {
    chain.send = 'not-a-transaction'
    await writeRecords(draftOf('encrypted'))
    wireClient('ready')
    await openByPush()
    const setupReads = setupState.mock.calls.length
    setupState.mockRejectedValueOnce(new Error('the node did not answer'))

    await press('arm-check-setup')

    expect(setupState).toHaveBeenCalledTimes(setupReads + 1)
    expect(byTestId('arm-write-failedNotSent')).not.toBeNull()
    expect(pageText()).not.toContain(t('socialRecovery.writes.notSent'))
    expect(byTestId('arm-check-setup')).not.toBeNull()
    expect(port.sendAccountBatch).toHaveBeenCalledTimes(1)

    chain.setupState = setupStateOf(true)
    await press('arm-check-setup')

    expect(setupState).toHaveBeenCalledTimes(setupReads + 2)
    expect(byTestId('arm-saved')).not.toBeNull()
    expect(confirmSetup).toHaveBeenCalledTimes(1)
    expect(port.sendAccountBatch).toHaveBeenCalledTimes(1)
  })

  it("leads to the deposit blocker where the sign screen's estimation read the key short, and Continue sends once the key holds enough", async () => {
    chain.send = 'refused'
    chain.estimation = feeReading({ error: true })
    await writeRecords(draftOf('encrypted'))
    wireClient('ready')
    reads.nativeBalance.mockResolvedValueOnce(10n ** 18n).mockResolvedValueOnce(0n)
    await openByPush()

    expect(byTestId('arm-gas-blocker')).not.toBeNull()
    expect(byTestId('arm-write-failedNotSent')).toBeNull()
    expect(port.sendAccountBatch).toHaveBeenCalledTimes(1)

    port.sendAccountBatch.mockResolvedValue(harness.TX_HASH)
    await press('arm-gas-continue')

    expect(port.sendAccountBatch).toHaveBeenCalledTimes(2)
    expect(byTestId('arm-saved')).not.toBeNull()
  })
})

describe("the deposit step's Continue", () => {
  it('reads the setup first and, where another tab saved meanwhile, ends as already set up with no gas check and nothing sent', async () => {
    await writeRecords(draftOf('encrypted'))
    wireClient('ready')
    reads.nativeBalance.mockResolvedValueOnce(0n)
    await openByPush()
    expect(byTestId('arm-gas-blocker')).not.toBeNull()
    const balances = reads.nativeBalance.mock.calls.length
    const estimates = reads.estimateGas.mock.calls.length
    const setupReads = setupState.mock.calls.length
    chain.setupState = setupStateOf(true)

    await press('arm-gas-continue')

    expect(setupState).toHaveBeenCalledTimes(setupReads + 1)
    expect(byTestId('review-blocked-already-set-up')).not.toBeNull()
    expect(byTestId('arm-gas-blocker')).toBeNull()
    expect(reads.nativeBalance).toHaveBeenCalledTimes(balances)
    expect(reads.estimateGas).toHaveBeenCalledTimes(estimates)
    expect(port.sendAccountBatch).not.toHaveBeenCalled()
    expect(prepareCommitSetup).toHaveBeenCalledTimes(1)
    expect(mockEntries.size).toBeGreaterThan(0)
  })

  it('reads the setup first and, where none is there, checks the gas again and sends once', async () => {
    await writeRecords(draftOf('encrypted'))
    wireClient('ready')
    reads.nativeBalance.mockResolvedValueOnce(0n)
    await openByPush()
    expect(byTestId('arm-gas-blocker')).not.toBeNull()
    const setupReads = setupState.mock.calls.length
    const balances = reads.nativeBalance.mock.calls.length

    await press('arm-gas-continue')

    // Once before the gas check, and once after the claim and before the send.
    expect(setupState).toHaveBeenCalledTimes(setupReads + 2)
    expect(reads.nativeBalance).toHaveBeenCalledTimes(balances + 1)
    expect(setupState.mock.invocationCallOrder[setupReads]).toBeLessThan(
      reads.nativeBalance.mock.invocationCallOrder[balances]
    )
    expect(setupState.mock.invocationCallOrder[setupReads + 1]).toBeGreaterThan(
      reads.nativeBalance.mock.invocationCallOrder[balances]
    )
    expect(setupState.mock.invocationCallOrder[setupReads + 1]).toBeLessThan(
      port.sendAccountBatch.mock.invocationCallOrder[0]
    )
    expect(port.sendAccountBatch).toHaveBeenCalledTimes(1)
    expect(prepareCommitSetup).toHaveBeenCalledTimes(1)
    expect(byTestId('arm-saved')).not.toBeNull()
  })
})

describe('the blocks on arrival', () => {
  const BLOCKED: [string, string, (draft: { clauses: Clause[] }) => void][] = [
    [
      'a trust read that did not answer',
      'unavailable',
      () => {
        chain.paused = { answered: false }
      }
    ],
    [
      'a removed key the wallet cannot read',
      'removed-key-unreadable',
      () => {
        chain.removedKey = { kind: 'unavailable', cause: 'no-creation-record' }
      }
    ],
    [
      'an action that does not fit the account',
      'cannot-recover',
      () => {
        chain.fitCheck = { basis: 'deployed-code', fits: false }
      }
    ],
    [
      'an account that already has a setup',
      'already-set-up',
      () => {
        chain.setupState = setupStateOf(true)
      }
    ],
    [
      'a path with an empty slot',
      'empty-slot',
      (draft) => {
        // eslint-disable-next-line no-param-reassign
        draft.clauses = [{ threshold: 1, credentials: [emptySlot('passkey')] }]
      }
    ]
  ]

  BLOCKED.forEach(([named, kind, arrange]) =>
    it(`blocks on ${named} with the review blocker, and prepares and sends nothing`, async () => {
      const draft = draftOf('encrypted')
      arrange(draft)
      await writeRecords(draft)
      wireClient('ready')
      await openByPush()

      expect(byTestId(`review-blocked-${kind}`)).not.toBeNull()
      expect(prepareCommitSetup).not.toHaveBeenCalled()
      expect(port.sendAccountBatch).not.toHaveBeenCalled()
    })
  )

  it('sends an encrypted save with no password in memory back to the privacy step, writing nothing', async () => {
    await writeRecords(draftOf('encrypted'))
    wireClient('ready')
    wipeRecoveryPassword(CHAIN_ID, address)
    const before = JSON.stringify([...mockEntries])
    await openByPush()

    expect(byTestId('review-blocked-password-missing')).not.toBeNull()
    expect(prepareCommitSetup).not.toHaveBeenCalled()
    expect(port.sendAccountBatch).not.toHaveBeenCalled()
    expect(JSON.stringify([...mockEntries])).toBe(before)
    await press('review-blocked-privacy')
    expect(router.pathname).toBe(`/${WEB_ROUTES.socialRecoverySetupPrivacy}`)
  })
  ;(['loading', 'view-only', 'state-unread'] as const).forEach((facts) =>
    it(`prepares and sends nothing while the account facts read ${facts}`, async () => {
      await writeRecords(draftOf('encrypted'))
      wireClient(facts)
      await openByPush()

      expect(prepareCommitSetup).not.toHaveBeenCalled()
      expect(port.sendAccountBatch).not.toHaveBeenCalled()
      expect(byTestId('arm-saved')).toBeNull()
      // A view-only account holds no key to save with, and the page says so with no retry.
      expect(pageText().includes(t('socialRecovery.arm.viewOnly'))).toBe(facts === 'view-only')
      expect(byTestId('arm-arrival-retry') !== null).toBe(facts === 'state-unread')
    })
  )

  it('names the deployment in the cost line for an account with no code', async () => {
    chain.send = 'refused'
    await writeRecords(draftOf('encrypted'))
    wireClient('ready', false)
    await openByPush()
    expect(byTestId('arm-cost-line')?.textContent).toBe(t('socialRecovery.costLines.saveDeploys'))
  })
})

describe('a reload of the save route after it ended', () => {
  it('after a saved setup: sends nothing again and shows the already-set-up block, not the saved screen', async () => {
    await writeRecords(draftOf('encrypted'))
    wireClient('ready')
    await openByPush()
    expect(byTestId('arm-saved')).not.toBeNull()

    chain.setupState = setupStateOf(true)
    await reload()

    expect(port.sendAccountBatch).toHaveBeenCalledTimes(1)
    expect(prepareCommitSetup).toHaveBeenCalledTimes(1)
    expect(byTestId('arm-saved')).toBeNull()
    // The wiped records read as the default draft with no password set; the setup on the account wins.
    expect(byTestId('review-blocked-password-missing')).toBeNull()
    expect(byTestId('review-blocked-already-set-up')).not.toBeNull()
  })

  it('after a disagreed check on a committed setup: sends nothing again and shows the second-setup block', async () => {
    chain.confirm = Object.assign(new Error('mismatch'), { code: 'confirm.commitment-mismatch' })
    await writeRecords(draftOf('clear'))
    wireClient('ready')
    await openByPush()
    expect(byTestId('arm-disagreed-mismatch')).not.toBeNull()
    expect(mockEntries.size).toBeGreaterThan(0)

    chain.setupState = setupStateOf(true)
    await reload()

    expect(port.sendAccountBatch).toHaveBeenCalledTimes(1)
    expect(byTestId('review-blocked-already-set-up')).not.toBeNull()
  })

  it('after a save never sent, at an encrypted backup: sends nothing and asks for the password again', async () => {
    chain.send = 'refused'
    await writeRecords(draftOf('encrypted'))
    wireClient('ready')
    await openByPush()
    expect(byTestId('arm-write-failedNotSent')).not.toBeNull()

    await reload()

    expect(port.sendAccountBatch).toHaveBeenCalledTimes(1)
    expect(byTestId('review-blocked-password-missing')).not.toBeNull()
  })

  it('after a save never sent, at a clear backup: opens no sign window by itself, and the Save button sends once more', async () => {
    chain.send = 'refused'
    await writeRecords(draftOf('clear'))
    wireClient('ready')
    await openByPush()
    expect(port.sendAccountBatch).toHaveBeenCalledTimes(1)

    await reload()

    expect(port.sendAccountBatch).toHaveBeenCalledTimes(1)
    expect(byTestId('arm-write-failedNotSent')).toBeNull()
    expect(byTestId('arm-save')).not.toBeNull()

    await press('arm-save')
    expect(port.sendAccountBatch).toHaveBeenCalledTimes(2)
  })
})

/**
 * Another page of this device, over the same storage, the same client and the
 * same chain reads, with a send port and receipts of its own.
 */
const anotherPage = () => {
  const { createWalletRecords, extensionRecordStorage } = jest.requireActual<
    typeof import('@web/modules/social-recovery/shared/records')
  >('@web/modules/social-recovery/shared/records')
  const records = createWalletRecords({ storage: extensionRecordStorage })
  const { client: kit } = mockClient.current as { client: ArmKitClient }
  const firstPort = sendPortFor('sent', address)
  const firstReceipts = receiptsFor('landed')
  const steps = saveStepsOf({
    client: kit,
    reads,
    receipts: firstReceipts,
    port: firstPort,
    requests: harness.requestsFake(),
    records,
    setup: records.setup(CHAIN_ID, address),
    chainId: CHAIN_ID,
    account: address,
    facts: factsOf(account, { key }),
    key,
    draft: draftOf('encrypted'),
    password: PASSWORD
  })
  return { records, steps, firstPort, firstReceipts }
}

/**
 * Another page claims the save and sends, then goes away, before the wallet
 * answered the hash or after the hash was written. Its run is never driven
 * again. Answers its send port and the save it stored.
 */
const anotherPageLeaves = async (withHash: boolean, flush: () => Promise<void>) => {
  const { records, steps, firstPort, firstReceipts } = anotherPage()
  if (withHash) {
    firstReceipts.wait.mockImplementation(() => harness.pending())
  } else {
    firstPort.sendAccountBatch.mockImplementation(() => harness.pending())
  }
  harness.unawaited(startSave(createArmStore(), steps))
  await flush()
  const read = await records.saveInFlight(CHAIN_ID, address).read()
  if (read.status !== 'present') {
    throw new Error('the other page stored no save')
  }
  expect(read.value.transactionHash).toBe(withHash ? harness.TX_HASH : undefined)
  expect(firstPort.sendAccountBatch).toHaveBeenCalledTimes(1)
  return { firstPort, record: read.value }
}

/** The single-key removals of the stored save in flight: its releases. */
const releases = () =>
  mockRemovals.filter((keys) => keys.length === 1 && keys[0].includes(':saveInFlight:')).length

describe("another page's save that lands during this page's gas check", () => {
  /** Opens the route with Save offered, presses it, and holds its gas check. */
  const pressSaveAndHoldGas = async () => {
    await writeRecords(draftOf('encrypted'))
    wireClient('ready')
    await openByAddress()
    expect(byTestId('arm-save')).not.toBeNull()
    const gas = held<bigint>()
    reads.nativeBalance.mockImplementationOnce(() => gas.promise)
    await press('arm-save')
    expect(byTestId('arm-write-checkingGas')).not.toBeNull()
    return gas
  }

  /** The other page's save lands, its check agrees, and its wipe takes the stored save with the records. */
  const anotherPageSaves = async () => {
    const { steps, firstPort, firstReceipts } = anotherPage()
    firstReceipts.wait.mockImplementation(async (hash: `0x${string}`) => {
      chain.setupState = setupStateOf(true)
      return landedReceipt(hash)
    })
    const store = createArmStore()
    await act(async () => {
      await startSave(store, steps)
    })
    await settle()
    expect(storedSaves()).toHaveLength(0)
    expect(wipes()).toBe(1)
    return firstPort
  }

  it('sends nothing, releases its own claim and shows the account as already set up', async () => {
    const gas = await pressSaveAndHoldGas()
    const firstPort = await anotherPageSaves()
    const confirms = confirmSetup.mock.calls.length

    await act(async () => {
      gas.release(10n ** 18n)
    })
    await settle()

    expect(byTestId('review-blocked-already-set-up')).not.toBeNull()
    expect(byTestId('arm-save')).toBeNull()
    expect(port.sendAccountBatch).not.toHaveBeenCalled()
    expect(firstPort.sendAccountBatch).toHaveBeenCalledTimes(1)
    expect(releases()).toBe(1)
    expect(storedSaves()).toHaveLength(0)
    expect(confirmSetup).toHaveBeenCalledTimes(confirms)
    expect(wipes()).toBe(1)
  })

  it('reads a setup read after the claim that throws as never sent, with Try again, and Try again sends once', async () => {
    const gas = await pressSaveAndHoldGas()
    setupState.mockRejectedValueOnce(new Error('the node did not answer the setup read'))

    await act(async () => {
      gas.release(10n ** 18n)
    })
    await settle()

    expect(byTestId('arm-write-failedNotSent')).not.toBeNull()
    expect(pageText()).toContain(t('socialRecovery.review.after.notSent'))
    expect(port.sendAccountBatch).not.toHaveBeenCalled()
    expect(releases()).toBe(1)
    expect(storedSaves()).toHaveLength(0)

    await pressText(t('socialRecovery.writes.tryAgain'))
    expect(port.sendAccountBatch).toHaveBeenCalledTimes(1)
    expect(byTestId('arm-saved')).not.toBeNull()
  })
})

describe('a save another page of this device sent', () => {
  const ARRIVALS: [string, () => Promise<void>][] = [
    ['a reload with the recovery password gone', reload],
    ['a second tab reached by the review push', openByPush]
  ]

  ARRIVALS.forEach(([named, open]) =>
    it(`offers no Save on ${named} while the save waits for its receipt, sends nothing, and saves with one check and one wipe`, async () => {
      await writeRecords(draftOf('encrypted'))
      wireClient('ready')
      const { firstPort, record } = await anotherPageLeaves(true, settle)
      const prepares = prepareCommitSetup.mock.calls.length
      const receipt = held<ReturnType<typeof landedReceipt>>()
      receipts.wait.mockImplementationOnce(() => receipt.promise)

      await open()

      expect(byTestId('arm-write-submitting')).not.toBeNull()
      expect(byTestId('arm-save')).toBeNull()
      expect(byTestId('review-blocked-password-missing')).toBeNull()
      expect(receipts.wait).toHaveBeenCalledWith(harness.TX_HASH, record.startBlock)

      await act(async () => {
        receipt.release(landedReceipt(harness.TX_HASH))
      })
      await settle()

      expect(byTestId('arm-saved')).not.toBeNull()
      expect(byTestId('arm-saved-explorer')).not.toBeNull()
      expect(confirmSetup).toHaveBeenCalledTimes(1)
      expect(confirmSetup).toHaveBeenCalledWith(draftOf('encrypted'), record.prepared)
      expect(wipes()).toBe(1)
      expect(mockEntries.size).toBe(0)
      expect(port.sendAccountBatch).not.toHaveBeenCalled()
      expect(firstPort.sendAccountBatch).toHaveBeenCalledTimes(1)
      expect(prepareCommitSetup).toHaveBeenCalledTimes(prepares)
    })
  )

  const DRAFT_AFTER: [string, () => Promise<void>][] = [
    ['changed', () => writeRecords(draftOf('clear', '0x', []))],
    [
      'removed',
      async () => {
        ;[...mockEntries.keys()]
          .filter((entry) => entry.includes('setupDraft'))
          .forEach((entry) => mockEntries.delete(entry))
      }
    ]
  ]

  DRAFT_AFTER.forEach(([named, arrange]) =>
    it(`checks with the draft the other page sent where this device's draft was ${named} after the claim, reads agreed and wipes once`, async () => {
      await writeRecords(draftOf('encrypted'))
      wireClient('ready')
      const { record } = await anotherPageLeaves(true, settle)
      expect(record.draft).toEqual(draftOf('encrypted'))
      await arrange()

      await openByAddress()

      expect(byTestId('arm-saved')).not.toBeNull()
      expect(confirmSetup).toHaveBeenCalledTimes(1)
      expect(confirmSetup).toHaveBeenCalledWith(draftOf('encrypted'), record.prepared)
      expect(wipes()).toBe(1)
      expect(storedSaves()).toHaveLength(0)
      expect(port.sendAccountBatch).not.toHaveBeenCalled()
    })
  )

  describe('where the other page went away before the hash was written', () => {
    const tick = (ms: number) => act(() => harness.advanceTimers(ms))

    /** A second tab typed to the route, over Jest's fake clock. */
    const arrive = async () => {
      act(() => root.unmount())
      root = createRoot(container)
      await act(async () => {
        root.render(tree([SAVE_PATH], 0))
      })
      await tick(100)
    }

    const activityReads = () =>
      backgroundDispatch.mock.calls.filter(
        ([action]) => action.type === 'MAIN_CONTROLLER_ACTIVITY_SET_ACC_OPS_FILTERS'
      ).length

    beforeEach(() => {
      jest.useFakeTimers()
    })

    afterEach(() => {
      jest.useRealTimers()
    })

    const leave = async () => {
      await writeRecords(draftOf('encrypted'))
      wireClient('ready')
      return anotherPageLeaves(false, () => tick(100))
    }

    it('shows the save waiting while the wallet queue holds the request, then follows its hash to saved when the wallet broadcasts it', async () => {
      const { record } = await leave()
      setQueue([record.requestId])

      await arrive()

      expect(byTestId('arm-write-submitting')).not.toBeNull()
      expect(byTestId('arm-save')).toBeNull()
      expect(byTestId('arm-check-again')).toBeNull()

      activity.current = [harness.operationFor(record.requestId, { hash: harness.TX_HASH })]
      setQueue([])
      await tick(100)

      expect(byTestId('arm-saved')).not.toBeNull()
      expect(receipts.wait).toHaveBeenCalledWith(harness.TX_HASH, harness.START_BLOCK)
      expect(confirmSetup).toHaveBeenCalledTimes(1)
      expect(wipes()).toBe(1)
      expect(mockEntries.size).toBe(0)
      expect(port.sendAccountBatch).not.toHaveBeenCalled()
    })

    it('follows a request the wallet broadcast under its hash to saved, sending nothing', async () => {
      const { record } = await leave()
      activity.current = [harness.operationFor(record.requestId, { hash: harness.TX_HASH })]

      await arrive()

      expect(byTestId('arm-saved')).not.toBeNull()
      expect(confirmSetup).toHaveBeenCalledTimes(1)
      expect(wipes()).toBe(1)
      expect(port.sendAccountBatch).not.toHaveBeenCalled()
    })

    it('shows a request the wallet cannot follow as a save that may still land: no title, its line, check again, no Save', async () => {
      const { record } = await leave()
      activity.current = [harness.operationFor(record.requestId, { untracked: true })]

      await arrive()

      expect(pageText()).toContain(t('socialRecovery.arm.mayStillLand'))
      expect(pageText()).not.toContain(t('socialRecovery.review.after.failedTitle'))
      expect(byTestId('arm-check-setup')).not.toBeNull()
      expect(byTestId('arm-save')).toBeNull()
      expect(storedSaves()).toHaveLength(1)
      expect(port.sendAccountBatch).not.toHaveBeenCalled()
    })

    it('saves with no hash where the request is gone and the account holds a setup', async () => {
      await leave()
      chain.setupState = setupStateOf(true)

      await arrive()

      expect(byTestId('arm-saved')).not.toBeNull()
      expect(byTestId('arm-saved-explorer')).toBeNull()
      expect(byTestId('review-blocked-already-set-up')).toBeNull()
      expect(confirmSetup).toHaveBeenCalledTimes(1)
      expect(wipes()).toBe(1)
      expect(port.sendAccountBatch).not.toHaveBeenCalled()
    })

    it('offers no Save while the activity does not answer, and check again reads it at once', async () => {
      await leave()
      activity.current = null

      await arrive()
      expect(byTestId('arm-check-again')).toBeNull()
      await tick(10_000)
      expect(byTestId('arm-check-again')?.textContent).toBe(t('socialRecovery.arm.checkAgain'))
      expect(byTestId('arm-save')).toBeNull()

      const before = activityReads()
      await act(async () => {
        byTestId('arm-check-again')?.click()
      })
      await tick(0)
      expect(activityReads()).toBe(before + 1)

      await tick(10 * GONE_GRACE_MS)
      expect(byTestId('arm-save')).toBeNull()
      expect(storedSaves()).toHaveLength(1)
      expect(port.sendAccountBatch).not.toHaveBeenCalled()
    })

    it('keeps reading a gone request with no setup until the grace period, then offers Save again with the stored save released', async () => {
      await leave()

      await arrive()
      await tick(GONE_GRACE_MS - 1_000)

      expect(byTestId('arm-write-submitting')).not.toBeNull()
      expect(byTestId('arm-save')).toBeNull()
      expect(storedSaves()).toHaveLength(1)

      await tick(1_000)

      expect(byTestId('arm-save')).not.toBeNull()
      expect(storedSaves()).toHaveLength(0)
      expect(port.sendAccountBatch).not.toHaveBeenCalled()
    })

    it("shows the save's own sentence in each reading of the followed request, and the submitting one while it is queued", async () => {
      const { record } = await leave()
      await arrive()
      expect(pageText()).toContain(t('socialRecovery.arm.lookingForSave'))
      expect(pageText()).not.toContain(t('socialRecovery.review.after.submitting'))
      expect(byTestId('arm-check-again')).toBeNull()

      setQueue([record.requestId])
      await tick(FOLLOW_REREAD_MS)
      expect(pageText()).toContain(t('socialRecovery.review.after.submitting'))
      expect(pageText()).not.toContain(t('socialRecovery.arm.lookingForSave'))
      expect(pageText()).not.toContain(t('socialRecovery.arm.unread'))

      activity.current = null
      setQueue([])
      await tick(10_000)
      expect(pageText()).toContain(t('socialRecovery.arm.unread'))
      expect(pageText()).not.toContain(t('socialRecovery.review.after.submitting'))
      expect(pageText()).not.toContain(t('socialRecovery.arm.lookingForSave'))
      expect(byTestId('arm-check-again')?.textContent).toBe(t('socialRecovery.arm.checkAgain'))
      expect(byTestId('arm-save')).toBeNull()
    })

    it('reads the stored save again after a void and follows the claim another page stored meanwhile, with no Save', async () => {
      const { record } = await leave()
      const [entry] = storedSaves()
      const claimed = mockEntries.get(entry) as string
      expect(typeof claimed).toBe('string')
      // Another page claims under a new id right after this page releases the void one.
      mockOnRemove.current = (keys) => {
        if (keys.includes(entry)) {
          mockOnRemove.current = null
          mockEntries.set(entry, claimed.split(record.requestId).join('claimed meanwhile'))
        }
      }
      setQueue(['claimed meanwhile'])

      await arrive()
      await tick(GONE_GRACE_MS + 1_000)

      expect(releases()).toBe(1)
      expect(storedSaves()).toHaveLength(1)
      expect(byTestId('arm-save')).toBeNull()
      expect(byTestId('arm-write-submitting')).not.toBeNull()
      expect(pageText()).toContain(t('socialRecovery.review.after.submitting'))
      expect(port.sendAccountBatch).not.toHaveBeenCalled()
    })

    /** Ways the screen of a followed save goes away and comes back. */
    const AWAY: [string, () => Promise<void>, () => Promise<void>][] = [
      [
        'an account switch',
        async () => {
          await select(other.addr)
          await tick(100)
          // The other account's screen offers its own Save and follows nothing of the first.
          expect(byTestId('arm-save')).not.toBeNull()
        },
        async () => {
          await select(address)
          await tick(100)
        }
      ],
      [
        'a remount',
        async () => {
          act(() => root.unmount())
          root = createRoot(container)
        },
        arrive
      ]
    ]

    AWAY.forEach(([named, away, back]) => {
      it(`pauses on ${named} the follow of a request queued at the unmount, voids nothing far past the grace, and after it reads the live queue to saved`, async () => {
        const { record } = await leave()
        await writeRecords(draftOf('clear'), true, other.addr)
        setQueue([record.requestId])
        await arrive()
        expect(byTestId('arm-write-submitting')).not.toBeNull()

        await away()
        const readsAway = activityReads()
        // The wallet broadcasts the request while its screen is away.
        activity.current = [harness.operationFor(record.requestId, { hash: harness.TX_HASH })]
        setQueue([])
        await tick(10 * GONE_GRACE_MS)

        expect(activityReads()).toBe(readsAway)
        expect(storedSaves()).toHaveLength(1)
        expect(releases()).toBe(0)
        expect(confirmSetup).not.toHaveBeenCalled()

        await back()
        await tick(100)

        expect(byTestId('arm-saved')).not.toBeNull()
        expect(confirmSetup).toHaveBeenCalledTimes(1)
        expect(wipes()).toBe(1)
        expect(storedSaves()).toHaveLength(0)
        expect(port.sendAccountBatch).not.toHaveBeenCalled()
      })

      it(`pauses on ${named} the follow of a request not yet queued, voids nothing far past the grace, and after it follows the request queued, then broadcast, to saved`, async () => {
        const { record } = await leave()
        await writeRecords(draftOf('clear'), true, other.addr)
        await arrive()
        expect(pageText()).toContain(t('socialRecovery.arm.lookingForSave'))

        await away()
        const readsAway = activityReads()
        await tick(10 * GONE_GRACE_MS)

        expect(activityReads()).toBe(readsAway)
        expect(storedSaves()).toHaveLength(1)
        expect(releases()).toBe(0)

        // The wallet takes the request in late.
        setQueue([record.requestId])
        await back()
        expect(byTestId('arm-write-submitting')).not.toBeNull()
        expect(byTestId('arm-save')).toBeNull()
        expect(pageText()).toContain(t('socialRecovery.review.after.submitting'))

        activity.current = [harness.operationFor(record.requestId, { hash: harness.TX_HASH })]
        setQueue([])
        await tick(100)

        expect(byTestId('arm-saved')).not.toBeNull()
        expect(confirmSetup).toHaveBeenCalledTimes(1)
        expect(wipes()).toBe(1)
        expect(port.sendAccountBatch).not.toHaveBeenCalled()
      })
    })

    /** Ways the screen changes while its read of the stored save is in flight. */
    const WHILE_READING: [string, () => Promise<void>][] = [
      [
        'leaves and comes back',
        async () => {
          act(() => root.unmount())
          root = createRoot(container)
          await arrive()
        }
      ],
      [
        'takes new steps',
        async () => {
          // The account's facts read again: the screen builds its steps anew on the same run.
          mockFacts.set(address.toLowerCase(), {
            status: 'ready',
            facts: factsOf(account, { key }),
            retry: jest.fn()
          })
          await select(address)
          await tick(100)
        }
      ]
    ]

    WHILE_READING.forEach(([named, change]) =>
      it(`follows a stored save with no hash whose read was in flight when the screen ${named}, to saved`, async () => {
        const { record } = await leave()
        const ready = mockClient.current
        mockClient.current = { status: 'loading', retry: jest.fn() }
        await arrive()
        expect(byTestId('arm-save')).toBeNull()

        // The client reads ready: the screen's first read of the stored save waits.
        const read = held<void>()
        mockReadHold.current = read.promise
        mockClient.current = ready
        await select(address)
        await tick(100)
        expect(mockReadHold.current).toBeNull()

        setQueue([record.requestId])
        await change()
        await act(async () => {
          read.release()
        })
        await tick(100)

        expect(byTestId('arm-write-submitting')).not.toBeNull()
        expect(pageText()).toContain(t('socialRecovery.review.after.submitting'))
        expect(byTestId('arm-save')).toBeNull()

        activity.current = [harness.operationFor(record.requestId, { hash: harness.TX_HASH })]
        setQueue([])
        await tick(100)

        expect(byTestId('arm-saved')).not.toBeNull()
        expect(confirmSetup).toHaveBeenCalledTimes(1)
        expect(wipes()).toBe(1)
        expect(port.sendAccountBatch).not.toHaveBeenCalled()
      })
    )

    AWAY.forEach(([named, away, back]) =>
      it(`follows, after ${named}, the save that beat this screen's claim while it was away, reading and voiding nothing while away`, async () => {
        await writeRecords(draftOf('encrypted'))
        await writeRecords(draftOf('clear'), true, other.addr)
        wireClient('ready')
        await arrive()
        const gas = held<bigint>()
        reads.nativeBalance.mockImplementationOnce(() => gas.promise)
        await act(async () => {
          byTestId('arm-save')?.click()
        })
        await tick(100)
        expect(byTestId('arm-write-checkingGas')).not.toBeNull()

        await away()
        const { firstPort, record } = await anotherPageLeaves(false, () => tick(100))
        const readsAway = activityReads()
        await act(async () => {
          gas.release(10n ** 18n)
        })
        await tick(10 * GONE_GRACE_MS)

        expect(activityReads()).toBe(readsAway)
        expect(storedSaves()).toHaveLength(1)
        expect(releases()).toBe(0)
        expect(port.sendAccountBatch).not.toHaveBeenCalled()

        setQueue([record.requestId])
        await back()
        expect(byTestId('arm-write-submitting')).not.toBeNull()
        expect(pageText()).toContain(t('socialRecovery.review.after.submitting'))
        expect(byTestId('arm-save')).toBeNull()

        activity.current = [harness.operationFor(record.requestId, { hash: harness.TX_HASH })]
        setQueue([])
        await tick(100)

        expect(byTestId('arm-saved')).not.toBeNull()
        expect(confirmSetup).toHaveBeenCalledTimes(1)
        expect(wipes()).toBe(1)
        expect(port.sendAccountBatch).not.toHaveBeenCalled()
        expect(firstPort.sendAccountBatch).toHaveBeenCalledTimes(1)
      })
    )

    /** What another page does to this screen's claim while its setup read after the claim waits. */
    const MEANWHILE: [string, (entry: string, claimed: string, requestId: string) => void][] = [
      [
        'claims anew after a void',
        (entry, claimed, requestId) =>
          mockEntries.set(entry, claimed.split(requestId).join('claimed meanwhile'))
      ],
      ['voids it', (entry) => mockEntries.delete(entry)]
    ]

    MEANWHILE.forEach(([named, meanwhile]) =>
      it(`sends nothing and releases nothing where another page ${named} before the send`, async () => {
        await writeRecords(draftOf('encrypted'))
        wireClient('ready')
        let done = false
        setupState.mockImplementation(async () => {
          const [entry] = storedSaves()
          if (entry && !done) {
            done = true
            const claimed = mockEntries.get(entry) as string
            const {
              value: { requestId }
            } = JSON.parse(claimed) as { value: { requestId: string } }
            meanwhile(entry, claimed, requestId)
          }
          return chain.setupState
        })
        setQueue(['claimed meanwhile'])
        await arrive()
        await act(async () => {
          byTestId('arm-save')?.click()
        })
        await tick(100)

        expect(done).toBe(true)
        expect(port.sendAccountBatch).not.toHaveBeenCalled()
        expect(releases()).toBe(0)
        if (named === 'voids it') {
          expect(storedSaves()).toHaveLength(0)
          expect(byTestId('arm-save')).not.toBeNull()
          return
        }
        expect(storedSaves()).toHaveLength(1)
        expect(byTestId('arm-save')).toBeNull()
        expect(byTestId('arm-write-submitting')).not.toBeNull()
        expect(pageText()).toContain(t('socialRecovery.review.after.submitting'))

        activity.current = [harness.operationFor('claimed meanwhile', { hash: harness.TX_HASH })]
        setQueue([])
        await tick(100)
        expect(byTestId('arm-saved')).not.toBeNull()
        expect(wipes()).toBe(1)
        expect(port.sendAccountBatch).not.toHaveBeenCalled()
      })
    )
  })
})

describe('the send port', () => {
  it('reads whether the page is shown from the document, on the chain of the save', async () => {
    await writeRecords(draftOf('encrypted'))
    wireClient('ready')
    await openByAddress()

    expect(mockPortOptions.length).toBeGreaterThan(0)
    mockPortOptions.forEach((options) =>
      expect(options).toEqual({ chainId: CHAIN_ID, visibility: document })
    )
  })
})

describe('the save in its own words', () => {
  it('shows a save never sent with its title and one sentence, and releases the stored save', async () => {
    chain.send = 'refused'
    await writeRecords(draftOf('encrypted'))
    wireClient('ready')
    await openByPush()

    expect(pageText()).toContain(t('socialRecovery.review.after.failedTitle'))
    expect(pageText()).toContain(t('socialRecovery.review.after.notSent'))
    expect(pageText()).not.toContain(t('socialRecovery.writes.notSent'))
    expect(storedSaves()).toHaveLength(0)
  })

  it('shows another waiting request with the save title, the shared line and Try again, releases the stored save, and Try again sends once more', async () => {
    chain.send = 'other-request-pending'
    await writeRecords(draftOf('encrypted'))
    wireClient('ready')
    await openByPush()

    expect(pageText()).toContain(t('socialRecovery.review.after.failedTitle'))
    expect(pageText()).toContain(t('socialRecovery.writes.otherRequestPending'))
    expect(pageText()).not.toContain(t('socialRecovery.review.after.notSent'))
    expect(byTestId('arm-back')).not.toBeNull()
    expect(storedSaves()).toHaveLength(0)

    port.sendAccountBatch.mockResolvedValue(harness.TX_HASH)
    await pressText(t('socialRecovery.writes.tryAgain'))
    expect(port.sendAccountBatch).toHaveBeenCalledTimes(2)
    expect(byTestId('arm-saved')).not.toBeNull()
  })

  it('replaces the push on the first mount keeping its state, search and hash', async () => {
    await writeRecords(draftOf('encrypted'))
    wireClient('loading')
    await mountAt([REVIEW_PATH])
    await act(async () => {
      router.push?.(`${SAVE_PATH}?from=review#top`, { from: 'review' })
    })
    await settle()

    expect(router.type).toBe('REPLACE')
    expect(router.pathname).toBe(SAVE_PATH)
    expect(router.search).toBe('?from=review')
    expect(router.hash).toBe('#top')
    expect(router.state).toEqual({ from: 'review' })
  })
})
