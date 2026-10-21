/**
 * @jest-environment jsdom
 *
 * The overview's write step mounted over a client built over the stand-in's
 * chain, with the wallet's hooks faked and a send port whose batch changes
 * the chain as the landed write would: the re-authorize's password ask and
 * its trust-list gate, a refusal at the prepare, the send in progress, a
 * landed write whose check agrees, one whose check did not answer and its
 * check again, and a write the network dropped.
 */
import type { Account } from '@ambire-common/interfaces/account'
import type {
  OverviewFacts,
  OverviewReads,
  OverviewWriteStepProps
} from '@web/modules/social-recovery/management/overview/types'
import type { KeyHandle, SendPort } from '@web/modules/social-recovery/shared/client'

jest.mock('viem', () => {
  // eslint-disable-next-line global-require
  const { TextDecoder, TextEncoder } = require('util')
  Object.assign(globalThis, { TextDecoder, TextEncoder })
  return jest.requireActual('viem')
})
jest.mock('@common/utils/clipboard', () => ({ setStringAsync: async () => true }))
// The spinner's animation needs a native module jsdom lacks.
jest.mock('@common/components/Spinner', () => ({ __esModule: true, default: () => null }))

// The wallet's controller states keep their identity between renders, as the real hooks do.
const mockWallet: { facts: unknown; port: SendPort | null } = { facts: null, port: null }
const mockState = {
  accounts: { accounts: [] as unknown[] },
  requests: { userRequests: [] as unknown[] },
  selected: { account: null },
  // The background answers the sign screen's state as it does once the page asks for it.
  background: {
    dispatch: jest.fn((action: { type: string }) => {
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
jest.mock('@web/hooks/useAccountsControllerState', () => ({
  __esModule: true,
  default: () => mockState.accounts
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
jest.mock('@web/modules/social-recovery/shared/client/useAccountFacts', () => ({
  useAccountFacts: () => mockWallet.facts
}))
jest.mock('@web/modules/social-recovery/shared/client', () => ({
  ...jest.requireActual('@web/modules/social-recovery/shared/client'),
  createSendPort: () => mockWallet.port
}))

/* eslint-disable @typescript-eslint/no-var-requires, global-require */
const React: typeof import('react') = require('react')
const { toFunctionSelector }: typeof import('viem') = require('viem')
const {
  POLICY_MANAGER_TRUSTED_PARTIES_ABI
}: typeof import('@kohaku-eth/social-recovery') = require('@kohaku-eth/social-recovery')
const { flushSync }: typeof import('react-dom') = require('react-dom')
const harness: typeof import('@web/modules/social-recovery/management/overview/__fixtures__/harness') = require('@web/modules/social-recovery/management/overview/__fixtures__/harness')
const armHarness: typeof import('@web/modules/social-recovery/setup/arm/__tests__/harness') = require('@web/modules/social-recovery/setup/arm/__tests__/harness')
const OverviewWriteStep: typeof import('@web/modules/social-recovery/management/overview/OverviewWriteStep').default =
  require('@web/modules/social-recovery/management/overview/OverviewWriteStep').default
const {
  DROPPED_AFTER_MS
}: typeof import('@web/modules/social-recovery/shared/writes') = require('@web/modules/social-recovery/shared/writes')
const {
  RECEIPT_WAIT_MS
}: typeof import('@web/modules/social-recovery/setup/arm') = require('@web/modules/social-recovery/setup/arm')
const {
  setRecoveryPassword,
  wipeRecoveryPassword
}: typeof import('@web/modules/social-recovery/shared/records') = require('@web/modules/social-recovery/shared/records')
const {
  deferred
}: typeof import('@web/modules/social-recovery/shared/chrome/__fixtures__/deferred') = require('@web/modules/social-recovery/shared/chrome/__fixtures__/deferred')
/* eslint-enable @typescript-eslint/no-var-requires, global-require */

const {
  act,
  mount,
  t,
  worldAt,
  readsOf,
  factsOver,
  readyFactsOf,
  receiptsOver,
  sendPortOver,
  storeOverviewWrite,
  GAS_READS,
  CHAIN_ID,
  CONFIGURATION,
  PASSWORD
} = harness
const O = 'socialRecovery.management.overview'

let seed = 0x0e5
let account: Account
let key: KeyHandle
let address: `0x${string}`

beforeEach(async () => {
  // Each test runs on an account of its own, so no run held for one account meets another test.
  seed += 1
  ;({ account, key } = await armHarness.keyedAccount(seed))
  address = account.addr as `0x${string}`
  mockWallet.facts = readyFactsOf(account, key)
})

afterEach(() => {
  wipeRecoveryPassword(CHAIN_ID, address)
})

const READABLE = (fields: Partial<OverviewReads> = {}) =>
  readsOf({ path: { kind: 'readable', configuration: CONFIGURATION }, ...fields })

const stepOf = (
  world: Awaited<ReturnType<typeof worldAt>>,
  facts: OverviewFacts,
  fields: Partial<OverviewWriteStepProps> & Pick<OverviewWriteStepProps, 'receipts'>
) => (
  <OverviewWriteStep
    intent="clear"
    client={world.client}
    chainReads={GAS_READS}
    records={world.records}
    chainId={CHAIN_ID}
    account={address}
    facts={facts}
    reads={READABLE()}
    autoStart={false}
    onFinished={jest.fn()}
    onLeft={jest.fn()}
    onClose={jest.fn()}
    navigate={jest.fn()}
    {...fields}
  />
)

describe("the overview's write step", () => {
  let view: Awaited<ReturnType<typeof mount>> | undefined

  afterEach(() => {
    view?.unmount()
    view = undefined
  })

  it('asks the recovery password at a hidden level before the re-authorize can start, then shows the trust list', async () => {
    const world = await worldAt('private', address)
    world.chain.setAuthorized(false)
    mockWallet.port = sendPortOver()
    const facts = await factsOver(world)
    const element = () => stepOf(world, facts, { intent: 'reauthorize', receipts: receiptsOver() })
    view = await mount(element())
    await harness.settleReads()
    expect(view.byTestId('overview-step-password')).not.toBeNull()
    expect(view.isDisabled('overview-step-start')).toBe(true)

    setRecoveryPassword(CHAIN_ID, address, PASSWORD)
    await view.render(element())
    expect(view.byTestId('overview-step-password')).toBeNull()
    expect(view.byTestId('review-trust-list')).not.toBeNull()
    expect(view.isDisabled('overview-step-start')).toBe(false)
  })

  it('keeps the re-authorize disabled until every party of the trust list has rendered', async () => {
    const world = await worldAt('public', address)
    world.chain.setAuthorized(false)
    mockWallet.port = sendPortOver()
    const held = deferred<void>()
    // The node holds every trust-list read until the test lets it answer.
    const selector = toFunctionSelector(POLICY_MANAGER_TRUSTED_PARTIES_ABI[0])
    const call = world.chain.call.bind(world.chain)
    jest.spyOn(world.chain, 'call').mockImplementation(async (...args) => {
      if (args[1].startsWith(selector)) {
        await held.promise
      }
      return call(...args)
    })
    view = await mount(
      stepOf(world, await factsOver(world), { intent: 'reauthorize', receipts: receiptsOver() })
    )
    expect(view.isDisabled('overview-step-start')).toBe(true)

    await act(async () => {
      held.resolve()
    })
    await harness.settle()
    expect(view.isDisabled('overview-step-start')).toBe(false)
  })

  it('sends nothing and hands the overview back its read where an attempt opened before the re-authorize prepared', async () => {
    const world = await worldAt('public', address)
    world.chain.setAuthorized(false)
    const port = sendPortOver()
    mockWallet.port = port
    const onFinished = jest.fn()
    const facts = await factsOver(world)
    view = await mount(
      stepOf(world, facts, { intent: 'reauthorize', receipts: receiptsOver(), onFinished })
    )
    world.chain.openAttempt()
    await view.press('overview-step-start')
    expect(onFinished).toHaveBeenCalled()
    expect(port.sendAccountBatch).not.toHaveBeenCalled()
  })

  it('starts the next re-authorize of the page clean after one refused at its prepare', async () => {
    const world = await worldAt('public', address)
    world.chain.setAuthorized(false)
    const port = sendPortOver()
    mockWallet.port = port
    world.chain.openAttempt()
    const facts = await factsOver(world)
    // The overview closes the step at once when the step hands back.
    const Closing = () => {
      const [open, setOpen] = React.useState(true)
      return open
        ? stepOf(world, facts, {
            intent: 'reauthorize',
            receipts: receiptsOver(),
            onFinished: () => flushSync(() => setOpen(false))
          })
        : null
    }
    const refused = await mount(<Closing />)
    await refused.press('overview-step-start')
    expect(refused.byTestId('overview-step-reauthorize')).toBeNull()
    refused.unmount()

    world.chain.cancelAttempt()
    view = await mount(
      stepOf(world, await factsOver(world), { intent: 'reauthorize', receipts: receiptsOver() })
    )
    expect(view.byTestId('overview-step-failedNotSent')).toBeNull()
    expect(view.isDisabled('overview-step-start')).toBe(false)

    await view.press('overview-step-start')
    expect(port.sendAccountBatch).toHaveBeenCalledTimes(1)
  })

  it('shows the clear in progress while its receipt is awaited, and hands back once the chain agrees', async () => {
    const world = await worldAt('public', address)
    world.chain.setAuthorized(false)
    world.chain.openAttempt()
    const port = sendPortOver(() => world.chain.clearSetup())
    mockWallet.port = port
    const receipts = receiptsOver()
    const landing = deferred<ReturnType<typeof armHarness.landedReceipt>>()
    receipts.wait.mockImplementationOnce(() => landing.promise)
    const onFinished = jest.fn()
    view = await mount(stepOf(world, await factsOver(world), { receipts, onFinished }))
    expect(view.textOf('overview-step-clear-cancels')).toBe(t(`${O}.dormant.clearCancels`))

    await view.press('overview-step-start')
    expect(port.sendAccountBatch).toHaveBeenCalledTimes(1)
    expect(view.byTestId('overview-step-submitting')).not.toBeNull()
    expect(onFinished).not.toHaveBeenCalled()

    await act(async () => {
      landing.resolve(armHarness.landedReceipt(armHarness.TX_HASH))
    })
    await harness.settle()
    expect(onFinished).toHaveBeenCalled()
    expect(port.sendAccountBatch).toHaveBeenCalledTimes(1)
  })

  it("reads a clear whose transaction reverted with the setup write's revert line, never the save's", async () => {
    const world = await worldAt('public', address)
    world.chain.setAuthorized(false)
    const port = sendPortOver()
    mockWallet.port = port
    const receipts = receiptsOver()
    receipts.wait.mockImplementation(async (hash: `0x${string}`) => {
      throw armHarness.minedAndReverted(hash)
    })
    const onFinished = jest.fn()
    view = await mount(stepOf(world, await factsOver(world), { receipts, onFinished }))

    await view.press('overview-step-start')
    expect(port.sendAccountBatch).toHaveBeenCalledTimes(1)
    const shown = view.textOf('overview-step-failedReverted') ?? ''
    const [, ownerTail] = t('socialRecovery.writes.reverted', { cause: '|' }).split('|')
    const [, saveTail] = t('socialRecovery.writes.revertedSave', { cause: '|' }).split('|')
    expect(shown).toContain(ownerTail.trim())
    expect(shown).not.toContain(saveTail.trim())
    expect(onFinished).not.toHaveBeenCalled()
  })

  it('keeps a landed clear whose check did not answer on its step, and its check again hands back once the read agrees', async () => {
    const world = await worldAt('public', address)
    world.chain.setAuthorized(false)
    const port = sendPortOver(() => {
      world.chain.clearSetup()
      world.chain.failRead('stateOf')
    })
    mockWallet.port = port
    const onFinished = jest.fn()
    view = await mount(
      stepOf(world, await factsOver(world), { receipts: receiptsOver(), onFinished })
    )

    await view.press('overview-step-start')
    expect(view.byTestId('overview-step-unread')).not.toBeNull()
    expect(onFinished).not.toHaveBeenCalled()

    world.chain.restoreRead('stateOf')
    await view.press('overview-step-reread')
    expect(onFinished).toHaveBeenCalled()
    expect(port.sendAccountBatch).toHaveBeenCalledTimes(1)
    const stored = await world.records.saveInFlight(CHAIN_ID, address).read()
    expect(stored.status).toBe('absent')
  })

  it('runs the removal of the authorization past the gas check to one send once its press opened the step, and hands back once the chain agrees', async () => {
    const world = await worldAt('public', address)
    world.chain.clearSetup()
    world.chain.setAuthorized(true)
    const port = sendPortOver(() => world.chain.setAuthorized(false))
    mockWallet.port = port
    const onFinished = jest.fn()
    view = await mount(
      stepOf(world, await factsOver(world), {
        intent: 'removeAuthorization',
        autoStart: true,
        receipts: receiptsOver(),
        onFinished
      })
    )
    expect(port.sendAccountBatch).toHaveBeenCalledTimes(1)
    expect(view.byTestId('overview-step-checkingGas')).toBeNull()
    expect(onFinished).toHaveBeenCalled()
  })

  describe('a write the network dropped', () => {
    beforeEach(() => {
      harness.useAdvancingFakeTimers()
    })

    afterEach(() => {
      jest.useRealTimers()
    })

    it('shows the dropped line above the try again, an hour after its broadcast, with nothing sent', async () => {
      const world = await worldAt('public', address)
      world.chain.setAuthorized(false)
      await storeOverviewWrite(world, 'clear', address)
      const port = sendPortOver()
      mockWallet.port = port
      const receipts = receiptsOver()
      receipts.transactionKnown.mockResolvedValue('unknown')
      receipts.wait.mockImplementation(() => armHarness.pending())
      jest.setSystemTime(Date.now() + DROPPED_AFTER_MS)

      view = await mount(stepOf(world, await factsOver(world), { receipts }))
      await act(() => armHarness.advanceTimers(RECEIPT_WAIT_MS))
      await harness.settle()

      expect(view.textOf('overview-step-dropped-line')).toBe(t(`${O}.writes.dropped`))
      const line = view.byTestId('overview-step-dropped-line')
      const again = view.byTestId('overview-step-send-again')
      expect(
        // eslint-disable-next-line no-bitwise
        line && again && line.compareDocumentPosition(again) & Node.DOCUMENT_POSITION_FOLLOWING
      ).toBeTruthy()
      expect(port.sendAccountBatch).not.toHaveBeenCalled()
    })
  })
})
