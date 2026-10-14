/**
 * @jest-environment jsdom
 *
 * The wallet's two reset entries, the seed import and the password reset by
 * email, mounted whole with their hooks scripted, the background's dispatch
 * recorded and the screen header replaced by a probe that records its mounts.
 */
import { createRoot, Root } from 'react-dom/client'
import { act } from 'react-dom/test-utils'
import { TextDecoder, TextEncoder } from 'util'

import en from '@common/config/localization/translations/en.json'
import type { ThemeContextReturnType } from '@common/contexts/themeContext'
import type { ThemeProps } from '@common/styles/themeConfig'

Object.assign(globalThis, { TextEncoder, TextDecoder })
// React only runs effects and state updates inside act() when this flag is set.
Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true })

const mockDispatch = jest.fn()
const mockHeaderMounts = jest.fn()
const mockNavigate = jest.fn()
const mockGoBack = jest.fn()
const mockGoToPrevRoute = jest.fn()
const mockHistory = { canGoBack: true }
const mockSeed = 'test test test test test test test test test test test junk'

jest.mock('@web/hooks/useBackgroundService', () => ({
  __esModule: true,
  default: () => ({ dispatch: mockDispatch })
}))
jest.mock('@common/hooks/useNavigation', () => ({
  __esModule: true,
  default: () => ({
    navigate: mockNavigate,
    goBack: mockGoBack,
    canGoBack: mockHistory.canGoBack
  })
}))
jest.mock('@common/modules/auth/hooks/useOnboardingNavigation', () => ({
  __esModule: true,
  default: () => ({ goToNextRoute: () => {}, goToPrevRoute: mockGoToPrevRoute })
}))
jest.mock('@web/hooks/useAccountPickerControllerState', () => ({
  __esModule: true,
  default: () => ({ initParams: null, subType: null })
}))
jest.mock('@web/hooks/useKeystoreControllerState', () => ({
  __esModule: true,
  default: () => ({ isUnlocked: false, hasTempSeed: false })
}))
jest.mock('@web/hooks/useEmailVaultControllerState', () => ({
  __esModule: true,
  default: () => ({
    currentState: 'loaded',
    emailVaultStates: { email: {} },
    hasConfirmedRecoveryEmail: false
  })
}))
jest.mock('@common/modules/header/components/Header', () => {
  const { useEffect } = jest.requireActual('react')
  return {
    __esModule: true,
    default: () => {
      useEffect(() => {
        mockHeaderMounts()
      }, [])
      return null
    }
  }
})
jest.mock('@common/components/AmbireLogoHorizontal', () => ({
  __esModule: true,
  default: () => null
}))
// Node's Buffer is not a Uint8Array of jsdom's realm, so ethers' checksum of a
// phrase fails under jsdom; the stand-in accepts the one phrase the test types.
jest.mock('ethers', () => {
  const actual = jest.requireActual('ethers')
  return {
    ...actual,
    Mnemonic: { ...actual.Mnemonic, isValidMnemonic: (phrase: string) => phrase === mockSeed }
  }
})
// The spinner's animation player calls native commands jsdom lacks.
jest.mock('@common/components/Spinner', () => ({ __esModule: true, default: () => null }))
// The bottom sheet's package reads native modules jsdom lacks; the password
// reset opens its sheets only after the holder sent the email.
jest.mock('react-native-modalize', () => ({
  Modalize: () => null,
  useModalize: () => ({ ref: { current: null }, open: () => {}, close: () => {} })
}))
jest.mock('@common/components/BottomSheet', () => ({ __esModule: true, default: () => null }))
// The email sheet's animation player draws on a canvas jsdom lacks.
jest.mock('lottie-react', () => ({ __esModule: true, default: () => null }))
// Jest's config does not transform these packages' ES modules.
jest.mock('@common/utils/clipboard', () => ({ setStringAsync: async () => true }))
jest.mock('react-native-keyboard-aware-scroll-view', () => ({
  KeyboardAwareScrollView: jest.requireActual('react-native').ScrollView
}))

