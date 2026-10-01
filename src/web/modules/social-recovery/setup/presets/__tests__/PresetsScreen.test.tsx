/**
 * @jest-environment jsdom
 *
 * The presets screen mounted with the app's own components, the real en.json
 * and real records on an in-memory double of the extension's storage helper.
 * The selected account, the navigation and the settings sidebar are stubs, so
 * a test can switch the account the way the background's state push does.
 */
import { createRoot, Root } from 'react-dom/client'
import { act } from 'react-dom/test-utils'
import { TextDecoder, TextEncoder } from 'util'

import { parse, stringify } from '@ambire-common/libs/richJson/richJson'
import type { ThemeContextReturnType } from '@common/contexts/themeContext'
import type { ThemeProps } from '@common/styles/themeConfig'
import type { Address } from '@web/modules/social-recovery/sdk-interfaces'
import type { RecordStorage } from '@web/modules/social-recovery/shared/records'

Object.assign(globalThis, { TextEncoder, TextDecoder })
// React only runs effects and state updates inside act() when this flag is set.
;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true

// The selected account as an external store: the screen is memoised, so it
// renders again only when the store tells it the account changed.
const mockSelected: {
  state: { account: { addr: string } | null }
  listeners: Set<() => void>
} = { state: { account: null }, listeners: new Set() }
const mockRaw = new Map<string, string>()
const mockStorage: RecordStorage = {
  get: async (key, defaultValue) => {
    const stored = key && mockRaw.get(key)
    return stored ? parse(stored) : defaultValue
  },
  getAll: async () =>
    Object.fromEntries([...mockRaw.entries()].map(([key, stored]) => [key, parse(stored)])),
  set: async (key, value) => {
    mockRaw.set(key, typeof value === 'string' ? value : stringify(value))
    return null
  },
  remove: async (key) => {
    mockRaw.delete(key)
    return null
  },
  setEntries: async (entries) => {
    Object.entries(entries).forEach(([key, value]) =>
      mockRaw.set(key, typeof value === 'string' ? value : stringify(value))
    )
  },
  removeKeys: async (keys) => {
    keys.forEach((key) => mockRaw.delete(key))
  }
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
jest.mock('@common/hooks/useNavigation', () => ({
  __esModule: true,
  default: () => ({ navigate: () => {} })
}))
jest.mock('@web/modules/settings/components/Sidebar', () => ({
  __esModule: true,
  default: () => null
}))
jest.mock('@common/components/AmbireLogoHorizontal', () => ({
  __esModule: true,
  default: () => null
}))
jest.mock('@web/modules/social-recovery/shared/records', () => ({
  ...jest.requireActual('@web/modules/social-recovery/shared/records'),
  extensionRecordStorage: mockStorage
}))

/* eslint-disable @typescript-eslint/no-var-requires, global-require */
const React: typeof import('react') = require('react')
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
  createWalletRecords
}: typeof import('@web/modules/social-recovery/shared/records') = require('@web/modules/social-recovery/shared/records')
const PresetsScreen: typeof import('../PresetsScreen').default = require('../PresetsScreen').default
/* eslint-enable @typescript-eslint/no-var-requires, global-require */

const ACCOUNT: Address = '0x1111111111111111111111111111111111111111'
const OTHER_ACCOUNT: Address = '0x2222222222222222222222222222222222222222'
const S = en.socialRecovery

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

describe('the presets screen', () => {
  let container: HTMLDivElement
  let root: Root

  beforeEach(() => {
    mockRaw.clear()
    container = document.createElement('div')
    document.body.appendChild(container)
    root = createRoot(container)
  })

  afterEach(() => {
    act(() => root.unmount())
    container.remove()
  })

  const showAccount = async (account: Address | null) => {
    mockSelected.state = { account: account && { addr: account } }
    await act(async () => {
      if (container.childElementCount) {
        mockSelected.listeners.forEach((listener) => listener())
      } else {
        root.render(
          <ThemeContext.Provider value={THEME_CONTEXT}>
            <PresetsScreen />
          </ThemeContext.Provider>
        )
      }
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

  it('shows no presets until an account is selected', async () => {
    await showAccount(null)
    expect(byTestId('presets-screen')).toBeNull()
    expect(container.textContent).toContain(S.chrome.breadcrumb)
  })

  it('starts the other account with no card picked', async () => {
    await showAccount(ACCOUNT)
    await press('preset-eitherOne')
    expect(byTestId('preset-eitherOne')?.getAttribute('aria-checked')).toBe('true')
    await showAccount(OTHER_ACCOUNT)
    expect(byTestId('presets-grid')).not.toBeNull()
    expect(byTestId('preset-eitherOne')?.getAttribute('aria-checked')).toBe('false')
    expect(container.textContent).toContain(S.presets.continueUnlock)
  })

  it("shows the other account's own draft, and the first account's grid when it comes back", async () => {
    const records = createWalletRecords({ storage: mockStorage })
    await records.setup(CHAIN_IDS[WALLET_RECOVERY_CHAIN], OTHER_ACCOUNT).setupDraft.write({
      wait: 172800n,
      clauses: [],
      ignoresPause: true,
      privacy: { backup: 'encrypted', publicMetadata: '0x' }
    })
    await showAccount(ACCOUNT)
    expect(byTestId('presets-grid')).not.toBeNull()
    await showAccount(OTHER_ACCOUNT)
    expect(byTestId('presets-resume')).not.toBeNull()
    expect(byTestId('presets-grid')).toBeNull()
    await showAccount(ACCOUNT)
    expect(byTestId('presets-grid')).not.toBeNull()
    expect(byTestId('presets-resume')).toBeNull()
  })
})
