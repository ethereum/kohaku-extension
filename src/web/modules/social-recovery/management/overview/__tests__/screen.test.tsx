/**
 * @jest-environment jsdom
 *
 * The overview's screen over a client built over the stand-in's chain, with
 * the wallet's hooks faked and the records on a storage in memory: a write
 * of the overview stored on this device as in flight opens its step again,
 * which follows it with nothing sent and hands the overview back its read
 * once the chain agrees; a write another screen stored opens no step.
 */
import type { Account } from '@ambire-common/interfaces/account'
import type { KeyHandle } from '@web/modules/social-recovery/shared/client'
import type {
  ChildrenProps,
  DispatchedAction,
  OverviewMocks
} from '@web/modules/social-recovery/management/overview/__fixtures__/types'

jest.mock('viem', () => {
  // eslint-disable-next-line global-require
  const { TextDecoder, TextEncoder } = require('util')
  Object.assign(globalThis, { TextDecoder, TextEncoder })
  return jest.requireActual('viem')
})
jest.mock('@common/utils/clipboard', () => ({ setStringAsync: async () => true }))
jest.mock('@common/components/Spinner', () => ({ __esModule: true, default: () => null }))

const mockWallet: OverviewMocks = {
  account: undefined,
  facts: null,
  client: null,
  port: null,
  storage: null,
  watched: undefined
}
// The wallet's controller states keep their identity between renders, as the real hooks do.
const mockState = {
  accounts: { accounts: [] as unknown[] },
  keystore: { keys: [] as unknown[] },
  networks: { networks: [] as unknown[] },
  requests: { userRequests: [] as unknown[] },
  selected: { account: null },
  navigation: { navigate: jest.fn() },
  background: {
    dispatch: jest.fn((action: DispatchedAction) => {
      if (action.type === 'INIT_CONTROLLER_STATE') {
        Promise.resolve()
          .then(() => {
            const { default: eventBus } = jest.requireActual(
              '@web/extension-services/event/eventBus'
            )
            eventBus.emit('signAccountOp', null)
          })
          .catch(() => undefined)
      }
    }),
    windowId: undefined
  }
}
jest.mock('@common/hooks/useNavigation', () => ({
  __esModule: true,
  default: () => mockState.navigation
}))
jest.mock('@web/hooks/useAccountsControllerState', () => ({
  __esModule: true,
  default: () => mockState.accounts
}))
jest.mock('@web/hooks/useKeystoreControllerState', () => ({
  __esModule: true,
  default: () => mockState.keystore
}))
jest.mock('@web/hooks/useNetworksControllerState', () => ({
  __esModule: true,
  default: () => mockState.networks
}))
jest.mock('@web/hooks/useBackgroundService', () => ({
  __esModule: true,
  default: () => mockState.background
}))
jest.mock('@web/hooks/useRequestsControllerState', () => ({
  __esModule: true,
  default: () => mockState.requests
}))
jest.mock('@web/hooks/useSelectedAccountControllerState', () => ({
  __esModule: true,
  default: () => mockState.selected
}))
jest.mock('@web/modules/social-recovery/shared/chrome/useSetupAccount', () => ({
  __esModule: true,
  default: () => ({
    account: mockWallet.account,
    differs: false,
    selected: undefined,
    switchToSelected: () => {}
  })
}))
jest.mock('@web/modules/social-recovery/shared/chrome/SetupChrome', () => ({
  __esModule: true,
  default: ({ children }: ChildrenProps) => children
}))
jest.mock('@web/modules/social-recovery/cancel/AccountAttemptBanner', () => ({
  __esModule: true,
  default: () => null
}))
// Each mounted reader of the watcher's record, so a test can push the record's next state.
const mockWatchers = new Set<(update: (round: number) => number) => void>()
jest.mock('@web/modules/social-recovery/watcher/useWatchedAttempt', () => ({
  useWatchedAttempt: () => {
    // eslint-disable-next-line global-require
    const { useEffect, useState } = require('react')
    const [, bump] = useState(0)
    useEffect(() => {
      mockWatchers.add(bump)
      return () => {
        mockWatchers.delete(bump)
      }
    }, [])
    return mockWallet.watched ?? { status: 'unwatched' }
  }
}))
const mockUseRecoveryClient = jest.fn(() => mockWallet.client)
jest.mock('@web/modules/social-recovery/shared/client/useRecoveryClient', () => ({
  useRecoveryClient: () => mockUseRecoveryClient()
}))
jest.mock('@web/modules/social-recovery/shared/client/useAccountFacts', () => ({
  useAccountFacts: () => mockWallet.facts
}))
jest.mock('@web/modules/social-recovery/shared/client', () => ({
  ...jest.requireActual('@web/modules/social-recovery/shared/client'),
  createSendPort: () => mockWallet.port
}))
jest.mock('@web/modules/social-recovery/shared/records/extensionStorage', () => ({
  get extensionRecordStorage() {
    return mockWallet.storage
  }
}))

