/**
 * @jest-environment jsdom
 */
import * as React from 'react'
import { createRoot, Root } from 'react-dom/client'

import type { Account, AccountStates } from '@ambire-common/interfaces/account'
import useAccountsControllerState from '@web/hooks/useAccountsControllerState'
import useBackgroundService from '@web/hooks/useBackgroundService'
import useKeystoreControllerState from '@web/hooks/useKeystoreControllerState'
import useNetworksControllerState from '@web/hooks/useNetworksControllerState'
import useProvidersControllerState from '@web/hooks/useProvidersControllerState'
import type { Address } from '@web/modules/social-recovery/sdk-interfaces'
import type { AccountFactsResult } from '@web/modules/social-recovery/shared/client/types'
import { useAccountFacts } from '@web/modules/social-recovery/shared/client/useAccountFacts'

jest.mock('@web/hooks/useAccountsControllerState', () => ({ __esModule: true, default: jest.fn() }))
jest.mock('@web/hooks/useKeystoreControllerState', () => ({ __esModule: true, default: jest.fn() }))
jest.mock('@web/hooks/useNetworksControllerState', () => ({ __esModule: true, default: jest.fn() }))
jest.mock('@web/hooks/useProvidersControllerState', () => ({
  __esModule: true,
  default: jest.fn()
}))
jest.mock('@web/hooks/useBackgroundService', () => ({ __esModule: true, default: jest.fn() }))
// viem builds a TextEncoder and a TextDecoder when either entry loads, which
// jsdom lacks: Node's own are installed first, whichever entry loads first.
jest.mock('viem', () => {
  // eslint-disable-next-line global-require
  const { TextDecoder, TextEncoder } = require('util')
  Object.assign(globalThis, { TextDecoder, TextEncoder })
  return jest.requireActual('viem')
})
jest.mock('viem/chains', () => {
  // eslint-disable-next-line global-require
  const { TextDecoder, TextEncoder } = require('util')
  Object.assign(globalThis, { TextDecoder, TextEncoder })
  return jest.requireActual('viem/chains')
})

// React 18.3.0 exports `act` only as `unstable_act`; the react-dom re-export warns on every call.
const act: typeof React.act =
  (React as unknown as { act?: typeof React.act }).act ??
  (React as unknown as { unstable_act: typeof React.act }).unstable_act
;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true

const SEPOLIA = 11155111
const ACCOUNT = '0x00000000000000000000000000000000000a11ce' as Address
const OTHER_ACCOUNT = '0x00000000000000000000000000000000000b0b00' as Address
const KEY = '0x00000000000000000000000000000000000000c1' as Address

const LISTED: Account = {
  addr: ACCOUNT,
  associatedKeys: [KEY],
  initialPrivileges: [],
  creation: {
    factoryAddr: `0x${'fa'.repeat(20)}`,
    bytecode: '0x6000',
    salt: `0x${'00'.repeat(32)}`
  },
  preferences: { label: 'Account 1', pfp: ACCOUNT }
}

const OTHER_LISTED: Account = {
  ...LISTED,
  addr: OTHER_ACCOUNT,
  preferences: { label: 'Account 2', pfp: OTHER_ACCOUNT }
}

/** One account's state on the recovery chain, as the background pushes it. */
const onChain = (
  addr: Address,
  isDeployed: boolean,
  members: { nonce?: bigint; balance?: bigint; currentBlock?: bigint } = {}
) => ({
  [String(SEPOLIA)]: {
    accountAddr: addr,
    isDeployed,
    isEOA: false,
    isV2: true,
    isSmarterEoa: false,
    nonce: 0n,
    balance: 0n,
    currentBlock: 7_000_000n,
    ...members
  }
})

const stateOf = (isDeployed: boolean): AccountStates =>
  ({ [ACCOUNT]: onChain(ACCOUNT, isDeployed) } as never)

const NETWORK = { chainId: BigInt(SEPOLIA), name: 'Sepolia' }

const accountsState = useAccountsControllerState as jest.Mock
const keystoreState = useKeystoreControllerState as jest.Mock
const networksState = useNetworksControllerState as jest.Mock
const providersState = useProvidersControllerState as jest.Mock
const backgroundService = useBackgroundService as jest.Mock
const dispatch = jest.fn()

