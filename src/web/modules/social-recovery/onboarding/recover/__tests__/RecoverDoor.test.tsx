/**
 * @jest-environment jsdom
 *
 * The welcome screen's recover door and the screen it opens, mounted with the
 * navigation, the auth state, the wallet state and the background's dispatch
 * scripted.
 */
import { createRoot, Root } from 'react-dom/client'
import { act } from 'react-dom/test-utils'

import en from '@common/config/localization/translations/en.json'
import type { ThemeContextReturnType } from '@common/contexts/themeContext'
import type { ThemeProps } from '@common/styles/themeConfig'

// React only runs effects and state updates inside act() when this flag is set.
Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true })

const mockDispatch = jest.fn()
const mockNavigate = jest.fn()
const mockGoToNextRoute = jest.fn()
const mockAuth = { authStatus: 'NOT_AUTHENTICATED' }

jest.mock('@web/hooks/useBackgroundService', () => ({
  __esModule: true,
  default: () => ({ dispatch: mockDispatch })
}))
jest.mock('@common/hooks/useNavigation', () => ({
  __esModule: true,
  default: () => ({ navigate: mockNavigate, canGoBack: false, goBack: () => {} })
}))
jest.mock('@common/modules/auth/hooks/useOnboardingNavigation', () => ({
  __esModule: true,
  default: () => ({ goToNextRoute: mockGoToNextRoute, goToPrevRoute: () => {} })
}))
jest.mock('@common/modules/auth/hooks/useAuth', () => ({
  __esModule: true,
  default: () => mockAuth
}))
jest.mock('@web/hooks/useWalletStateController', () => ({
  __esModule: true,
  default: () => ({ isPinned: false, isSetupComplete: false })
}))
// Jest's config transforms neither images nor this package's ES modules; the
// logos and the tab layout's scroll wrapper load them.
jest.mock('@web/assets/kohaku.png', () => 'kohaku.png')
jest.mock('@common/components/AmbireLogoHorizontal', () => ({
  __esModule: true,
  default: () => null
}))
jest.mock('react-native-keyboard-aware-scroll-view', () => ({
  KeyboardAwareScrollView: jest.requireActual('react-native').ScrollView
}))

/* eslint-disable @typescript-eslint/no-var-requires, global-require */
const React: typeof import('react') = require('react')
const {
  ThemeContext
}: typeof import('@common/contexts/themeContext') = require('@common/contexts/themeContext')
const themeConfig: typeof import('@common/styles/themeConfig') = require('@common/styles/themeConfig')
const {
  AUTH_STATUS
}: typeof import('@common/modules/auth/constants/authStatus') = require('@common/modules/auth/constants/authStatus')
const {
  WEB_ROUTES
}: typeof import('@common/modules/router/constants/common') = require('@common/modules/router/constants/common')
const GetStartedScreen: typeof import('@web/modules/auth/screens/GetStartedScreen/GetStartedScreen').default =
  require('@web/modules/auth/screens/GetStartedScreen/GetStartedScreen').default
const RecoverScreen: typeof import('@web/modules/social-recovery/onboarding/recover/RecoverScreen').default =
  require('@web/modules/social-recovery/onboarding/recover/RecoverScreen').default
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

const RECOVER = en.socialRecovery.recover

let container: HTMLDivElement
let root: Root

beforeEach(() => {
  container = document.createElement('div')
  document.body.appendChild(container)
  root = createRoot(container)
  mockDispatch.mockClear()
  mockNavigate.mockClear()
  mockGoToNextRoute.mockClear()
  mockAuth.authStatus = AUTH_STATUS.NOT_AUTHENTICATED
})

afterEach(() => {
  act(() => root.unmount())
  container.remove()
})

const mount = async (screen: React.ReactElement) => {
  await act(async () => {
    root.render(<ThemeContext.Provider value={THEME_CONTEXT}>{screen}</ThemeContext.Provider>)
  })
}

const byTestId = (id: string) => container.querySelector<HTMLElement>(`[data-testid="${id}"]`)

const press = async (id: string) => {
  const node = byTestId(id)
  if (!node) {
    throw new Error(`nothing to press: ${id}`)
  }
  await act(async () => {
    node.click()
  })
}

const acknowledge = () => press('recovery-warning-acknowledge')

