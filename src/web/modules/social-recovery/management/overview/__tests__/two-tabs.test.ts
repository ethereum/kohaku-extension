/**
 * @jest-environment jsdom
 *
 * Two tabs of this device on the same clear of the overview, each with its
 * own run over the records both read: the first claims and sends, the second
 * loses the claim and follows the first's write to its landing, and only one
 * transaction goes out. A re-authorize held at the deposit step sends nothing
 * where an attempt opened meanwhile, and so does one where an attempt opened
 * while it claimed the write, and a clear that finds another write of
 * the overview stored leaves it to that write's own step.
 */
import type { Account } from '@ambire-common/interfaces/account'
import type { ChainReads, KeyHandle } from '@web/modules/social-recovery/shared/client'

/* eslint-disable @typescript-eslint/no-var-requires, global-require */
const harness: typeof import('@web/modules/social-recovery/management/overview/__fixtures__/harness') = require('@web/modules/social-recovery/management/overview/__fixtures__/harness')
const armHarness: typeof import('@web/modules/social-recovery/setup/arm/__tests__/harness') = require('@web/modules/social-recovery/setup/arm/__tests__/harness')
const {
  overviewStepsOf
}: typeof import('@web/modules/social-recovery/management/overview/writeSteps') = require('@web/modules/social-recovery/management/overview/writeSteps')
const {
  REMOVAL_DRAFT
}: typeof import('@web/modules/social-recovery/management/overview/constants') = require('@web/modules/social-recovery/management/overview/constants')
const {
  reauthorizeDraftOf
}: typeof import('@web/modules/social-recovery/management/overview/readings') = require('@web/modules/social-recovery/management/overview/readings')
const {
  createArmStore,
  isSaved,
  lookForSave,
  recheckGas,
  startSave
}: typeof import('@web/modules/social-recovery/setup/arm') = require('@web/modules/social-recovery/setup/arm')
const {
  deferred
}: typeof import('@web/modules/social-recovery/shared/chrome/__fixtures__/deferred') = require('@web/modules/social-recovery/shared/chrome/__fixtures__/deferred')
/* eslint-enable @typescript-eslint/no-var-requires, global-require */

const { worldAt, receiptsOver, sendPortOver, GAS_READS, CHAIN_ID, CONFIGURATION } = harness

const GAS_READS_BALANCE = 1_000_000_000_000_000_000n

let account: Account
let key: KeyHandle
let address: `0x${string}`

beforeAll(async () => {
  ;({ account, key } = await armHarness.keyedAccount(0x7ab))
  address = account.addr as `0x${string}`
})

/** One tab's run of the clear: its own store, send port and receipt waits, over the shared records. */
const tabOver = (world: Awaited<ReturnType<typeof worldAt>>) => {
  const port = sendPortOver()
  const receipts = receiptsOver()
  const steps = overviewStepsOf({
    intent: 'clear',
    client: world.client,
    reads: GAS_READS,
    receipts,
    port,
    requests: armHarness.requestsFake(),
    records: world.records,
    chainId: CHAIN_ID,
    account: address,
    facts: armHarness.factsOf(account, { key }),
    key,
    draft: REMOVAL_DRAFT,
    password: undefined,
    onAttemptOpen: () => {}
  })
  return { port, receipts, steps, store: createArmStore('ownerWrite') }
}

describe('two tabs on the same clear', () => {
  it('sends once: the second tab follows the write of the first to its landing', async () => {
    const world = await worldAt('public', address)
    world.chain.setAuthorized(false)
    const landing = deferred<ReturnType<typeof armHarness.landedReceipt>>()
    const first = tabOver(world)
    first.receipts.wait.mockImplementation(() => landing.promise)
    const second = tabOver(world)
    second.receipts.wait.mockImplementation(() => landing.promise)

    const firstRun = startSave(first.store, first.steps)
    await harness.settle()
    expect(first.port.sendAccountBatch).toHaveBeenCalledTimes(1)
    const held = await world.records.saveInFlight(CHAIN_ID, address).read()
    expect(held.status).toBe('present')

    const secondRun = startSave(second.store, second.steps)
    await harness.settle()
    expect(second.port.sendAccountBatch).not.toHaveBeenCalled()
    expect(second.receipts.wait).toHaveBeenCalledWith(armHarness.TX_HASH, armHarness.START_BLOCK)

    world.chain.clearSetup()
    landing.resolve(armHarness.landedReceipt(armHarness.TX_HASH))
    await Promise.all([firstRun, secondRun])

    expect(isSaved(first.store.state())).toBe(true)
    expect(isSaved(second.store.state())).toBe(true)
    expect(first.port.sendAccountBatch).toHaveBeenCalledTimes(1)
    expect(second.port.sendAccountBatch).not.toHaveBeenCalled()
    expect((await world.records.saveInFlight(CHAIN_ID, address).read()).status).toBe('absent')
  })
})

