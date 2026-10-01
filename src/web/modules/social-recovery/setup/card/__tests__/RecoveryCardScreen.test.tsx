/**
 * @jest-environment jsdom
 *
 * The card screen mounted whole: the settings chrome, the real records over an
 * in-memory `browser.storage.local`, the real password holder and the real
 * carriers. The selected account and the keystore are the two controller
 * states the screen reads; the test hands in both. jsdom has no `TextEncoder`,
 * which viem reads when it loads, so the test sets Node's before it loads the
 * modules; it has no object URLs or print either, so each test sets its own.
 */
import { createRoot, Root } from 'react-dom/client'
import { act } from 'react-dom/test-utils'
import { TextDecoder, TextEncoder } from 'util'

import type { ThemeContextReturnType } from '@common/contexts/themeContext'
import type { ThemeProps } from '@common/styles/themeConfig'
import type { Address, SetupDraft } from '@web/modules/social-recovery/sdk-interfaces'

Object.assign(globalThis, { TextEncoder, TextDecoder })
;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true

// The selected account as an external store, so the test can switch it.
const mockSelected = {
  current: { account: null as { addr: string } | null },
  listeners: new Set<() => void>()
}
// The keystore as an external store too, so a push re-renders the ask.
const KEYSTORE_AT_REST = {
  hasPasswordSecret: true,
  statuses: { unlockWithSecret: 'INITIAL' },
  errorMessage: ''
}
const mockKeystore = {
  current: KEYSTORE_AT_REST,
  listeners: new Set<() => void>()
}

jest.mock('@web/hooks/useSelectedAccountControllerState', () => {
  const R = jest.requireActual('react')
  const subscribe = (listener: () => void) => {
    mockSelected.listeners.add(listener)
    return () => mockSelected.listeners.delete(listener)
  }
  return {
    __esModule: true,
    default: () => R.useSyncExternalStore(subscribe, () => mockSelected.current)
  }
})
jest.mock('@web/hooks/useKeystoreControllerState', () => {
  const R = jest.requireActual('react')
  const subscribe = (listener: () => void) => {
    mockKeystore.listeners.add(listener)
    return () => mockKeystore.listeners.delete(listener)
  }
  return {
    __esModule: true,
    default: () => R.useSyncExternalStore(subscribe, () => mockKeystore.current)
  }
})
// The extension's `browser.storage.local` the records write through: one
// in-memory store, whose reads a test can hold back.
const mockEntries = new Map<string, unknown>()
const mockStorageGate: { current: Promise<void> | null } = { current: null }
jest.mock('@web/constants/browserapi', () => ({
  ...jest.requireActual('@web/constants/browserapi'),
  browser: {
    storage: {
      local: {
        get: async () => {
          if (mockStorageGate.current) {
            await mockStorageGate.current
          }
          return Object.fromEntries(mockEntries)
        },
        set: async (items: Record<string, unknown>) => {
          Object.entries(items).forEach(([key, value]) => mockEntries.set(key, value))
        },
        remove: async (keys: string[]) => {
          keys.forEach((key) => mockEntries.delete(key))
        }
      }
    }
  }
}))

// Jest's config transforms neither images nor this package's ES modules; the
// chrome's logo and its sidebar's scroll wrapper load them.
jest.mock('@web/assets/kohaku-horizontal.png', () => 'kohaku-horizontal.png')
jest.mock('react-native-keyboard-aware-scroll-view', () => ({
  KeyboardAwareScrollView: jest.requireActual('react-native').ScrollView
}))
// Jest resolves no `.web` platform file, so the navigation takes the web build's.
jest.mock('@common/hooks/useNavigation', () =>
  jest.requireActual('@common/hooks/useNavigation/useNavigation.web')
)