/* eslint-disable @typescript-eslint/no-var-requires, global-require */
const React: typeof import('react') = require('react')
const {
  ThemeContext
}: typeof import('@common/contexts/themeContext') = require('@common/contexts/themeContext')
const themeConfig: typeof import('@common/styles/themeConfig') = require('@common/styles/themeConfig')
const SeedPhraseImportScreen: typeof import('@web/modules/auth/screens/SeedPhraseImportScreen/SeedPhraseImportScreen').default =
  require('@web/modules/auth/screens/SeedPhraseImportScreen/SeedPhraseImportScreen').default
const KeyStoreResetScreen: typeof import('@web/modules/keystore/screens/KeyStoreResetScreen/KeyStoreResetScreen').default =
  require('@web/modules/keystore/screens/KeyStoreResetScreen/KeyStoreResetScreen').default
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

const WARNING = en.socialRecovery.recover.warning

const ENTRIES = [
  { name: 'the seed import', Screen: SeedPhraseImportScreen, submit: 'Confirm' },
  {
    name: 'the password reset by email',
    Screen: KeyStoreResetScreen,
    submit: 'Send Confirmation Email'
  }
] as const

let container: HTMLDivElement
let root: Root

beforeEach(() => {
  container = document.createElement('div')
  document.body.appendChild(container)
  root = createRoot(container)
  mockDispatch.mockClear()
  mockHeaderMounts.mockClear()
  mockNavigate.mockClear()
  mockGoBack.mockClear()
  mockGoToPrevRoute.mockClear()
  mockHistory.canGoBack = true
})

afterEach(() => {
  act(() => root.unmount())
  container.remove()
})