describe('a re-authorize held at the deposit step', () => {
  it('sends nothing and tells its step where an attempt opened before the deposit continuation', async () => {
    const world = await worldAt('public', address)
    world.chain.setAuthorized(false)
    let balance = 0n
    const reads = { ...GAS_READS, nativeBalance: async () => balance } as ChainReads
    const port = sendPortOver()
    const onAttemptOpen = jest.fn()
    const steps = overviewStepsOf({
      intent: 'reauthorize',
      client: world.client,
      reads,
      receipts: receiptsOver(),
      port,
      requests: armHarness.requestsFake(),
      records: world.records,
      chainId: CHAIN_ID,
      account: address,
      facts: armHarness.factsOf(account, { key }),
      key,
      draft: reauthorizeDraftOf(CONFIGURATION, 'public'),
      password: undefined,
      onAttemptOpen
    })
    const store = createArmStore('save')

    await startSave(store, steps)
    expect(store.state().write.status).toBe('needsDeposit')

    world.chain.openAttempt()
    balance = GAS_READS_BALANCE
    await recheckGas(store, steps)

    expect(port.sendAccountBatch).not.toHaveBeenCalled()
    expect(onAttemptOpen).toHaveBeenCalledTimes(1)
    expect(store.state().write.status).toBe('failedNotSent')
    expect((await world.records.saveInFlight(CHAIN_ID, address).read()).status).toBe('absent')
  })
})

describe('a re-authorize whose claim an attempt overtakes', () => {
  it('sends nothing, releases its claim and tells its step where an attempt opened as the claim returned', async () => {
    const world = await worldAt('public', address)
    world.chain.setAuthorized(false)
    const port = sendPortOver()
    const onAttemptOpen = jest.fn()
    const records = {
      ...world.records,
      saveInFlight: (chainId: number, of: `0x${string}`) => {
        const inFlight = world.records.saveInFlight(chainId, of)
        return {
          ...inFlight,
          claim: async (...args: Parameters<typeof inFlight.claim>) => {
            const claim = await inFlight.claim(...args)
            world.chain.openAttempt()
            return claim
          }
        }
      }
    }
    const steps = overviewStepsOf({
      intent: 'reauthorize',
      client: world.client,
      reads: { ...GAS_READS, nativeBalance: async () => GAS_READS_BALANCE } as ChainReads,
      receipts: receiptsOver(),
      port,
      requests: armHarness.requestsFake(),
      records,
      chainId: CHAIN_ID,
      account: address,
      facts: armHarness.factsOf(account, { key }),
      key,
      draft: reauthorizeDraftOf(CONFIGURATION, 'public'),
      password: undefined,
      onAttemptOpen
    })
    const store = createArmStore('save')

    await startSave(store, steps)

    expect(port.sendAccountBatch).not.toHaveBeenCalled()
    expect(onAttemptOpen).toHaveBeenCalledTimes(1)
    expect(store.state().write.status).toBe('failedNotSent')
    expect((await world.records.saveInFlight(CHAIN_ID, address).read()).status).toBe('absent')
  })
})

describe('a clear that finds the removal of the authorization stored', () => {
  it('stops with nothing followed, sent or released, and leaves that write stored', async () => {
    const world = await worldAt('public', address)
    // Another tab stored its removal while the account still authorized the action.
    await harness.storeOverviewWrite(world, 'removeAuthorization', address)
    world.chain.setAuthorized(false)
    const held = await world.records.saveInFlight(CHAIN_ID, address).read()
    const tab = tabOver(world)

    await lookForSave(tab.store, tab.steps)

    expect(tab.store.state().stop).toBe('held-by-another-write')
    expect(tab.receipts.wait).not.toHaveBeenCalled()
    expect(tab.port.sendAccountBatch).not.toHaveBeenCalled()
    expect(await world.records.saveInFlight(CHAIN_ID, address).read()).toEqual(held)
  })
})