/* eslint-disable @typescript-eslint/no-var-requires, global-require */
const React: typeof import('react') = require('react')
const harness: typeof import('@web/modules/social-recovery/management/overview/__fixtures__/harness') = require('@web/modules/social-recovery/management/overview/__fixtures__/harness')
const armHarness: typeof import('@web/modules/social-recovery/setup/arm/__tests__/harness') = require('@web/modules/social-recovery/setup/arm/__tests__/harness')
const {
  makeStorage
}: typeof import('@web/modules/social-recovery/shared/records/__fixtures__/storage') = require('@web/modules/social-recovery/shared/records/__fixtures__/storage')
const {
  newSendRequestId
}: typeof import('@web/modules/social-recovery/shared/client') = require('@web/modules/social-recovery/shared/client')
const {
  REMOVAL_DRAFT
}: typeof import('@web/modules/social-recovery/management/overview/constants') = require('@web/modules/social-recovery/management/overview/constants')
const {
  WEB_ROUTES
}: typeof import('@common/modules/router/constants/common') = require('@common/modules/router/constants/common')
const {
  reauthorizeDraftOf
}: typeof import('@web/modules/social-recovery/management/overview/readings') = require('@web/modules/social-recovery/management/overview/readings')
const {
  requestIdOf
}: typeof import('@web/modules/social-recovery/shared/writes') = require('@web/modules/social-recovery/shared/writes')
const {
  deferred
}: typeof import('@web/modules/social-recovery/shared/chrome/__fixtures__/deferred') = require('@web/modules/social-recovery/shared/chrome/__fixtures__/deferred')
const OverviewScreen: typeof import('@web/modules/social-recovery/management/overview/OverviewScreen').default =
  require('@web/modules/social-recovery/management/overview/OverviewScreen').default
const display: typeof import('@web/modules/social-recovery/shared/display') = require('@web/modules/social-recovery/shared/display')
/* eslint-enable @typescript-eslint/no-var-requires, global-require */

const {
  mount,
  t,
  worldAt,
  readyOver,
  readyFactsOf,
  receiptsOver,
  sendPortOver,
  storeOverviewWrite,
  act,
  settle,
  GAS_READS,
  CHAIN_ID,
  CONFIGURATION
} = harness

const O = 'socialRecovery.management.overview'

let seed = 0x5c0
let account: Account
let key: KeyHandle
let address: `0x${string}`

beforeEach(async () => {
  // Each test runs on an account of its own, so no run held for one account meets another test.
  seed += 1
  ;({ account, key } = await armHarness.keyedAccount(seed))
  address = account.addr as `0x${string}`
  mockWallet.account = address
  mockWallet.facts = readyFactsOf(account, key)
})

