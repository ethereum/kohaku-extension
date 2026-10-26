/**
 * @jest-environment jsdom
 *
 * The enroll route mounted with the settings chrome, the real en.json and the
 * tab's real session storage. The wallet's controller states, the recovery
 * client, the ceremony's page helpers, the sidebar and the logo are stubs, and
 * the view is a stub that records what the route gives it. jsdom has no
 * `TextEncoder`, which viem reads when it loads, so the test sets Node's before
 * it loads the modules.
 */
import { createRoot, Root } from 'react-dom/client'
import { act } from 'react-dom/test-utils'
import { TextDecoder, TextEncoder } from 'util'

import type { ThemeContextReturnType } from '@common/contexts/themeContext'
import type { ThemeProps } from '@common/styles/themeConfig'
import type { Address } from '@kohaku-eth/social-recovery'
import type { EnrollViewProps } from '@web/modules/social-recovery/setup/enroll/types'
import type {
  MountCount,
  SelectedAccountMock,
  WalletMock
} from '@web/modules/social-recovery/setup/enroll/__fixtures__/types'

Object.assign(globalThis, { TextEncoder, TextDecoder })
// React only runs effects and state updates inside act() when this flag is set.
;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true

// The selected account as an external store, so a test can switch it.
const mockSelected: SelectedAccountMock = { state: { account: null }, listeners: new Set() }
const mockViewRenders: EnrollViewProps[] = []
const mockViewMounts: MountCount = { count: 0 }
const mockNavigate = jest.fn()
// The wallet's listed accounts and stored keys, so a test can give it seeds.
const mockWallet: WalletMock = { accounts: [], keys: [] }

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
  default: () => ({ dispatch: () => {}, windowId: undefined })
}))
jest.mock('@common/hooks/useNavigation', () => ({
  __esModule: true,
  default: () => ({ navigate: mockNavigate })
}))
jest.mock('@web/modules/social-recovery/shared/client/useRecoveryClient', () => ({
  useRecoveryClient: () => ({ status: 'loading', retry: () => {} })
}))
jest.mock('@web/modules/social-recovery/shared/ceremony/screen', () => ({
  browserReportStore: {},
  browserReportSubscribe: () => () => {},
  pagePasskeysServed: () => false,
  pagePlatform: () => 'other'
}))
jest.mock('@web/modules/settings/components/Sidebar', () => ({
  __esModule: true,
  default: () => null
}))
jest.mock('@common/components/AmbireLogoHorizontal', () => ({
  __esModule: true,
  default: () => null
}))
jest.mock('@web/modules/social-recovery/setup/enroll/EnrollView', () => ({
  __esModule: true,
  default: (props: EnrollViewProps) => {
    // eslint-disable-next-line global-require
    const R: typeof import('react') = require('react')
    mockViewRenders.push(props)
    R.useEffect(() => {
      mockViewMounts.count += 1
    }, [])
    // eslint-disable-next-line global-require
    return R.createElement(require('react-native').View, { testID: 'enroll-view' })
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
const {
  seedCheckOf
}: typeof import('@web/modules/social-recovery/setup/enroll/guardian') = require('@web/modules/social-recovery/setup/enroll/guardian')
const EnrollScreen: typeof import('@web/modules/social-recovery/setup/enroll/EnrollScreen').default =
  require('@web/modules/social-recovery/setup/enroll/EnrollScreen').default
/* eslint-enable @typescript-eslint/no-var-requires, global-require */

const ACCOUNT: Address = '0x1111111111111111111111111111111111111111'
const OTHER_ACCOUNT: Address = '0x2222222222222222222222222222222222222222'
const ENROLL_AT = '/social-recovery/setup/enroll?kind=ecdsa&clause=1&member=0'

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

describe('the enroll screen while the wallet selects another account', () => {
  let container: HTMLDivElement
  let root: Root

  beforeEach(() => {
    mockWallet.accounts = []
    mockWallet.keys = []
    sessionStorage.clear()
    mockViewRenders.length = 0
    mockViewMounts.count = 0
    mockNavigate.mockClear()
    container = document.createElement('div')
    document.body.appendChild(container)
    root = createRoot(container)
  })

  afterEach(() => {
    act(() => root.unmount())
    container.remove()
  })

  const open = async (account: Address, at: string = ENROLL_AT) => {
    mockSelected.state = { account: { addr: account } }
    await act(async () => {
      root.render(
        <MemoryRouter initialEntries={[at]}>
          <ThemeContext.Provider value={THEME_CONTEXT}>
            <EnrollScreen />
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

  it('counts the enrollment with the editor, as the second of the setup stages', async () => {
    await open(ACCOUNT)
    expect(byTestId('enroll-stage')?.textContent).toBe('Set up · Step 2 of 7')
  })

  it('draws no setup step where the management editor opened the enrollment', async () => {
    await open(ACCOUNT, `${ENROLL_AT}&return=manage`)
    expect(byTestId('enroll-stage')).toBeNull()
    expect(lastProps()?.search?.returnTo).toBe('manage')
  })

  it("keeps the step on the tab's account, with the same view and search, and says so", async () => {
    await open(ACCOUNT)
    expect(lastProps().account).toBe(ACCOUNT)
    expect(byTestId('setup-other-account')).toBeNull()

    await selectInWallet(OTHER_ACCOUNT)

    expect(byTestId('enroll-view')).not.toBeNull()
    expect(mockViewMounts.count).toBe(1)
    expect(lastProps().account).toBe(ACCOUNT)
    expect(lastProps().search).toEqual(mockViewRenders[0].search)
    expect(byTestId('setup-other-account')?.textContent).toContain(
      en.socialRecovery.chrome.otherAccount.title
    )
  })

  it('gives a new view the selected account after the switch, and leaves for the setup entry', async () => {
    await open(ACCOUNT)
    await selectInWallet(OTHER_ACCOUNT)
    await act(async () => {
      byTestId('setup-other-account-switch')?.click()
    })
    expect(mockNavigate).toHaveBeenCalledWith(WEB_ROUTES.socialRecoverySetup, { replace: true })
    expect(mockViewMounts.count).toBe(2)
    expect(lastProps().account).toBe(OTHER_ACCOUNT)
    expect(byTestId('setup-other-account')).toBeNull()
  })

  it("reads a guardian from the smart account's seed as the same seed, and one from the other seed as held", async () => {
    const controller: Address = '0x3333333333333333333333333333333333333333'
    const fromAccountSeed: Address = '0x4444444444444444444444444444444444444444'
    const fromOtherSeed: Address = '0x5555555555555555555555555555555555555555'
    const otherSeedBasic: Address = '0x6666666666666666666666666666666666666666'
    mockWallet.keys = [
      { addr: controller, type: 'internal', meta: { fromSeedId: 'seed-account' } },
      { addr: fromAccountSeed, type: 'internal', meta: { fromSeedId: 'seed-account' } },
      { addr: otherSeedBasic, type: 'internal', meta: { fromSeedId: 'seed-other' } },
      { addr: fromOtherSeed, type: 'internal', meta: { fromSeedId: 'seed-other' } }
    ]
    mockWallet.accounts = [
      { addr: ACCOUNT, associatedKeys: [controller] },
      { addr: otherSeedBasic, associatedKeys: [otherSeedBasic] }
    ]
    await open(ACCOUNT)
    const { keys, ownSeedIds } = lastProps().deps
    expect(seedCheckOf(keys, ownSeedIds, fromAccountSeed)).toBe('same')
    expect(seedCheckOf(keys, ownSeedIds, fromOtherSeed)).toBe('held')
  })
})
