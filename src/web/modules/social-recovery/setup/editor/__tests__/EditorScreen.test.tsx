/**
 * @jest-environment jsdom
 *
 * The editor's screen mounted with the app's own components, the real en.json
 * and real records on an in-memory double of the extension's storage helper,
 * whose reads a test can hold back. The selected account, the navigation, the
 * recovery client, the settings sidebar, the logo and the wallet's spinner are
 * stubs. jsdom has no `TextEncoder`, which viem reads when it loads, so the
 * test sets Node's before it loads the modules.
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

// The selected account as an external store, so a test can switch it.
const mockSelected: {
  state: { account: { addr: string } | null }
  listeners: Set<() => void>
} = { state: { account: null }, listeners: new Set() }
const mockRaw = new Map<string, string>()
// While set, every storage read waits for it to settle.
const mockHeld: { current: Promise<void> | null } = { current: null }
const waitWhileHeld = async () => {
  if (mockHeld.current) {
    await mockHeld.current
  }
}
const mockStorage: RecordStorage = {
  get: async (key, defaultValue) => {
    await waitWhileHeld()
    const stored = key && mockRaw.get(key)
    return stored ? parse(stored) : defaultValue
  },
  getAll: async () => {
    await waitWhileHeld()
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
jest.mock('@common/hooks/useNavigation', () => ({
  __esModule: true,
  default: () => ({ navigate: () => {} })
}))
jest.mock('@web/modules/social-recovery/shared/client/useRecoveryClient', () => ({
  useRecoveryClient: () => ({ status: 'loading', retry: () => {} })
}))
jest.mock('@web/modules/settings/components/Sidebar', () => ({
  __esModule: true,
  default: () => null
}))
jest.mock('@common/components/AmbireLogoHorizontal', () => ({
  __esModule: true,
  default: () => null
}))
jest.mock('@common/components/Avatar', () => ({ __esModule: true, default: () => null }))
// The wallet's spinner is an animation Jest cannot draw; the stub marks its place.
jest.mock('@common/components/Spinner', () => ({
  __esModule: true,
  default: () =>
    // eslint-disable-next-line global-require
    require('react').createElement(require('react-native').View, { testID: 'screen-spinner' })
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
const EditorScreen: typeof import('@web/modules/social-recovery/setup/editor/EditorScreen').default =
  require('@web/modules/social-recovery/setup/editor/EditorScreen').default
const {
  createWalletRecords,
  defaultSetupDraft
}: typeof import('@web/modules/social-recovery/shared/records') = require('@web/modules/social-recovery/shared/records')
const {
  CHAIN_IDS,
  WALLET_RECOVERY_CHAIN
}: typeof import('@web/modules/social-recovery/shared/client') = require('@web/modules/social-recovery/shared/client')
const {
  ALICE,
  BOB,
  PASSPORT
}: typeof import('@web/modules/social-recovery/setup/editor/__tests__/harness') = require('@web/modules/social-recovery/setup/editor/__tests__/harness')
/* eslint-enable @typescript-eslint/no-var-requires, global-require */

const ACCOUNT: Address = '0x1111111111111111111111111111111111111111'
const BREADCRUMB = en.socialRecovery.chrome.breadcrumb

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

