/**
 * @jest-environment jsdom
 */
import { createRoot } from 'react-dom/client'
import { act } from 'react-dom/test-utils'

import type { ThemeContextReturnType } from '@common/contexts/themeContext'
import type { ThemeProps } from '@common/styles/themeConfig'

// React only runs effects and state updates inside act() when this flag is set.
Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true })

// The controller state and the location keep one object between renders, as the app's do.
const mockKeystore = {
  isUnlocked: false,
  errorMessage: '',
  statuses: { unlockWithSecret: 'INITIAL' }
}
const mockLocation: { pathname: string; search: string; hash: string; state: unknown } = {
  pathname: '/keystore-unlock',
  search: '',
  hash: '',
  state: null
}
const mockNavigate = jest.fn()

jest.mock('@env', () => ({ DEFAULT_KEYSTORE_PASSWORD_DEV: '' }), { virtual: true })
jest.mock('@web/hooks/useKeystoreControllerState', () => ({
  __esModule: true,
  default: () => mockKeystore
}))
jest.mock('@web/hooks/useBackgroundService', () => ({
  __esModule: true,
  default: () => ({ dispatch: jest.fn() })
}))
jest.mock('@common/hooks/useNavigation', () => ({
  __esModule: true,
  default: () => ({ navigate: mockNavigate })
}))
jest.mock('react-router-dom', () => ({
  ...jest.requireActual('react-router-dom'),
  useLocation: () => mockLocation
}))
jest.mock('@common/hooks/useDisableNavigatingBack', () => ({ __esModule: true, default: () => {} }))
jest.mock('@common/modules/header/components/Header', () => ({
  __esModule: true,
  default: () => null
}))
// The background artwork loads a stylesheet and the logo an image file, which Jest cannot read.
jest.mock('@common/assets/svg/UnlockScreenBackground', () => ({
  __esModule: true,
  default: () => null
}))
jest.mock('@common/components/HokahuLogo', () => ({
  __esModule: true,
  default: () => null
}))
jest.mock('@web/components/TabLayoutWrapper', () => ({
  TabLayoutContainer: ({ children }: { children: unknown }) => children,
  TabLayoutWrapperMainContent: ({ children }: { children: unknown }) => children
}))

/* eslint-disable @typescript-eslint/no-var-requires, global-require */
const {
  ThemeContext
}: typeof import('@common/contexts/themeContext') = require('@common/contexts/themeContext')
const themeConfig: typeof import('@common/styles/themeConfig') = require('@common/styles/themeConfig')
const KeyStoreUnlockScreen: typeof import('@web/modules/keystore/screens/KeyStoreUnlockScreen').default =
  require('@web/modules/keystore/screens/KeyStoreUnlockScreen').default
/* eslint-enable @typescript-eslint/no-var-requires, global-require */

const THEME_CONTEXT: ThemeContextReturnType = {
  theme: Object.fromEntries(
    Object.entries(themeConfig.default).map(([name, byType]) => [
      name,
      byType[themeConfig.THEME_TYPES.LIGHT]
    ])
  ) as ThemeProps,
  themeType: themeConfig.THEME_TYPES.LIGHT,
  selectedThemeType: themeConfig.THEME_TYPES.LIGHT,
  setThemeType: () => {}
}

const mount = () => {
  const container = document.createElement('div')
  document.body.appendChild(container)
  const root = createRoot(container)
  act(() => {
    root.render(
      <ThemeContext.Provider value={THEME_CONTEXT}>
        <KeyStoreUnlockScreen />
      </ThemeContext.Provider>
    )
  })
  return () => {
    act(() => root.unmount())
    container.remove()
  }
}

describe('KeyStoreUnlockScreen', () => {
  let unmount: () => void = () => {}

  beforeEach(() => {
    mockNavigate.mockReset()
    mockKeystore.isUnlocked = false
    mockLocation.state = null
  })

  afterEach(() => unmount())

  it('returns to the page a path return target names once unlocked, replacing the unlock entry', () => {
    mockKeystore.isUnlocked = true
    mockLocation.state = { returnTo: '/social-recovery/approve?request=abc' }
    unmount = mount()

    expect(mockNavigate).toHaveBeenCalledTimes(1)
    expect(mockNavigate).toHaveBeenCalledWith('/social-recovery/approve?request=abc', {
      replace: true
    })
  })

  it('returns to the page a location return target names once unlocked, with its search and hash', () => {
    mockKeystore.isUnlocked = true
    mockLocation.state = {
      returnTo: { pathname: '/social-recovery/approve', search: '?request=abc', hash: '#top' }
    }
    unmount = mount()

    expect(mockNavigate).toHaveBeenCalledTimes(1)
    expect(mockNavigate).toHaveBeenCalledWith('/social-recovery/approve?request=abc#top', {
      replace: true
    })
  })

  it('goes to the dashboard once unlocked when no return target is given', () => {
    mockKeystore.isUnlocked = true
    mockLocation.state = { prevRoute: { pathname: '/somewhere', search: '', hash: '' } }
    unmount = mount()

    expect(mockNavigate).toHaveBeenCalledTimes(1)
    expect(mockNavigate).toHaveBeenCalledWith('/')
  })

  it('goes to the dashboard once unlocked when the return target names no path', () => {
    mockKeystore.isUnlocked = true
    mockLocation.state = { returnTo: { search: '?request=abc' } }
    unmount = mount()

    expect(mockNavigate).toHaveBeenCalledTimes(1)
    expect(mockNavigate).toHaveBeenCalledWith('/')
  })

  it('navigates nowhere while the keystore is locked, even with a return target', () => {
    mockLocation.state = { returnTo: '/social-recovery/approve?request=abc' }
    unmount = mount()

    expect(mockNavigate).not.toHaveBeenCalled()
  })
})