const REFRESH = {
  type: 'ACCOUNTS_CONTROLLER_UPDATE_ACCOUNT_STATE',
  params: { addr: ACCOUNT, chainIds: [BigInt(SEPOLIA)] }
}

let root: Root
let latest: AccountFactsResult | undefined

const Probe = ({ account }: { account: Address | undefined }) => {
  latest = useAccountFacts(account)
  return null
}

const render = async (account: Address | null = ACCOUNT) => {
  await act(async () => {
    root.render(React.createElement(Probe, { account: account ?? undefined }))
  })
}

/** What the controller states hand the hook; a test changes it and renders again. */
let wallet: {
  accounts?: Account[]
  accountStates?: AccountStates
  areAccountStatesLoading?: boolean
  keys?: { addr: string; type: string }[]
  networks?: object[]
  providers?: Record<string, { isWorking?: boolean }>
}

beforeEach(() => {
  wallet = {
    accounts: [LISTED],
    accountStates: stateOf(true),
    areAccountStatesLoading: false,
    keys: [{ addr: KEY, type: 'internal' }],
    networks: [NETWORK],
    providers: { [String(SEPOLIA)]: { isWorking: true } }
  }
  accountsState.mockImplementation(() => ({
    accounts: wallet.accounts,
    accountStates: wallet.accountStates,
    areAccountStatesLoading: wallet.areAccountStatesLoading
  }))
  keystoreState.mockImplementation(() => ({ keys: wallet.keys }))
  networksState.mockImplementation(() => ({ networks: wallet.networks }))
  providersState.mockImplementation(() => ({ providers: wallet.providers }))
  backgroundService.mockImplementation(() => ({ dispatch }))
  root = createRoot(document.createElement('div'))
  latest = undefined
})

afterEach(async () => {
  await act(async () => root.unmount())
  jest.clearAllMocks()
})

describe('useAccountFacts', () => {
  it("hands the selected account's facts from the accounts, keystore and networks states", async () => {
    await render()
    expect(latest).toMatchObject({
      status: 'ready',
      facts: {
        account: LISTED,
        deployed: true,
        key: { addr: KEY, type: 'internal' },
        creation: { factory: LISTED.creation?.factoryAddr, salt: LISTED.creation?.salt }
      }
    })
  })

  it('reads as loading until each state arrives, then ready', async () => {
    wallet.keys = undefined
    await render()
    expect(latest).toMatchObject({ status: 'loading' })
    wallet.keys = [{ addr: KEY, type: 'internal' }]
    await render()
    expect(latest?.status).toBe('ready')
  })

  it('reads the account again when its state on the chain changes', async () => {
    wallet.accountStates = stateOf(false)
    await render()
    expect(latest?.status === 'ready' && latest.facts.deployed).toBe(false)
    wallet.accountStates = stateOf(true)
    await render()
    expect(latest?.status === 'ready' && latest.facts.deployed).toBe(true)
  })

  it('reads a view-only account with no key, and an unlisted one as not listed', async () => {
    wallet.keys = []
    await render()
    expect(latest?.status === 'ready' && latest.facts).not.toHaveProperty('key')
    await render(OTHER_ACCOUNT)
    expect(latest).toMatchObject({ status: 'unavailable', cause: 'not-listed' })
  })

  it('reads as loading with no account selected', async () => {
    await render(null)
    expect(latest).toMatchObject({ status: 'loading' })
  })

  it('reads as no network where the wallet holds none for the recovery chain, and asks for no refresh', async () => {
    wallet.accountStates = {}
    wallet.networks = [{ chainId: 1n, name: 'Ethereum' }]
    await render()
    expect(latest).toMatchObject({ status: 'unavailable', cause: 'no-network' })
    expect(dispatch).not.toHaveBeenCalled()
  })

  it('hands the same reading while nothing it reads changed', async () => {
    await render()
    const first = latest
    await render()
    expect(latest).toBe(first)
  })

  it('hands a new reading with the new label after the account is renamed', async () => {
    await render()
    const first = latest
    wallet.accounts = [{ ...LISTED, preferences: { ...LISTED.preferences, label: 'Savings' } }]
    await render()
    expect(latest).not.toBe(first)
    expect(latest).toMatchObject({
      status: 'ready',
      facts: { account: { preferences: { label: 'Savings' } } }
    })
  })

  it("hands the same reading after a change of the account's picture, which it does not read", async () => {
    await render()
    const first = latest
    wallet.accounts = [{ ...LISTED, preferences: { ...LISTED.preferences, pfp: OTHER_ACCOUNT } }]
    await render()
    expect(latest).toBe(first)
  })
})

