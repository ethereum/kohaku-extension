/**
 * @jest-environment jsdom
 *
 * The account picker's page list mounted with a scripted controller state. The
 * usage check's client finds used only the addresses the test names. jsdom has
 * no `TextEncoder`, which viem reads when it loads, so the test sets Node's
 * before it loads the modules.
 */
import { createRoot, Root } from 'react-dom/client'
import { act } from 'react-dom/test-utils'
import { TextDecoder, TextEncoder } from 'util'

import type { Address } from 'viem'

import type AccountPickerController from '@ambire-common/controllers/accountPicker/accountPicker'
import type {
  AccountOnPage,
  ImportStatus as ImportStatusType
} from '@ambire-common/interfaces/account'
import en from '@common/config/localization/translations/en.json'
import type { ThemeContextReturnType } from '@common/contexts/themeContext'
import type { ThemeProps } from '@common/styles/themeConfig'

Object.assign(globalThis, { TextEncoder, TextDecoder })
;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true

const mockDispatch = jest.fn()
const mockNetworks = [
  { chainId: 1n, name: 'Ethereum', selectedRpcUrl: 'http://rpc.invalid/1' },
  { chainId: 10n, name: 'Optimism', selectedRpcUrl: 'http://rpc.invalid/10' }
]
// The addresses the usage check finds used.
const mockChain: { usedAddrs: string[] } = { usedAddrs: [] }
// The name the reverse lookup finds, per account address.
const mockEnsNames: Record<string, string> = {}

jest.mock('@web/hooks/useBackgroundService', () => ({
  __esModule: true,
  default: () => ({ dispatch: mockDispatch })
}))
jest.mock('@web/hooks/useNetworksControllerState', () => ({
  __esModule: true,
  default: () => ({ networks: mockNetworks })
}))
jest.mock('@web/hooks/useAccountPickerControllerState', () => ({
  __esModule: true,
  default: () => ({ networksWithAccountStateError: [], pageError: null, page: 1 })
}))
jest.mock('@common/hooks/useReverseLookup', () => ({
  __esModule: true,
  default: ({ address }: { address: string }) => ({
    isLoading: false,
    ens: mockEnsNames[address] ?? null
  })
}))
jest.mock('@common/hooks/useToast', () => ({
  __esModule: true,
  default: () => ({ addToast: () => {} })
}))
// Jest's config transforms neither images nor these packages' ES modules; the
// row's avatar, badge and copy button and the list's scroll wrapper load them.
jest.mock('@common/components/Avatar', () => ({ __esModule: true, default: () => null }))
// The list's spinner, drawn while the usage scan runs, plays a Lottie animation
// jsdom cannot run.
jest.mock('@common/components/Spinner', () => ({ __esModule: true, default: () => null }))
jest.mock('nanoid', () => ({ nanoid: () => 'badge' }))
jest.mock('@common/utils/clipboard', () => ({ setStringAsync: async () => true }))
// The tooltip opens through a portal on hover, which jsdom does not lay out; the
// stand-in renders its content in place under the id its anchor names.
jest.mock('@common/components/Tooltip', () => ({
  __esModule: true,
  default: ({ id, content }: { id: string; content: string }) =>
    jest.requireActual('react').createElement('span', { 'data-tooltip-content-for': id }, content)
}))
// The intro steps' context loads a stylesheet; the row reads only its setter.
jest.mock('@web/modules/account-picker/contexts/accountPickerIntroStepsContext', () => ({
  AccountPickerIntroStepsContext: jest
    .requireActual('react')
    .createContext({ setShowIntroSteps: () => {} }),
  SmartAccountIntroId: 'smart-account-intro'
}))
jest.mock('react-native-keyboard-aware-scroll-view', () => ({
  KeyboardAwareScrollView: jest.requireActual('react-native').ScrollView
}))
jest.mock('viem', () => ({
  ...jest.requireActual('viem'),
  createPublicClient: () => ({
    getTransactionCount: async ({ address }: { address: string }) =>
      mockChain.usedAddrs.includes(address) ? 1 : 0,
    getBalance: async () => 0n
  })
}))

/* eslint-disable @typescript-eslint/no-var-requires, global-require */
const React: typeof import('react') = require('react')
const { Dimensions }: typeof import('react-native') = require('react-native')
const {
  ThemeContext
}: typeof import('@common/contexts/themeContext') = require('@common/contexts/themeContext')
const themeConfig: typeof import('@common/styles/themeConfig') = require('@common/styles/themeConfig')
const {
  ImportStatus
}: typeof import('@ambire-common/interfaces/account') = require('@ambire-common/interfaces/account')
const {
  SMART_ACCOUNT_SIGNER_KEY_DERIVATION_OFFSET
}: typeof import('@ambire-common/consts/derivation') = require('@ambire-common/consts/derivation')
const shortenAddress: typeof import('@ambire-common/utils/shortenAddress').default =
  require('@ambire-common/utils/shortenAddress').default
