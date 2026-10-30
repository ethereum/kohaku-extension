/**
 * @jest-environment jsdom
 *
 * The review route mounted with the settings chrome, the real en.json and the
 * tab's real session storage. The wallet's controller states, the recovery
 * client, the record storage, the sidebar and the logo are stubs, and the view
 * is a stub that records what the route gives it, or the real view where a test
 * asks for it. jsdom
 * has no `TextEncoder`, which viem reads when it loads, so the test sets Node's
 * before it loads the modules.
 */
import { createRoot, Root } from 'react-dom/client'
import { act } from 'react-dom/test-utils'
import { TextDecoder, TextEncoder } from 'util'

import type { Account } from '@ambire-common/interfaces/account'
import type { ThemeContextReturnType } from '@common/contexts/themeContext'
import type { ThemeProps } from '@common/styles/themeConfig'
import type { Address } from '@kohaku-eth/social-recovery'
import type { ReviewViewProps } from '@web/modules/social-recovery/setup/review/types'
import type {
  MountCount,
  SelectedAccountMock
} from '@web/modules/social-recovery/setup/review/__fixtures__/types'

Object.assign(globalThis, { TextEncoder, TextDecoder })
// React only runs effects and state updates inside act() when this flag is set.
;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true

const mockAccount = '0x1111111111111111111111111111111111111111'
const mockOtherAccount = '0x2222222222222222222222222222222222222222'

// The selected account as an external store, so a test can switch it.
const mockSelected: SelectedAccountMock = { state: { account: null }, listeners: new Set() }
const mockViewRenders: ReviewViewProps[] = []
const mockViewMounts: MountCount = { count: 0 }
// The wallet holds a creation record for a smart account and none for a basic one.
const CREATION: Account['creation'] = {
  factoryAddr: '0x3333333333333333333333333333333333333333',
  bytecode: '0x00',
  salt: '0x0000000000000000000000000000000000000000000000000000000000000000'
}
const listedAccount = (addr: string, label: string, smart: boolean): Account => ({
  addr,
  associatedKeys: [addr],
  initialPrivileges: [],
  creation: smart ? CREATION : null,
  preferences: { label, pfp: addr }
})
const listedPair = (smart: boolean): Account[] => [
  listedAccount(mockAccount, 'Account 1', smart),
  listedAccount(mockOtherAccount, 'Account 2', smart)
]
// The accounts the wallet lists, which a test can switch.
const mockAccounts: Account[] = listedPair(true)
const listAccounts = (accounts: Account[]) => {
  mockAccounts.splice(0, mockAccounts.length, ...accounts)
}
// The client the wallet builds for the account the screen asks for.
const mockClients = new Map<string, unknown>()
const mockNavigate = jest.fn()
// Whether the route mounts the real view in place of the recording stub.
const mockRealView = { on: false }
// How the record storage answers: with nothing stored, with a refusal, or never.
type StorageAnswerMode = 'empty' | 'refuses' | 'never'
const mockStorageAnswer: { mode: StorageAnswerMode } = { mode: 'empty' }
const mockStorageCall = jest.fn()
const mockStorageRead = (defaultValue?: unknown): Promise<unknown> => {
  mockStorageCall()
  if (mockStorageAnswer.mode === 'refuses') {
    return Promise.reject(new Error('storage unavailable'))
  }
  if (mockStorageAnswer.mode === 'never') {
    return new Promise(() => {})
  }
  return Promise.resolve(defaultValue)
}

jest.mock('@web/hooks/useSelectedAccountControllerState', () => ({
  __esModule: true,
  default: () =>
    // eslint-disable-next-line global-require
    require('react').useSyncExternalStore(
      (listener: () => void) => {
        mockSelected.listeners.add(listener)
        return () => mockSelected.listeners.delete(listener)
      },
      () => mockSelected.state
    )
}))
jest.mock('@web/hooks/useAccountsControllerState', () => ({
  __esModule: true,
  default: () => ({ accounts: mockAccounts })
}))
jest.mock('@web/hooks/useNetworksControllerState', () => ({
  __esModule: true,
  default: () => ({ networks: [] })
}))
jest.mock('@common/hooks/useNavigation', () => ({
  __esModule: true,
  default: () => ({ navigate: mockNavigate })
}))
jest.mock('@web/modules/social-recovery/shared/records', () => ({
  ...jest.requireActual('@web/modules/social-recovery/shared/records'),
  extensionRecordStorage: {
    get: (_key: string, defaultValue?: unknown) => mockStorageRead(defaultValue),
    set: () => mockStorageRead(null),
    remove: () => mockStorageRead(null),
    getAll: () => mockStorageRead({}),
    setEntries: () => mockStorageRead(),
    removeKeys: () => mockStorageRead()
  }
}))
// The spinner's animation needs a native module jsdom lacks; a plain view stands in.
jest.mock('@common/components/Spinner', () => ({
  __esModule: true,
  // eslint-disable-next-line global-require
  default: () => require('react').createElement(require('react-native').View, { testID: 'spinner' })
}))
jest.mock('@web/modules/social-recovery/shared/client', () => ({
  ...jest.requireActual('@web/modules/social-recovery/shared/client')
}))
jest.mock('@web/modules/social-recovery/shared/client/useRecoveryClient', () => ({
  useRecoveryClient: (account: string | undefined) =>
    (account && mockClients.get(account)) || { status: 'loading', retry: () => {} }
}))
jest.mock('@web/modules/settings/components/Sidebar', () => ({
  __esModule: true,
  default: () => null
}))
jest.mock('@common/components/AmbireLogoHorizontal', () => ({
  __esModule: true,
  default: () => null
}))
jest.mock('@web/modules/social-recovery/setup/review/ReviewView', () => ({
  __esModule: true,
  default: (props: ReviewViewProps) => {
    // eslint-disable-next-line global-require
    const R: typeof import('react') = require('react')
    if (mockRealView.on) {
      const RealView: typeof import('@web/modules/social-recovery/setup/review/ReviewView').default =
        jest.requireActual('@web/modules/social-recovery/setup/review/ReviewView').default
      return R.createElement(RealView, props)
    }
    mockViewRenders.push(props)
    R.useEffect(() => {
      mockViewMounts.count += 1
    }, [])
    // eslint-disable-next-line global-require
    return R.createElement(require('react-native').View, { testID: 'review-view' })
  }
}))

