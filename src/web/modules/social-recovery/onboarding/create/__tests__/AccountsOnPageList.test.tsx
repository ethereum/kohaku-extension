/**
 * @jest-environment jsdom
 *
 * The account picker's page list mounted with a scripted controller state. The
 * chain is scripted too: the account-state read answers per account, and the
 * usage check's client finds every address unused. jsdom has no `TextEncoder`,
 * which viem reads when it loads, so the test sets Node's before it loads the
 * modules.
 */
import { createRoot, Root } from 'react-dom/client'
import { act } from 'react-dom/test-utils'
import { TextDecoder, TextEncoder } from 'util'

import type { Address } from 'viem'

import type AccountPickerController from '@ambire-common/controllers/accountPicker/accountPicker'
import type { Account, AccountOnchainState, AccountOnPage } from '@ambire-common/interfaces/account'
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
// The on-chain state every answering network gives, per account address; the
// networks whose read throws; and every provider the reads open, in order.
const mockChain: {
  states: Record<string, Partial<AccountOnchainState>>
  failingChainIds: bigint[]
  providers: {
    chainId: bigint
    accountAddrs: string[]
    readSettled: boolean
    destroyCalls: number
    destroyedAfterRead: boolean
  }[]
} = { states: {}, failingChainIds: [], providers: [] }
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
jest.mock('@web/services/provider', () => ({
  getRpcProviderForUI: (network: { chainId: bigint }) => {
    const record = {
      chainId: network.chainId,
      accountAddrs: [] as string[],
      readSettled: false,
      destroyCalls: 0,
      destroyedAfterRead: false
    }
    mockChain.providers.push(record)
    return {
      record,
      destroy: () => {
        record.destroyCalls += 1
        record.destroyedAfterRead = record.readSettled
      }
    }
  }
}))
jest.mock('@ambire-common/libs/accountState/accountState', () => ({
  getAccountState: async (
    provider: { record: { accountAddrs: string[]; readSettled: boolean } },
    network: { chainId: bigint },
    accounts: Account[]
  ) => {
    await Promise.resolve()
    const { record } = provider
    record.accountAddrs.push(...accounts.map((account) => account.addr))
    record.readSettled = true
    if (mockChain.failingChainIds.includes(network.chainId)) {
      throw new Error('read failed')
    }
    return accounts.map((account) => ({
      accountAddr: account.addr,
      isDeployed: false,
      associatedKeys: {},
      ...mockChain.states[account.addr]
    }))
  }
}))
// Jest's config transforms neither images nor these packages' ES modules; the
// row's avatar, badge and copy button and the list's scroll wrapper load them.
jest.mock('@common/components/Avatar', () => ({ __esModule: true, default: () => null }))
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
    getTransactionCount: async () => 0,
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
  ERC_4337_ENTRYPOINT
}: typeof import('@ambire-common/consts/deploy') = require('@ambire-common/consts/deploy')
const shortenAddress: typeof import('@ambire-common/utils/shortenAddress').default =
  require('@ambire-common/utils/shortenAddress').default
const {
  renderFullAddress,
  renderShortAddress
}: typeof import('@web/modules/social-recovery/shared/display') = require('@web/modules/social-recovery/shared/display')
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
// The key the slot derives for the smart account.
const DERIVED_KEY: Address = '0x3333333333333333333333333333333333333333'
// Another key, which holds the privilege on the account.
const HOLDER: Address = '0x4444444444444444444444444444444444444444'
// A second smart account on the same page.
const OTHER_SMART: Address = '0x6666666666666666666666666666666666666666'
const PRIVILEGE_NONE = `0x${'0'.repeat(64)}`
const PRIVILEGE_SIGNER = `0x${'0'.repeat(63)}2`

const basicAccount: AccountOnPage['account'] = {
  addr: BASIC,
  associatedKeys: [BASIC],
  initialPrivileges: [],
  creation: null,
  preferences: { label: 'Account 1', pfp: BASIC },
  usedOnNetworks: []
}

