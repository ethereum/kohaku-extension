/**
 * @jest-environment jsdom
 *
 * The cancel's screen with the wallet's hooks faked: the account from the
 * search, the attempt its own fresh read finds open, the readiness of the
 * client and the account's key, the steps the send runs through, and moving
 * funds.
 */
import type { Network } from '@ambire-common/interfaces/network'
import type {
  AccountProbeProps,
  CancelScreenMocks,
  ChildrenProps,
  KeystoreKey
} from '@web/modules/social-recovery/cancel/__fixtures__/types'

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
jest.mock('@common/utils/clipboard', () => ({ setStringAsync: async () => true }))

const mockWallet: CancelScreenMocks = {
  navigate: jest.fn(),
  dispatch: jest.fn(),
  selected: null,
  client: { status: 'loading', retry: jest.fn() },
  facts: { status: 'loading', retry: jest.fn() },
  reads: null,
  storage: null
}
// The wallet's controller states keep their identity between renders, as the real hooks do.
const mockState = {
  accounts: { accounts: [] as unknown[] },
  networks: { networks: [{ chainId: 11155111n, name: 'Sepolia' }] },
  requests: { userRequests: [] }
}

jest.mock('@common/hooks/useNavigation', () => ({
  __esModule: true,
  default: () => ({ navigate: mockWallet.navigate })
}))
jest.mock('@web/hooks/useAccountsControllerState', () => ({
  __esModule: true,
  default: () => mockState.accounts
}))
jest.mock('@web/hooks/useNetworksControllerState', () => ({
  __esModule: true,
  default: () => mockState.networks
}))
jest.mock('@web/hooks/useBackgroundService', () => ({
  __esModule: true,
  default: () => ({ dispatch: mockWallet.dispatch, windowId: undefined })
}))
jest.mock('@web/hooks/useRequestsControllerState', () => ({
  __esModule: true,
  default: () => mockState.requests
}))
jest.mock('@web/hooks/useSelectedAccountControllerState', () => ({
  __esModule: true,
  default: () => ({ account: mockWallet.selected ? { addr: mockWallet.selected } : null })
}))
jest.mock('@web/modules/social-recovery/shared/client/useRecoveryClient', () => ({
  useRecoveryClient: () => mockWallet.client
}))
jest.mock('@web/modules/social-recovery/shared/client/useAccountFacts', () => ({
  useAccountFacts: () => mockWallet.facts
}))
jest.mock('@web/modules/social-recovery/shared/client/watcher-reads', () => ({
  watchedDeploymentOf: () => ({}),
  watcherConnectionFor: () => ({ reads: mockWallet.reads, providerKey: 'test', destroy: () => {} })
}))
jest.mock('@web/modules/social-recovery/shared/records/extensionStorage', () => ({
  get extensionRecordStorage() {
    return mockWallet.storage
  }
}))
jest.mock('@web/modules/social-recovery/shared/chrome/RecoveryChrome', () => ({
  __esModule: true,
  default: ({ children }: ChildrenProps) => children
}))

/* eslint-disable @typescript-eslint/no-var-requires, global-require */
const React: typeof import('react') = require('react')
const {
  MemoryRouter,
  Route,
  Routes
}: typeof import('react-router-dom') = require('react-router-dom')
const fixtures: typeof import('@web/modules/social-recovery/cancel/__fixtures__/mount') = require('@web/modules/social-recovery/cancel/__fixtures__/mount')
const harness: typeof import('@web/modules/social-recovery/watcher/__fixtures__/harness') = require('@web/modules/social-recovery/watcher/__fixtures__/harness')
const runFixtures: typeof import('@web/modules/social-recovery/cancel/__fixtures__/run') = require('@web/modules/social-recovery/cancel/__fixtures__/run')
const display: typeof import('@web/modules/social-recovery/shared/display') = require('@web/modules/social-recovery/shared/display')
const {
  WEB_ROUTES
}: typeof import('@common/modules/router/constants/common') = require('@common/modules/router/constants/common')
const {
  cancelPathOf,
  SELECT_ACCOUNT_LIMIT_MS
}: typeof import('@web/modules/social-recovery/cancel') = require('@web/modules/social-recovery/cancel')
const CancelScreen: typeof import('@web/modules/social-recovery/cancel/CancelScreen').default =
  require('@web/modules/social-recovery/cancel/CancelScreen').default