describe('the welcome screen', () => {
  it('shows the recover door third, under the create and the import doors, with its line under it', async () => {
    await mount(<GetStartedScreen />)

    const order = Array.from(container.querySelectorAll('*'))
    const create = byTestId('create-new-account-btn') as HTMLElement
    const importDoor = byTestId('create-existing-account-btn') as HTMLElement
    const recoverDoor = byTestId('recover-account-btn') as HTMLElement
    const doorLine = Array.from(container.querySelectorAll<HTMLElement>('[dir="auto"]')).find(
      (node) => node.textContent === RECOVER.doorLine
    ) as HTMLElement

    expect(recoverDoor?.textContent).toBe(en.socialRecovery.routes.recover)
    expect(doorLine).toBeDefined()
    expect(order.indexOf(importDoor)).toBeGreaterThan(order.indexOf(create))
    expect(order.indexOf(recoverDoor)).toBeGreaterThan(order.indexOf(importDoor))
    expect(order.indexOf(doorLine)).toBeGreaterThan(order.indexOf(recoverDoor))
  })

  it('leads the recover door to the warning and sends nothing to the background', async () => {
    await mount(<GetStartedScreen />)
    mockDispatch.mockClear()

    await press('recover-account-btn')

    expect(mockNavigate).toHaveBeenCalledTimes(1)
    expect(mockNavigate).toHaveBeenCalledWith(WEB_ROUTES.socialRecoveryRecover)
    expect(mockGoToNextRoute).not.toHaveBeenCalled()
    expect(mockDispatch).not.toHaveBeenCalled()
  })
})

describe('the recover door screen', () => {
  it('opens on the warning in its recover form, under the recover header', async () => {
    await mount(<RecoverScreen />)

    expect(byTestId('recovery-warning')).not.toBeNull()
    expect(byTestId('recovery-warning-step')).not.toBeNull()
    expect(byTestId('recovery-warning-pointer')).not.toBeNull()
    expect(container.textContent).toContain(en.socialRecovery.routes.recover)
    expect(container.textContent).toContain(RECOVER.warning.acknowledgeRecover)
  })

  it('goes nowhere on continue before the acknowledgment', async () => {
    await mount(<RecoverScreen />)

    await press('recovery-warning-continue')

    expect(mockNavigate).not.toHaveBeenCalled()
    expect(mockGoToNextRoute).not.toHaveBeenCalled()
  })

  it('opens the fast track on continue after the acknowledgment', async () => {
    await mount(<RecoverScreen />)

    await acknowledge()
    await press('recovery-warning-continue')

    expect(mockNavigate).toHaveBeenCalledTimes(1)
    expect(mockNavigate).toHaveBeenCalledWith(WEB_ROUTES.socialRecoveryFastTrack, {
      state: { acknowledged: true }
    })
  })

  it('sends import instead where the welcome screen sends its import door', async () => {
    await mount(<GetStartedScreen />)
    await press('create-existing-account-btn')
    const welcomeImport = mockGoToNextRoute.mock.calls
    expect(welcomeImport).toHaveLength(1)

    mockGoToNextRoute.mockClear()
    await mount(<RecoverScreen />)
    await press('recovery-warning-import-instead')

    expect(mockGoToNextRoute.mock.calls).toEqual(welcomeImport)
    expect(mockNavigate).not.toHaveBeenCalledWith(WEB_ROUTES.socialRecoveryFastTrack)
  })

  it('goes back to the welcome screen on leave on a fresh install', async () => {
    await mount(<RecoverScreen />)

    await press('recovery-warning-leave')

    expect(mockNavigate).toHaveBeenCalledTimes(1)
    expect(mockNavigate).toHaveBeenCalledWith(WEB_ROUTES.getStarted)
  })

  it('goes back to the account recovery settings on leave for a holder with an account', async () => {
    mockAuth.authStatus = AUTH_STATUS.AUTHENTICATED
    await mount(<RecoverScreen />)

    await press('recovery-warning-leave')

    expect(mockNavigate).toHaveBeenCalledTimes(1)
    expect(mockNavigate).toHaveBeenCalledWith(WEB_ROUTES.socialRecoverySetup)
  })

  it('sends nothing to the background on any of its actions', async () => {
    await mount(<RecoverScreen />)
    await press('recovery-warning-leave')
    await press('recovery-warning-import-instead')
    await acknowledge()
    await press('recovery-warning-continue')

    expect(mockDispatch).not.toHaveBeenCalled()
  })

  it('never calls the seed anything but the recovery phrase on the door or its screen', async () => {
    await mount(<RecoverScreen />)
    const screen = container.textContent ?? ''
    await mount(<GetStartedScreen />)
    const doorLine = RECOVER.doorLine

    expect(screen).not.toMatch(/seed|mnemonic|secret phrase/i)
    expect(screen).toMatch(/recovery phrase/)
    expect(doorLine).not.toMatch(/seed|mnemonic|secret phrase/i)
    expect(container.textContent).toContain(doorLine)
  })
})