/* eslint-disable @typescript-eslint/no-var-requires, global-require */
const React: typeof import('react') = require('react')
const { MemoryRouter, useLocation }: typeof import('react-router-dom') = require('react-router-dom')
const {
  WEB_ROUTES
}: typeof import('@common/modules/router/constants/common') = require('@common/modules/router/constants/common')
const en: typeof import('@common/config/localization/translations/en.json') = require('@common/config/localization/translations/en.json')
const {
  ThemeContext
}: typeof import('@common/contexts/themeContext') = require('@common/contexts/themeContext')
const themeConfig: typeof import('@common/styles/themeConfig') = require('@common/styles/themeConfig')
const {
  BackgroundServiceContext
}: typeof import('@web/contexts/backgroundServiceContext') = require('@web/contexts/backgroundServiceContext')
const {
  CHAIN_IDS,
  WALLET_RECOVERY_CHAIN
}: typeof import('@web/modules/social-recovery/shared/client') = require('@web/modules/social-recovery/shared/client')
const {
  createWalletRecords,
  extensionRecordStorage,
  setRecoveryPassword
}: typeof import('@web/modules/social-recovery/shared/records') = require('@web/modules/social-recovery/shared/records')
const {
  markCardCarried,
  wasCardCarried
}: typeof import('@web/modules/social-recovery/setup/card') = require('@web/modules/social-recovery/setup/card')
const RecoveryCardScreen: typeof import('@web/modules/social-recovery/setup/card/RecoveryCardScreen').default =
  require('@web/modules/social-recovery/setup/card/RecoveryCardScreen').default
/* eslint-enable @typescript-eslint/no-var-requires, global-require */

const S = en.socialRecovery
const CHAIN_ID = CHAIN_IDS[WALLET_RECOVERY_CHAIN]
const PASSWORD = 'tide lantern orchid'

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

// Where the router stands after each render.
const location = { pathname: '' }
const LocationProbe = () => {
  location.pathname = useLocation().pathname
  return null
}

// Each test takes its own account, since the holder and the carried card live
// in memory for the whole file.
let nextAccount = 1
const newAccount = (): Address => `0x${(nextAccount++).toString(16).padStart(40, '0')}` as Address

const draftWith = (backup: SetupDraft['privacy']['backup']): SetupDraft => ({
  wait: 86400n,
  clauses: [{ threshold: 1, credentials: [{ method: '0x01', config: '0xabcd' }] }],
  ignoresPause: false,
  privacy: { publicMetadata: '0x', backup }
})

const writeDraft = async (account: Address, backup: SetupDraft['privacy']['backup']) =>
  createWalletRecords({ storage: extensionRecordStorage })
    .setup(CHAIN_ID, account)
    .setupDraft.write(draftWith(backup))

