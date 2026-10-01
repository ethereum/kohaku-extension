/**
 * @jest-environment jsdom
 *
 * The screens that open the account picker on a key: the new seed's write-down
 * screen, the seed import and the private key import. Each is mounted with its
 * hooks scripted and the background's dispatch recorded.
 */
import { createRoot, Root } from 'react-dom/client'
import { act } from 'react-dom/test-utils'
import { TextDecoder, TextEncoder } from 'util'

import type { ThemeContextReturnType } from '@common/contexts/themeContext'
import type { ThemeProps } from '@common/styles/themeConfig'

Object.assign(globalThis, { TextEncoder, TextDecoder })
;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true

const mockDispatch = jest.fn()
const mockSeed = 'test test test test test test test test test test test junk'

jest.mock('@web/hooks/useBackgroundService', () => ({
  __esModule: true,
  default: () => ({ dispatch: mockDispatch })
}))
jest.mock('@common/modules/auth/hooks/useOnboardingNavigation', () => ({
  __esModule: true,
  default: () => ({ goToNextRoute: () => {}, goToPrevRoute: () => {} })
}))
jest.mock('@web/hooks/useAccountPickerControllerState', () => ({
  __esModule: true,
  default: () => ({ initParams: null, subType: null })
}))
jest.mock('@web/hooks/useKeystoreControllerState', () => ({
  __esModule: true,
  default: () => ({ hasTempSeed: true })
}))
jest.mock('@common/hooks/useToast', () => ({
  __esModule: true,
  default: () => ({ addToast: () => {} })
}))
jest.mock('@web/extension-services/background/webapi/storage', () => ({
  __esModule: true,
  default: { get: async () => undefined, set: async () => {} }
}))
jest.mock('@common/modules/header/components/Header', () => ({
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
// Jest's config does not transform these packages' ES modules; the copy button
// and the scroll wrappers load them.
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
const {
  BIP44_STANDARD_DERIVATION_TEMPLATE
}: typeof import('@ambire-common/consts/derivation') = require('@ambire-common/consts/derivation')
const eventBus: typeof import('@web/extension-services/event/eventBus').default =
  require('@web/extension-services/event/eventBus').default
const CreateSeedPhraseWriteScreen: typeof import('@web/modules/auth/modules/create-seed-phrase/screens/CreateSeedPhraseWriteScreen/CreateSeedPhraseWriteScreen').default =
  require('@web/modules/auth/modules/create-seed-phrase/screens/CreateSeedPhraseWriteScreen/CreateSeedPhraseWriteScreen').default
const PrivateKeyImportScreen: typeof import('@web/modules/auth/screens/PrivateKeyImportScreen/PrivateKeyImportScreen').default =
  require('@web/modules/auth/screens/PrivateKeyImportScreen/PrivateKeyImportScreen').default
const SeedPhraseImportScreen: typeof import('@web/modules/auth/screens/SeedPhraseImportScreen/SeedPhraseImportScreen').default =
  require('@web/modules/auth/screens/SeedPhraseImportScreen/SeedPhraseImportScreen').default
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

const SEED = mockSeed
const PRIVATE_KEY = '1'.repeat(64)
const PICKER_INIT = 'MAIN_CONTROLLER_ACCOUNT_PICKER_INIT_PRIVATE_KEY_OR_SEED_PHRASE'

describe('the screens that open the picker on a key', () => {
  let container: HTMLDivElement
  let root: Root

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
  const settle = () =>
    act(async () => {
      await new Promise((resolve) => {
        setTimeout(resolve, 0)
      })
    })
  const pickerInits = () =>
    mockDispatch.mock.calls.map(([action]) => action).filter(({ type }) => type === PICKER_INIT)

  beforeEach(() => {
    container = document.createElement('div')
    document.body.appendChild(container)
    root = createRoot(container)
    mockDispatch.mockClear()
  })

  afterEach(() => {
    act(() => root.unmount())
    container.remove()
  })

  it('opens the picker from a new seed asking it to select the smart account', async () => {
    await mount(<CreateSeedPhraseWriteScreen />)
    // The keystore sends the new seed to the screen once it is asked for it.
    await act(async () => {
      eventBus.emit('receiveOneTimeData', {
        tempSeed: { seed: SEED, hdPathTemplate: BIP44_STANDARD_DERIVATION_TEMPLATE }
      })
    })

    await press('create-seed-phrase-write-continue-btn')

    expect(pickerInits()).toEqual([
      {
        type: PICKER_INIT,
        params: {
          privKeyOrSeed: SEED,
          hdPathTemplate: BIP44_STANDARD_DERIVATION_TEMPLATE,
          shouldSelectSmartAccountAutomatically: true
        }
      }
    ])
  })

  it('opens the picker from an imported seed without asking it to select the smart account', async () => {
    await mount(<SeedPhraseImportScreen />)
    const field = container.querySelector<HTMLTextAreaElement>(
      '[data-testid="enter-seed-phrase-field"]'
    )
    if (!field) {
      throw new Error('no seed field')
    }
    await act(async () => {
      const setValue = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value')?.set
      setValue?.call(field, SEED)
      field.dispatchEvent(new Event('input', { bubbles: true }))
    })

    // The form validates the phrase before it enables the button.
    await settle()

    await press('import-button')
    await settle()

    const inits = pickerInits()
    expect(inits).toHaveLength(1)
    expect(inits[0].params.privKeyOrSeed).toBe(SEED)
    expect(inits[0].params).not.toHaveProperty('shouldSelectSmartAccountAutomatically')
  })

  it('opens the picker from an imported private key without asking it to select the smart account', async () => {
    await mount(<PrivateKeyImportScreen />)
    const field = container.querySelector<HTMLInputElement>(
      '[data-testid="enter-seed-phrase-field"]'
    )
    if (!field) {
      throw new Error('no key field')
    }
    await act(async () => {
      const setValue = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set
      setValue?.call(field, `0x${PRIVATE_KEY}`)
      field.dispatchEvent(new Event('input', { bubbles: true }))
    })
    await settle()
    await press('backup-warning-checkbox')

    await press('import-button')
    await settle()

    const inits = pickerInits()
    expect(inits).toHaveLength(1)
    expect(inits[0].params.privKeyOrSeed).toBe(PRIVATE_KEY)
    expect(inits[0].params).not.toHaveProperty('shouldSelectSmartAccountAutomatically')
  })
})