const AccountsOnPageList: typeof import('@web/modules/account-picker/components/AccountsOnPageList/AccountsOnPageList').default =
  require('@web/modules/account-picker/components/AccountsOnPageList/AccountsOnPageList').default
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

const BASIC: Address = '0x1111111111111111111111111111111111111111'
const SMART: Address = '0x2222222222222222222222222222222222222222'
// The key the slot derives for the smart account, which controls it.
const KEY: Address = '0x3333333333333333333333333333333333333333'
// A second slot's smart account and its key.
const OTHER_SMART: Address = '0x6666666666666666666666666666666666666666'
const OTHER_KEY: Address = '0x7777777777777777777777777777777777777777'
const PRIVILEGE_SIGNER = `0x${'0'.repeat(63)}2`

// The derivation index of the key the slot derives for its smart account.
const keyIndex = (slot: number) => SMART_ACCOUNT_SIGNER_KEY_DERIVATION_OFFSET + slot - 1

const basic = (addr: Address, label: string): AccountOnPage['account'] => ({
  addr,
  associatedKeys: [addr],
  initialPrivileges: [],
  creation: null,
  preferences: { label, pfp: addr },
  usedOnNetworks: []
})

const smart = (addr: Address, key: Address): AccountOnPage['account'] => ({
  addr,
  associatedKeys: [key],
  initialPrivileges: [[key, PRIVILEGE_SIGNER]],
  creation: {
    factoryAddr: `0x${'5'.repeat(40)}`,
    bytecode: '0x00',
    salt: `0x${'0'.repeat(64)}`
  },
  preferences: { label: 'Smart account', pfp: addr },
  usedOnNetworks: []
})

const basicAccount = basic(BASIC, 'Account 1')
const smartAccount = smart(SMART, KEY)
const keyAccount = basic(KEY, 'Account 2')
const otherSmartAccount = smart(OTHER_SMART, OTHER_KEY)
const otherKeyAccount = basic(OTHER_KEY, 'Account 4')

const onPage = (
  account: AccountOnPage['account'],
  {
    slot = 1,
    index = slot - 1,
    importStatus = ImportStatus.NotImported
  }: { slot?: number; index?: number; importStatus?: ImportStatusType } = {}
): AccountOnPage => ({ account, isLinked: false, slot, index, importStatus })

// The key entry the picker lists after the smart account of the same slot.
const keyOnPage = (
  account: AccountOnPage['account'],
  { slot = 1, importStatus = ImportStatus.NotImported } = {}
): AccountOnPage => onPage(account, { slot, index: keyIndex(slot), importStatus })

const pickerState = ({
  accountsOnPage,
  selectedAccounts = [],
  shouldSelectSmartAccountAutomatically
}: {
  accountsOnPage: AccountOnPage[]
  selectedAccounts?: AccountOnPage[]
  shouldSelectSmartAccountAutomatically?: boolean
}): AccountPickerController =>
  ({
    isInitialized: true,
    accountsLoading: false,
    pageError: null,
    page: 1,
    accountsOnPage,
    selectedAccounts: selectedAccounts.map(({ account, isLinked }) => ({
      account,
      isLinked,
      accountKeys: []
    })),
    ...(shouldSelectSmartAccountAutomatically !== undefined && {
      shouldSelectSmartAccountAutomatically
    })
  } as unknown as AccountPickerController)

const controllingKeyRow = (smartAddr: Address) =>
  en.socialRecovery.create.controllingKeyRow.replace('{{account}}', shortenAddress(smartAddr, 16))

