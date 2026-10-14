/**
 * @jest-environment jsdom
 *
 * The notice that the wallet selects another account than the setup tab's,
 * alone and inside the setup chrome, mounted with the app's own components,
 * the real en.json and the tab's real session storage. The selected account,
 * the navigation, the settings sidebar and the logo are stubs. jsdom has no
 * `TextEncoder`, which viem reads when it loads, so the test sets Node's before
 * it loads the modules.
 */
import { createRoot, Root } from 'react-dom/client'
import { act } from 'react-dom/test-utils'
import { TextDecoder, TextEncoder } from 'util'

import type { ThemeContextReturnType } from '@common/contexts/themeContext'
import type { ThemeProps } from '@common/styles/themeConfig'
import type { Address } from '@web/modules/social-recovery/sdk-interfaces'

Object.assign(globalThis, { TextEncoder, TextDecoder })
// React only runs effects and state updates inside act() when this flag is set.
;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true

const mockSelected: {
  state: { account: { addr: string } | null }
  listeners: Set<() => void>
} = { state: { account: null }, listeners: new Set() }
const mockNavigate = jest.fn()

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
jest.mock('@common/hooks/useNavigation', () => ({
  __esModule: true,
  default: () => ({ navigate: mockNavigate })
}))
jest.mock('@web/modules/settings/components/Sidebar', () => ({
  __esModule: true,
  default: () => null
}))
jest.mock('@common/components/AmbireLogoHorizontal', () => ({
  __esModule: true,
  default: () => null
}))

/* eslint-disable @typescript-eslint/no-var-requires, global-require */
const React: typeof import('react') = require('react')
const { MemoryRouter }: typeof import('react-router-dom') = require('react-router-dom')
const { Text }: typeof import('react-native') = require('react-native')
const { getAddress }: typeof import('viem') = require('viem')
const i18n: typeof import('@common/config/localization').default =
  require('@common/config/localization').default
const {
  ThemeContext
}: typeof import('@common/contexts/themeContext') = require('@common/contexts/themeContext')
const themeConfig: typeof import('@common/styles/themeConfig') = require('@common/styles/themeConfig')
const {
  WEB_ROUTES
}: typeof import('@common/modules/router/constants/common') = require('@common/modules/router/constants/common')
const OtherAccountNotice: typeof import('@web/modules/social-recovery/shared/chrome/OtherAccountNotice').default =
  require('@web/modules/social-recovery/shared/chrome/OtherAccountNotice').default
const SetupChrome: typeof import('@web/modules/social-recovery/shared/chrome/SetupChrome').default =
  require('@web/modules/social-recovery/shared/chrome/SetupChrome').default
const RecoveryChrome: typeof import('@web/modules/social-recovery/shared/chrome/RecoveryChrome').default =
  require('@web/modules/social-recovery/shared/chrome/RecoveryChrome').default
/* eslint-enable @typescript-eslint/no-var-requires, global-require */

// Lowercase on purpose: the notice shows the address in its checksummed form.
const ACCOUNT: Address = '0xabcdefabcdefabcdefabcdefabcdefabcdefabcd'
const OTHER_ACCOUNT: Address = '0x2222222222222222222222222222222222222222'
const NOTICE = 'setup-other-account'

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

const TITLE = i18n.t('socialRecovery.chrome.otherAccount.title')
const SWITCH = i18n.t('socialRecovery.chrome.otherAccount.switchAction')
const bodyFor = (account: Address) =>
  i18n.t('socialRecovery.chrome.otherAccount.body', { account: getAddress(account) })

let container: HTMLDivElement
let root: Root

beforeEach(() => {
  sessionStorage.clear()
  mockNavigate.mockClear()
  mockSelected.state = { account: null }
  container = document.createElement('div')
  document.body.appendChild(container)
  root = createRoot(container)
})

afterEach(() => {
  act(() => root.unmount())
  container.remove()
})

const mount = (element: React.ReactElement) =>
  act(() => {
    root.render(
      <MemoryRouter>
        <ThemeContext.Provider value={THEME_CONTEXT}>{element}</ThemeContext.Provider>
      </MemoryRouter>
    )
  })

const select = (addr: string | null) =>
  act(() => {
    mockSelected.state = { account: addr === null ? null : { addr } }
    mockSelected.listeners.forEach((listener) => listener())
  })

const byTestId = (id: string) => container.querySelector<HTMLElement>(`[data-testid="${id}"]`)

const press = (id: string) => {
  const node = byTestId(id)
  if (!node) {
    throw new Error(`nothing on screen with the test id ${id}`)
  }
  act(() => node.click())
}