describe('useAccountFacts, where the wallet holds no state for the listed account on the recovery chain', () => {
  beforeEach(() => {
    wallet.accountStates = {}
  })

  /** The accounts state reports its account states loading, then no longer loading. */
  const loadingRan = async () => {
    wallet.areAccountStatesLoading = true
    await render()
    wallet.areAccountStatesLoading = false
    await render()
  }

  it("asks the wallet once to refresh the account's state on the chain, and reads as loading", async () => {
    await render()
    expect(dispatch).toHaveBeenCalledTimes(1)
    expect(dispatch).toHaveBeenCalledWith(REFRESH)
    expect(latest).toMatchObject({ status: 'loading' })
    await render()
    await render()
    expect(dispatch).toHaveBeenCalledTimes(1)
  })

  it('asks for no refresh for an account whose state the wallet holds, nor for one it does not list', async () => {
    wallet.accountStates = stateOf(true)
    await render()
    await render()
    await render(OTHER_ACCOUNT)
    expect(dispatch).not.toHaveBeenCalled()
  })

  it('reads as ready once the state arrives, and asks for nothing more', async () => {
    await render()
    wallet.areAccountStatesLoading = true
    await render()
    wallet.accountStates = stateOf(false)
    wallet.areAccountStatesLoading = false
    await render()
    expect(latest).toMatchObject({ status: 'ready', facts: { deployed: false } })
    expect(dispatch).toHaveBeenCalledTimes(1)
  })

  it('asks once more by itself where the refresh ran and ended with no state, and reads as loading meanwhile', async () => {
    await render()
    await loadingRan()
    expect(dispatch).toHaveBeenCalledTimes(2)
    expect(dispatch).toHaveBeenLastCalledWith(REFRESH)
    expect(latest).toMatchObject({ status: 'loading' })
    await render()
    expect(dispatch).toHaveBeenCalledTimes(2)
    expect(latest).toMatchObject({ status: 'loading' })
  })

  it('reads as ready where the second refresh brings the state', async () => {
    await render()
    await loadingRan()
    wallet.areAccountStatesLoading = true
    await render()
    wallet.accountStates = stateOf(true)
    wallet.areAccountStatesLoading = false
    await render()
    expect(latest).toMatchObject({ status: 'ready', facts: { deployed: true } })
    expect(dispatch).toHaveBeenCalledTimes(2)
  })

  it('reads as ready where the state arrives before the second refresh is seen running', async () => {
    await render()
    await loadingRan()
    wallet.accountStates = stateOf(false)
    await render()
    expect(latest).toMatchObject({ status: 'ready', facts: { deployed: false } })
    expect(dispatch).toHaveBeenCalledTimes(2)
  })

  it('reads as unread once the second refresh ran and ended with no state, and asks no more', async () => {
    await render()
    await loadingRan()
    expect(latest).toMatchObject({ status: 'loading' })
    await loadingRan()
    expect(latest).toMatchObject({ status: 'unavailable', cause: 'state-unread' })
    expect(dispatch).toHaveBeenCalledTimes(2)
    await loadingRan()
    await loadingRan()
    expect(latest).toMatchObject({ status: 'unavailable', cause: 'state-unread' })
    expect(dispatch).toHaveBeenCalledTimes(2)
  })

  it('stays loading while the accounts state never reported the refresh running', async () => {
    await render()
    await render()
    expect(latest).toMatchObject({ status: 'loading' })
  })

  it("reads as unread where the chain's provider reports it is not working", async () => {
    wallet.providers = { [String(SEPOLIA)]: { isWorking: false } }
    await render()
    expect(latest).toMatchObject({ status: 'unavailable', cause: 'state-unread' })
  })

  it('reads as ready where the refresh brings the state while another load was already running at the request', async () => {
    wallet.areAccountStatesLoading = true
    await render()
    await render()
    wallet.accountStates = stateOf(true)
    await render()
    expect(latest).toMatchObject({ status: 'ready', facts: { deployed: true } })
    wallet.areAccountStatesLoading = false
    await render()
    expect(latest?.status).toBe('ready')
  })

  it('asks again at each retry, at most twice each time, and reads the outcome of that refresh', async () => {
    await render()
    await loadingRan()
    await loadingRan()
    expect(latest).toMatchObject({ status: 'unavailable', cause: 'state-unread' })

    await act(async () => latest?.retry())
    expect(dispatch).toHaveBeenCalledTimes(3)
    expect(dispatch).toHaveBeenLastCalledWith(REFRESH)
    expect(latest).toMatchObject({ status: 'loading' })

    await loadingRan()
    expect(dispatch).toHaveBeenCalledTimes(4)
    expect(latest).toMatchObject({ status: 'loading' })
    await loadingRan()
    expect(latest).toMatchObject({ status: 'unavailable', cause: 'state-unread' })
    await loadingRan()
    expect(dispatch).toHaveBeenCalledTimes(4)

    await act(async () => latest?.retry())
    expect(dispatch).toHaveBeenCalledTimes(5)
    wallet.accountStates = stateOf(true)
    await render()
    expect(latest?.status).toBe('ready')
  })
})