describe("the overview's screen", () => {
  let view: Awaited<ReturnType<typeof mount>> | undefined

  afterEach(() => {
    view?.unmount()
    view = undefined
  })

  /** A dormant setup on the chain, and the client and the storage the screen reads it through. */
  const dormantWorld = async () => {
    const storage = makeStorage()
    mockWallet.storage = storage
    const world = await worldAt('public', address, storage)
    world.chain.setAuthorized(false)
    return world
  }

  it('opens a stored clear again, follows it with nothing sent, and reads the chain once it agrees', async () => {
    const world = await dormantWorld()
    await storeOverviewWrite(world, 'clear', address)
    world.chain.clearSetup()
    const port = sendPortOver()
    const receipts = receiptsOver()
    mockWallet.port = port
    mockWallet.client = readyOver(world.client, GAS_READS, receipts)

    view = await mount(<OverviewScreen />)

    expect(receipts.wait).toHaveBeenCalledWith(armHarness.TX_HASH, armHarness.START_BLOCK)
    expect(view.byTestId('overview-step-clear')).toBeNull()
    expect(view.byTestId('overview-empty')).not.toBeNull()
    expect(port.sendAccountBatch).not.toHaveBeenCalled()
    const stored = await world.records.saveInFlight(CHAIN_ID, address).read()
    expect(stored.status).toBe('absent')
  })

  it('keeps the step of a stored clear open while its receipt is awaited, with no start offered', async () => {
    const world = await dormantWorld()
    await storeOverviewWrite(world, 'clear', address)
    const port = sendPortOver()
    const receipts = receiptsOver()
    receipts.wait.mockImplementation(() => armHarness.pending())
    mockWallet.port = port
    mockWallet.client = readyOver(world.client, GAS_READS, receipts)

    view = await mount(<OverviewScreen />)

    expect(view.byTestId('overview-step-clear')).not.toBeNull()
    expect(view.byTestId('overview-step-submitting')).not.toBeNull()
    expect(view.byTestId('overview-step-start')).toBeNull()
    expect(view.byTestId('overview-dormant')).toBeNull()
    expect(port.sendAccountBatch).not.toHaveBeenCalled()
  })

  it('takes up a re-authorize sent before a reload: its step reopens and follows it to the landing with no second send', async () => {
    const world = await dormantWorld()
    const draft = reauthorizeDraftOf(CONFIGURATION, 'public')
    const prepared = await world.client.setup.prepareCommitSetup(draft)
    const inFlight = world.records.saveInFlight(CHAIN_ID, address)
    const requestId = requestIdOf('reauthorize')
    await inFlight.claim({
      draft,
      prepared,
      requestId,
      claimedAt: Date.now(),
      startBlock: armHarness.START_BLOCK
    })
    await inFlight.markSent(requestId, armHarness.TX_HASH, armHarness.START_BLOCK)
    const port = sendPortOver()
    const receipts = receiptsOver()
    const landing = deferred<ReturnType<typeof armHarness.landedReceipt>>()
    receipts.wait.mockImplementation(() => landing.promise)
    mockWallet.port = port
    mockWallet.client = readyOver(world.client, GAS_READS, receipts)

    view = await mount(<OverviewScreen />)

    expect(view.byTestId('overview-step-reauthorize')).not.toBeNull()
    expect(view.byTestId('overview-step-submitting')).not.toBeNull()
    expect(view.byTestId('overview-step-start')).toBeNull()
    expect(receipts.wait).toHaveBeenCalledWith(armHarness.TX_HASH, armHarness.START_BLOCK)

    world.chain.land(prepared)
    await act(async () => {
      landing.resolve(armHarness.landedReceipt(armHarness.TX_HASH))
    })
    await settle()

    expect(view.byTestId('overview-step-reauthorize')).toBeNull()
    expect(view.byTestId('overview-dormant')).toBeNull()
    expect(port.sendAccountBatch).not.toHaveBeenCalled()
    expect((await inFlight.read()).status).toBe('absent')
  })

  it("starts the mirror's removal of the authorization as soon as its action opens the step, and sends once", async () => {
    const storage = makeStorage()
    mockWallet.storage = storage
    const world = await worldAt('public', address, storage)
    world.chain.clearSetup()
    world.chain.setAuthorized(true)
    const port = sendPortOver(() => world.chain.setAuthorized(false))
    const receipts = receiptsOver()
    const landing = deferred<ReturnType<typeof armHarness.landedReceipt>>()
    receipts.wait.mockImplementation(() => landing.promise)
    mockWallet.port = port
    mockWallet.client = readyOver(world.client, GAS_READS, receipts)

    view = await mount(<OverviewScreen />)
    expect(view.byTestId('overview-mirror')).not.toBeNull()

    await view.press('overview-remove-authorization')
    expect(view.byTestId('overview-step-removeAuthorization')).not.toBeNull()
    expect(view.byTestId('overview-step-start')).toBeNull()
    expect(port.sendAccountBatch).toHaveBeenCalledTimes(1)

    await act(async () => {
      landing.resolve(armHarness.landedReceipt(armHarness.TX_HASH))
    })
    await settle()
    expect(view.byTestId('overview-step-removeAuthorization')).toBeNull()
    expect(view.byTestId('overview-mirror')).toBeNull()
    expect(port.sendAccountBatch).toHaveBeenCalledTimes(1)
  })

  const OTHER_WRITES = [
    {
      named: "the editor's change",
      mark: ':manage-edit',
      route: WEB_ROUTES.socialRecoveryManageReview,
      line: 'socialRecovery.management.overview.writes.editInFlight',
      link: 'socialRecovery.management.overview.writes.openReview'
    },
    {
      named: "the editor's removal",
      mark: ':manage-remove',
      route: WEB_ROUTES.socialRecoveryManageRemove,
      line: 'socialRecovery.management.overview.writes.removeInFlight',
      link: 'socialRecovery.management.overview.writes.openRemove'
    },
    {
      named: "the setup flow's save",
      mark: '',
      route: WEB_ROUTES.socialRecoverySetupSave,
      line: 'socialRecovery.management.overview.writes.saveInFlight',
      link: 'socialRecovery.management.overview.writes.openSave'
    }
  ]
  OTHER_WRITES.forEach(({ named, mark, route, line, link }) =>
    it(`leaves a stored write of ${named} to its own screen and points there under the overview's title and status, with no path or step of its own`, async () => {
      const world = await dormantWorld()
      const prepared = await world.client.setup.prepareClearSetup()
      await world.records.saveInFlight(CHAIN_ID, address).claim({
        draft: REMOVAL_DRAFT,
        prepared,
        requestId: `${newSendRequestId()}${mark}`,
        claimedAt: Date.now()
      })
      const port = sendPortOver()
      const receipts = receiptsOver()
      mockWallet.port = port
      mockWallet.client = readyOver(world.client, GAS_READS, receipts)
      mockState.navigation.navigate.mockClear()

      view = await mount(<OverviewScreen />)

      expect(view.textOf('overview-write-elsewhere')).toContain(t(line))
      expect(view.textOf('overview-write-elsewhere')).not.toContain(
        t('socialRecovery.management.overview.writes.inFlightElsewhere')
      )
      expect(view.textOf('overview-open-elsewhere')).toContain(t(link))
      expect(view.textOf('overview-title')).toContain(t('socialRecovery.management.overview.title'))
      expect(view.byTestId('overview-chip-not-active')).not.toBeNull()
      expect(view.byTestId('overview-dormant')).toBeNull()
      expect(view.byTestId('overview-path')).toBeNull()
      expect(view.byTestId('overview-clear')).toBeNull()
      expect(view.byTestId('overview-step-clear')).toBeNull()
      expect(view.byTestId('overview-step-reauthorize')).toBeNull()
      expect(view.byTestId('overview-step-removeAuthorization')).toBeNull()
      await view.press('overview-open-elsewhere')
      expect(mockState.navigation.navigate).toHaveBeenCalledWith(route)
      expect(receipts.wait).not.toHaveBeenCalled()
      expect(port.sendAccountBatch).not.toHaveBeenCalled()
      const stored = await world.records.saveInFlight(CHAIN_ID, address).read()
      expect(stored.status).toBe('present')
    })
  )

  it("stops a clear whose claim loses to a write the editor stored after the screen opened, sends nothing, and points to the editor's screen", async () => {
    const world = await dormantWorld()
    const port = sendPortOver()
    const receipts = receiptsOver()
    mockWallet.port = port
    mockWallet.client = readyOver(world.client, GAS_READS, receipts)
    mockState.navigation.navigate.mockClear()

    view = await mount(<OverviewScreen />)
    await view.press('overview-clear')
    expect(view.byTestId('overview-step-clear')).not.toBeNull()

    const requestId = `${newSendRequestId()}:manage-edit`
    await world.records.saveInFlight(CHAIN_ID, address).claim({
      draft: REMOVAL_DRAFT,
      prepared: await world.client.setup.prepareClearSetup(),
      requestId,
      claimedAt: Date.now()
    })
    await view.press('overview-step-start')
    await settle()

    expect(view.byTestId('overview-step-clear')).toBeNull()
    expect(view.textOf('overview-write-elsewhere')).toContain(
      t('socialRecovery.management.overview.writes.editInFlight')
    )
    await view.press('overview-open-elsewhere')
    expect(mockState.navigation.navigate).toHaveBeenCalledWith(
      WEB_ROUTES.socialRecoveryManageReview
    )
    expect(port.sendAccountBatch).not.toHaveBeenCalled()
    expect(receipts.wait).not.toHaveBeenCalled()
    const stored = await world.records.saveInFlight(CHAIN_ID, address).read()
    expect(stored.status === 'present' && stored.value.requestId).toBe(requestId)
  })

  it('stops a clear whose claim loses to a re-authorize another tab stored, and opens the re-authorize step to follow it with nothing sent', async () => {
    const world = await dormantWorld()
    const port = sendPortOver()
    const receipts = receiptsOver()
    receipts.wait.mockImplementation(() => armHarness.pending())
    mockWallet.port = port
    mockWallet.client = readyOver(world.client, GAS_READS, receipts)

    view = await mount(<OverviewScreen />)
    await view.press('overview-clear')
    expect(view.byTestId('overview-step-clear')).not.toBeNull()

    const draft = reauthorizeDraftOf(CONFIGURATION, 'public')
    const inFlight = world.records.saveInFlight(CHAIN_ID, address)
    const requestId = requestIdOf('reauthorize')
    await inFlight.claim({
      draft,
      prepared: await world.client.setup.prepareCommitSetup(draft),
      requestId,
      claimedAt: Date.now(),
      startBlock: armHarness.START_BLOCK
    })
    await inFlight.markSent(requestId, armHarness.TX_HASH, armHarness.START_BLOCK)
    await view.press('overview-step-start')
    await settle()

    expect(view.byTestId('overview-step-clear')).toBeNull()
    expect(view.byTestId('overview-step-reauthorize')).not.toBeNull()
    expect(view.byTestId('overview-step-submitting')).not.toBeNull()
    expect(view.byTestId('overview-step-start')).toBeNull()
    expect(receipts.wait).toHaveBeenCalledWith(armHarness.TX_HASH, armHarness.START_BLOCK)
    expect(port.sendAccountBatch).not.toHaveBeenCalled()
    const stored = await inFlight.read()
    expect(stored.status === 'present' && stored.value.requestId).toBe(requestId)
  })

  it("drops the editor's block once the tab is shown again and the editor's write is no longer stored", async () => {
    const world = await dormantWorld()
    const requestId = `${newSendRequestId()}:manage-remove`
    const inFlight = world.records.saveInFlight(CHAIN_ID, address)
    await inFlight.claim({
      draft: REMOVAL_DRAFT,
      prepared: await world.client.setup.prepareClearSetup(),
      requestId,
      claimedAt: Date.now()
    })
    mockWallet.port = sendPortOver()
    mockWallet.client = readyOver(world.client, GAS_READS, receiptsOver())

    view = await mount(<OverviewScreen />)
    expect(view.byTestId('overview-write-elsewhere')).not.toBeNull()

    await inFlight.release(requestId)
    await act(async () => {
      document.dispatchEvent(new Event('visibilitychange'))
    })
    await settle()

    expect(view.byTestId('overview-write-elsewhere')).toBeNull()
    expect(view.byTestId('overview-dormant')).not.toBeNull()
  })

  it('reads the account as no longer controlled from here once a recovery executed, with the time the watcher read', async () => {
    const storage = makeStorage()
    mockWallet.storage = storage
    const world = await worldAt('public', address, storage)
    const controller = '0x00000000000000000000000000000000000000e2' as const
    world.chain.setAuthorities([key.addr])
    world.chain.openAttempt({ handover: { newAuthority: controller, removedAuthority: key.addr } })
    world.chain.consume()
    const { attempt } = await world.client.walletReads.attemptState()
    mockWallet.client = readyOver(world.client)
    mockState.accounts.accounts = [account]
    mockState.keystore.keys = [{ addr: key.addr, type: key.type }]
    mockWallet.watched = {
      status: 'watched',
      reading: {
        account: address,
        block: { number: 300, timestamp: 3_000 },
        hasSetup: true,
        dormant: false,
        ended: {
          attemptId: attempt.attemptId,
          road: 'executed',
          controller,
          at: 2_500,
          transactionHash: armHarness.TX_HASH
        }
      },
      attemptDismissed: false
    }
    const zone = Intl.DateTimeFormat().resolvedOptions().timeZone
    try {
      view = await mount(<OverviewScreen />)
      await harness.settleReads()

      expect(view.textOf('overview-title')).toBe(t(`${O}.controlMoved.title`))
      expect(view.text()).toContain(
        t(`${O}.controlMoved.lead`, { date: display.renderDateTimeInZone(2_500_000, zone).date })
      )
      expect(view.textOf('overview-control-moved-controller')).toBe(
        display.renderFullAddress(controller)
      )
      expect(view.byTestId('overview-control-moved-transaction')).not.toBeNull()
      expect(view.byTestId('overview-edit-path')).toBeNull()
      expect(view.byTestId('overview-remove-recovery')).toBeNull()
    } finally {
      mockState.accounts.accounts = []
      mockState.keystore.keys = []
      mockWallet.watched = undefined
    }
  })

  it('stays set up with its actions where the recovery handed control to the key of another account of this wallet', async () => {
    const storage = makeStorage()
    mockWallet.storage = storage
    const world = await worldAt('public', address, storage)
    // The key of another account the keystore holds, which this account's entry never lists.
    const other = await armHarness.keyedAccount(seed + 0x1000)
    expect(account.associatedKeys.map((associated) => associated.toLowerCase())).not.toContain(
      other.key.addr.toLowerCase()
    )
    world.chain.setAuthorities([key.addr])
    world.chain.openAttempt({
      handover: { newAuthority: other.key.addr, removedAuthority: key.addr }
    })
    world.chain.consume()
    mockWallet.client = readyOver(world.client)
    mockState.accounts.accounts = [account, other.account]
    mockState.keystore.keys = [
      { addr: key.addr, type: key.type },
      { addr: other.key.addr, type: other.key.type }
    ]
    try {
      view = await mount(<OverviewScreen />)
      await harness.settleReads()

      expect(view.byTestId('overview-control-moved-notice')).toBeNull()
      expect(view.textOf('overview-title')).not.toBe(t(`${O}.controlMoved.title`))
      expect(view.byTestId('overview-chip-set-up')).not.toBeNull()
      expect(view.byTestId('overview-edit-path')).not.toBeNull()
      expect(view.byTestId('overview-remove-recovery')).not.toBeNull()
    } finally {
      mockState.accounts.accounts = []
      mockState.keystore.keys = []
    }
  })

  describe('left open while an attempt waits', () => {
    const CONTROLLER = '0x00000000000000000000000000000000000000e2' as const

    /** An attempt open on the account that hands control away from its one held key. */
    const waitingWorld = async () => {
      const storage = makeStorage()
      mockWallet.storage = storage
      const world = await worldAt('public', address, storage)
      world.chain.setAuthorities([key.addr])
      world.chain.openAttempt({
        handover: { newAuthority: CONTROLLER, removedAuthority: key.addr }
      })
      const { attempt } = await world.client.walletReads.attemptState()
      mockWallet.client = readyOver(world.client)
      mockState.accounts.accounts = [account]
      mockState.keystore.keys = [{ addr: key.addr, type: key.type }]
      mockWallet.watched = { status: 'watched', attemptDismissed: false }
      return { world, attemptId: attempt.attemptId }
    }

    /** The recovery executes from another wallet: the attempt consumed, the held key no longer signing. */
    const executeElsewhere = async (world: Awaited<ReturnType<typeof waitingWorld>>['world']) => {
      world.chain.consume()
      expect((await world.client.walletReads.attemptState()).attempt.state).toBe('Consumed')
      expect(await world.client.action.isAuthority(key.addr)).toBe(false)
    }

    const pushExecutedEnding = async (attemptId: bigint) => {
      mockWallet.watched = {
        status: 'watched',
        reading: {
          account: address,
          block: { number: 300, timestamp: 3_000 },
          hasSetup: true,
          dormant: false,
          ended: {
            attemptId,
            road: 'executed',
            controller: CONTROLLER,
            at: 2_500,
            transactionHash: armHarness.TX_HASH
          }
        },
        attemptDismissed: false
      }
      await act(async () => {
        mockWatchers.forEach((bump) => bump((round) => round + 1))
      })
      await harness.settleReads()
    }

    const showTab = async () => {
      await act(async () => {
        document.dispatchEvent(new Event('visibilitychange'))
      })
      await harness.settleReads()
    }

    const terminal = () => ({
      moved: view?.byTestId('overview-control-moved-notice') !== null,
      edit: view?.byTestId('overview-edit-path') !== null
    })

    afterEach(() => {
      mockState.accounts.accounts = []
      mockState.keystore.keys = []
      mockWallet.watched = undefined
    })

    it('reaches the terminal state with no remount once the watcher reads the execution and the tab is shown', async () => {
      const { world, attemptId } = await waitingWorld()
      view = await mount(<OverviewScreen />)
      await harness.settleReads()
      expect(terminal()).toEqual({ moved: false, edit: true })

      await executeElsewhere(world)
      await pushExecutedEnding(attemptId)
      await showTab()

      expect(terminal()).toEqual({ moved: true, edit: false })
      expect(view.textOf('overview-control-moved-controller')).toBe(
        display.renderFullAddress(CONTROLLER)
      )
    })

    it('reads the chain again when the watcher reads a new ending alone', async () => {
      const { world, attemptId } = await waitingWorld()
      view = await mount(<OverviewScreen />)
      await harness.settleReads()

      await executeElsewhere(world)
      await pushExecutedEnding(attemptId)

      expect(terminal()).toEqual({ moved: true, edit: false })
    })

    it('reads the chain again when the tab is shown alone', async () => {
      const { world } = await waitingWorld()
      view = await mount(<OverviewScreen />)
      await harness.settleReads()

      await executeElsewhere(world)
      await showTab()

      expect(terminal()).toEqual({ moved: true, edit: false })
    })
  })

  it('keeps an open write step mounted when the tab is shown or the watcher reads a new ending', async () => {
    const world = await dormantWorld()
    await storeOverviewWrite(world, 'clear', address)
    const receipts = receiptsOver()
    receipts.wait.mockImplementation(() => armHarness.pending())
    mockWallet.port = sendPortOver()
    mockWallet.client = readyOver(world.client, GAS_READS, receipts)
    mockWallet.watched = { status: 'watched', attemptDismissed: false }
    try {
      view = await mount(<OverviewScreen />)
      const step = view.byTestId('overview-step-clear')
      expect(step).not.toBeNull()

      await act(async () => {
        document.dispatchEvent(new Event('visibilitychange'))
      })
      await settle()
      mockWallet.watched = {
        status: 'watched',
        reading: {
          account: address,
          block: { number: 300, timestamp: 3_000 },
          hasSetup: true,
          dormant: true,
          ended: { attemptId: 9n, road: 'cancelled', cancelledBy: 'cancelByOwner', at: 2_500 }
        },
        attemptDismissed: false
      }
      await act(async () => {
        mockWatchers.forEach((bump) => bump((round) => round + 1))
      })
      await settle()

      expect(view.byTestId('overview-step-clear')).toBe(step)
      expect(view.byTestId('overview-step-submitting')).not.toBeNull()
      expect(view.byTestId('overview-reading')).toBeNull()
    } finally {
      mockWallet.watched = undefined
    }
  })
})

