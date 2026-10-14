/**
 * @jest-environment jsdom
 *
 * The review route mounted with the settings chrome, the real en.json and the
 * tab's real session storage. The wallet's controller states, the recovery
 * client, the sidebar and the logo are stubs, and the view is a stub that records what the route gives it. jsdom
 * has no `TextEncoder`, which viem reads when it loads, so the test sets Node's
 * before it loads the modules.
 */
import { createRoot, Root } from 'react-dom/client'
import { act } from 'react-dom/test-utils'
import { TextDecoder, TextEncoder } from 'util'

import type { ThemeContextReturnType } from '@common/contexts/themeContext'
import type { ThemeProps } from '@common/styles/themeConfig'
import type { Address } from '@web/modules/social-recovery/sdk-interfaces'
import type { ReviewViewProps } from '@web/modules/social-recovery/setup/review/types'

Object.assign(globalThis, { TextEncoder, TextDecoder })
// React only runs effects and state updates inside act() when this flag is set.
;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true

const mockAccount = '0x1111111111111111111111111111111111111111'
const mockOtherAccount = '0x2222222222222222222222222222222222222222'

// The selected account as an external store, so a test can switch it.
const mockSelected: {
  state: { account: { addr: string } | null }
  listeners: Set<() => void>
} = { state: { account: null }, listeners: new Set() }
const mockViewRenders: ReviewViewProps[] = []
const mockViewMounts: { count: number } = { count: 0 }
const mockAccounts = [
  { addr: mockAccount, preferences: { label: 'Account 1' } },
  { addr: mockOtherAccount, preferences: { label: 'Account 2' } }
]
// The client the wallet builds for the account the screen asks for.
const mockClients = new Map<string, unknown>()

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
  default: () => ({ navigate: () => {} })
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
    mockViewRenders.length = 0
    mockViewMounts.count = 0
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
})