describe('the editor screen', () => {
  let container: HTMLDivElement
  let root: Root

  beforeEach(() => {
    mockRaw.clear()
    mockHeld.current = null
    container = document.createElement('div')
    document.body.appendChild(container)
    root = createRoot(container)
  })

  afterEach(() => {
    act(() => root.unmount())
    container.remove()
  })

  /**
   * Lets the pending storage reads settle, then renders what they changed.
   * The storage double answers in microtasks, which all run before a timer fires.
   */
  const settle = () =>
    act(async () => {
      await new Promise((resolve) => {
        setTimeout(resolve, 0)
      })
    })

  const showAccount = async (account: Address | null) => {
    mockSelected.state = { account: account && { addr: account } }
    await act(async () => {
      if (container.childElementCount) {
        mockSelected.listeners.forEach((listener) => listener())
      } else {
        root.render(
          <ThemeContext.Provider value={THEME_CONTEXT}>
            <EditorScreen />
          </ThemeContext.Provider>
        )
      }
    })
    await settle()
  }

  const byTestId = (id: string) => container.querySelector<HTMLElement>(`[data-testid="${id}"]`)

  it('shows the breadcrumb and a spinner, and no editor, until an account is selected', async () => {
    await showAccount(null)
    expect(container.textContent).toContain(BREADCRUMB)
    expect(byTestId('screen-spinner')).not.toBeNull()
    expect(byTestId('editor')).toBeNull()
    expect(byTestId('editor-spinner')).toBeNull()
  })

  it("shows the editor's spinner while the account's records load", async () => {
    let release: () => void = () => {}
    mockHeld.current = new Promise<void>((resolve) => {
      release = resolve
    })
    await showAccount(ACCOUNT)
    expect(container.textContent).toContain(BREADCRUMB)
    expect(byTestId('editor-spinner')).not.toBeNull()
    expect(byTestId('editor')).toBeNull()
    expect(byTestId('screen-spinner')).toBeNull()
    release()
    await settle()
    expect(byTestId('editor')).not.toBeNull()
    expect(byTestId('editor-title')).not.toBeNull()
  })

  it("shows the editor under the breadcrumb once the account's records are read", async () => {
    await showAccount(ACCOUNT)
    const editor = byTestId('editor')
    expect(editor).not.toBeNull()
    expect(byTestId('screen-spinner')).toBeNull()
    expect(byTestId('editor-title')).not.toBeNull()
    expect(container.textContent?.indexOf(BREADCRUMB)).toBe(0)
  })

  const press = async (id: string) => {
    const node = byTestId(id)
    if (!node) {
      throw new Error(`nothing on screen with the test id ${id}`)
    }
    act(() => node.click())
    await settle()
  }

  // A required row whose credential is also a member of the group after it.
  const storeRowAlsoInGroup = () =>
    createWalletRecords({ storage: mockStorage })
      .setup(CHAIN_IDS[WALLET_RECOVERY_CHAIN], ACCOUNT)
      .setupDraft.write({
        ...defaultSetupDraft(),
        clauses: [
          { threshold: 1, credentials: [ALICE] },
          { threshold: 2, credentials: [ALICE, BOB, PASSPORT] }
        ]
      })

  const expectOneRefusalInTheHeader = () => {
    expect(byTestId('editor-picker')).toBeNull()
    const refusals = container.querySelectorAll('[data-testid="editor-refusal"]')
    expect(refusals).toHaveLength(1)
    expect(refusals[0].textContent).toBe(en.socialRecovery.editor.duplicate)
    // The header's line sits under the title and above the required rows.
    const inOrder = container.querySelectorAll<HTMLElement>(
      '[data-testid="editor-title"], [data-testid="editor-refusal"], [data-testid="editor-required"]'
    )
    expect(Array.from(inOrder, (node) => node.dataset.testid)).toEqual([
      'editor-title',
      'editor-refusal',
      'editor-required'
    ])
  }

  it('closes an open picker and refuses in the header when a row moves into a group that holds it', async () => {
    await storeRowAlsoInGroup()
    await showAccount(ACCOUNT)
    await press('editor-add-required')
    expect(byTestId('editor-picker')).not.toBeNull()
    await press('editor-row-0-move')
    expectOneRefusalInTheHeader()
  })

  it('closes an open picker and refuses in the header when a group member a row holds is made required', async () => {
    await storeRowAlsoInGroup()
    await showAccount(ACCOUNT)
    await press('editor-add-required')
    expect(byTestId('editor-picker')).not.toBeNull()
    await press('editor-member-1-0-required')
    expectOneRefusalInTheHeader()
  })

  it('takes the spinner back when the account is cleared', async () => {
    await showAccount(ACCOUNT)
    expect(byTestId('editor')).not.toBeNull()
    await showAccount(null)
    expect(byTestId('editor')).toBeNull()
    expect(byTestId('screen-spinner')).not.toBeNull()
  })
})