describe('the account picker page list', () => {
  let container: HTMLDivElement
  let root: Root

  const mount = async (
    state: AccountPickerController,
    { isScanComplete = true, onScanComplete = () => {} } = {}
  ) => {
    await act(async () => {
      root.render(
        <ThemeContext.Provider value={THEME_CONTEXT}>
          <AccountsOnPageList
            state={state}
            setPage={() => {}}
            subType="seed"
            isLoading={false}
            isScanComplete={isScanComplete}
            onScanComplete={onScanComplete}
          />
        </ThemeContext.Provider>
      )
    })
    // The usage check settles over its promises.
    await act(async () => {
      await new Promise((resolve) => {
        setTimeout(resolve, 0)
      })
    })
  }

  const rows = (address: Address) =>
    container.querySelectorAll<HTMLElement>(`[data-testid="add-account-${address}"]`)
  const row = (address: Address) => rows(address)[0] ?? null
  const caption = (address: Address) =>
    container.querySelector<HTMLElement>(`[data-testid="account-caption-${address}"]`)
  // The switch tells its state only by where its thumb sits: at the track's
  // start when off.
  const isSwitchOn = (address: Address) => {
    const thumb = row(address)?.querySelector<HTMLElement>('[role="switch"] > div > div')
    return !!thumb && !thumb.style.transform.startsWith('translateX(3px)')
  }
  const tooltip = (id: string) =>
    container.querySelector<HTMLElement>(`[data-tooltip-content-for="${id}"]`)
  const comesBefore = (first: HTMLElement | null, second: HTMLElement | null) =>
    !!first &&
    !!second &&
    // eslint-disable-next-line no-bitwise
    !!(first.compareDocumentPosition(second) & Node.DOCUMENT_POSITION_FOLLOWING)
  // jsdom lays nothing out, so the window reads as zero wide; a row on a wide
  // window has room for a full address.
  const widenWindow = () =>
    jest
      .spyOn(Dimensions, 'get')
      .mockReturnValue({ width: 1440, height: 900, scale: 1, fontScale: 1 })
  const rowLines = (address: Address) =>
    Array.from(row(address)?.querySelectorAll<HTMLElement>('[dir="auto"]') ?? []).map(
      (node) => node.textContent
    )
  const dispatchedSelections = () =>
    mockDispatch.mock.calls
      .map(([action]) => action)
      .filter(({ type }) =>
        [
          'MAIN_CONTROLLER_ACCOUNT_PICKER_SELECT_ACCOUNT',
          'MAIN_CONTROLLER_ACCOUNT_PICKER_DESELECT_ACCOUNT'
        ].includes(type)
      )

  beforeEach(() => {
    container = document.createElement('div')
    document.body.appendChild(container)
    root = createRoot(container)
    mockDispatch.mockClear()
    mockChain.usedAddrs = []
    Object.keys(mockEnsNames).forEach((address) => {
      delete mockEnsNames[address]
    })
    jest.spyOn(console, 'log').mockImplementation(() => {})
  })

  afterEach(() => {
    act(() => root.unmount())
    container.remove()
    jest.restoreAllMocks()
  })

  describe('on an import', () => {
    it('lists the basic account and no smart account when the state carries no selection flag', async () => {
      await mount(pickerState({ accountsOnPage: [onPage(basicAccount), onPage(smartAccount)] }))

      expect(row(BASIC)).not.toBeNull()
      expect(row(SMART)).toBeNull()
    })

    it('lists no smart account and no key row when the state turns the selection flag off', async () => {
      await mount(
        pickerState({
          accountsOnPage: [onPage(basicAccount), onPage(smartAccount)],
          shouldSelectSmartAccountAutomatically: false
        })
      )

      expect(row(BASIC)).not.toBeNull()
      expect(row(SMART)).toBeNull()
      expect(row(KEY)).toBeNull()
      expect(caption(KEY)).toBeNull()
      expect(container.textContent).not.toContain(controllingKeyRow(SMART))
    })

    it('selects a used basic account the usage scan finds', async () => {
      mockChain.usedAddrs = [BASIC]
      await mount(pickerState({ accountsOnPage: [onPage(basicAccount)] }))

      expect(mockDispatch).toHaveBeenCalledWith({
        type: 'MAIN_CONTROLLER_ACCOUNT_PICKER_SELECT_ACCOUNT',
        params: { account: basicAccount }
      })
    })
  })

  describe('on a newly created seed', () => {
    // The page as the picker lists it: the slot's basic account, its smart
    // account, then the key that controls the smart account.
    const createFlow = (
      selectedAccounts: AccountOnPage[] = [],
      { keyImportStatus = ImportStatus.NotImported } = {}
    ) =>
      pickerState({
        accountsOnPage: [
          onPage(basicAccount),
          onPage(smartAccount),
          keyOnPage(keyAccount, { importStatus: keyImportStatus })
        ],
        selectedAccounts,
        shouldSelectSmartAccountAutomatically: true
      })
    // The picker selects the smart account and then its key.
    const bothSelected = () => [onPage(smartAccount), keyOnPage(keyAccount)]

    it('lists the smart account above the basic account', async () => {
      await mount(createFlow(bothSelected()))

      expect(row(BASIC)).not.toBeNull()
      expect(row(SMART)).not.toBeNull()
      expect(comesBefore(row(SMART), row(BASIC))).toBe(true)
    })

    it('draws the key the picker lists for the smart account as a row under it, captioned as its controlling key', async () => {
      await mount(createFlow(bothSelected()))

      const smartAddress = row(SMART)?.querySelector<HTMLElement>(`[data-tooltip-id="${SMART}"]`)
      expect(smartAddress?.textContent).toBeTruthy()
      expect(controllingKeyRow(SMART)).toContain(smartAddress?.textContent)
      expect(caption(KEY)?.textContent).toBe(controllingKeyRow(SMART))
      expect(comesBefore(row(SMART), row(KEY))).toBe(true)
      expect(comesBefore(row(KEY), row(BASIC))).toBe(true)
    })

    it('draws the key once, never again among the basic accounts', async () => {
      await mount(createFlow(bothSelected()))

      expect(rows(KEY)).toHaveLength(1)
      expect(container.querySelectorAll('[data-testid^="account-caption-"]')).toHaveLength(1)
    })

    it('draws no key row when the picker lists no key for the smart account', async () => {
      await mount(
        pickerState({
          accountsOnPage: [onPage(basicAccount), onPage(smartAccount)],
          selectedAccounts: [onPage(smartAccount)],
          shouldSelectSmartAccountAutomatically: true
        })
      )

      expect(row(SMART)).not.toBeNull()
      expect(row(KEY)).toBeNull()
      expect(container.textContent).not.toContain(controllingKeyRow(SMART))
    })

    it('draws each key under the smart account of its own slot', async () => {
      await mount(
        pickerState({
          accountsOnPage: [
            onPage(basicAccount),
            onPage(smartAccount),
            onPage(basic('0x8888888888888888888888888888888888888888', 'Account 3'), { slot: 2 }),
            onPage(otherSmartAccount, { slot: 2 }),
            keyOnPage(keyAccount),
            keyOnPage(otherKeyAccount, { slot: 2 })
          ],
          shouldSelectSmartAccountAutomatically: true
        })
      )

      expect(caption(KEY)?.textContent).toBe(controllingKeyRow(SMART))
      expect(caption(OTHER_KEY)?.textContent).toBe(controllingKeyRow(OTHER_SMART))
      expect(comesBefore(row(SMART), row(KEY))).toBe(true)
      expect(comesBefore(row(KEY), row(OTHER_SMART))).toBe(true)
      expect(comesBefore(row(OTHER_SMART), row(OTHER_KEY))).toBe(true)
      expect(rows(KEY)).toHaveLength(1)
      expect(rows(OTHER_KEY)).toHaveLength(1)
    })

    it('shows the key by its full address on a wide window, with the full address in a tooltip', async () => {
      widenWindow()
      await mount(createFlow(bothSelected()))

      expect(rowLines(KEY)).toContain(KEY)
      const address = row(KEY)?.querySelector<HTMLElement>(`[data-tooltip-id="${KEY}"]`)
      expect(address?.textContent).toBe(KEY)
      expect(tooltip(KEY)?.textContent).toBe(KEY)
    })

    it('shows the key with its own import status, not the smart account’s', async () => {
      await mount(createFlow(bothSelected(), { keyImportStatus: ImportStatus.ImportedWithoutKey }))

      expect(row(KEY)?.textContent).toContain(
        'Already imported as a view only account. Import now to be able to manage this account.'
      )
      expect(row(SMART)?.textContent).not.toContain('Already imported')
    })

    it('shows both rows on when the picker selects the smart account and its key', async () => {
      await mount(createFlow(bothSelected()))

      expect(isSwitchOn(SMART)).toBe(true)
      expect(isSwitchOn(KEY)).toBe(true)
    })

    it('shows the key row off when only the smart account is selected', async () => {
      await mount(createFlow([onPage(smartAccount)]))

      expect(isSwitchOn(SMART)).toBe(true)
      expect(isSwitchOn(KEY)).toBe(false)
    })

    it('shows the smart account row off when only the key is selected', async () => {
      await mount(createFlow([keyOnPage(keyAccount)]))

      expect(isSwitchOn(SMART)).toBe(false)
      expect(isSwitchOn(KEY)).toBe(true)
    })

    it('turns the key row off and leaves the smart account row on when the key alone is deselected', async () => {
      await mount(createFlow(bothSelected()))
      await mount(createFlow([onPage(smartAccount)]))

      expect(isSwitchOn(KEY)).toBe(false)
      expect(isSwitchOn(SMART)).toBe(true)
    })

    it('deselects the key alone on a press of the key row', async () => {
      await mount(createFlow(bothSelected()))

      await act(async () => {
        row(KEY)?.click()
      })

      expect(dispatchedSelections()).toEqual([
        {
          type: 'MAIN_CONTROLLER_ACCOUNT_PICKER_DESELECT_ACCOUNT',
          params: { account: keyAccount }
        }
      ])
    })

    it('selects the key alone on a press of the key row', async () => {
      await mount(createFlow([onPage(smartAccount)]))

      await act(async () => {
        row(KEY)?.click()
      })

      expect(dispatchedSelections()).toEqual([
        { type: 'MAIN_CONTROLLER_ACCOUNT_PICKER_SELECT_ACCOUNT', params: { account: keyAccount } }
      ])
    })

    it('deselects the smart account alone on a press of its row', async () => {
      await mount(createFlow(bothSelected()))

      await act(async () => {
        row(SMART)?.click()
      })

      expect(dispatchedSelections()).toEqual([
        {
          type: 'MAIN_CONTROLLER_ACCOUNT_PICKER_DESELECT_ACCOUNT',
          params: { account: smartAccount }
        }
      ])
    })

    it('selects the smart account alone on a press of its row', async () => {
      await mount(createFlow([keyOnPage(keyAccount)]))

      await act(async () => {
        row(SMART)?.click()
      })

      expect(dispatchedSelections()).toEqual([
        {
          type: 'MAIN_CONTROLLER_ACCOUNT_PICKER_SELECT_ACCOUNT',
          params: { account: smartAccount }
        }
      ])
    })

    it('shows the basic account off when the picker selects the smart account and its key', async () => {
      await mount(createFlow(bothSelected()))

      expect(isSwitchOn(BASIC)).toBe(false)
    })

    it('does not select a used basic account the usage scan finds', async () => {
      mockChain.usedAddrs = [BASIC]
      await mount(createFlow(bothSelected()))

      expect(dispatchedSelections()).toEqual([])
      expect(isSwitchOn(BASIC)).toBe(false)
    })

    it('finishes the usage scan once without selecting anything', async () => {
      mockChain.usedAddrs = [BASIC]
      const onScanComplete = jest.fn()
      await mount(createFlow(bothSelected()), { isScanComplete: false, onScanComplete })

      expect(onScanComplete).toHaveBeenCalledTimes(1)
      expect(dispatchedSelections()).toEqual([])
    })

    it('selects the basic account on a press, which stays selectable', async () => {
      await mount(createFlow(bothSelected()))

      await act(async () => {
        row(BASIC)?.click()
      })

      expect(dispatchedSelections()).toEqual([
        {
          type: 'MAIN_CONTROLLER_ACCOUNT_PICKER_SELECT_ACCOUNT',
          params: { account: basicAccount }
        }
      ])
    })

    it('shows an unnamed smart account by its short address, with the full address in a tooltip', async () => {
      widenWindow()
      await mount(createFlow(bothSelected()))

      const short = shortenAddress(SMART, 16)
      expect(short.length).toBeLessThan(SMART.length)
      const address = row(SMART)?.querySelector<HTMLElement>(`[data-tooltip-id="${SMART}"]`)
      expect(address?.textContent).toBe(short)
      expect(rowLines(SMART)).not.toContain(SMART)
      expect(tooltip(SMART)?.textContent).toBe(SMART)
    })

    it('shows a named smart account by its name beside its short address', async () => {
      mockEnsNames[SMART] = 'savings.eth'
      widenWindow()
      await mount(createFlow(bothSelected()))

      const lines = rowLines(SMART)
      expect(lines).toContain('savings.eth')
      expect(lines).toContain(`(${shortenAddress(SMART, 16)})`)
      expect(lines).not.toContain(SMART)
      expect(tooltip(SMART)?.textContent).toBe(SMART)
    })

    it('still shows an unnamed basic account by its full address, with no tooltip and no caption', async () => {
      widenWindow()
      await mount(createFlow(bothSelected()))

      expect(rowLines(BASIC)).toContain(BASIC)
      expect(rowLines(BASIC)).not.toContain(shortenAddress(BASIC, 16))
      expect(tooltip(BASIC)).toBeNull()
      expect(caption(BASIC)).toBeNull()
    })

    it('asks nothing about a seed', async () => {
      await mount(createFlow(bothSelected()))

      expect(caption(KEY)).not.toBeNull()
      expect(container.textContent).not.toMatch(/seed/i)
      expect(container.textContent).not.toMatch(/recovery phrase/i)
    })
  })
})
