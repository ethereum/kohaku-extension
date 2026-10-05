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
import {
  deferred,
  digestVersionRefusal,
  restoreRefusalOf
} from '@web/modules/social-recovery/setup/card/__tests__/harness'
import type {
  FakeClientState,
  FakeSetupReads
} from '@web/modules/social-recovery/setup/card/__tests__/harness'

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
// in-memory store, whose reads a test can hold back and whose writes it keeps.
const mockEntries = new Map<string, unknown>()
const mockWrites: Record<string, unknown>[] = []
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
          mockWrites.push(items)
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
// The recovery client as an external store too, so a test can move it from
// failed to ready; each call keeps the account the screen asked a client for.
const mockClient = {
  current: { status: 'loading' } as FakeClientState,
  listeners: new Set<() => void>(),
  accounts: [] as (string | undefined)[],
  retry: (() => {}) as () => void
}
jest.mock('@web/modules/social-recovery/shared/client/useRecoveryClient', () => {
  const R = jest.requireActual('react')
  const subscribe = (listener: () => void) => {
    mockClient.listeners.add(listener)
    return () => mockClient.listeners.delete(listener)
  }
  return {
    useRecoveryClient: (account: string | undefined) => {
      mockClient.accounts.push(account)
      const state = R.useSyncExternalStore(subscribe, () => mockClient.current)
      return { ...state, retry: mockClient.retry }
    }
  }
})

/* eslint-disable @typescript-eslint/no-var-requires, global-require */
const React: typeof import('react') = require('react')
const { MemoryRouter, useLocation }: typeof import('react-router-dom') = require('react-router-dom')
const {
  WEB_ROUTES
}: typeof import('@common/modules/router/constants/common') = require('@common/modules/router/constants/common')
const en: typeof import('@common/config/localization/translations/en.json') = require('@common/config/localization/translations/en.json')
const i18n: typeof import('@common/config/localization').default =
  require('@common/config/localization').default
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
  readRecoveryPassword,
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
// Typed with an outer space, which the check and the holder keep as typed.
const TYPED = ' harbor quill meadow '
const t = (key: string): string => i18n.t(key)

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