const {
  useMoveFunds
}: typeof import('@web/modules/social-recovery/cancel/useMoveFunds') = require('@web/modules/social-recovery/cancel/useMoveFunds')
/* eslint-enable @typescript-eslint/no-var-requires, global-require */

const { act, mount, t } = fixtures
const { ACCOUNT, NEW_KEY, OLD_KEY, payloadTo, memoryStorage } = harness
const { ATTEMPT, KEY, CANCEL_CALL, openChain, openOn } = runFixtures

const NETWORK = { chainId: 11155111n, name: 'Sepolia' } as Partial<Network> as Network

const readyClient = (prepareCancelByOwner: jest.Mock) => ({
  status: 'ready',
  client: { recovery: { prepareCancelByOwner } },
  // The key holds far more than the cancel's gas.
  reads: {
    estimateGas: async () => 50_000n,
    gasPrice: async () => 1n,
    nativeBalance: async () => 1_000_000_000_000_000_000n
  },
  receipts: { blockNumber: async () => 1, wait: jest.fn() },
  retry: jest.fn()
})

const readyFacts = (key?: KeystoreKey) => ({
  status: 'ready',
  facts: {
    account: { ...harness.listed(ACCOUNT), associatedKeys: [KEY] },
    network: NETWORK,
    deployed: true,
    state: { nonce: 0n, isDeployed: true },
    ...(key ? { key } : {})
  },
  retry: jest.fn()
})

const at = (path: string) => (
  <MemoryRouter
    initialEntries={[path]}
    future={{ v7_startTransition: true, v7_relativeSplatPath: true }}
  >
    <Routes>
      <Route path="*" element={<CancelScreen />} />
    </Routes>
  </MemoryRouter>
)

describe("the cancel's screen", () => {
  let view: Awaited<ReturnType<typeof mount>> | undefined
  let prepare: jest.Mock

  beforeEach(() => {
    const chain = openChain()
    mockWallet.reads = chain.reads
    mockWallet.storage = memoryStorage()
    mockWallet.navigate = jest.fn()
    mockWallet.dispatch = jest.fn()
    mockWallet.selected = null
    prepare = jest.fn(async () => CANCEL_CALL)
    mockWallet.client = readyClient(prepare)
    mockWallet.facts = readyFacts({ addr: KEY, type: 'internal' })
    mockState.accounts.accounts = [harness.listed(ACCOUNT)]
  })

  afterEach(() => {
    view?.unmount()
    view = undefined
  })

  it('goes back to the dashboard on a malformed account, and builds nothing', async () => {
    view = await mount(at(`/${WEB_ROUTES.socialRecoveryCancel}?account=0x1234`))

    expect(mockWallet.navigate).toHaveBeenCalledWith(`/${WEB_ROUTES.dashboard}`, { replace: true })
    expect(view.byTestId('cancel-confirm')).toBeNull()
    expect(view.byTestId('cancel-loading')).toBeNull()
  })

  it('offers the attempt its own read finds open', async () => {
    view = await mount(at(cancelPathOf(ACCOUNT)))

    expect(view.textOf('cancel-new-key')).toBe(display.renderFullAddress(NEW_KEY))
    expect(view.isDisabled('cancel-send')).toBe(false)
    expect(prepare).not.toHaveBeenCalled()
  })

  it('offers a newer attempt the fresh read finds open', async () => {
    const chain = openChain()
    openOn(chain, ATTEMPT + 1n, payloadTo(OLD_KEY))
    mockWallet.reads = chain.reads
    view = await mount(at(cancelPathOf(ACCOUNT)))

    expect(view.byTestId('cancel-ended')).toBeNull()
    expect(view.textOf('cancel-new-key')).toBe(display.renderFullAddress(OLD_KEY))
  })

  it('reads view-only where the keystore holds no key of the account', async () => {
    mockWallet.facts = readyFacts()
    view = await mount(at(cancelPathOf(ACCOUNT)))

    expect(view.isDisabled('cancel-send')).toBe(true)
    expect(view.textOf('cancel-view-only')).toBe(t('socialRecovery.cancel.confirm.viewOnly'))
  })

  it('reads the client failed, with a retry that builds it again', async () => {
    const retry = jest.fn()
    mockWallet.client = { status: 'failed', error: new Error('down'), retry }
    view = await mount(at(cancelPathOf(ACCOUNT)))

    expect(view.isDisabled('cancel-send')).toBe(true)
    expect(view.textOf('cancel-ready-failed-line')).toBe(
      t('socialRecovery.cancel.confirm.clientFailed')
    )
    await view.press('cancel-ready-retry')
    expect(retry).toHaveBeenCalledTimes(1)
  })
})

