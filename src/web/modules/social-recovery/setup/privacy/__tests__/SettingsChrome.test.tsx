/**
 * @jest-environment jsdom
 *
 * The settings chrome around a step, mounted with the app's own components and
 * the real en.json. The selected account, the navigation, the settings sidebar
 * and the logo are stubs; the step is a stub that records what it is given.
 * jsdom has no `TextEncoder`, which viem reads when it loads, so the test sets
 * Node's before it loads the modules.
 */
import { createRoot, Root } from 'react-dom/client'
import { act } from 'react-dom/test-utils'
import { TextDecoder, TextEncoder } from 'util'

import type { ThemeContextReturnType } from '@common/contexts/themeContext'
import type { ThemeProps } from '@common/styles/themeConfig'
import type { Address } from '@web/modules/social-recovery/sdk-interfaces'
import type { StepViewProps } from '@web/modules/social-recovery/setup/privacy'

Object.assign(globalThis, { TextEncoder, TextDecoder })
// React only runs effects and state updates inside act() when this flag is set.
;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true

// The selected account as an external store, so a test can switch it.
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
const { View }: typeof import('react-native') = require('react-native')
const en: typeof import('@common/config/localization/translations/en.json') = require('@common/config/localization/translations/en.json')
const {
  ThemeContext
}: typeof import('@common/contexts/themeContext') = require('@common/contexts/themeContext')
const themeConfig: typeof import('@common/styles/themeConfig') = require('@common/styles/themeConfig')
const {
  CHAIN_IDS,
  WALLET_RECOVERY_CHAIN
}: typeof import('@web/modules/social-recovery/shared/client') = require('@web/modules/social-recovery/shared/client')
const {
  WEB_ROUTES
}: typeof import('@common/modules/router/constants/common') = require('@common/modules/router/constants/common')
const SettingsChrome: typeof import('@web/modules/social-recovery/setup/privacy/SettingsChrome').default =
  require('@web/modules/social-recovery/setup/privacy/SettingsChrome').default
/* eslint-enable @typescript-eslint/no-var-requires, global-require */

const ACCOUNT: Address = '0x1111111111111111111111111111111111111111'
const OTHER_ACCOUNT: Address = '0x2222222222222222222222222222222222222222'
const BREADCRUMB = en.socialRecovery.chrome.breadcrumb

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

// The step: renders a marker and records each render's props and each mount.
const stepRenders: StepViewProps[] = []
let stepMounts = 0
const Step = (props: StepViewProps) => {
  stepRenders.push(props)
  React.useEffect(() => {
    stepMounts += 1
  }, [])
  return <View testID="step" />
}

describe('the settings chrome around a step', () => {
  let container: HTMLDivElement
  let root: Root

  beforeEach(() => {
    stepRenders.length = 0
    stepMounts = 0
    mockNavigate.mockClear()
    container = document.createElement('div')
    document.body.appendChild(container)
    root = createRoot(container)
  })

  afterEach(() => {
    act(() => root.unmount())
    container.remove()
  })

  const showAccount = async (addr: string | null) => {
    // Each selection here stands for a tab opened on that account, so no latched account carries over.
    sessionStorage.clear()
    mockSelected.state = { account: addr === null ? null : { addr } }
    await act(async () => {
      if (container.childElementCount) {
        mockSelected.listeners.forEach((listener) => listener())
      } else {
        root.render(
          <MemoryRouter>
            <ThemeContext.Provider value={THEME_CONTEXT}>
              <SettingsChrome step={Step} />
            </ThemeContext.Provider>
          </MemoryRouter>
        )
      }
    })
  }

  const byTestId = (id: string) => container.querySelector<HTMLElement>(`[data-testid="${id}"]`)
  const lastProps = () => stepRenders[stepRenders.length - 1]

  it('gives the step the records, the recovery chain, the account and the navigation', async () => {
    await showAccount(ACCOUNT)
    expect(container.textContent).toContain(BREADCRUMB)
    expect(byTestId('step')).not.toBeNull()
    const props = lastProps()
    expect(props.account).toBe(ACCOUNT)
    expect(props.chainId).toBe(CHAIN_IDS[WALLET_RECOVERY_CHAIN])
    expect(typeof props.records.setup).toBe('function')
    props.navigate('/somewhere')
    expect(mockNavigate).toHaveBeenCalledWith('/somewhere')
  })

  it('shows the breadcrumb and no step while no account is selected', async () => {
    await showAccount(null)
    expect(container.textContent).toBe(BREADCRUMB)
    expect(byTestId('step')).toBeNull()
    expect(stepRenders).toHaveLength(0)
  })

  it('shows no step for a selected account that is not an address', async () => {
    await showAccount('not-an-address')
    expect(container.textContent).toBe(BREADCRUMB)
    expect(byTestId('step')).toBeNull()
    expect(stepRenders).toHaveLength(0)
  })

  it('mounts a new step for another account, and drops it when the account goes', async () => {
    await showAccount(ACCOUNT)
    expect(stepMounts).toBe(1)
    await showAccount(OTHER_ACCOUNT)
    expect(stepMounts).toBe(2)
    expect(lastProps().account).toBe(OTHER_ACCOUNT)
    await showAccount(null)
    expect(byTestId('step')).toBeNull()
  })

  // The wallet selects another account while the tab stays open on its own.
  const selectInWallet = async (addr: string) => {
    mockSelected.state = { account: { addr } }
    await act(async () => {
      mockSelected.listeners.forEach((listener) => listener())
    })
  }

  it("keeps the step on the tab's account when the wallet selects another account, and says so", async () => {
    await showAccount(ACCOUNT)
    expect(byTestId('setup-other-account')).toBeNull()
    await selectInWallet(OTHER_ACCOUNT)
    expect(stepMounts).toBe(1)
    expect(lastProps().account).toBe(ACCOUNT)
    expect(byTestId('step')).not.toBeNull()
    expect(byTestId('setup-other-account')?.textContent).toContain(
      en.socialRecovery.chrome.otherAccount.title
    )
    // Switching gives a new step the selected account and leaves for the setup entry.
    await act(async () => {
      byTestId('setup-other-account-switch')?.click()
    })
    expect(stepMounts).toBe(2)
    expect(lastProps().account).toBe(OTHER_ACCOUNT)
    expect(byTestId('setup-other-account')).toBeNull()
    expect(mockNavigate).toHaveBeenCalledWith(WEB_ROUTES.socialRecoverySetup, { replace: true })
  })
})