const smartAccount = (initialPrivileges: [string, string][]): AccountOnPage['account'] => ({
  addr: SMART,
  associatedKeys: [DERIVED_KEY],
  initialPrivileges,
  creation: {
    factoryAddr: `0x${'5'.repeat(40)}`,
    bytecode: '0x00',
    salt: `0x${'0'.repeat(64)}`
  },
  preferences: { label: 'Account 2', pfp: SMART },
  usedOnNetworks: []
})

const onPage = (account: AccountOnPage['account']): AccountOnPage => ({
  account,
  isLinked: false,
  slot: 1,
  index: 0,
  importStatus: ImportStatus.NotImported
})

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

const controlledBy = (address: Address) =>
  en.socialRecovery.create.controlledBy.replace('{{address}}', renderShortAddress(address))

describe('the account picker page list', () => {
  let container: HTMLDivElement
  let root: Root

  const mount = async (state: AccountPickerController) => {
    await act(async () => {
      root.render(
        <ThemeContext.Provider value={THEME_CONTEXT}>
          <AccountsOnPageList
            state={state}
            setPage={() => {}}
            subType="seed"
            isLoading={false}
            isScanComplete
            onScanComplete={() => {}}
          />
        </ThemeContext.Provider>
      )
    })
    // The usage check and the privilege read settle over their promises.
    await act(async () => {
      await new Promise((resolve) => {
        setTimeout(resolve, 0)
      })
    })
  }

  const row = (address: Address) =>
    container.querySelector<HTMLElement>(`[data-testid="add-account-${address}"]`)
  const badge = (address: Address) =>
    container.querySelector<HTMLElement>(`[data-testid="controlled-by-${address}"]`)
  const tooltip = (id: string) =>
    container.querySelector<HTMLElement>(`[data-tooltip-content-for="${id}"]`)
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

  beforeEach(() => {
    container = document.createElement('div')
    document.body.appendChild(container)
    root = createRoot(container)
    mockDispatch.mockClear()
    mockChain.states = {}
    mockChain.failingChainIds = []
    mockChain.providers = []
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
      const smart = smartAccount([[DERIVED_KEY, PRIVILEGE_SIGNER]])
      await mount(pickerState({ accountsOnPage: [onPage(basicAccount), onPage(smart)] }))

      expect(row(BASIC)).not.toBeNull()
      expect(row(SMART)).toBeNull()
      expect(badge(SMART)).toBeNull()
    })

    it('lists no smart account when the state turns the selection flag off', async () => {
      const smart = smartAccount([[DERIVED_KEY, PRIVILEGE_SIGNER]])
      await mount(
        pickerState({
          accountsOnPage: [onPage(basicAccount), onPage(smart)],
          shouldSelectSmartAccountAutomatically: false
        })
      )

      expect(row(BASIC)).not.toBeNull()
      expect(row(SMART)).toBeNull()
    })
  })

  describe('on a newly created seed', () => {
    const createFlow = (smart: AccountOnPage['account'], selectedAccounts: AccountOnPage[] = []) =>
      pickerState({
        accountsOnPage: [onPage(basicAccount), onPage(smart)],
        selectedAccounts,
        shouldSelectSmartAccountAutomatically: true
      })

    it('lists the smart account beside the basic account', async () => {
      await mount(createFlow(smartAccount([[DERIVED_KEY, PRIVILEGE_SIGNER]])))

      expect(row(BASIC)).not.toBeNull()
      expect(row(SMART)).not.toBeNull()
    })

    it('badges a counterfactual smart account with the key its initial privileges name, not the derived key', async () => {
      await mount(createFlow(smartAccount([[HOLDER, PRIVILEGE_SIGNER]])))

      expect(controlledBy(HOLDER)).toContain(renderShortAddress(HOLDER))
      expect(badge(SMART)?.textContent).toBe(controlledBy(HOLDER))
      expect(container.textContent).not.toContain(renderShortAddress(DERIVED_KEY))
    })

    it('ties the badge to a tooltip carrying the full address of the holder', async () => {
      await mount(createFlow(smartAccount([[HOLDER, PRIVILEGE_SIGNER]])))

      const tooltipId = badge(SMART)?.getAttribute('data-tooltip-id')
      expect(tooltipId).toBeTruthy()
      expect(tooltip(tooltipId as string)?.textContent).toBe(renderFullAddress(HOLDER))
    })

    it('passes over a key whose initial privilege is zero', async () => {
      await mount(
        createFlow(
          smartAccount([
            [DERIVED_KEY, PRIVILEGE_NONE],
            [HOLDER, PRIVILEGE_SIGNER]
          ])
        )
      )

      expect(badge(SMART)?.textContent).toBe(controlledBy(HOLDER))
    })

    it('badges a deployed smart account with the key holding the privilege on chain, not the derived key', async () => {
      // Created with the derived key, which has since lost its privilege to
      // another key. The chain lists the entry point beside the keys.
      mockChain.states[SMART] = {
        isDeployed: true,
        associatedKeys: {
          [ERC_4337_ENTRYPOINT]: PRIVILEGE_SIGNER,
          [DERIVED_KEY]: PRIVILEGE_NONE,
          [HOLDER]: PRIVILEGE_SIGNER
        }
      }
      await mount(createFlow(smartAccount([[DERIVED_KEY, PRIVILEGE_SIGNER]])))

      expect(badge(SMART)?.textContent).toBe(controlledBy(HOLDER))
      expect(container.textContent).not.toContain(renderShortAddress(DERIVED_KEY))
      expect(container.textContent).not.toContain(
        renderShortAddress(ERC_4337_ENTRYPOINT as Address)
      )
    })

    it('shows no badge on a deployed smart account whose derived key has lost its privilege', async () => {
      // The account's creation still names the derived key; the chain has revoked it.
      mockChain.states[SMART] = {
        isDeployed: true,
        associatedKeys: {
          [ERC_4337_ENTRYPOINT]: PRIVILEGE_SIGNER,
          [DERIVED_KEY]: PRIVILEGE_NONE
        }
      }
      await mount(createFlow(smartAccount([[DERIVED_KEY, PRIVILEGE_SIGNER]])))

      expect(row(SMART)).not.toBeNull()
      expect(badge(SMART)).toBeNull()
      expect(container.textContent).not.toContain(renderShortAddress(DERIVED_KEY))
    })

    it('shows no badge when no key holds a privilege on the account', async () => {
      await mount(createFlow(smartAccount([[DERIVED_KEY, PRIVILEGE_NONE]])))

      expect(row(SMART)).not.toBeNull()
      expect(badge(SMART)).toBeNull()
    })

    it('badges a deployed smart account from its creation when no network answers', async () => {
      // The chain has revoked the derived key, but no read reaches it.
      mockChain.states[SMART] = {
        isDeployed: true,
        associatedKeys: {
          [ERC_4337_ENTRYPOINT]: PRIVILEGE_SIGNER,
          [DERIVED_KEY]: PRIVILEGE_NONE
        }
      }
      mockChain.failingChainIds = mockNetworks.map(({ chainId }) => chainId)
      await mount(createFlow(smartAccount([[DERIVED_KEY, PRIVILEGE_SIGNER]])))

      expect(badge(SMART)?.textContent).toBe(controlledBy(DERIVED_KEY))
    })

    it('badges a counterfactual smart account from its creation when one network answers and another fails', async () => {
      mockChain.failingChainIds = [mockNetworks[0].chainId]
      await mount(createFlow(smartAccount([[HOLDER, PRIVILEGE_SIGNER]])))

      expect(badge(SMART)?.textContent).toBe(controlledBy(HOLDER))
    })

    it('badges a counterfactual smart account from its creation when no network answers', async () => {
      mockChain.failingChainIds = mockNetworks.map(({ chainId }) => chainId)
      await mount(createFlow(smartAccount([[HOLDER, PRIVILEGE_SIGNER]])))

      expect(badge(SMART)?.textContent).toBe(controlledBy(HOLDER))
    })

    it('releases every provider the privilege read opens, once each and after its read', async () => {
      const otherSmart = { ...smartAccount([[HOLDER, PRIVILEGE_SIGNER]]), addr: OTHER_SMART }
      mockChain.failingChainIds = [mockNetworks[1].chainId]
      await mount(
        pickerState({
          accountsOnPage: [
            onPage(basicAccount),
            onPage(smartAccount([[HOLDER, PRIVILEGE_SIGNER]])),
            { ...onPage(otherSmart), index: 1 }
          ],
          shouldSelectSmartAccountAutomatically: true
        })
      )

      const opened = mockChain.providers.map(({ chainId, accountAddrs }) => ({
        chainId,
        accountAddrs
      }))
      expect(opened).toHaveLength(mockNetworks.length * 2)
      expect(opened).toEqual(
        expect.arrayContaining(
          [SMART, OTHER_SMART].flatMap((addr) =>
            mockNetworks.map(({ chainId }) => ({ chainId, accountAddrs: [addr] }))
          )
        )
      )
      mockChain.providers.forEach((provider) => {
        expect(provider.destroyCalls).toBe(1)
        expect(provider.destroyedAfterRead).toBe(true)
      })
    })

    it('shows the smart account as selected when the picker selects it with the basic account', async () => {
      const smart = smartAccount([[DERIVED_KEY, PRIVILEGE_SIGNER]])
      await mount(createFlow(smart, [onPage(basicAccount), onPage(smart)]))

      // A press on a selected row deselects it.
      await act(async () => {
        row(SMART)?.click()
      })

      expect(mockDispatch).toHaveBeenCalledWith({
        type: 'MAIN_CONTROLLER_ACCOUNT_PICKER_DESELECT_ACCOUNT',
        params: { account: smart }
      })
    })

    it('selects the smart account on a press when the state does not select it', async () => {
      const smart = smartAccount([[DERIVED_KEY, PRIVILEGE_SIGNER]])
      await mount(createFlow(smart, [onPage(basicAccount)]))

      await act(async () => {
        row(SMART)?.click()
      })

      expect(mockDispatch).toHaveBeenCalledWith({
        type: 'MAIN_CONTROLLER_ACCOUNT_PICKER_SELECT_ACCOUNT',
        params: { account: smart }
      })
    })

    it('shows an unnamed smart account by its short address, with the full address in a tooltip', async () => {
      widenWindow()
      await mount(createFlow(smartAccount([[HOLDER, PRIVILEGE_SIGNER]])))

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
      await mount(createFlow(smartAccount([[HOLDER, PRIVILEGE_SIGNER]])))

      const lines = rowLines(SMART)
      expect(lines).toContain('savings.eth')
      expect(lines).toContain(`(${shortenAddress(SMART, 16)})`)
      expect(lines).not.toContain(SMART)
      expect(tooltip(SMART)?.textContent).toBe(SMART)
    })

    it('still shows an unnamed basic account by its full address', async () => {
      widenWindow()
      await mount(createFlow(smartAccount([[HOLDER, PRIVILEGE_SIGNER]])))

      expect(rowLines(BASIC)).toContain(BASIC)
      expect(rowLines(BASIC)).not.toContain(shortenAddress(BASIC, 16))
      expect(tooltip(BASIC)).toBeNull()
    })

    it('asks nothing about a seed', async () => {
      const smart = smartAccount([[HOLDER, PRIVILEGE_SIGNER]])
      await mount(createFlow(smart, [onPage(basicAccount), onPage(smart)]))

      expect(badge(SMART)).not.toBeNull()
      expect(container.textContent).not.toMatch(/seed/i)
      expect(container.textContent).not.toMatch(/recovery phrase/i)
    })
  })
})