describe('moving funds', () => {
  let view: Awaited<ReturnType<typeof mount>> | undefined
  let latest: ReturnType<typeof useMoveFunds> | undefined

  const Probe = ({ account }: AccountProbeProps) => {
    latest = useMoveFunds(account)
    return null
  }

  beforeEach(() => {
    mockWallet.navigate = jest.fn()
    mockWallet.dispatch = jest.fn()
    mockWallet.selected = null
    latest = undefined
  })

  afterEach(() => {
    view?.unmount()
    view = undefined
    jest.useRealTimers()
  })

  it('selects the account, then opens the transfer screen once the wallet reports it', async () => {
    view = await mount(<Probe account={ACCOUNT} />)
    act(() => latest!.move())

    expect(mockWallet.dispatch).toHaveBeenCalledWith({
      type: 'MAIN_CONTROLLER_SELECT_ACCOUNT',
      params: { accountAddr: ACCOUNT }
    })
    expect(latest!.busy).toBe(true)
    expect(mockWallet.navigate).not.toHaveBeenCalled()

    mockWallet.selected = ACCOUNT
    await view.render(<Probe account={ACCOUNT} />)
    expect(mockWallet.navigate).toHaveBeenCalledWith(`/${WEB_ROUTES.transfer}`)
    expect(latest!.busy).toBe(false)
  })

  it('opens nothing, logs and frees the action where the wallet does not select in time', async () => {
    const logged = jest.spyOn(console, 'error').mockImplementation(() => undefined)
    view = await mount(<Probe account={ACCOUNT} />)
    // The selection's wait runs on the fake clock from here.
    jest.useFakeTimers()
    act(() => latest!.move())
    expect(latest!.busy).toBe(true)

    act(() => {
      jest.advanceTimersByTime(SELECT_ACCOUNT_LIMIT_MS)
    })
    expect(latest!.busy).toBe(false)
    expect(mockWallet.navigate).not.toHaveBeenCalled()
    expect(logged).toHaveBeenCalledTimes(1)
    logged.mockRestore()

    act(() => latest!.move())
    expect(mockWallet.dispatch).toHaveBeenCalledTimes(2)
  })
})

// The run this send starts outlives the screen, one per account, so it runs after every other mount of the account.
describe("the cancel's send", () => {
  let view: Awaited<ReturnType<typeof mount>> | undefined

  afterEach(() => {
    view?.unmount()
    view = undefined
  })

  it('sends through the steps it built: one request in the wallet queue, for the account and the prepared call', async () => {
    mockWallet.reads = openChain().reads
    mockWallet.storage = memoryStorage()
    mockWallet.navigate = jest.fn()
    mockWallet.dispatch = jest.fn()
    mockWallet.selected = ACCOUNT
    const prepare = jest.fn(async () => CANCEL_CALL)
    mockWallet.client = readyClient(prepare)
    mockWallet.facts = readyFacts({ addr: KEY, type: 'internal' })
    mockState.accounts.accounts = [harness.listed(ACCOUNT)]
    view = await mount(at(cancelPathOf(ACCOUNT)))

    await view.press('cancel-send')
    await fixtures.settle()

    expect(prepare).toHaveBeenCalledTimes(1)
    const added = mockWallet.dispatch.mock.calls
      .map(([action]) => action)
      .filter(({ type }) => type === 'REQUESTS_CONTROLLER_ADD_USER_REQUEST')
    expect(added).toHaveLength(1)
    expect(added[0].params.userRequest.meta.accountAddr).toBe(ACCOUNT)
    expect(added[0].params.userRequest.action).toEqual({
      kind: 'calls',
      calls: [{ to: CANCEL_CALL.target, value: CANCEL_CALL.value, data: CANCEL_CALL.data }]
    })
    expect(view.byTestId('cancel-in-progress')).not.toBeNull()
  })
})