// Where the router stands after each render, and every place it stood.
const location = { pathname: '', visited: [] as string[] }
const LocationProbe = () => {
  const { pathname, search, hash } = useLocation()
  location.pathname = pathname
  location.visited.push(`${pathname}${search}${hash}`)
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
  let setup: FakeSetupReads
  let retry: jest.Mock
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
  const settle = async () => {
    await act(async () => {
      await new Promise((resolve) => {
        setTimeout(resolve, 0)
      })
    })
  }
  const clientSays = async (state: FakeClientState) => {
    await act(async () => {
      mockClient.current = state
      mockClient.listeners.forEach((listener) => listener())
    })
  }
  const isDisabled = (id: string) => byTestId(id)?.getAttribute('aria-disabled') === 'true'
  const carriersDisabled = () => ['card-download', 'card-print', 'card-send'].map(isDisabled)
  const recoveryField = () =>
    container.querySelector<HTMLInputElement>('[data-testid="card-recovery-password-ask"] input')
  const typeRecovery = async (value: string, { enter = false } = {}) => {
    const node = recoveryField()
    if (!node) {
      throw new Error('no recovery password field')
    }
    await act(async () => {
      Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set?.call(node, value)
      node.dispatchEvent(new Event('input', { bubbles: true }))
    })
    if (enter) {
      await act(async () => {
        node.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }))
      })
    }
  }
  const savedSetup = () => setup.setupState.mockResolvedValue({ hasSetup: true })
  const opensBackup = (typed: string) =>
    setup.getSetup.mockImplementation(async ({ password }: { password: string }) => {
      if (password === typed) {
        return {}
      }
      throw restoreRefusalOf('restore.backup-unopened')
    })

  beforeEach(() => {
    container = document.createElement('div')
    document.body.appendChild(container)
    root = createRoot(container)
    dispatch = jest.fn()
    background = { dispatch, windowId: undefined }
    downloads = 0
    mockEntries.clear()
    mockWrites.length = 0
    mockKeystore.current = KEYSTORE_AT_REST
    // A ready client whose account has no saved setup, unless a test says otherwise.
    setup = {
      setupState: jest.fn(async () => ({ hasSetup: false })),
      getSetup: jest.fn(async () => ({}))
    }
    retry = jest.fn()
    mockClient.current = { status: 'ready', client: { setup } }
    mockClient.accounts = []
    mockClient.retry = retry
    location.visited = []
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

    const others: [string, () => void, string][] = [
      ['no saved setup', () => {}, 'card-password-gone'],
      ['a saved setup', () => savedSetup(), 'card-recovery-password-ask']
    ]
    others.forEach(([what, given, row]) => {
      it(`never shows the held password of one account on another with ${what}, and shows it again back on the first`, async () => {
        given()
        const first = newAccount()
        const second = newAccount()
        setRecoveryPassword(CHAIN_ID, first, PASSWORD)
        await mount(first)
        await press('card-reveal')
        expect(byTestId('card-password-value')?.textContent).toBe(PASSWORD)

        await select(second)
        await settle()
        expect(byTestId('card-account')?.textContent?.toLowerCase()).toBe(second)
        expect(byTestId(row)).not.toBeNull()
        expect(byTestId('card-password-value')).toBeNull()
        expect(container.innerHTML).not.toContain(PASSWORD)
        expect(carriersDisabled()).toEqual([true, true, true])

        await select(first)
        await settle()
        expect(byTestId(row)).toBeNull()
        await press('card-reveal')
        expect(byTestId('card-password-value')?.textContent).toBe(PASSWORD)
        expect(carriersDisabled()).toEqual([false, false, false])
      })
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

  describe('the recovery password asked again', () => {
    it('shows the row label alone and keeps the carriers off while the setup read runs', async () => {
      const read = deferred<{ hasSetup: boolean }>()
      setup.setupState.mockReturnValue(read.promise)
      const account = newAccount()
      await mount(account)
      expect(byTestId('card-password')?.textContent).toBe(
        t('socialRecovery.display.passwords.recoveryPassword')
      )
      expect(byTestId('card-recovery-password-ask')).toBeNull()
      expect(byTestId('card-password-gone')).toBeNull()
      expect(carriersDisabled()).toEqual([true, true, true])

      await act(async () => {
        read.resolve({ hasSetup: true })
      })
      expect(byTestId('card-recovery-password-ask')).not.toBeNull()
    })

    it('asks the recovery password in the row when the account has a saved setup', async () => {
      savedSetup()
      const account = newAccount()
      await mount(account)
      expect(mockClient.accounts).toContain(account)
      expect(byTestId('card-recovery-password-lead')?.textContent).toBe(
        t('socialRecovery.card.passwordAsk')
      )
      expect(recoveryField()?.getAttribute('aria-label')).toBe(
        t('socialRecovery.display.passwords.recoveryPassword')
      )
      expect(byTestId('card-recovery-password-check')?.textContent).toBe(
        t('socialRecovery.card.passwordAskAction')
      )
      expect(byTestId('card-password-gone')).toBeNull()
      expect(byTestId('card-reveal')).toBeNull()
      expect(byTestId('card-password-value')).toBeNull()
      expect(carriersDisabled()).toEqual([true, true, true])
    })

    it('keeps the gone line and asks nothing when the account has no saved setup', async () => {
      await mount(newAccount())
      expect(byTestId('card-password-gone')?.textContent).toBe(
        t('socialRecovery.card.passwordGone')
      )
      expect(byTestId('card-recovery-password-ask')).toBeNull()
      expect(container.querySelector('input')).toBeNull()
    })

    it('asks the recovery password when the setup read fails', async () => {
      setup.setupState.mockRejectedValue(new Error('the node did not answer'))
      await mount(newAccount())
      expect(byTestId('card-recovery-password-ask')).not.toBeNull()
      expect(byTestId('card-password-gone')).toBeNull()
      expect(carriersDisabled()).toEqual([true, true, true])
    })

    it('builds no client and shows the card as before at the public level or with the password held', async () => {
      savedSetup()
      const shown = newAccount()
      await writeDraft(shown, 'clear')
      await mount(shown)
      expect(level()).toBe('public')

      const held = newAccount()
      setRecoveryPassword(CHAIN_ID, held, PASSWORD)
      await mount(held)
      expect(byTestId('card-password-value')?.textContent).toBe(
        t('socialRecovery.display.hiddenValue')
      )

      expect(mockClient.accounts.every((account) => account === undefined)).toBe(true)
      expect(setup.setupState).not.toHaveBeenCalled()
      expect(byTestId('card-recovery-password-ask')).toBeNull()
    })
    const unbuilt: FakeClientState[] = [
      { status: 'failed', error: new Error('no client') },
      { status: 'update-the-wallet', refusal: digestVersionRefusal() }
    ]
    unbuilt.forEach((state) => {
      it(`asks when the client is ${state.status}, and a check says it could not check and tries the client again`, async () => {
        mockClient.current = state
        const account = newAccount()
        await mount(account)
        expect(byTestId('card-recovery-password-ask')).not.toBeNull()
        expect(byTestId('card-password-gone')).toBeNull()

        await typeRecovery(TYPED)
        await press('card-recovery-password-check')
        await settle()
        expect(byTestId('card-recovery-password-unchecked')?.textContent).toBe(
          t('socialRecovery.card.passwordUnchecked')
        )
        expect(recoveryField()?.value).toBe(TYPED)
        expect(retry).toHaveBeenCalledTimes(1)
        expect(setup.getSetup).not.toHaveBeenCalled()
        expect(readRecoveryPassword(CHAIN_ID, account)).toBeUndefined()
      })
    })

    it('keeps a half-typed password while the client is built again, then checks it', async () => {
      mockClient.current = { status: 'failed', error: new Error('no client') }
      savedSetup()
      const account = newAccount()
      await mount(account)
      await typeRecovery(TYPED)

      await clientSays({ status: 'loading' })
      expect(recoveryField()?.value).toBe(TYPED)
      opensBackup(TYPED)
      await clientSays({ status: 'ready', client: { setup } })
      await settle()
      expect(setup.setupState).toHaveBeenCalledTimes(1)
      expect(byTestId('card-recovery-password-ask')).not.toBeNull()
      expect(byTestId('card-password-gone')).toBeNull()
      expect(recoveryField()?.value).toBe(TYPED)

      await press('card-recovery-password-check')
      await settle()
      expect(setup.getSetup.mock.calls).toEqual([[{ password: TYPED }]])
      expect(readRecoveryPassword(CHAIN_ID, account)).toBe(TYPED)
    })

    it('reads the setup again once a client is ready after one that failed, and leads back to the privacy step when there is none', async () => {
      mockClient.current = { status: 'failed', error: new Error('no client') }
      const account = newAccount()
      await mount(account)
      expect(byTestId('card-recovery-password-ask')).not.toBeNull()
      await typeRecovery(TYPED)
      await press('card-recovery-password-check')
      await settle()
      expect(retry).toHaveBeenCalledTimes(1)
      expect(setup.setupState).not.toHaveBeenCalled()

      await clientSays({ status: 'ready', client: { setup } })
      await settle()
      expect(setup.setupState).toHaveBeenCalledTimes(1)
      expect(byTestId('card-password-gone')?.textContent).toBe(
        t('socialRecovery.card.passwordGone')
      )
      expect(byTestId('card-recovery-password-ask')).toBeNull()
      expect(setup.getSetup).not.toHaveBeenCalled()
      expect(readRecoveryPassword(CHAIN_ID, account)).toBeUndefined()

      await clientSays({ status: 'loading' })
      await clientSays({ status: 'ready', client: { setup } })
      await settle()
      expect(setup.setupState).toHaveBeenCalledTimes(1)
      await press('card-password-gone-action')
      expect(location.pathname).toBe(`/${WEB_ROUTES.socialRecoverySetupPrivacy}`)
    })

    it('leads back to the privacy step when a check finds no saved backup', async () => {
      setup.setupState.mockRejectedValue(new Error('the node did not answer'))
      setup.getSetup.mockRejectedValue(restoreRefusalOf('restore.no-backup'))
      const account = newAccount()
      await mount(account)
      expect(byTestId('card-recovery-password-ask')).not.toBeNull()
      await typeRecovery(TYPED)
      await press('card-recovery-password-check')
      await settle()

      expect(setup.getSetup.mock.calls).toEqual([[{ password: TYPED }]])
      expect(byTestId('card-password-gone')?.textContent).toBe(
        t('socialRecovery.card.passwordGone')
      )
      expect(byTestId('card-recovery-password-ask')).toBeNull()
      expect(byTestId('card-recovery-password-unchecked')).toBeNull()
      expect(container.querySelector('input')).toBeNull()
      expect(readRecoveryPassword(CHAIN_ID, account)).toBeUndefined()
      expect(carriersDisabled()).toEqual([true, true, true])
      await press('card-password-gone-action')
      expect(location.pathname).toBe(`/${WEB_ROUTES.socialRecoverySetupPrivacy}`)
    })

    it('masks the typed recovery password', async () => {
      savedSetup()
      await mount(newAccount())
      await typeRecovery(TYPED)
      expect(recoveryField()?.getAttribute('type')).toBe('password')
    })

    it('keeps a right password in memory and shows the card as with a password held', async () => {
      savedSetup()
      opensBackup(TYPED)
      const account = newAccount()
      await mount(account)
      await typeRecovery(TYPED)
      await press('card-recovery-password-check')
      await settle()

      expect(setup.getSetup.mock.calls).toEqual([[{ password: TYPED }]])
      expect(readRecoveryPassword(CHAIN_ID, account)).toBe(TYPED)
      expect(byTestId('card-recovery-password-ask')).toBeNull()
      expect(container.querySelector('input')).toBeNull()
      expect(container.innerHTML).not.toContain(TYPED)
      expect(byTestId('card-password-value')?.textContent).toBe(
        t('socialRecovery.display.hiddenValue')
      )
      expect(byTestId('card-password-chip')?.textContent).toBe(
        t('socialRecovery.display.hiddenChip')
      )
      expect(carriersDisabled()).toEqual([false, false, false])

      await press('card-reveal')
      expect(byTestId('card-password-value')?.textContent).toBe(TYPED)
      await press('card-download')
      expect(downloads).toBe(1)
    })

    it('submits the typed password on the Enter key', async () => {
      savedSetup()
      opensBackup(TYPED)
      const account = newAccount()
      await mount(account)
      await typeRecovery(TYPED, { enter: true })
      await settle()
      expect(setup.getSetup.mock.calls).toEqual([[{ password: TYPED }]])
      expect(readRecoveryPassword(CHAIN_ID, account)).toBe(TYPED)
    })

    it('says a wrong password is wrong, empties the field and holds nothing, then takes the right one', async () => {
      savedSetup()
      opensBackup(TYPED)
      const account = newAccount()
      await mount(account)
      await typeRecovery('not the password')
      await press('card-recovery-password-check')
      await settle()

      expect(byTestId('card-recovery-password-wrong')?.textContent).toBe(
        t('socialRecovery.card.wrongRecoveryPassword')
      )
      expect(byTestId('card-recovery-password-unchecked')).toBeNull()
      expect(recoveryField()?.value).toBe('')
      expect(readRecoveryPassword(CHAIN_ID, account)).toBeUndefined()
      expect(carriersDisabled()).toEqual([true, true, true])
      expect(isDisabled('card-recovery-password-check')).toBe(true)

      await typeRecovery(TYPED)
      await press('card-recovery-password-check')
      await settle()
      expect(byTestId('card-recovery-password-wrong')).toBeNull()
      expect(readRecoveryPassword(CHAIN_ID, account)).toBe(TYPED)
      expect(carriersDisabled()).toEqual([false, false, false])
    })

    const failures: [string, () => Error][] = [
      ['a refusal of another cause', () => restoreRefusalOf('restore.commitment-mismatch')],
      ['a thrown error', () => new Error('the node did not answer')]
    ]
    failures.forEach(([what, failure]) => {
      it(`says the password could not be checked after ${what}, keeps it and checks again on the next press`, async () => {
        savedSetup()
        const account = newAccount()
        await mount(account)
        setup.getSetup.mockRejectedValueOnce(failure())
        await typeRecovery(TYPED)
        await press('card-recovery-password-check')
        await settle()

        expect(byTestId('card-recovery-password-unchecked')?.textContent).toBe(
          t('socialRecovery.card.passwordUnchecked')
        )
        expect(byTestId('card-recovery-password-wrong')).toBeNull()
        expect(recoveryField()?.value).toBe(TYPED)
        expect(readRecoveryPassword(CHAIN_ID, account)).toBeUndefined()
        expect(isDisabled('card-recovery-password-check')).toBe(false)

        // The second check waits, so the earlier line is seen gone meanwhile.
        const second = deferred<object>()
        setup.getSetup.mockReturnValueOnce(second.promise)
        await press('card-recovery-password-check')
        expect(byTestId('card-recovery-password-unchecked')).toBeNull()
        await act(async () => {
          second.resolve({})
        })
        await settle()
        expect(setup.getSetup.mock.calls).toEqual([[{ password: TYPED }], [{ password: TYPED }]])
        expect(readRecoveryPassword(CHAIN_ID, account)).toBe(TYPED)
      })
    })

    it('writes the typed password to no storage, no route and no log', async () => {
      savedSetup()
      opensBackup(TYPED)
      const account = newAccount()
      await writeDraft(account, 'encrypted')
      mockWrites.length = 0
      const logged = (['log', 'info', 'warn', 'error', 'debug'] as const).map((method) =>
        jest.spyOn(console, method)
      )
      await mount(account)
      await typeRecovery('not the password')
      await press('card-recovery-password-check')
      await settle()
      await typeRecovery(TYPED, { enter: true })
      await settle()
      await press('card-reveal')
      await press('card-download')
      expect(readRecoveryPassword(CHAIN_ID, account)).toBe(TYPED)

      const asText = (value: unknown) =>
        JSON.stringify(value, (_, inner) =>
          typeof inner === 'bigint' ? inner.toString() : inner
        ) ?? ''
      expect(asText(mockWrites)).not.toContain(TYPED)
      expect(asText(mockWrites)).not.toContain('not the password')
      expect(asText(Object.fromEntries(mockEntries))).not.toContain(TYPED)
      expect(location.visited.length).toBeGreaterThan(0)
      expect(location.visited.every((place) => place === '/social-recovery/setup/card')).toBe(true)
      expect(
        asText(logged.map((spy) => spy.mock.calls.map((call) => call.map(String))))
      ).not.toContain(TYPED)
    })

    it('keeps the button off while the field is empty and while a check runs, and checks once for two quick presses', async () => {
      savedSetup()
      const account = newAccount()
      await mount(account)
      expect(isDisabled('card-recovery-password-check')).toBe(true)
      await press('card-recovery-password-check')
      expect(setup.getSetup).not.toHaveBeenCalled()

      const answer = deferred<object>()
      setup.getSetup.mockReturnValue(answer.promise)
      await typeRecovery(TYPED)
      expect(isDisabled('card-recovery-password-check')).toBe(false)
      const button = byTestId('card-recovery-password-check')
      await act(async () => {
        button?.click()
        button?.click()
      })
      expect(isDisabled('card-recovery-password-check')).toBe(true)
      await press('card-recovery-password-check')
      await typeRecovery(TYPED, { enter: true })
      expect(setup.getSetup).toHaveBeenCalledTimes(1)

      await act(async () => {
        answer.resolve({})
      })
      await settle()
      expect(readRecoveryPassword(CHAIN_ID, account)).toBe(TYPED)
    })

    it('holds nothing for the first account when the selection changes while its check runs', async () => {
      savedSetup()
      const answer = deferred<object>()
      setup.getSetup.mockReturnValue(answer.promise)
      const first = newAccount()
      const second = newAccount()
      await mount(first)
      await typeRecovery(TYPED)
      await press('card-recovery-password-check')

      await select(second)
      await settle()
      await act(async () => {
        answer.resolve({})
      })
      await settle()
      expect(readRecoveryPassword(CHAIN_ID, first)).toBeUndefined()
      expect(readRecoveryPassword(CHAIN_ID, second)).toBeUndefined()

      await select(first)
      await settle()
      expect(byTestId('card-recovery-password-ask')).not.toBeNull()
      expect(byTestId('card-password-value')).toBeNull()
      expect(carriersDisabled()).toEqual([true, true, true])
    })

    it('holds nothing when the screen leaves while the check runs', async () => {
      savedSetup()
      const answer = deferred<object>()
      setup.getSetup.mockReturnValue(answer.promise)
      const account = newAccount()
      await mount(account)
      await typeRecovery(TYPED)
      await press('card-recovery-password-check')

      act(() => root.unmount())
      await act(async () => {
        answer.resolve({})
      })
      await settle()
      expect(readRecoveryPassword(CHAIN_ID, account)).toBeUndefined()

      await mount(account)
      expect(byTestId('card-recovery-password-ask')).not.toBeNull()
    })

    it('shows the opened password again when the selection leaves the account and comes back', async () => {
      savedSetup()
      opensBackup(TYPED)
      const first = newAccount()
      const second = newAccount()
      await mount(first)
      await typeRecovery(TYPED)
      await press('card-recovery-password-check')
      await settle()

      await select(second)
      await settle()
      expect(byTestId('card-account')?.textContent?.toLowerCase()).toBe(second)
      expect(byTestId('card-recovery-password-ask')).not.toBeNull()
      expect(container.textContent).not.toContain(TYPED)

      await select(first)
      await settle()
      expect(byTestId('card-recovery-password-ask')).toBeNull()
      expect(byTestId('card-password-value')?.textContent).toBe(
        t('socialRecovery.display.hiddenValue')
      )
      expect(carriersDisabled()).toEqual([false, false, false])
      await press('card-reveal')
      expect(byTestId('card-password-value')?.textContent).toBe(TYPED)
    })

    it('keeps the newer password when a check from before the selection left and came back opens late', async () => {
      savedSetup()
      const late = deferred<object>()
      setup.getSetup.mockReturnValueOnce(late.promise)
      const first = newAccount()
      const second = newAccount()
      await mount(first)
      await typeRecovery('older password')
      await press('card-recovery-password-check')

      await select(second)
      await settle()
      await select(first)
      await settle()
      await typeRecovery(TYPED)
      await press('card-recovery-password-check')
      await settle()
      expect(readRecoveryPassword(CHAIN_ID, first)).toBe(TYPED)

      await act(async () => {
        late.resolve({})
      })
      await settle()
      expect(readRecoveryPassword(CHAIN_ID, first)).toBe(TYPED)
      await press('card-reveal')
      expect(byTestId('card-password-value')?.textContent).toBe(TYPED)
    })

    it('holds nothing when a check from before the selection left and came back opens late', async () => {
      savedSetup()
      const late = deferred<object>()
      setup.getSetup.mockReturnValueOnce(late.promise)
      const first = newAccount()
      const second = newAccount()
      await mount(first)
      await typeRecovery(TYPED)
      await press('card-recovery-password-check')

      await select(second)
      await settle()
      await select(first)
      await settle()
      await act(async () => {
        late.resolve({})
      })
      await settle()
      expect(readRecoveryPassword(CHAIN_ID, first)).toBeUndefined()
      expect(byTestId('card-recovery-password-ask')).not.toBeNull()
      expect(byTestId('card-password-value')).toBeNull()
      expect(carriersDisabled()).toEqual([true, true, true])
    })

    it('keeps the ask and then the card when a check from before the selection left and came back finds no backup late', async () => {
      savedSetup()
      const late = deferred<object>()
      const newer = deferred<object>()
      setup.getSetup.mockReturnValueOnce(late.promise).mockReturnValueOnce(newer.promise)
      const first = newAccount()
      const second = newAccount()
      await mount(first)
      await typeRecovery('older password')
      await press('card-recovery-password-check')

      await select(second)
      await settle()
      await select(first)
      await settle()
      await typeRecovery(TYPED)
      await press('card-recovery-password-check')

      await act(async () => {
        late.reject(restoreRefusalOf('restore.no-backup'))
      })
      await settle()
      expect(byTestId('card-password-gone')).toBeNull()
      expect(byTestId('card-recovery-password-ask')).not.toBeNull()

      await act(async () => {
        newer.resolve({})
      })
      await settle()
      expect(byTestId('card-password-gone')).toBeNull()
      expect(readRecoveryPassword(CHAIN_ID, first)).toBe(TYPED)
      expect(carriersDisabled()).toEqual([false, false, false])
      await press('card-reveal')
      expect(byTestId('card-password-value')?.textContent).toBe(TYPED)
    })
  })
})