describe('the other-account notice', () => {
  it('shows the title, the full address of the tab’s account and the switch action', () => {
    mount(<OtherAccountNotice account={ACCOUNT} onSwitch={() => {}} testID={NOTICE} />)
    const text = byTestId(NOTICE)?.textContent ?? ''
    expect(TITLE).not.toBe('')
    expect(text).toContain(TITLE)
    expect(text).toContain(bodyFor(ACCOUNT))
    expect(text).toContain(getAddress(ACCOUNT))
    expect(byTestId(`${NOTICE}-switch`)?.textContent).toBe(SWITCH)
  })

  it('runs its switch when the action is pressed', () => {
    const onSwitch = jest.fn()
    mount(<OtherAccountNotice account={ACCOUNT} onSwitch={onSwitch} testID={NOTICE} />)
    press(`${NOTICE}-switch`)
    expect(onSwitch).toHaveBeenCalledTimes(1)
  })
})

describe('the setup chrome while the wallet selects another account', () => {
  const openChrome = () => {
    mockSelected.state = { account: { addr: ACCOUNT } }
    mount(
      <SetupChrome testID="chrome">
        <Text testID="view">The view</Text>
      </SetupChrome>
    )
  }

  it('shows no notice while the wallet selects the tab’s account', () => {
    openChrome()
    expect(byTestId(NOTICE)).toBeNull()
    expect(byTestId('view')).not.toBeNull()
  })

  it('shows the notice above the view, naming the tab’s account', () => {
    openChrome()
    select(OTHER_ACCOUNT)
    const notice = byTestId(NOTICE)
    expect(notice?.textContent).toContain(TITLE)
    expect(notice?.textContent).toContain(bodyFor(ACCOUNT))
    expect(notice?.textContent).not.toContain(getAddress(OTHER_ACCOUNT))
    // The notice comes before the view in the document.
    const inOrder = container.querySelectorAll<HTMLElement>(
      `[data-testid="${NOTICE}"], [data-testid="view"]`
    )
    expect(Array.from(inOrder, (node) => node.dataset.testid)).toEqual([NOTICE, 'view'])
  })

  it('drops the notice when the wallet selects the tab’s account again', () => {
    openChrome()
    select(OTHER_ACCOUNT)
    expect(byTestId(NOTICE)).not.toBeNull()
    select(ACCOUNT)
    expect(byTestId(NOTICE)).toBeNull()
  })

  it('switches the tab to the selected account and goes to the setup entry', () => {
    openChrome()
    select(OTHER_ACCOUNT)
    expect(mockNavigate).not.toHaveBeenCalled()
    press(`${NOTICE}-switch`)
    expect(mockNavigate).toHaveBeenCalledTimes(1)
    expect(mockNavigate).toHaveBeenCalledWith(WEB_ROUTES.socialRecoverySetup, { replace: true })
    expect(byTestId(NOTICE)).toBeNull()
    // The tab now keeps the account it switched to.
    select(ACCOUNT)
    expect(byTestId(NOTICE)?.textContent).toContain(bodyFor(OTHER_ACCOUNT))
  })
})

describe('the setup chrome and the tab’s account latch', () => {
  const LATCH_KEY = 'socialRecovery.setupAccount'

  const openChrome = (skipAccountLatch?: boolean) => {
    mockSelected.state = { account: { addr: ACCOUNT } }
    mount(
      <SetupChrome testID="chrome" skipAccountLatch={skipAccountLatch}>
        <Text testID="view">The view</Text>
      </SetupChrome>
    )
  }

  it('latches the selected account by default and shows the notice when the selection changes', () => {
    openChrome()
    expect(sessionStorage.getItem(LATCH_KEY)).toBe(ACCOUNT)
    select(OTHER_ACCOUNT)
    expect(byTestId(NOTICE)).not.toBeNull()
    expect(sessionStorage.getItem(LATCH_KEY)).toBe(ACCOUNT)
  })

  it('latches nothing and shows no notice when told to skip the latch', () => {
    openChrome(true)
    expect(sessionStorage.getItem(LATCH_KEY)).toBeNull()
    select(OTHER_ACCOUNT)
    expect(byTestId(NOTICE)).toBeNull()
    expect(byTestId('view')).not.toBeNull()
    expect(sessionStorage.getItem(LATCH_KEY)).toBeNull()
  })

  it('latches nothing under a recovery screen on the logged-in route', () => {
    mockSelected.state = { account: { addr: ACCOUNT } }
    mount(
      <RecoveryChrome route="logged-in" titleKey="socialRecovery.routes.recovery" testID="chrome">
        <Text testID="view">The view</Text>
      </RecoveryChrome>
    )
    expect(sessionStorage.getItem(LATCH_KEY)).toBeNull()
    select(OTHER_ACCOUNT)
    expect(byTestId(NOTICE)).toBeNull()
    expect(byTestId('view')).not.toBeNull()
  })
})