describe('the overview of an account the wallet lists, with no setup on the chain', () => {
  let view: Awaited<ReturnType<typeof mount>> | undefined

  /** A client over a fresh node, which holds no setup for the account. */
  const noSetupWorld = async () => {
    const storage = makeStorage()
    mockWallet.storage = storage
    const world = await worldAt('public', address, storage)
    world.chain.clearSetup()
    world.chain.setAuthorized(false)
    mockWallet.client = readyOver(world.client)
    mockUseRecoveryClient.mockClear()
    mockState.navigation.navigate.mockClear()
    return world
  }

  afterEach(() => {
    view?.unmount()
    view = undefined
    mockState.accounts.accounts = []
  })

  it('refuses a basic account under the title, with the way to recover another account and no invitation to set up', async () => {
    await noSetupWorld()
    mockState.accounts.accounts = [{ ...account, creation: null }]

    view = await mount(<OverviewScreen />)
    await harness.settleReads()

    expect(view.byTestId('overview-cannot-recover')).not.toBeNull()
    expect(view.textOf('overview-title')).toBe(t(`${O}.title`))
    expect(view.byTestId('review-blocked-cannot-recover')).not.toBeNull()
    expect(view.textOf('review-blocked-body')).toBe(
      t('socialRecovery.review.blocked.cannotRecover.reasonNotSupported')
    )
    expect(view.byTestId('recover')).not.toBeNull()
    expect(view.byTestId('overview-empty')).toBeNull()
    expect(view.byTestId('overview-set-up')).toBeNull()
    expect(view.byTestId('overview-chips')).toBeNull()
    expect(view.byTestId('overview-reading')).toBeNull()
    expect(mockUseRecoveryClient).not.toHaveBeenCalled()
  })

  it("leads a basic account's link to the recovery of another account", async () => {
    await noSetupWorld()
    mockState.accounts.accounts = [{ ...account, creation: null }]

    view = await mount(<OverviewScreen />)
    await view.press('recover')

    expect(mockState.navigation.navigate).toHaveBeenCalledWith(WEB_ROUTES.socialRecoveryRecovery)
  })

  it('still invites a smart account to set recovery up, over its read of the chain', async () => {
    await noSetupWorld()
    mockState.accounts.accounts = [account]

    view = await mount(<OverviewScreen />)
    await harness.settleReads()

    expect(view.byTestId('overview-empty')).not.toBeNull()
    expect(view.byTestId('overview-set-up')).not.toBeNull()
    expect(view.byTestId('overview-cannot-recover')).toBeNull()
    expect(view.byTestId('review-blocked-cannot-recover')).toBeNull()
    expect(view.byTestId('recover')).toBeNull()
    expect(mockUseRecoveryClient).toHaveBeenCalled()
  })
})