/* eslint-disable @typescript-eslint/no-var-requires, global-require */
const React: typeof import('react') = require('react')
const { MemoryRouter }: typeof import('react-router-dom') = require('react-router-dom')
const en: typeof import('@common/config/localization/translations/en.json') = require('@common/config/localization/translations/en.json')
const {
  ThemeContext
}: typeof import('@common/contexts/themeContext') = require('@common/contexts/themeContext')
const themeConfig: typeof import('@common/styles/themeConfig') = require('@common/styles/themeConfig')
const {
  WEB_ROUTES
}: typeof import('@common/modules/router/constants/common') = require('@common/modules/router/constants/common')
const ReviewScreen: typeof import('@web/modules/social-recovery/setup/review/ReviewScreen').default =
  require('@web/modules/social-recovery/setup/review/ReviewScreen').default
/* eslint-enable @typescript-eslint/no-var-requires, global-require */

const ACCOUNT: Address = mockAccount
const OTHER_ACCOUNT: Address = mockOtherAccount

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

describe('the review screen while the wallet selects another account', () => {
  let container: HTMLDivElement
  let root: Root

  beforeEach(() => {
    sessionStorage.clear()
    listAccounts(listedPair(true))
    mockViewRenders.length = 0
    mockViewMounts.count = 0
    mockRealView.on = false
    mockStorageAnswer.mode = 'empty'
    mockStorageCall.mockClear()
    mockNavigate.mockClear()
    mockClients.clear()
    ;[ACCOUNT, OTHER_ACCOUNT].forEach((account) =>
      mockClients.set(account, { status: 'ready', client: { account }, retry: () => {} })
    )
    container = document.createElement('div')
    document.body.appendChild(container)
    root = createRoot(container)
  })

  afterEach(() => {
    act(() => root.unmount())
    container.remove()
  })

  const open = async (account: Address) => {
    mockSelected.state = { account: { addr: account } }
    await act(async () => {
      root.render(
        <MemoryRouter>
          <ThemeContext.Provider value={THEME_CONTEXT}>
            <ReviewScreen />
          </ThemeContext.Provider>
        </MemoryRouter>
      )
    })
  }

  const selectInWallet = async (account: Address) => {
    mockSelected.state = { account: { addr: account } }
    await act(async () => {
      mockSelected.listeners.forEach((listener) => listener())
    })
  }

  const byTestId = (id: string) => container.querySelector<HTMLElement>(`[data-testid="${id}"]`)
  const lastProps = () => mockViewRenders[mockViewRenders.length - 1]

  it('counts the review as the fifth of the setup stages', async () => {
    await open(ACCOUNT)
    expect(byTestId('review-stage')?.textContent).toBe('Set up · Step 5 of 7')
  })

  it("keeps the review on the tab's account with its name, and says so", async () => {
    await open(ACCOUNT)
    expect(lastProps().account).toBe(ACCOUNT)
    expect(lastProps().accountLabel).toBe('Account 1')
    expect(byTestId('setup-other-account')).toBeNull()

    await selectInWallet(OTHER_ACCOUNT)

    expect(byTestId('review-view')).not.toBeNull()
    expect(mockViewMounts.count).toBe(1)
    expect(lastProps().account).toBe(ACCOUNT)
    expect(lastProps().accountLabel).toBe('Account 1')
    expect(byTestId('setup-other-account')?.textContent).toContain(
      en.socialRecovery.chrome.otherAccount.title
    )
  })

  it('refuses a listed basic account in place of the review, with no stage counter', async () => {
    listAccounts(listedPair(false))
    await open(ACCOUNT)
    expect(byTestId('review-blocked-cannot-recover')).not.toBeNull()
    expect(byTestId('review-blocked-body')?.textContent).toBe(
      en.socialRecovery.review.blocked.cannotRecover.reasonNotSupported
    )
    expect(byTestId('review-title')?.textContent).toBe(en.socialRecovery.review.title)
    expect(byTestId('review-view')).toBeNull()
    expect(mockViewRenders).toHaveLength(0)
    expect(byTestId('review-stage')).toBeNull()
  })

  it('tells the review that a listed smart account is not a basic account', async () => {
    await open(ACCOUNT)
    expect(lastProps().basicAccount).toBe(false)
  })

  it('tells the review nothing of a basic account where the wallet does not list the account', async () => {
    listAccounts([listedAccount(mockOtherAccount, 'Account 2', false)])
    await open(ACCOUNT)
    expect(lastProps().account).toBe(ACCOUNT)
    expect(lastProps().basicAccount).toBe(false)
  })

  it("keeps the tab's account kind when the wallet selects another account of the other kind", async () => {
    listAccounts([
      listedAccount(mockAccount, 'Account 1', false),
      listedAccount(mockOtherAccount, 'Account 2', true)
    ])
    await open(ACCOUNT)
    await selectInWallet(OTHER_ACCOUNT)
    expect(byTestId('review-blocked-cannot-recover')).not.toBeNull()
    expect(byTestId('review-view')).toBeNull()
    expect(mockViewRenders).toHaveLength(0)
  })

  it('takes a basic account back to the privacy step from the refusal', async () => {
    listAccounts(listedPair(false))
    await open(ACCOUNT)
    act(() => byTestId('review-back')?.click())
    expect(mockNavigate).toHaveBeenCalledWith(WEB_ROUTES.socialRecoverySetupPrivacy)
  })
})