describe('useAccountFacts hands one reading object while nothing a screen reads changed', () => {
  beforeEach(() => {
    wallet.accounts = [LISTED, OTHER_LISTED]
    wallet.accountStates = {
      [ACCOUNT]: onChain(ACCOUNT, true),
      [OTHER_ACCOUNT]: onChain(OTHER_ACCOUNT, true)
    } as never
  })

  const push = async (states: AccountStates) => {
    wallet.accountStates = states
    await render()
  }

  it("keeps the object across a push that changes another account's state", async () => {
    await render()
    const first = latest
    await push({
      [ACCOUNT]: onChain(ACCOUNT, true),
      [OTHER_ACCOUNT]: onChain(OTHER_ACCOUNT, false, { nonce: 3n, balance: 10n ** 18n })
    } as never)
    expect(latest).toBe(first)
  })

  it("keeps the object across a push that changes this account's balance or block", async () => {
    await render()
    const first = latest
    await push({
      [ACCOUNT]: onChain(ACCOUNT, true, { balance: 10n ** 18n, currentBlock: 7_000_009n }),
      [OTHER_ACCOUNT]: onChain(OTHER_ACCOUNT, true)
    } as never)
    expect(latest).toBe(first)
  })

  it("hands a new object, with the new state, where the account's code or its nonce changes", async () => {
    await render()
    const first = latest
    await push({ [ACCOUNT]: onChain(ACCOUNT, false) } as never)
    expect(latest).not.toBe(first)
    expect(latest?.status === 'ready' && latest.facts.deployed).toBe(false)
    const second = latest
    await push({ [ACCOUNT]: onChain(ACCOUNT, false, { nonce: 1n }) } as never)
    expect(latest).not.toBe(second)
    expect(latest?.status === 'ready' && latest.facts.state.nonce).toBe(1n)
  })

  it('hands a new object where the held key changes', async () => {
    await render()
    const first = latest
    wallet.keys = [{ addr: KEY, type: 'ledger' }]
    await render()
    expect(latest).not.toBe(first)
    expect(latest?.status === 'ready' && latest.facts.key).toEqual({ addr: KEY, type: 'ledger' })
  })

  it('hands a new object where the creation record changes', async () => {
    await render()
    const first = latest
    wallet.accounts = [
      { ...LISTED, creation: { ...LISTED.creation!, salt: `0x${'01'.repeat(32)}` } },
      OTHER_LISTED
    ]
    await render()
    expect(latest).not.toBe(first)
  })
})