describe('the recovery card screen', () => {
  let container: HTMLDivElement
  let root: Root
  let dispatch: jest.Mock
  let background: { dispatch: jest.Mock; windowId: undefined }
  let downloads: number
  const originalCreate = URL.createObjectURL
  const originalRevoke = URL.revokeObjectURL
  const originalPrint = window.print

  const select = async (account: Address | null) => {
    await act(async () => {
      mockSelected.current = { account: account ? { addr: account } : null }
      mockSelected.listeners.forEach((listener) => listener())
    })
  }

  // A fresh tab each time, so the router starts at the search given.
  const mount = async (account: Address, search = '') => {
    act(() => root.unmount())
    root = createRoot(container)
    mockSelected.current = { account: { addr: account } }
    await act(async () => {
      root.render(
        <MemoryRouter initialEntries={[`/social-recovery/setup/card${search}`]}>
          <ThemeContext.Provider value={THEME_CONTEXT}>
            <BackgroundServiceContext.Provider value={background}>
              <RecoveryCardScreen />
              <LocationProbe />
            </BackgroundServiceContext.Provider>
          </ThemeContext.Provider>
        </MemoryRouter>
      )
    })
    // The draft read settles over the storage's promises.
    await act(async () => {
      await new Promise((resolve) => {
        setTimeout(resolve, 0)
      })
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
  const keystoreSays = async (unlockWithSecret: string) => {
    await act(async () => {
      mockKeystore.current = { ...KEYSTORE_AT_REST, statuses: { unlockWithSecret } }
      mockKeystore.listeners.forEach((listener) => listener())
    })
  }
  const typePassword = async (value: string) => {
    const node = container.querySelector<HTMLInputElement>('input')
    if (!node) {
      throw new Error('no password field')
    }
    await act(async () => {
      Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set?.call(node, value)
      node.dispatchEvent(new Event('input', { bubbles: true }))
    })
    await act(async () => {
      node.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }))
    })
  }
  const backAndContinue = () => [!!byTestId('card-back'), !!byTestId('card-continue')]
  const level = () => {
    if (!byTestId('recovery-card')) {
      return null
    }
    return byTestId('card-password') ? 'hidden' : 'public'
  }

  beforeEach(() => {
    container = document.createElement('div')
    document.body.appendChild(container)
    root = createRoot(container)
    dispatch = jest.fn()
    background = { dispatch, windowId: undefined }
    downloads = 0
    mockEntries.clear()
    mockKeystore.current = KEYSTORE_AT_REST
    URL.createObjectURL = () => 'blob:card'
    URL.revokeObjectURL = () => {}
    window.print = () => {}
    jest.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {
      downloads += 1
    })
  })

  afterEach(() => {
    act(() => root.unmount())
    container.remove()
    URL.createObjectURL = originalCreate
    URL.revokeObjectURL = originalRevoke
    window.print = originalPrint
    jest.restoreAllMocks()
  })

  describe('the level', () => {
    it('takes the level the search names over the draft', async () => {
      const account = newAccount()
      await writeDraft(account, 'encrypted')
      await mount(account, '?level=public')
      expect(level()).toBe('public')

      const other = newAccount()
      await writeDraft(other, 'clear')
      await mount(other, '?level=hidden')
      expect(level()).toBe('hidden')
    })

    it('reads an encrypted draft as hidden and a clear one as public', async () => {
      const hidden = newAccount()
      await writeDraft(hidden, 'encrypted')
      await mount(hidden)
      expect(level()).toBe('hidden')

      const shown = newAccount()
      await writeDraft(shown, 'clear')
      await mount(shown)
      expect(level()).toBe('public')
    })

    it('falls back to hidden when neither the search nor a draft names a level', async () => {
      await mount(newAccount())
      expect(level()).toBe('hidden')
      await mount(newAccount(), '?level=private')
      expect(level()).toBe('hidden')
    })

    it('shows no card until an account is selected', async () => {
      const account = newAccount()
      await mount(account)
      await select(null)
      expect(byTestId('recovery-card')).toBeNull()
      expect(container.textContent).toContain(S.chrome.breadcrumb)
    })
  })

  describe('the password', () => {
    it('reveals the password the holder keeps for the account', async () => {
      const account = newAccount()
      setRecoveryPassword(CHAIN_ID, account, PASSWORD)
      await mount(account)
      expect(container.textContent).not.toContain(PASSWORD)
      await press('card-reveal')
      expect(byTestId('card-password-value')?.textContent).toBe(PASSWORD)
    })

    it('says the password is gone and keeps the carriers off when the holder has none for the account', async () => {
      const account = newAccount()
      setRecoveryPassword(CHAIN_ID, newAccount(), PASSWORD)
      await mount(account)
      expect(byTestId('card-password-gone')?.textContent).toBe(S.card.passwordGone)
      expect(byTestId('card-reveal')).toBeNull()
      expect(byTestId('card-download')?.getAttribute('aria-disabled')).toBe('true')
      expect(byTestId('card-print')?.getAttribute('aria-disabled')).toBe('true')
      expect(byTestId('card-send')?.getAttribute('aria-disabled')).toBe('true')
      expect(container.textContent).not.toContain(PASSWORD)
    })

    it('goes to the privacy step to set the password again', async () => {
      const account = newAccount()
      await mount(account)
      expect(location.pathname).toBe('/social-recovery/setup/card')
      await press('card-password-gone-action')
      expect(location.pathname).toBe(`/${WEB_ROUTES.socialRecoverySetupPrivacy}`)
    })
  })

  describe('the carried card', () => {
    it('marks the account carried after the first carrier', async () => {
      const account = newAccount()
      setRecoveryPassword(CHAIN_ID, account, PASSWORD)
      await mount(account)
      expect(wasCardCarried(CHAIN_ID, account)).toBe(false)
      await press('card-download')
      expect(downloads).toBe(1)
      expect(wasCardCarried(CHAIN_ID, account)).toBe(true)
    })

    it('asks the extension password first for an account carried earlier in this tab', async () => {
      const account = newAccount()
      setRecoveryPassword(CHAIN_ID, account, PASSWORD)
      markCardCarried(CHAIN_ID, account)
      await mount(account)
      await press('card-download')
      expect(downloads).toBe(0)
      expect(byTestId('card-password-ask')).not.toBeNull()
      expect(dispatch).toHaveBeenCalledWith({ type: 'KEYSTORE_CONTROLLER_RESET_ERROR_STATE' })
    })

    it('hides back and continue while the ask shows and brings them back when the ask goes back', async () => {
      const account = newAccount()
      setRecoveryPassword(CHAIN_ID, account, PASSWORD)
      markCardCarried(CHAIN_ID, account)
      await mount(account)
      expect(backAndContinue()).toEqual([true, true])
      await press('card-download')
      expect(byTestId('card-password-ask')).not.toBeNull()
      expect(backAndContinue()).toEqual([false, false])
      await press('card-password-cancel')
      expect(byTestId('card-password-ask')).toBeNull()
      expect(backAndContinue()).toEqual([true, true])
      expect(downloads).toBe(0)
    })

    it('brings back and continue back once the right extension password carries the card', async () => {
      const account = newAccount()
      setRecoveryPassword(CHAIN_ID, account, PASSWORD)
      markCardCarried(CHAIN_ID, account)
      await mount(account)
      await press('card-download')
      await typePassword('hunter22')
      expect(backAndContinue()).toEqual([false, false])
      await keystoreSays('LOADING')
      await keystoreSays('SUCCESS')
      expect(downloads).toBe(1)
      expect(byTestId('card-password-ask')).toBeNull()
      expect(backAndContinue()).toEqual([true, true])
    })
  })

  describe('another account', () => {
    it('starts the card over with the new account, its level and its password', async () => {
      const first = newAccount()
      const second = newAccount()
      await writeDraft(first, 'encrypted')
      await writeDraft(second, 'clear')
      setRecoveryPassword(CHAIN_ID, first, PASSWORD)
      await mount(first)
      await press('card-reveal')
      await press('card-why')
      expect(byTestId('card-why-body')).not.toBeNull()

      await select(second)
      await act(async () => {
        await new Promise((resolve) => {
          setTimeout(resolve, 0)
        })
      })
      expect(byTestId('card-account')?.textContent?.toLowerCase()).toBe(second)
      expect(level()).toBe('public')
      expect(byTestId('card-why-body')).toBeNull()
      expect(container.textContent).not.toContain(PASSWORD)

      await select(first)
      await act(async () => {
        await new Promise((resolve) => {
          setTimeout(resolve, 0)
        })
      })
      expect(level()).toBe('hidden')
      expect(byTestId('card-password-value')?.textContent).toBe(S.display.hiddenValue)
    })

    it('never shows one account with the level read for another', async () => {
      const first = newAccount()
      const second = newAccount()
      await writeDraft(first, 'clear')
      await mount(first)
      expect(level()).toBe('public')

      // The second account's draft read waits until the test lets it through.
      let release = () => {}
      mockStorageGate.current = new Promise<void>((resolve) => {
        release = resolve
      })
      await select(second)
      expect(byTestId('recovery-card')).toBeNull()

      mockStorageGate.current = null
      await act(async () => {
        release()
        await new Promise((resolve) => {
          setTimeout(resolve, 0)
        })
      })
      expect(byTestId('card-account')?.textContent?.toLowerCase()).toBe(second)
      expect(level()).toBe('hidden')
    })
  })
})