describe('the review screen before the draft of a basic account is read', () => {
  let container: HTMLDivElement
  let root: Root

  beforeEach(() => {
    sessionStorage.clear()
    mockViewRenders.length = 0
    mockViewMounts.count = 0
    mockRealView.on = true
    mockStorageAnswer.mode = 'empty'
    mockStorageCall.mockClear()
    mockNavigate.mockClear()
    mockClients.clear()
    container = document.createElement('div')
    document.body.appendChild(container)
    root = createRoot(container)
  })

  afterEach(() => {
    act(() => root.unmount())
    container.remove()
    mockRealView.on = false
  })

  const open = async (account: Address) => {
    mockSelected.state = { account: { addr: account } }
    await act(async () => {
      root.render(
        <MemoryRouter>
          <ThemeContext.Provider value={THEME_CONTEXT}>
            <ReviewScreen />
          </ThemeContext.Provider>
        </MemoryRouter>
      )
    })
    await act(async () => {
      await new Promise((resolve) => {
        setTimeout(resolve, 0)
      })
    })
  }

  const byTestId = (id: string) => container.querySelector<HTMLElement>(`[data-testid="${id}"]`)

  it('refuses a basic account whose draft storage fails, with no read failure', async () => {
    listAccounts(listedPair(false))
    mockStorageAnswer.mode = 'refuses'
    await open(ACCOUNT)
    expect(byTestId('review-blocked-cannot-recover')).not.toBeNull()
    expect(byTestId('review-load-failed')).toBeNull()
    expect(byTestId('review-load-retry')).toBeNull()
  })

  it('refuses a basic account whose draft storage never answers, with no waiting block', async () => {
    listAccounts(listedPair(false))
    mockStorageAnswer.mode = 'never'
    await open(ACCOUNT)
    expect(byTestId('review-blocked-cannot-recover')).not.toBeNull()
    expect(byTestId('loading-screen')).toBeNull()
    expect(container.textContent).not.toContain(en.socialRecovery.loading.draft)
  })

  it('reads no record of a draft for a basic account', async () => {
    listAccounts(listedPair(false))
    await open(ACCOUNT)
    expect(byTestId('review-blocked-cannot-recover')).not.toBeNull()
    expect(mockStorageCall).not.toHaveBeenCalled()
  })

  it('reads the draft of a smart account and shows its failure under the step counter', async () => {
    listAccounts(listedPair(true))
    mockStorageAnswer.mode = 'refuses'
    await open(ACCOUNT)
    expect(mockStorageCall).toHaveBeenCalled()
    expect(byTestId('review-stage')?.textContent).toBe('Set up · Step 5 of 7')
    expect(byTestId('review-load-failed')).not.toBeNull()
    expect(byTestId('review-blocked-cannot-recover')).toBeNull()
  })

  it('waits on the draft of a smart account whose storage never answers', async () => {
    listAccounts(listedPair(true))
    mockStorageAnswer.mode = 'never'
    await open(ACCOUNT)
    expect(byTestId('loading-screen')?.textContent).toBe(en.socialRecovery.loading.draft)
    expect(byTestId('review-blocked-cannot-recover')).toBeNull()
  })
})