const mount = async (screen: React.ReactElement | null) => {
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

const settle = () =>
  act(async () => {
    await new Promise((resolve) => {
      setTimeout(resolve, 0)
    })
  })

const pass = async () => {
  await press('recovery-warning-acknowledge')
  await press('recovery-warning-continue')
  await settle()
}

const fields = () => container.querySelectorAll('input, textarea, select')

// React Native Web renders a pressable as an element with a tab index, enabled
// or not.
const controls = () => Array.from(container.querySelectorAll<HTMLElement>('[tabindex], button'))

// Every control on the page that is not part of the warning.
const controlsOutsideTheWarning = () => {
  const warning = byTestId('recovery-warning')
  return controls().filter((node) => !warning?.contains(node))
}

const buttonWithText = (text: string) => controls().find((node) => node.textContent === text)

const type = async (field: HTMLInputElement | HTMLTextAreaElement, value: string) => {
  await act(async () => {
    const prototype =
      field instanceof HTMLTextAreaElement
        ? HTMLTextAreaElement.prototype
        : HTMLInputElement.prototype
    Object.getOwnPropertyDescriptor(prototype, 'value')?.set?.call(field, value)
    field.dispatchEvent(new Event('input', { bubbles: true }))
  })
  await settle()
}

ENTRIES.forEach(({ name, Screen, submit }) => {
  describe(name, () => {
    it('opens on the warning in its reset form and nothing of its own', async () => {
      await mount(<Screen />)

      expect(byTestId('recovery-warning')).not.toBeNull()
      expect(container.textContent).toContain(WARNING.acknowledgeReset)
      expect(byTestId('recovery-warning-step')).toBeNull()
      expect(byTestId('recovery-warning-pointer')).toBeNull()
      expect(fields()).toHaveLength(0)
      expect(controlsOutsideTheWarning()).toHaveLength(0)
      expect(buttonWithText(submit)).toBeUndefined()
      expect(mockHeaderMounts).not.toHaveBeenCalled()
      expect(mockDispatch).not.toHaveBeenCalled()
    })

    it('mounts nothing of its own after the acknowledgment alone', async () => {
      await mount(<Screen />)
      await press('recovery-warning-acknowledge')
      await settle()

      expect(fields()).toHaveLength(0)
      expect(controlsOutsideTheWarning()).toHaveLength(0)
      expect(buttonWithText(submit)).toBeUndefined()
      expect(mockHeaderMounts).not.toHaveBeenCalled()
      expect(mockDispatch).not.toHaveBeenCalled()
    })

    it('mounts nothing of its own on a press of continue before the acknowledgment', async () => {
      await mount(<Screen />)
      await press('recovery-warning-continue')
      await settle()

      expect(byTestId('recovery-warning')).not.toBeNull()
      expect(fields()).toHaveLength(0)
      expect(mockHeaderMounts).not.toHaveBeenCalled()
      expect(mockDispatch).not.toHaveBeenCalled()
    })

    it('mounts its own content once, in place of the warning, after the acknowledgment and continue', async () => {
      await mount(<Screen />)
      await pass()

      expect(byTestId('recovery-warning')).toBeNull()
      expect(fields().length).toBeGreaterThan(0)
      expect(buttonWithText(submit)).toBeDefined()
      expect(mockHeaderMounts).toHaveBeenCalledTimes(1)
      expect(mockDispatch).not.toHaveBeenCalled()
    })

    it('takes the acknowledgment again when it opens again', async () => {
      await mount(<Screen />)
      await pass()
      await mount(null)
      await mount(<Screen />)

      expect(byTestId('recovery-warning-continue')?.getAttribute('aria-disabled')).toBe('true')
      expect(fields()).toHaveLength(0)
      expect(mockHeaderMounts).toHaveBeenCalledTimes(1)
    })

    it('goes back where the holder came from on leave, mounting nothing of its own', async () => {
      await mount(<Screen />)
      await press('recovery-warning-leave')

      expect(mockGoBack).toHaveBeenCalledTimes(1)
      expect(mockHeaderMounts).not.toHaveBeenCalled()
      expect(mockDispatch).not.toHaveBeenCalled()
    })
  })
})

describe('the seed import behind the warning', () => {
  it('takes the recovery phrase and hands it to the background once passed', async () => {
    await mount(<SeedPhraseImportScreen />)
    await pass()

    const field = byTestId('enter-seed-phrase-field') as HTMLTextAreaElement
    await type(field, mockSeed)
    await press('import-button')
    await settle()

    const types = mockDispatch.mock.calls.map(([action]) => action.type)
    expect(types).toContain('MAIN_CONTROLLER_ACCOUNT_PICKER_INIT_PRIVATE_KEY_OR_SEED_PHRASE')
  })

  it('goes to the previous onboarding step on leave when the tab has no history', async () => {
    mockHistory.canGoBack = false
    await mount(<SeedPhraseImportScreen />)
    await press('recovery-warning-leave')

    expect(mockGoToPrevRoute).toHaveBeenCalledTimes(1)
    expect(mockGoBack).not.toHaveBeenCalled()
  })
})

describe('the password reset behind the warning', () => {
  it('takes the email and asks the background to send the link once passed', async () => {
    await mount(<KeyStoreResetScreen />)
    await pass()

    const field = container.querySelector('input') as HTMLInputElement
    await type(field, 'holder@example.com')
    const send = buttonWithText('Send Confirmation Email')
    expect(send).toBeDefined()
    await act(async () => {
      send?.click()
    })
    await settle()

    expect(mockDispatch.mock.calls.map(([action]) => action)).toEqual([
      {
        type: 'EMAIL_VAULT_CONTROLLER_HANDLE_MAGIC_LINK_KEY',
        params: { email: 'holder@example.com', flow: 'recovery' }
      }
    ])
  })

  it('goes to the start on leave when the tab has no history', async () => {
    mockHistory.canGoBack = false
    await mount(<KeyStoreResetScreen />)
    await press('recovery-warning-leave')

    expect(mockNavigate).toHaveBeenCalledTimes(1)
    expect(mockNavigate).toHaveBeenCalledWith('/')
    expect(mockGoBack).not.toHaveBeenCalled()
  })
})
