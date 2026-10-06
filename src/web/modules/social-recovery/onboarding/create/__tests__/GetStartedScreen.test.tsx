/**
 * @jest-environment jsdom
 *
 * The get-started screen mounted with its navigation, auth, wallet-state and
 * background hooks scripted: a signed-out wallet on its first run.
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

jest.mock('@web/hooks/useBackgroundService', () => ({
  __esModule: true,
  default: () => ({ dispatch: mockDispatch })
}))
jest.mock('@common/hooks/useNavigation', () => ({
  __esModule: true,
  default: () => ({ navigate: mockNavigate })
}))
jest.mock('@common/modules/auth/hooks/useOnboardingNavigation', () => ({
  __esModule: true,
  default: () => ({ goToNextRoute: mockGoToNextRoute })
}))
jest.mock('@common/modules/auth/hooks/useAuth', () => ({
  __esModule: true,
  default: () => ({ authStatus: 'NOT_AUTHENTICATED' })
}))
jest.mock('@web/hooks/useWalletStateController', () => ({
  __esModule: true,
  default: () => ({ isPinned: false, isSetupComplete: false })
}))
// Jest's config transforms neither images nor this package's ES modules; the
// logo and the tab layout's scroll wrapper load them.
jest.mock('@web/assets/kohaku.png', () => 'kohaku.png')
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
  WEB_ROUTES
}: typeof import('@common/modules/router/constants/common') = require('@common/modules/router/constants/common')
const GetStartedScreen: typeof import('@web/modules/auth/screens/GetStartedScreen/GetStartedScreen').default =
  require('@web/modules/auth/screens/GetStartedScreen/GetStartedScreen').default
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

describe('the get-started screen', () => {
  let container: HTMLDivElement
  let root: Root

  const mount = async () => {
    await act(async () => {
      root.render(
        <ThemeContext.Provider value={THEME_CONTEXT}>
          <GetStartedScreen />
        </ThemeContext.Provider>
      )
    })
  }

  const byTestId = (id: string) => container.querySelector<HTMLElement>(`[data-testid="${id}"]`)
  const textLines = () =>
    Array.from(container.querySelectorAll<HTMLElement>('[dir="auto"]')).map(
      (node) => node.textContent
    )

  beforeEach(() => {
    container = document.createElement('div')
    document.body.appendChild(container)
    root = createRoot(container)
    mockDispatch.mockClear()
    mockNavigate.mockClear()
    mockGoToNextRoute.mockClear()
  })

  afterEach(() => {
    act(() => root.unmount())
    container.remove()
  })

  it('says under the create door that recovery covers the smart account and one ordinary key', async () => {
    await mount()

    const lines = textLines()
    const covers = lines.indexOf(en.socialRecovery.create.coversSmartAccount)
    const oneKey = lines.indexOf(en.socialRecovery.create.oneOrdinaryKey)
    expect(covers).toBeGreaterThan(-1)
    expect(oneKey).toBe(covers + 1)
  })

  it('places the two sentences after the import door and above the version line', async () => {
    await mount()

    const create = byTestId('create-new-account-btn') as HTMLElement
    const importDoor = byTestId('create-existing-account-btn') as HTMLElement
    const lines = Array.from(container.querySelectorAll<HTMLElement>('[dir="auto"]'))
    const footer = lines[lines.length - 1]
    const sentences = Array.from(container.querySelectorAll<HTMLElement>('[dir="auto"]')).filter(
      (node) =>
        node.textContent === en.socialRecovery.create.coversSmartAccount ||
        node.textContent === en.socialRecovery.create.oneOrdinaryKey
    )

    // Document order: every element of the screen as it reads top to bottom.
    const order = Array.from(container.querySelectorAll('*'))
    expect(order.indexOf(importDoor)).toBeGreaterThan(order.indexOf(create))
    expect(footer.textContent).toMatch(/^v[0-9]/)
    expect(sentences).toHaveLength(2)
    sentences.forEach((sentence) => {
      expect(order.indexOf(sentence)).toBeGreaterThan(order.indexOf(importDoor))
      expect(order.indexOf(sentence)).toBeLessThan(order.indexOf(footer))
    })
  })

  it('asks nothing about a seed', async () => {
    await mount()

    expect(container.textContent).not.toMatch(/seed/i)
    expect(container.textContent).not.toMatch(/recovery phrase/i)
  })

  it('leads the create door to the new seed and sends nothing to the background', async () => {
    await mount()
    mockDispatch.mockClear()

    await act(async () => {
      byTestId('create-new-account-btn')?.click()
    })

    expect(mockGoToNextRoute).toHaveBeenCalledWith(WEB_ROUTES.createSeedPhrasePrepare)
    expect(mockDispatch).not.toHaveBeenCalled()
  })

  it('leads the import door to the seed import unchanged', async () => {
    await mount()

    await act(async () => {
      byTestId('create-existing-account-btn')?.click()
    })

    expect(mockGoToNextRoute).toHaveBeenCalledWith(WEB_ROUTES.importSeedPhrase)
  })
})
