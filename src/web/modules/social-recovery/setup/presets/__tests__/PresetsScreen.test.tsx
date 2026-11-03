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

// The recovery client: one stable client per account, whose setup state
// answers that no setup is committed unless a test gives the account its own
// client or a client status other than ready. Every account the screen asks a
// client for is kept, so a test can tell that a basic account is asked for none.
const mockClients = new Map<string, { setup: { setupState: jest.Mock<Promise<unknown>, []> } }>()
const mockClientStatus = new Map<string, 'loading' | 'failed' | 'update-the-wallet'>()
const mockClientRetry = jest.fn()
const mockClientAccounts: (string | undefined)[] = []
jest.mock('@web/modules/social-recovery/shared/client/useRecoveryClient', () => ({
  useRecoveryClient: (account: string | undefined) => {
    mockClientAccounts.push(account)
    if (!account) {
      return { status: 'loading', retry: mockClientRetry }
    }
    const status = mockClientStatus.get(account)
    if (status) {
      return { status, retry: mockClientRetry }
    }
    if (!mockClients.has(account)) {
      mockClients.set(account, {
        setup: { setupState: jest.fn(async () => ({ hasSetup: false, isAuthorized: false })) }
      })
    }
    return { status: 'ready', client: mockClients.get(account), retry: mockClientRetry }
  }
}))
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
jest.mock('@common/components/Spinner', () => ({ __esModule: true, default: () => null }))
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
    mockClients.clear()
    mockClientStatus.clear()
    mockClientRetry.mockClear()
    mockClientAccounts.length = 0
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

  describe('for the setup state the chain answers', () => {
    const NO_SETUP = { hasSetup: false, isAuthorized: false }
    const MIRROR = { hasSetup: false, isAuthorized: true }
    const SET_UP = { hasSetup: true, isAuthorized: true }
    const DORMANT = { hasSetup: true, isAuthorized: false }

    const deferred = () => {
      let resolve: (value: unknown) => void = () => {}
      let reject: (reason: unknown) => void = () => {}
      const promise = new Promise<unknown>((onResolve, onReject) => {
        resolve = onResolve
        reject = onReject
      })
      return { promise, resolve, reject }
    }

    // The account's client, whose setup state reads answer in turn with the given promises.
    const clientAnswering = (account: Address, ...answers: (() => Promise<unknown>)[]) => {
      const setupState = jest.fn<Promise<unknown>, []>()
      answers.forEach((answer) => setupState.mockImplementationOnce(answer))
      mockClients.set(account, { setup: { setupState } })
      return setupState
    }

    const settle = async () => {
      await act(async () => {
        await new Promise((resolve) => {
          setTimeout(resolve, 0)
        })
      })
    }

    const writeDraft = (account: Address) =>
      createWalletRecords({ storage: mockStorage })
        .setup(CHAIN_IDS[WALLET_RECOVERY_CHAIN], account)
        .setupDraft.write({
          wait: 172800,
          clauses: [],
          ignoresPause: true,
          privacy: { backup: 'encrypted', publicMetadata: '0x' }
        })

    const expectNoPresets = () => {
      expect(byTestId('presets-screen')).toBeNull()
      expect(byTestId('presets-grid')).toBeNull()
      expect(byTestId('presets-resume')).toBeNull()
      expect(byTestId('recovery-status')).toBeNull()
      expect(byTestId('continue')).toBeNull()
      expect(byTestId('customize')).toBeNull()
      expect(byTestId('resume')).toBeNull()
      expect(container.textContent).not.toContain(S.status.recovery.notSetUp)
    }

    const clientMessagePrefix = S.loading.client.split('{{')[0]

    it('shows the connecting block, and no presets, while the client connects', async () => {
      mockClientStatus.set(ACCOUNT, 'loading')
      await showAccount(ACCOUNT)

      expect(byTestId('presets-entry-connecting')).not.toBeNull()
      expect(byTestId('loading-block')).not.toBeNull()
      expect(byTestId('loading-message')?.textContent).toContain(clientMessagePrefix)
      expect(byTestId('presets-stage')?.textContent).toBe('Set up · Step 1 of 7')
      expectNoPresets()
    })

    it('shows the lookup block, and no presets or draft, while the setup state reads', async () => {
      await writeDraft(ACCOUNT)
      mockReads.length = 0
      const pending = deferred()
      clientAnswering(ACCOUNT, () => pending.promise)
      await showAccount(ACCOUNT)

      expect(byTestId('presets-entry-reading')).not.toBeNull()
      expect(byTestId('loading-block')).not.toBeNull()
      expect(byTestId('loading-message')?.textContent).toBe(S.loading.lookup)
      expect(byTestId('presets-entry-connecting')).toBeNull()
      expectNoPresets()
      expect(mockReads).toEqual([])
    })

    it('reads the setup state once on arrival', async () => {
      const setupState = clientAnswering(ACCOUNT, async () => NO_SETUP)
      await showAccount(ACCOUNT)
      await settle()

      expect(setupState).toHaveBeenCalledTimes(1)
    })

    it('shows the failed block for a failed read, never the presets, and draws them once a retry answers no setup', async () => {
      const setupState = clientAnswering(
        ACCOUNT,
        async () => {
          throw new Error('the node did not answer')
        },
        async () => NO_SETUP
      )
      await showAccount(ACCOUNT)
      await settle()

      const failed = byTestId('presets-entry-read-failed')
      expect(failed).not.toBeNull()
      expect(failed?.textContent).toContain(S.management.overview.reads.failedTitle)
      expect(failed?.textContent).toContain(S.management.overview.reads.failedBody)
      expectNoPresets()

      await press('presets-entry-read-failed-retry')
      await settle()

      expect(setupState).toHaveBeenCalledTimes(2)
      expect(byTestId('presets-entry-read-failed')).toBeNull()
      expect(byTestId('presets-grid')).not.toBeNull()
    })

    it('shows the lookup block again while a retry reads', async () => {
      const retried = deferred()
      clientAnswering(
        ACCOUNT,
        async () => {
          throw new Error('the node did not answer')
        },
        () => retried.promise
      )
      await showAccount(ACCOUNT)
      await settle()
      await press('presets-entry-read-failed-retry')

      expect(byTestId('presets-entry-reading')).not.toBeNull()
      expect(byTestId('presets-entry-read-failed')).toBeNull()
      expectNoPresets()

      await act(async () => retried.resolve(NO_SETUP))
      await settle()
      expect(byTestId('presets-grid')).not.toBeNull()
    })

    it('shows the failed block where the client did not build, and its retry builds the client again', async () => {
      mockClientStatus.set(ACCOUNT, 'failed')
      await showAccount(ACCOUNT)

      expect(byTestId('presets-entry-read-failed')).not.toBeNull()
      expectNoPresets()

      await press('presets-entry-read-failed-retry')

      expect(mockClientRetry).toHaveBeenCalledTimes(1)
    })

    it('shows the wallet-too-old alert, and no presets, where the wallet is too old for the deployment', async () => {
      mockClientStatus.set(ACCOUNT, 'update-the-wallet')
      await showAccount(ACCOUNT)

      const alert = byTestId('presets-entry-update-the-wallet')
      expect(alert).not.toBeNull()
      expect(alert?.textContent).toContain(S.client.updateTheWalletTitle)
      expect(byTestId('presets-entry-read-failed')).toBeNull()
      expectNoPresets()
    })

    const alreadySetUpCases: [string, { hasSetup: boolean; isAuthorized: boolean }][] = [
      ['a setup that is in force', SET_UP],
      ['a setup that the account no longer authorizes', DORMANT]
    ]
    alreadySetUpCases.forEach(([name, answer]) => {
      it(`refuses the presets for ${name} and opens the recovery path instead`, async () => {
        await writeDraft(ACCOUNT)
        clientAnswering(ACCOUNT, async () => answer)
        await showAccount(ACCOUNT)
        await settle()

        const block = byTestId('presets-already-set-up')
        expect(block).not.toBeNull()
        expect(block?.contains(byTestId('review-blocked-already-set-up'))).toBe(true)
        expect(byTestId('review-blocked-chip')?.textContent).toBe(
          S.review.blocked.alreadySetUp.chip
        )
        expect(byTestId('review-blocked-title')?.textContent).toBe(
          S.review.blocked.alreadySetUp.title
        )
        expect(byTestId('review-blocked-body')?.textContent).toBe(
          S.review.blocked.alreadySetUp.body
        )
        expect(byTestId('review-blocked-open')?.textContent).toBe(
          S.review.blocked.alreadySetUp.open
        )
        expectNoPresets()

        await press('review-blocked-open')

        expect(mockNavigate).toHaveBeenCalledWith(WEB_ROUTES.socialRecoveryManage)
      })

      it(`titles the refusal for ${name} with the recovery title, and counts no step of the setup`, async () => {
        clientAnswering(ACCOUNT, async () => answer)
        await showAccount(ACCOUNT)
        await settle()

        expect(byTestId('presets-entry')?.textContent?.startsWith(S.routes.root)).toBe(true)
        expect(container.textContent).not.toContain(S.routes.setup)
        expect(byTestId('presets-stage')).toBeNull()
        expect(container.textContent).not.toContain('Step 1 of 7')
      })

      it(`offers, under the refusal for ${name}, the way to recover another account`, async () => {
        clientAnswering(ACCOUNT, async () => answer)
        await showAccount(ACCOUNT)
        await settle()

        expect(byTestId('presets-already-set-up')?.contains(byTestId('recover'))).toBe(true)
        await press('recover')

        expect(mockNavigate).toHaveBeenCalledTimes(1)
        expect(mockNavigate).toHaveBeenCalledWith(WEB_ROUTES.socialRecoveryRecovery)
      })
    })

    it('keeps the setup title and the first step counter while the setup state reads, and after it fails', async () => {
      const retried = deferred()
      clientAnswering(
        ACCOUNT,
        () => retried.promise,
        async () => NO_SETUP
      )
      await showAccount(ACCOUNT)

      expect(byTestId('presets-entry-reading')).not.toBeNull()
      expect(byTestId('presets-stage')?.textContent).toBe('Set up · Step 1 of 7')
      expect(byTestId('presets-entry')?.textContent?.startsWith(S.routes.setup)).toBe(true)
      expect(byTestId('recover')).toBeNull()

      await act(async () => retried.reject(new Error('the node did not answer')))
      await settle()

      expect(byTestId('presets-entry-read-failed')).not.toBeNull()
      expect(byTestId('presets-stage')?.textContent).toBe('Set up · Step 1 of 7')
      expect(byTestId('presets-entry')?.textContent?.startsWith(S.routes.setup)).toBe(true)
      expect(byTestId('recover')).toBeNull()
    })

    it('counts the step again once a tab opens on an account with no setup after one with a setup', async () => {
      clientAnswering(ACCOUNT, async () => SET_UP)
      clientAnswering(OTHER_ACCOUNT, async () => NO_SETUP)
      await showAccount(ACCOUNT)
      await settle()
      expect(byTestId('presets-stage')).toBeNull()

      await showAccount(OTHER_ACCOUNT)
      await settle()
      expect(byTestId('presets-stage')?.textContent).toBe('Set up · Step 1 of 7')
      expect(byTestId('presets-grid')).not.toBeNull()
    })

    it('draws the presets for an account that authorizes the action but has no setup', async () => {
      clientAnswering(ACCOUNT, async () => MIRROR)
      await showAccount(ACCOUNT)
      await settle()

      expect(byTestId('presets-grid')).not.toBeNull()
      expect(byTestId('presets-entry')).toBeNull()
      expect(byTestId('presets-already-set-up')).toBeNull()
    })

    it('draws the presets and the draft for an account with no setup', async () => {
      await writeDraft(ACCOUNT)
      clientAnswering(ACCOUNT, async () => NO_SETUP)
      await showAccount(ACCOUNT)
      await settle()

      expect(byTestId('presets-resume')).not.toBeNull()
      expect(byTestId('presets-entry')).toBeNull()
    })

    it("drops the late answer of the first account and draws the other account's own answer", async () => {
      const firstRead = deferred()
      clientAnswering(ACCOUNT, () => firstRead.promise)
      clientAnswering(OTHER_ACCOUNT, async () => NO_SETUP)
      await showAccount(ACCOUNT)
      expect(byTestId('presets-entry-reading')).not.toBeNull()

      await showAccount(OTHER_ACCOUNT)
      await settle()
      expect(byTestId('presets-grid')).not.toBeNull()

      await act(async () => firstRead.resolve(SET_UP))
      await settle()

      expect(byTestId('presets-grid')).not.toBeNull()
      expect(byTestId('presets-already-set-up')).toBeNull()
    })

    it('keeps the other account reading while the first account answers late, then lets its own answer decide', async () => {
      const firstRead = deferred()
      const otherRead = deferred()
      clientAnswering(ACCOUNT, () => firstRead.promise)
      clientAnswering(OTHER_ACCOUNT, () => otherRead.promise)
      await showAccount(ACCOUNT)
      await showAccount(OTHER_ACCOUNT)

      await act(async () => firstRead.resolve(NO_SETUP))
      await settle()

      expect(byTestId('presets-entry-reading')).not.toBeNull()
      expectNoPresets()

      await act(async () => otherRead.resolve(SET_UP))
      await settle()

      expect(byTestId('presets-already-set-up')).not.toBeNull()
      expectNoPresets()
    })

    it('drops the late failure of the first account', async () => {
      const firstRead = deferred()
      clientAnswering(ACCOUNT, () => firstRead.promise)
      clientAnswering(OTHER_ACCOUNT, async () => NO_SETUP)
      await showAccount(ACCOUNT)
      await showAccount(OTHER_ACCOUNT)
      await settle()

      await act(async () => firstRead.reject(new Error('the node did not answer')))
      await settle()

      expect(byTestId('presets-grid')).not.toBeNull()
      expect(byTestId('presets-entry-read-failed')).toBeNull()
    })

    it('asks no client for a basic account, and shows it the refusal', async () => {
      listAccounts([listedAccount(ACCOUNT, false)])
      await showAccount(ACCOUNT)
      await settle()

      expect(mockClientAccounts.length).toBeGreaterThan(0)
      expect(mockClientAccounts.every((account) => account === undefined)).toBe(true)
      expect(mockClients.has(ACCOUNT)).toBe(false)
      expect(byTestId('presets-cannot-recover')).not.toBeNull()
      expect(byTestId('presets-entry')).toBeNull()
      expect(byTestId('presets-entry-connecting')).toBeNull()
    })
  })
})
