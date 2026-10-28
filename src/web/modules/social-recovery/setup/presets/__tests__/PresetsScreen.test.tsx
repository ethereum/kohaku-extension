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

import type { Account } from '@ambire-common/interfaces/account'
import { parse, stringify } from '@ambire-common/libs/richJson/richJson'
import type { ThemeContextReturnType } from '@common/contexts/themeContext'
import type { ThemeProps } from '@common/styles/themeConfig'
import type { Address } from '@kohaku-eth/social-recovery'
import type { RecordStorage } from '@web/modules/social-recovery/shared/records'
import type { SelectedAccountMock } from '@web/modules/social-recovery/setup/presets/__fixtures__/types'

Object.assign(globalThis, { TextEncoder, TextDecoder })
// React only runs effects and state updates inside act() when this flag is set.
;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true

// The selected account as an external store: the screen is memoised, so it
// renders again only when the store tells it the account changed.
const mockSelected: SelectedAccountMock = { state: { account: null }, listeners: new Set() }
// The accounts the wallet lists, which a test can switch. The wallet holds a
// creation record for a smart account and none for a basic one.
const mockAccounts: Account[] = []
const CREATION: Account['creation'] = {
  factoryAddr: '0x3333333333333333333333333333333333333333',
  bytecode: '0x00',
  salt: '0x0000000000000000000000000000000000000000000000000000000000000000'
}
const listedAccount = (addr: string, smart: boolean): Account => ({
  addr,
  associatedKeys: [addr],
  initialPrivileges: [],
  creation: smart ? CREATION : null,
  preferences: { label: addr, pfp: addr }
})
const listAccounts = (accounts: Account[]) => {
  mockAccounts.splice(0, mockAccounts.length, ...accounts)
}
const mockRaw = new Map<string, string>()
// Every key the records read, so a test can tell whether the screen read a draft at all.
const mockReads: string[] = []
const mockStorage: RecordStorage = {
  get: async (key, defaultValue) => {
    mockReads.push(key ?? '')
    const stored = key && mockRaw.get(key)
    return stored ? parse(stored) : defaultValue
  },
  getAll: async () => {
    mockReads.push('*')
    return Object.fromEntries([...mockRaw.entries()].map(([key, stored]) => [key, parse(stored)]))
  },
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
jest.mock('@web/hooks/useAccountsControllerState', () => ({
  __esModule: true,
  default: () => ({ accounts: mockAccounts })
}))
// Every route the screen navigates to, in order.
const mockNavigate = jest.fn()
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
jest.mock('@web/modules/social-recovery/shared/records', () => ({
  ...jest.requireActual('@web/modules/social-recovery/shared/records'),
  extensionRecordStorage: mockStorage
}))

/* eslint-disable @typescript-eslint/no-var-requires, global-require */
const React: typeof import('react') = require('react')
const { MemoryRouter }: typeof import('react-router-dom') = require('react-router-dom')
const en: typeof import('@common/config/localization/translations/en.json') = require('@common/config/localization/translations/en.json')
const {
  WEB_ROUTES
}: typeof import('@common/modules/router/constants/common') = require('@common/modules/router/constants/common')
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
    mockReads.length = 0
    mockNavigate.mockClear()
    listAccounts([listedAccount(ACCOUNT, true), listedAccount(OTHER_ACCOUNT, true)])
    container = document.createElement('div')
    document.body.appendChild(container)
    root = createRoot(container)
  })

  afterEach(() => {
    act(() => root.unmount())
    container.remove()
  })

  const showAccount = async (account: Address | null) => {
    // Each selection here stands for a tab opened on that account, so no latched account carries over.
    sessionStorage.clear()
    mockSelected.state = { account: account && { addr: account } }
    await act(async () => {
      if (container.childElementCount) {
        mockSelected.listeners.forEach((listener) => listener())
      } else {
        root.render(
          <MemoryRouter>
            <ThemeContext.Provider value={THEME_CONTEXT}>
              <PresetsScreen />
            </ThemeContext.Provider>
          </MemoryRouter>
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

  it('counts the presets as the first of the setup stages', async () => {
    await showAccount(ACCOUNT)
    expect(byTestId('presets-stage')?.textContent).toBe('Set up · Step 1 of 7')
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
      wait: 172800,
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

  // The wallet selects another account while the tab stays open on its own.
  const selectInWallet = async (account: Address) => {
    mockSelected.state = { account: { addr: account } }
    await act(async () => {
      mockSelected.listeners.forEach((listener) => listener())
    })
  }

  it("keeps the tab's account and its draft when the wallet selects another account, and says so", async () => {
    await createWalletRecords({ storage: mockStorage })
      .setup(CHAIN_IDS[WALLET_RECOVERY_CHAIN], ACCOUNT)
      .setupDraft.write({
        wait: 172800,
        clauses: [],
        ignoresPause: true,
        privacy: { backup: 'encrypted', publicMetadata: '0x' }
      })
    await showAccount(ACCOUNT)
    expect(byTestId('presets-resume')).not.toBeNull()
    expect(byTestId('setup-other-account')).toBeNull()
    await selectInWallet(OTHER_ACCOUNT)
    expect(byTestId('presets-resume')).not.toBeNull()
    expect(byTestId('presets-grid')).toBeNull()
    expect(byTestId('setup-other-account')?.textContent).toContain(S.chrome.otherAccount.title)
  })

  // The page comes up again on a history entry with its own key and route state.
  const openFrom = async (key: string, prevRoute: string) => {
    act(() => root.unmount())
    root = createRoot(container)
    await act(async () => {
      root.render(
        <MemoryRouter
          initialEntries={[
            {
              pathname: '/social-recovery/setup',
              key,
              state: { prevRoute: { pathname: prevRoute } }
            }
          ]}
        >
          <ThemeContext.Provider value={THEME_CONTEXT}>
            <PresetsScreen />
          </ThemeContext.Provider>
        </MemoryRouter>
      )
    })
  }

  it('opens on the account the wallet selects when the holder comes back from outside the setup', async () => {
    await createWalletRecords({ storage: mockStorage })
      .setup(CHAIN_IDS[WALLET_RECOVERY_CHAIN], ACCOUNT)
      .setupDraft.write({
        wait: 172800,
        clauses: [],
        ignoresPause: true,
        privacy: { backup: 'encrypted', publicMetadata: '0x' }
      })
    await showAccount(ACCOUNT)
    expect(byTestId('presets-resume')).not.toBeNull()
    mockSelected.state = { account: { addr: OTHER_ACCOUNT } }
    await openFrom('second-visit', '/dashboard')
    expect(byTestId('presets-grid')).not.toBeNull()
    expect(byTestId('presets-resume')).toBeNull()
    expect(byTestId('setup-other-account')).toBeNull()
    // A reload of that entry stays on the account of the new visit.
    mockSelected.state = { account: { addr: ACCOUNT } }
    await openFrom('second-visit', '/dashboard')
    expect(byTestId('presets-grid')).not.toBeNull()
    expect(byTestId('setup-other-account')?.textContent).toContain(S.chrome.otherAccount.title)
  })

  describe('for the kind of account the wallet lists', () => {
    const writeDraft = (account: Address) =>
      createWalletRecords({ storage: mockStorage })
        .setup(CHAIN_IDS[WALLET_RECOVERY_CHAIN], account)
        .setupDraft.write({
          wait: 172800,
          clauses: [],
          ignoresPause: true,
          privacy: { backup: 'encrypted', publicMetadata: '0x' }
        })

    const expectPresetsGone = () => {
      expect(byTestId('presets-screen')).toBeNull()
      expect(byTestId('presets-grid')).toBeNull()
      expect(byTestId('presets-resume')).toBeNull()
      expect(byTestId('presets-load-failed')).toBeNull()
      expect(byTestId('recovery-status')).toBeNull()
      expect(byTestId('continue')).toBeNull()
      expect(byTestId('customize')).toBeNull()
      expect(byTestId('resume')).toBeNull()
      expect(byTestId('recover')).not.toBeNull()
      expect(container.textContent).not.toContain(S.status.recovery.notSetUp)
    }

    it('shows a basic account that this release cannot recover it, with the unsupported line', async () => {
      listAccounts([listedAccount(ACCOUNT, false)])
      await showAccount(ACCOUNT)

      const refusal = byTestId('presets-cannot-recover')
      expect(refusal).not.toBeNull()
      expect(refusal?.contains(byTestId('review-blocked-cannot-recover'))).toBe(true)
      expect(byTestId('review-blocked-chip')?.textContent).toBe(S.status.recovery.cannotRecover)
      expect(byTestId('review-blocked-title')?.textContent).toBe(
        S.review.blocked.cannotRecover.title
      )
      expect(byTestId('review-blocked-body')?.textContent).toBe(
        S.review.blocked.cannotRecover.reasonNotSupported
      )
      expect(byTestId('review-blocked-retry')).toBeNull()
    })

    it('shows a basic account nothing of the presets, and no way into the editor', async () => {
      listAccounts([listedAccount(ACCOUNT, false)])
      await showAccount(ACCOUNT)

      expectPresetsGone()
      expect(container.textContent).not.toContain(S.presets.continueUnlock)
    })

    it('offers a basic account no draft it left, and reads no record of it', async () => {
      await writeDraft(ACCOUNT)
      mockReads.length = 0
      listAccounts([listedAccount(ACCOUNT, false)])
      await showAccount(ACCOUNT)

      expect(byTestId('presets-cannot-recover')).not.toBeNull()
      expectPresetsGone()
      expect(mockReads).toEqual([])
    })

    it('shows a smart account the presets as before', async () => {
      await showAccount(ACCOUNT)

      expect(byTestId('presets-grid')).not.toBeNull()
      expect(byTestId('recovery-status')?.textContent).toBe(S.status.recovery.notSetUp)
      expect(byTestId('presets-cannot-recover')).toBeNull()
      expect(byTestId('review-blocked-cannot-recover')).toBeNull()
    })

    it('offers a smart account the draft it left, as before, from the records it reads', async () => {
      await writeDraft(ACCOUNT)
      mockReads.length = 0
      await showAccount(ACCOUNT)

      expect(byTestId('presets-resume')).not.toBeNull()
      expect(mockReads.length).toBeGreaterThan(0)
      expect(byTestId('presets-cannot-recover')).toBeNull()
    })

    it('shows the presets for an account the wallet does not list', async () => {
      listAccounts([listedAccount(OTHER_ACCOUNT, false)])
      await showAccount(ACCOUNT)

      expect(byTestId('presets-grid')).not.toBeNull()
      expect(byTestId('presets-cannot-recover')).toBeNull()
    })

    it('offers a basic account, under the refusal, the way to recover another account', async () => {
      listAccounts([listedAccount(ACCOUNT, false)])
      await showAccount(ACCOUNT)

      const refusal = byTestId('presets-cannot-recover')
      const recover = byTestId('recover')
      expect(refusal?.contains(recover)).toBe(true)
      expect(recover?.textContent).toContain(S.routes.recover)
      expect(recover?.textContent).toContain(S.presets.recoverLine)
      expect(
        byTestId('review-blocked-cannot-recover')?.compareDocumentPosition(recover as Node)
      ).toBe(Node.DOCUMENT_POSITION_FOLLOWING)
    })

    it('opens the recovery of another account when a basic account presses the way to it', async () => {
      listAccounts([listedAccount(ACCOUNT, false)])
      await showAccount(ACCOUNT)

      await press('recover')

      expect(mockNavigate).toHaveBeenCalledTimes(1)
      expect(mockNavigate).toHaveBeenCalledWith(WEB_ROUTES.socialRecoveryRecovery)
    })

    it('titles the refusal with the recovery title, and counts no step of the setup', async () => {
      listAccounts([listedAccount(ACCOUNT, false)])
      await showAccount(ACCOUNT)

      const refusal = byTestId('presets-cannot-recover')
      expect(refusal?.textContent?.startsWith(S.routes.root)).toBe(true)
      expect(container.textContent).not.toContain(S.routes.setup)
      expect(byTestId('presets-stage')).toBeNull()
      expect(container.textContent).not.toContain('Step 1 of 7')
    })

    it('keeps the setup title and the first step counter for a smart account', async () => {
      await showAccount(ACCOUNT)

      expect(byTestId('presets-stage')?.textContent).toBe('Set up · Step 1 of 7')
      expect(byTestId('presets-screen')?.textContent).toContain(S.routes.setup)
    })

    it('keeps the way to recover another account for a smart account, opening the recovery', async () => {
      await showAccount(ACCOUNT)

      expect(byTestId('presets-screen')?.contains(byTestId('recover'))).toBe(true)
      await press('recover')

      expect(mockNavigate).toHaveBeenCalledWith(WEB_ROUTES.socialRecoveryRecovery)
    })

    it('counts the step again once a tab opens on a smart account after a basic one', async () => {
      listAccounts([listedAccount(ACCOUNT, false), listedAccount(OTHER_ACCOUNT, true)])
      await showAccount(ACCOUNT)
      expect(byTestId('presets-stage')).toBeNull()

      await showAccount(OTHER_ACCOUNT)
      expect(byTestId('presets-stage')?.textContent).toBe('Set up · Step 1 of 7')
    })

    it('shows the presets once a tab opens on a smart account after a basic one', async () => {
      listAccounts([listedAccount(ACCOUNT, false), listedAccount(OTHER_ACCOUNT, true)])
      await showAccount(ACCOUNT)
      expect(byTestId('presets-cannot-recover')).not.toBeNull()

      await showAccount(OTHER_ACCOUNT)
      expect(byTestId('presets-grid')).not.toBeNull()
      expect(byTestId('presets-cannot-recover')).toBeNull()
    })
  })
})
