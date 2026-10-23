/**
 * The save in flight stored on this device, over the records lane's own
 * record on an in-memory storage that several saves share as the pages of one
 * device: the claim before the send and its loser, the hash written at the
 * send, each way a run ends against the record after it, and a page that
 * finds the record, with its hash or with none, following it to its end with
 * nothing sent. Every wait runs on Jest's fake clock.
 */
import type { Account } from '@ambire-common/interfaces/account'
import { AccountOpStatus } from '@ambire-common/libs/accountOp/types'
import { deferred } from '@web/modules/social-recovery/shared/chrome/__fixtures__/deferred'
import { shapeNoteOf } from '@web/modules/social-recovery/shared/client'
import {
  canRetry,
  intentOfRequest,
  mayStillLand,
  requestIdOf
} from '@web/modules/social-recovery/shared/writes'

import {
  armScreenOf,
  checkReceiptAgain,
  checkSetupAgain,
  committedDraftOf,
  createArmStore,
  FOLLOW_REREAD_MS,
  isSaved,
  lookForSave,
  RECEIPT_WAIT_MS,
  startSave
} from '@web/modules/social-recovery/setup/arm'
import type { ArmStore, SaveSteps } from '@web/modules/social-recovery/setup/arm'
import {
  CLAIM_SEND_LIMIT_MS,
  CLAIMED_SETUP_READ_MS,
  SEND_BLOCK_READ_MS
} from '@web/modules/social-recovery/setup/arm/constants'
import { attachSteps, detachSteps } from '@web/modules/social-recovery/setup/arm/run'

import {
  advanceTimers,
  draftOf,
  ENDINGS,
  HAPPY,
  landedReceipt,
  memoryStorage,
  nodeError,
  operationFor,
  pending,
  requestsFake,
  setupStateOf,
  SHORT_TIMEOUT_MS,
  smartAccount,
  START_BLOCK,
  TX_HASH,
  unawaited,
  wireSave
} from '@web/modules/social-recovery/setup/arm/__tests__/harness'
import type {
  MemoryStorage,
  RequestsFake,
  SaveScript,
  WiredSave
} from '@web/modules/social-recovery/setup/arm/__tests__/harness'

const OPTIONS = { timeoutMs: SHORT_TIMEOUT_MS }

/** Ten minutes: far past any wait of a follow. */
const FAR_MS = 10 * 60_000

let account: Account

beforeAll(async () => {
  account = await smartAccount()
})

beforeEach(() => {
  jest.useFakeTimers()
})

afterEach(() => {
  jest.useRealTimers()
})

const script = (overrides: Partial<SaveScript> = {}): SaveScript => ({
  ...HAPPY,
  authorized: false,
  deployed: true,
  ...overrides
})

const stored = async (wired: WiredSave) => {
  const read = await wired.inFlight.read()
  return read.status === 'present' ? read.value : undefined
}

/** Whether the page offers the Save button now: an idle run that holds nothing and read no stored save. */
const offersSave = (store: ArmStore) => {
  const state = store.state()
  return (
    armScreenOf(state) === 'arrival' &&
    state.write.status === 'idle' &&
    state.lookup === 'none' &&
    state.requestId === undefined
  )
}

/**
 * The first page: it claims and sends, then goes away, before the wallet
 * answered the hash or after the hash was written. Its run is never driven
 * again, and the clock moves past the claim's send limit, so the page could
 * no longer send under it. Answers the record it left.
 */
const firstPageLeaves = async (
  storage: MemoryStorage,
  requests: RequestsFake,
  { withHash }: { withHash: boolean }
) => {
  const first = wireSave(account, script(), { storage, requests })
  if (withHash) {
    first.receipts.wait.mockImplementation(() => pending())
  } else {
    first.port.sendAccountBatch.mockImplementation(() => pending())
  }
  unawaited(startSave(createArmStore(), first.steps, OPTIONS))
  await advanceTimers(0)
  const record = await stored(first)
  expect(record).toBeDefined()
  expect(record?.transactionHash).toBe(withHash ? TX_HASH : undefined)
  expect(first.port.sendAccountBatch).toHaveBeenCalledTimes(1)
  jest.setSystemTime(Date.now() + CLAIM_SEND_LIMIT_MS)
  return { first, record: record! }
}

/** A second page over the same storage, as a reload or a second tab has: a new store, its own edges. */
const secondPage = (storage: MemoryStorage, requests: RequestsFake) => {
  const wired = wireSave(account, script(), { storage, requests })
  const store = createArmStore()
  return { wired, store, arrive: () => lookForSave(store, wired.steps, OPTIONS) }
}

describe('the claim before the send', () => {
  it('stores the prepared save under a new request id once the gas check reads enough, and sends under that id', async () => {
    const wired = wireSave(account, script())
    const sign = deferred<typeof TX_HASH>()
    wired.port.sendAccountBatch.mockImplementationOnce(() => sign.promise)
    const writes = jest.spyOn(wired.storage, 'set')
    unawaited(startSave(createArmStore(), wired.steps, OPTIONS))
    await advanceTimers(0)

    const record = await stored(wired)
    expect(record?.prepared).toEqual(wired.prepared)
    expect(record?.requestId).toEqual(expect.any(String))
    expect(record?.claimedAt).toEqual(expect.any(Number))
    expect(record?.transactionHash).toBeUndefined()
    expect(wired.port.sendAccountBatch).toHaveBeenCalledTimes(1)
    expect(wired.port.sendAccountBatch.mock.calls[0][4]).toBe(record?.requestId)
    const claimedAt = writes.mock.invocationCallOrder[0]
    expect(Math.max(...wired.reads.nativeBalance.mock.invocationCallOrder)).toBeLessThan(claimedAt)
    expect(wired.port.sendAccountBatch.mock.invocationCallOrder[0]).toBeGreaterThan(claimedAt)
    sign.resolve(TX_HASH)
  })

  it('writes the hash and the start block into the stored save when the wallet answers the hash', async () => {
    const wired = wireSave(account, script())
    const receipt = deferred<ReturnType<typeof landedReceipt>>()
    wired.receipts.wait.mockImplementationOnce(() => receipt.promise)
    const store = createArmStore()
    const running = startSave(store, wired.steps, OPTIONS)
    await advanceTimers(0)

    const record = await stored(wired)
    expect(record?.transactionHash).toBe(TX_HASH)
    expect(record?.startBlock).toBe(START_BLOCK)
    expect(store.state().requestId).toBe(record?.requestId)

    receipt.resolve(landedReceipt())
    await advanceTimers(SHORT_TIMEOUT_MS)
    await running
    expect(isSaved(store.state())).toBe(true)
    expect(await stored(wired)).toBeUndefined()
  })

  it('lets the send add its request while the stored save is its own, and never once another page voided it', async () => {
    const wired = wireSave(account, script())
    const sign = deferred<typeof TX_HASH>()
    wired.port.sendAccountBatch.mockImplementationOnce(() => sign.promise)
    unawaited(startSave(createArmStore(), wired.steps, OPTIONS))
    await advanceTimers(0)
    const record = await stored(wired)
    const options = wired.port.sendAccountBatch.mock.calls[0][5]
    expect(await options.canAdd()).toBe(true)

    await wired.steps.release(record!.requestId)
    expect(await stored(wired)).toBeUndefined()
    expect(await options.canAdd()).toBe(false)
    sign.resolve(TX_HASH)
  })

  it('lets the send add its request only within the send limit after the claim', async () => {
    const wired = wireSave(account, script())
    const sign = deferred<typeof TX_HASH>()
    wired.port.sendAccountBatch.mockImplementationOnce(() => sign.promise)
    unawaited(startSave(createArmStore(), wired.steps, OPTIONS))
    await advanceTimers(0)
    const options = wired.port.sendAccountBatch.mock.calls[0][5]
    expect(await options.canAdd()).toBe(true)

    await advanceTimers(CLAIM_SEND_LIMIT_MS)
    expect((await stored(wired))?.transactionHash).toBeUndefined()
    expect(await options.canAdd()).toBe(false)
    sign.resolve(TX_HASH)
  })

  it('reads a claim that throws as never sent, with the retry, and sends nothing', async () => {
    const wired = wireSave(account, script())
    jest.spyOn(wired.storage, 'get').mockRejectedValueOnce(new Error('storage unavailable'))
    const store = createArmStore()
    await startSave(store, wired.steps, OPTIONS)

    expect(store.state().write.status).toBe('failedNotSent')
    expect(canRetry(store.state().write)).toBe(true)
    expect(wired.port.sendAccountBatch).not.toHaveBeenCalled()
    expect(await stored(wired)).toBeUndefined()

    const retry = startSave(store, wired.steps, OPTIONS)
    await advanceTimers(SHORT_TIMEOUT_MS)
    await retry
    expect(wired.port.sendAccountBatch).toHaveBeenCalledTimes(1)
    expect(isSaved(store.state())).toBe(true)
  })

  it('sends once where two pages press Save together over one storage: the first reaches saved, and the other waits on the claim and follows its hash to saved', async () => {
    const storage = memoryStorage()
    const requests = requestsFake()
    const one = wireSave(account, script(), { storage, requests })
    const two = wireSave(account, script(), { storage, requests })
    const stores = [createArmStore(), createArmStore()]
    const runs = [
      startSave(stores[0], one.steps, OPTIONS),
      startSave(stores[1], two.steps, OPTIONS)
    ]
    await advanceTimers(SHORT_TIMEOUT_MS)
    await runs[0]

    expect(one.port.sendAccountBatch).toHaveBeenCalledTimes(1)
    expect(two.port.sendAccountBatch).not.toHaveBeenCalled()
    expect(isSaved(stores[0].state())).toBe(true)
    const sent = one.port.sendAccountBatch.mock.calls[0][4]
    expect(stores[1].state().requestId).toBe(sent)
    expect(stores[1].state().write.status).toBe('submitting')
    expect(offersSave(stores[1])).toBe(false)

    requests.activity = [operationFor(sent, { hash: TX_HASH })]
    await advanceTimers(FOLLOW_REREAD_MS)
    await runs[1]
    expect(isSaved(stores[1].state())).toBe(true)
    expect(two.port.sendAccountBatch).not.toHaveBeenCalled()
    expect(two.prepareCommitSetup).toHaveBeenCalledTimes(1)
  })

  it('sends nothing on a start that loses the claim to a save another page stored, and follows that save under its hash', async () => {
    const storage = memoryStorage()
    const requests = requestsFake()
    const { record } = await firstPageLeaves(storage, requests, { withHash: true })
    const page = wireSave(account, script(), { storage, requests })
    const store = createArmStore()

    const running = startSave(store, page.steps, OPTIONS)
    await advanceTimers(SHORT_TIMEOUT_MS)
    await running

    expect(page.port.sendAccountBatch).not.toHaveBeenCalled()
    expect(page.receipts.wait).toHaveBeenCalledWith(TX_HASH, record.startBlock)
    expect(isSaved(store.state())).toBe(true)
    expect(page.confirmSetup).toHaveBeenCalledTimes(1)
    expect(page.saveSetup).toHaveBeenCalledTimes(1)
  })
})

describe('a save that meets a write of the recovery overview at its claim', () => {
  it('stops with nothing sent or followed where the overview claimed after the save read the account, and leaves its write stored', async () => {
    const storage = memoryStorage()
    const requests = requestsFake()
    const overview = wireSave(account, script(), { storage, requests })
    overview.receipts.wait.mockImplementation(() => pending())
    const overviewSteps: SaveSteps = {
      ...overview.steps,
      newRequestId: () => requestIdOf('removeAuthorization')
    }
    const page = wireSave(account, script(), { storage, requests })
    const store = createArmStore()

    // The save reads the account and prepares; the overview claims before the save's claim.
    const prepared = deferred<void>()
    const pageSteps: SaveSteps = {
      ...page.steps,
      prepare: async () => {
        await prepared.promise
        return page.steps.prepare()
      }
    }
    const running = startSave(store, pageSteps, OPTIONS)
    await advanceTimers(0)
    unawaited(startSave(createArmStore(), overviewSteps, OPTIONS))
    await advanceTimers(0)
    const held = await stored(overview)
    expect(held && intentOfRequest(held.requestId)).toBe('removeAuthorization')

    prepared.resolve()
    await advanceTimers(SHORT_TIMEOUT_MS)
    await running

    expect(store.state().stop).toBe('held-by-another-write')
    expect(armScreenOf(store.state())).toBe('held-by-another-write')
    expect(page.port.sendAccountBatch).not.toHaveBeenCalled()
    expect(page.receipts.wait).not.toHaveBeenCalled()
    expect(page.confirmSetup).not.toHaveBeenCalled()
    expect((await stored(page))?.requestId).toBe(held?.requestId)
  })

  it('stops with nothing sent where its claim held and the stored write became one of the overview before the send, and leaves that write stored', async () => {
    const storage = memoryStorage()
    const requests = requestsFake()
    const page = wireSave(account, script(), { storage, requests })
    const store = createArmStore()
    const overviewId = requestIdOf('clear')
    let claimedByRun: string | undefined
    // Between the claim and the send another page released the save's claim and the overview claimed.
    const pageSteps: SaveSteps = {
      ...page.steps,
      hasSetup: async () => {
        const own = store.state().requestId
        if (own && !claimedByRun) {
          claimedByRun = own
          await page.inFlight.release(own)
          await page.inFlight.claim({
            draft: page.draft,
            prepared: page.prepared,
            requestId: overviewId,
            claimedAt: Date.now()
          })
        }
        return page.steps.hasSetup()
      }
    }

    const running = startSave(store, pageSteps, OPTIONS)
    await advanceTimers(SHORT_TIMEOUT_MS)
    await running

    expect(claimedByRun).toBeDefined()
    expect(store.state().stop).toBe('held-by-another-write')
    expect(store.state().requestId).toBeUndefined()
    expect(page.port.sendAccountBatch).not.toHaveBeenCalled()
    expect(page.receipts.wait).not.toHaveBeenCalled()
    expect(page.confirmSetup).not.toHaveBeenCalled()
    expect((await stored(page))?.requestId).toBe(overviewId)
  })
})

describe('an arrival that finds a stored write of another kind', () => {
  const CASES = [
    {
      named: 'an overview clear that finds a save',
      ownId: () => requestIdOf('clear'),
      otherId: () => 'social-recovery-sender:7'
    },
    {
      named: 'an overview removal of the authorization that finds a save',
      ownId: () => requestIdOf('removeAuthorization'),
      otherId: () => 'social-recovery-sender:7'
    },
    {
      named: 'an overview re-authorize that finds a save',
      ownId: () => requestIdOf('reauthorize'),
      otherId: () => 'social-recovery-sender:7'
    },
    {
      named: 'an editor run that finds a save',
      ownId: () => 'social-recovery-sender:2:manage-remove',
      otherId: () => 'social-recovery-sender:7'
    },
    {
      named: 'a save that finds a write of the overview',
      ownId: undefined,
      otherId: () => requestIdOf('removeAuthorization')
    },
    {
      named: 'an overview clear that finds the removal of the authorization',
      ownId: () => requestIdOf('clear'),
      otherId: () => requestIdOf('removeAuthorization')
    },
    {
      named: 'an overview run that finds a write of the editor',
      ownId: () => requestIdOf('reauthorize'),
      otherId: () => 'social-recovery-sender:1:manage-edit'
    }
  ]

  CASES.forEach(({ named, ownId, otherId: otherIdOf }) =>
    it(`stops with nothing followed, sent or released for ${named}`, async () => {
      const storage = memoryStorage()
      const requests = requestsFake()
      const page = wireSave(account, script(), { storage, requests })
      const otherId = otherIdOf()
      await page.inFlight.claim({
        draft: page.draft,
        prepared: page.prepared,
        requestId: otherId,
        claimedAt: Date.now()
      })
      await page.inFlight.markSent(otherId, TX_HASH, START_BLOCK)
      const store = createArmStore()
      const steps: SaveSteps = ownId ? { ...page.steps, newRequestId: ownId } : page.steps

      await lookForSave(store, steps, OPTIONS)

      expect(store.state().stop).toBe('held-by-another-write')
      expect(store.state().requestId).toBeUndefined()
      expect(page.receipts.wait).not.toHaveBeenCalled()
      expect(page.port.sendAccountBatch).not.toHaveBeenCalled()
      expect(page.confirmSetup).not.toHaveBeenCalled()
      expect((await stored(page))?.requestId).toBe(otherId)
    })
  )

  it('follows a stored save from a save, with nothing sent', async () => {
    const storage = memoryStorage()
    const requests = requestsFake()
    const page = wireSave(account, script(), { storage, requests })
    page.receipts.wait.mockImplementation(() => pending())
    const otherId = 'social-recovery-sender:7'
    await page.inFlight.claim({
      draft: page.draft,
      prepared: page.prepared,
      requestId: otherId,
      claimedAt: Date.now()
    })
    await page.inFlight.markSent(otherId, TX_HASH, START_BLOCK)
    const store = createArmStore()

    unawaited(lookForSave(store, page.steps, OPTIONS))
    await advanceTimers(0)

    expect(store.state().stop).toBeUndefined()
    expect(store.state().requestId).toBe(otherId)
    expect(page.receipts.wait).toHaveBeenCalledWith(TX_HASH, START_BLOCK)
    expect(page.port.sendAccountBatch).not.toHaveBeenCalled()
  })

  it('follows a stored write of the same overview write, with nothing sent', async () => {
    const storage = memoryStorage()
    const requests = requestsFake()
    const page = wireSave(account, script(), { storage, requests })
    page.receipts.wait.mockImplementation(() => pending())
    const otherId = requestIdOf('clear')
    await page.inFlight.claim({
      draft: page.draft,
      prepared: page.prepared,
      requestId: otherId,
      claimedAt: Date.now()
    })
    await page.inFlight.markSent(otherId, TX_HASH, START_BLOCK)
    const store = createArmStore()
    const steps: SaveSteps = { ...page.steps, newRequestId: () => requestIdOf('clear') }

    unawaited(lookForSave(store, steps, OPTIONS))
    await advanceTimers(0)

    expect(store.state().stop).toBeUndefined()
    expect(store.state().requestId).toBe(otherId)
    expect(page.receipts.wait).toHaveBeenCalledWith(TX_HASH, START_BLOCK)
    expect(page.port.sendAccountBatch).not.toHaveBeenCalled()
  })
})

describe('a management write that meets a write of another kind at its claim', () => {
  const CASES = [
    {
      named: 'an overview clear that meets a save',
      ownId: () => requestIdOf('clear'),
      otherId: () => 'social-recovery-sender:7'
    },
    {
      named: 'an overview run that meets a write of the editor',
      ownId: () => requestIdOf('clear'),
      otherId: () => 'social-recovery-sender:1:manage-edit'
    },
    {
      named: 'an editor run that meets a write of the overview',
      ownId: () => 'social-recovery-sender:2:manage-remove',
      otherId: () => requestIdOf('reauthorize')
    },
    {
      named: "an overview clear that meets the overview's re-authorize",
      ownId: () => requestIdOf('clear'),
      otherId: () => requestIdOf('reauthorize')
    }
  ]

  CASES.forEach(({ named, ownId, otherId: otherIdOf }) =>
    it(`stops with nothing sent or followed for ${named}, and leaves that write stored`, async () => {
      const storage = memoryStorage()
      const requests = requestsFake()
      const page = wireSave(account, script(), { storage, requests })
      const otherId = otherIdOf()
      await page.inFlight.claim({
        draft: page.draft,
        prepared: page.prepared,
        requestId: otherId,
        claimedAt: Date.now()
      })
      const store = createArmStore()
      const steps: SaveSteps = { ...page.steps, newRequestId: ownId }

      const running = startSave(store, steps, OPTIONS)
      await advanceTimers(SHORT_TIMEOUT_MS)
      await running

      expect(store.state().stop).toBe('held-by-another-write')
      expect(page.port.sendAccountBatch).not.toHaveBeenCalled()
      expect(page.receipts.wait).not.toHaveBeenCalled()
      expect(page.confirmSetup).not.toHaveBeenCalled()
      expect((await stored(page))?.requestId).toBe(otherId)
    })
  )

  it('follows a write of the overview from another run of that same write, with nothing sent', async () => {
    const storage = memoryStorage()
    const requests = requestsFake()
    const page = wireSave(account, script(), { storage, requests })
    const otherId = requestIdOf('clear')
    await page.inFlight.claim({
      draft: page.draft,
      prepared: page.prepared,
      requestId: otherId,
      claimedAt: Date.now()
    })
    await page.inFlight.markSent(otherId, TX_HASH, START_BLOCK)
    const store = createArmStore()
    const steps: SaveSteps = { ...page.steps, newRequestId: () => requestIdOf('clear') }

    const running = startSave(store, steps, OPTIONS)
    await advanceTimers(SHORT_TIMEOUT_MS)
    await running

    expect(store.state().stop).toBeUndefined()
    expect(store.state().requestId).toBe(otherId)
    expect(page.receipts.wait).toHaveBeenCalledWith(TX_HASH, START_BLOCK)
    expect(page.port.sendAccountBatch).not.toHaveBeenCalled()
  })
})

describe('each way a run ends, against the stored save after it', () => {
  ENDINGS.forEach(({ named, overrides, record, arrange }) =>
    it(`${
      record === 'kept' ? 'keeps the' : record === 'absent' ? 'leaves no' : 'removes the'
    } stored save after ${named}`, async () => {
      const wired = wireSave(account, script(overrides))
      arrange?.(wired)
      const store = createArmStore()
      const claimed = jest.spyOn(wired.storage, 'set')
      const running = startSave(store, wired.steps, OPTIONS)
      await advanceTimers(RECEIPT_WAIT_MS + SHORT_TIMEOUT_MS)
      if (record !== 'kept') {
        await running
      }

      const after = await stored(wired)
      expect(after !== undefined).toBe(record === 'kept')
      expect(claimed.mock.calls.length > 0).toBe(record !== 'absent')
      expect(wired.port.sendAccountBatch.mock.calls.length).toBeLessThanOrEqual(1)
    })
  )
})

describe('the read of a stored save before the save is offered', () => {
  it('offers no Save after a read that failed, and a second read follows the stored save', async () => {
    const storage = memoryStorage()
    const requests = requestsFake()
    await firstPageLeaves(storage, requests, { withHash: true })
    const page = secondPage(storage, requests)
    jest.spyOn(storage, 'get').mockRejectedValueOnce(new Error('storage unavailable'))

    await page.arrive()
    expect(page.store.state().lookup).toBe('failed')
    expect(offersSave(page.store)).toBe(false)

    unawaited(page.arrive())
    await advanceTimers(SHORT_TIMEOUT_MS)
    expect(isSaved(page.store.state())).toBe(true)
    expect(page.wired.port.sendAccountBatch).not.toHaveBeenCalled()
  })

  it('reads once per run held: a page that read none does not read again by itself', async () => {
    const page = secondPage(memoryStorage(), requestsFake())
    const reads = jest.spyOn(page.wired.storage, 'get')
    await page.arrive()
    await page.arrive()

    expect(offersSave(page.store)).toBe(true)
    expect(reads).toHaveBeenCalledTimes(1)
  })
})

describe('a page that finds a save stored under its hash', () => {
  it('offers no Save, sends nothing, waits for the same hash and reaches saved with one check and one wipe', async () => {
    const storage = memoryStorage()
    const requests = requestsFake()
    const { record, first } = await firstPageLeaves(storage, requests, { withHash: true })
    const page = secondPage(storage, requests)
    const receipt = deferred<ReturnType<typeof landedReceipt>>()
    page.wired.receipts.wait.mockImplementationOnce(() => receipt.promise)

    const arriving = page.arrive()
    await advanceTimers(0)
    const { write } = page.store.state()
    expect(write.status === 'submitting' && write.transactionHash).toBe(TX_HASH)
    expect(armScreenOf(page.store.state())).toBe('run')
    expect(offersSave(page.store)).toBe(false)
    expect(page.wired.receipts.wait).toHaveBeenCalledWith(TX_HASH, record.startBlock)

    receipt.resolve(landedReceipt())
    await advanceTimers(SHORT_TIMEOUT_MS)
    await arriving

    expect(isSaved(page.store.state())).toBe(true)
    expect(page.wired.confirmSetup).toHaveBeenCalledTimes(1)
    expect(page.wired.confirmSetup).toHaveBeenCalledWith(page.wired.draft, record.prepared)
    expect(page.wired.saveSetup).toHaveBeenCalledTimes(1)
    expect(await stored(page.wired)).toBeUndefined()
    expect(page.wired.port.sendAccountBatch).not.toHaveBeenCalled()
    expect(page.wired.prepareCommitSetup).not.toHaveBeenCalled()
    expect(first.port.sendAccountBatch).toHaveBeenCalledTimes(1)
  })

  it('reads stalled past the wait limit, and check again takes up the same wait with no other opened', async () => {
    const storage = memoryStorage()
    const requests = requestsFake()
    await firstPageLeaves(storage, requests, { withHash: true })
    const page = secondPage(storage, requests)
    const receipt = deferred<ReturnType<typeof landedReceipt>>()
    page.wired.receipts.wait.mockImplementationOnce(() => receipt.promise)

    unawaited(page.arrive())
    await advanceTimers(RECEIPT_WAIT_MS - 1)
    expect(page.store.state().stalled).toBeFalsy()
    await advanceTimers(1)
    expect(page.store.state().stalled).toBe(true)
    expect(await stored(page.wired)).toBeDefined()

    unawaited(checkReceiptAgain(page.store, page.wired.steps, OPTIONS))
    unawaited(checkReceiptAgain(page.store, page.wired.steps, OPTIONS))
    await advanceTimers(0)
    expect(page.wired.receipts.wait).toHaveBeenCalledTimes(1)
    receipt.resolve(landedReceipt())
    await advanceTimers(SHORT_TIMEOUT_MS)

    expect(isSaved(page.store.state())).toBe(true)
    expect(page.wired.confirmSetup).toHaveBeenCalledTimes(1)
    expect(page.wired.saveSetup).toHaveBeenCalledTimes(1)
    expect(page.wired.port.sendAccountBatch).not.toHaveBeenCalled()
  })

  it('releases the stored save where the followed transaction reverted, and then offers the retry', async () => {
    const storage = memoryStorage()
    const requests = requestsFake()
    await firstPageLeaves(storage, requests, { withHash: true })
    const page = secondPage(storage, requests)
    page.wired.receipts.wait.mockRejectedValueOnce(
      Object.assign(new Error('reverted'), {
        code: 'CALL_EXCEPTION',
        receipt: { hash: TX_HASH, status: 0, blockNumber: START_BLOCK + 1 }
      })
    )

    await page.arrive()

    expect(page.store.state().write.status).toBe('failedReverted')
    expect(canRetry(page.store.state().write)).toBe(true)
    expect(await stored(page.wired)).toBeUndefined()
    expect(page.wired.saveSetup).not.toHaveBeenCalled()
  })
})

describe('a page that finds a save stored with no hash', () => {
  /** The first page went away before the wallet answered the hash; a second page arrives. */
  const arriveWithNoHash = async () => {
    const storage = memoryStorage()
    const requests = requestsFake()
    const { record } = await firstPageLeaves(storage, requests, { withHash: false })
    const page = secondPage(storage, requests)
    return { ...page, requests, record }
  }

  /** How many times the page read the account's activity. */
  const activityReads = (requests: RequestsFake) =>
    requests.dispatch.mock.calls.filter(
      ([action]) => action.type === 'MAIN_CONTROLLER_ACTIVITY_SET_ACC_OPS_FILTERS'
    ).length

  it('shows the save waiting while the wallet queue holds the request, offers no Save, and reads again when the queue changes', async () => {
    const { store, wired, arrive, requests, record } = await arriveWithNoHash()
    requests.queued = [record.requestId]

    unawaited(arrive())
    await advanceTimers(0)
    expect(store.state().write.status).toBe('submitting')
    expect(store.state().follow).toBe('queued')
    expect(offersSave(store)).toBe(false)

    requests.queued = []
    requests.activity = [operationFor(record.requestId, { hash: TX_HASH })]
    requests.pushQueue()
    await advanceTimers(SHORT_TIMEOUT_MS)

    expect(isSaved(store.state())).toBe(true)
    expect(wired.confirmSetup).toHaveBeenCalledTimes(1)
    expect(wired.saveSetup).toHaveBeenCalledTimes(1)
    expect(wired.port.sendAccountBatch).not.toHaveBeenCalled()
  })

  it('reads a queued request again after its rest where the queue does not change', async () => {
    const { store, wired, arrive, requests, record } = await arriveWithNoHash()
    requests.queued = [record.requestId]
    unawaited(arrive())
    await advanceTimers(0)
    requests.queued = []
    requests.activity = [operationFor(record.requestId, { hash: TX_HASH })]

    await advanceTimers(FOLLOW_REREAD_MS - 1)
    expect(store.state().follow).toBe('queued')
    await advanceTimers(1 + SHORT_TIMEOUT_MS)

    expect(isSaved(store.state())).toBe(true)
    expect(wired.port.sendAccountBatch).not.toHaveBeenCalled()
  })

  it('stores the hash of a broadcast request, follows it, and reaches saved with one check and one wipe', async () => {
    const { store, wired, arrive, requests, record } = await arriveWithNoHash()
    requests.activity = [
      operationFor(record.requestId, { hash: TX_HASH, status: AccountOpStatus.BroadcastButStuck })
    ]
    const receipt = deferred<ReturnType<typeof landedReceipt>>()
    wired.receipts.wait.mockImplementationOnce(() => receipt.promise)

    const arriving = arrive()
    await advanceTimers(0)
    const marked = await stored(wired)
    expect(marked?.transactionHash).toBe(TX_HASH)
    expect(marked?.startBlock).toBe(START_BLOCK)
    expect(wired.receipts.wait).toHaveBeenCalledWith(TX_HASH, START_BLOCK)

    receipt.resolve(landedReceipt())
    await advanceTimers(SHORT_TIMEOUT_MS)
    await arriving
    expect(isSaved(store.state())).toBe(true)
    expect(wired.confirmSetup).toHaveBeenCalledTimes(1)
    expect(wired.saveSetup).toHaveBeenCalledTimes(1)
    expect(wired.port.sendAccountBatch).not.toHaveBeenCalled()
  })

  it('reads a request the wallet cannot follow as a save that may still land: no retry, the record kept, and check again leads to the check', async () => {
    const { store, wired, arrive, requests, record } = await arriveWithNoHash()
    requests.activity = [operationFor(record.requestId, { untracked: true })]

    await arrive()
    expect(mayStillLand(store.state().write)).toBe(true)
    expect(canRetry(store.state().write)).toBe(false)
    expect(await stored(wired)).toBeDefined()

    await startSave(store, wired.steps, OPTIONS)
    expect(wired.port.sendAccountBatch).not.toHaveBeenCalled()

    wired.setupState.mockResolvedValue(setupStateOf(true))
    const checking = checkSetupAgain(store, wired.steps, OPTIONS)
    await advanceTimers(SHORT_TIMEOUT_MS)
    await checking
    expect(isSaved(store.state())).toBe(true)
    expect(wired.confirmSetup).toHaveBeenCalledWith(wired.draft, record.prepared)
    expect(await stored(wired)).toBeUndefined()
  })

  it('keeps the record and offers no Save while the activity does not answer, never reading it as gone, and check again reads at once', async () => {
    const { store, wired, arrive, requests } = await arriveWithNoHash()
    requests.activity = null

    unawaited(arrive())
    await advanceTimers(0)
    expect(store.state().follow).toBeUndefined()
    await advanceTimers(10_000)
    expect(store.state().follow).toBe('unread')

    await advanceTimers(FAR_MS)
    expect(store.state().follow).toBe('unread')
    expect(store.state().write.status).toBe('submitting')
    expect(offersSave(store)).toBe(false)
    expect(await stored(wired)).toBeDefined()
    expect(wired.setupState).not.toHaveBeenCalled()

    const reads = activityReads(requests)
    unawaited(checkReceiptAgain(store, wired.steps, OPTIONS))
    await advanceTimers(0)
    expect(activityReads(requests)).toBe(reads + 1)
    expect(wired.port.sendAccountBatch).not.toHaveBeenCalled()
  })

  it('runs the check as after a receipt where the request is gone and the account holds a setup, and reads saved with no hash', async () => {
    const { store, wired, arrive, record } = await arriveWithNoHash()
    wired.setupState.mockResolvedValue(setupStateOf(true))

    const arriving = arrive()
    await advanceTimers(SHORT_TIMEOUT_MS)
    await arriving

    expect(isSaved(store.state())).toBe(true)
    expect(store.state().write.status).toBe('submitting')
    expect(store.state().landedUnseen).toBe(true)
    expect(wired.confirmSetup).toHaveBeenCalledTimes(1)
    expect(wired.confirmSetup).toHaveBeenCalledWith(wired.draft, record.prepared)
    expect(wired.saveSetup).toHaveBeenCalledTimes(1)
    expect(await stored(wired)).toBeUndefined()
    expect(wired.port.sendAccountBatch).not.toHaveBeenCalled()
  })

  it('reads a request the wallet neither queues nor broadcast, with no setup, as never sent at once: it releases the stored save and offers Save again', async () => {
    const { store, wired, arrive } = await arriveWithNoHash()

    const arriving = arrive()
    await advanceTimers(0)
    await arriving
    expect(offersSave(store)).toBe(true)
    expect(armScreenOf(store.state())).toBe('arrival')
    expect(await stored(wired)).toBeUndefined()
    expect(wired.port.sendAccountBatch).not.toHaveBeenCalled()

    // Save is a fresh start: it reads the setup, prepares and sends once.
    const saving = startSave(store, wired.steps, OPTIONS)
    await advanceTimers(SHORT_TIMEOUT_MS)
    await saving
    expect(wired.port.sendAccountBatch).toHaveBeenCalledTimes(1)
    expect(isSaved(store.state())).toBe(true)
  })

  it('follows a request the queue holds, and releases it at once with Save offered once the queue lets it go with nothing broadcast', async () => {
    const { store, wired, arrive, requests, record } = await arriveWithNoHash()
    requests.queued = [record.requestId]

    unawaited(arrive())
    await advanceTimers(FAR_MS)
    expect(store.state().follow).toBe('queued')
    expect(offersSave(store)).toBe(false)
    expect(await stored(wired)).toBeDefined()

    requests.queued = []
    requests.pushQueue()
    await advanceTimers(0)
    expect(offersSave(store)).toBe(true)
    expect(await stored(wired)).toBeUndefined()
    expect(wired.port.sendAccountBatch).not.toHaveBeenCalled()
  })

  it('leaves the page whose send runs in its own state: a second page follows its queued request, and the first reaches saved with one send', async () => {
    const storage = memoryStorage()
    const requests = requestsFake()
    const first = wireSave(account, script(), { storage, requests })
    const sign = deferred<typeof TX_HASH>()
    first.port.sendAccountBatch.mockImplementationOnce(() => sign.promise)
    const own = createArmStore()
    const running = startSave(own, first.steps, OPTIONS)
    await advanceTimers(0)
    const { requestId } = own.state()
    requests.queued = [requestId!]

    const second = secondPage(storage, requests)
    unawaited(second.arrive())
    await advanceTimers(0)
    expect(second.store.state().follow).toBe('queued')
    expect(offersSave(second.store)).toBe(false)
    expect((await stored(second.wired))?.requestId).toBe(requestId)
    expect(own.state().write.status).toBe('submitting')
    expect(own.state().requestId).toBe(requestId)

    sign.resolve(TX_HASH)
    requests.queued = []
    requests.activity = [operationFor(requestId!, { hash: TX_HASH })]
    requests.pushQueue()
    await advanceTimers(SHORT_TIMEOUT_MS)
    await running
    expect(isSaved(own.state())).toBe(true)
    expect(first.port.sendAccountBatch).toHaveBeenCalledTimes(1)
    expect(second.wired.port.sendAccountBatch).not.toHaveBeenCalled()
  })

  it('keeps the record where the setup read of a gone request fails, and never voids on it', async () => {
    const { store, wired, arrive } = await arriveWithNoHash()
    wired.setupState.mockRejectedValue(nodeError())

    unawaited(arrive())
    await advanceTimers(FAR_MS)

    expect(offersSave(store)).toBe(false)
    expect(store.state().write.status).toBe('submitting')
    expect(await stored(wired)).toBeDefined()
  })
})

describe('the setup read after the claim', () => {
  it("sends nothing where another page's save landed, and its stored save left, during this page's gas check: the claim is released and the run ends as already set up", async () => {
    const storage = memoryStorage()
    const requests = requestsFake()
    let onChain = false
    const first = wireSave(account, script(), { storage, requests })
    const second = wireSave(account, script(), { storage, requests })
    ;[first, second].forEach((page) =>
      page.setupState.mockImplementation(async () => setupStateOf(onChain))
    )
    first.receipts.wait.mockImplementation(async (hash) => {
      onChain = true
      return landedReceipt(hash)
    })
    const gas = deferred<bigint>()
    second.reads.nativeBalance.mockImplementationOnce(() => gas.promise)

    // The second page reads no stored save and no setup, and offers Save; Save starts its run.
    const store = createArmStore()
    await lookForSave(store, second.steps, OPTIONS)
    expect(offersSave(store)).toBe(true)
    const running = startSave(store, second.steps, OPTIONS)
    await advanceTimers(0)
    expect(store.state().write.status).toBe('checkingGas')
    expect(second.setupState).toHaveBeenCalledTimes(1)

    // Meanwhile the first page's save lands, its check agrees, and its wipe takes the stored save.
    const firstStore = createArmStore()
    const firstRun = startSave(firstStore, first.steps, OPTIONS)
    await advanceTimers(SHORT_TIMEOUT_MS)
    await firstRun
    expect(isSaved(firstStore.state())).toBe(true)
    expect(await stored(first)).toBeUndefined()
    const writes = jest.spyOn(storage, 'set')
    const removals = jest.spyOn(storage, 'remove')

    gas.resolve(1_000_000_000_000_000_000n)
    await advanceTimers(SHORT_TIMEOUT_MS)
    await running

    // The second page's claim found no record and was written, then released.
    expect(writes).toHaveBeenCalledTimes(1)
    expect(removals).toHaveBeenCalledTimes(1)
    expect(second.setupState).toHaveBeenCalledTimes(2)
    expect(second.setupState.mock.invocationCallOrder[1]).toBeGreaterThan(
      writes.mock.invocationCallOrder[0]
    )
    expect(store.state().stop).toBe('already-set-up')
    expect(armScreenOf(store.state())).toBe('already-set-up')
    expect(store.state().requestId).toBeUndefined()
    expect(second.port.sendAccountBatch).not.toHaveBeenCalled()
    expect(first.port.sendAccountBatch).toHaveBeenCalledTimes(1)
    expect(second.confirmSetup).not.toHaveBeenCalled()
    expect(second.saveSetup).not.toHaveBeenCalled()
    expect(await stored(second)).toBeUndefined()
  })

  it('reads a setup read after the claim that throws as never sent, with the claim released and nothing sent, and the retry sends once', async () => {
    const wired = wireSave(account, script())
    wired.setupState
      .mockResolvedValueOnce(setupStateOf(false))
      .mockRejectedValueOnce(new Error('the node did not answer the setup read'))
    const removals = jest.spyOn(wired.storage, 'remove')
    const store = createArmStore()

    await startSave(store, wired.steps, OPTIONS)

    expect(store.state().write.status).toBe('failedNotSent')
    expect(canRetry(store.state().write)).toBe(true)
    expect(mayStillLand(store.state().write)).toBe(false)
    expect(store.state().requestId).toBeUndefined()
    expect(wired.port.sendAccountBatch).not.toHaveBeenCalled()
    expect(removals).toHaveBeenCalledTimes(1)
    expect(await stored(wired)).toBeUndefined()

    const retry = startSave(store, wired.steps, OPTIONS)
    await advanceTimers(SHORT_TIMEOUT_MS)
    await retry
    expect(wired.port.sendAccountBatch).toHaveBeenCalledTimes(1)
    expect(isSaved(store.state())).toBe(true)
    expect(await stored(wired)).toBeUndefined()
  })
})

/** The first page went away before the wallet answered the hash; another page's screen follows the save it stored. */
const followWithNoHash = async () => {
  const storage = memoryStorage()
  const { record } = await firstPageLeaves(storage, requestsFake(), { withHash: false })
  return { storage, record }
}

/** A screen's steps over the device's storage and the wallet's queue and activity as that screen reads them. */
const screenOver = (storage: MemoryStorage, requests: RequestsFake) =>
  wireSave(account, script(), { storage, requests })

/** Counts the subscriptions to the wallet's pushes that are still open. */
const openSubscriptions = (requests: RequestsFake) => {
  let open = 0
  const subscribe = requests.subscribe.bind(requests)
  jest.spyOn(requests, 'subscribe').mockImplementation((listener) => {
    open += 1
    const unsubscribe = subscribe(listener)
    let closed = false
    return () => {
      if (!closed) {
        closed = true
        open -= 1
      }
      unsubscribe()
    }
  })
  return () => open
}

describe('a follow with no hash whose screen went away', () => {
  it('pauses while the request was queued at the unmount, reads, voids and releases nothing long after, and on the next screen reads the live queue to saved', async () => {
    const { storage, record } = await followWithNoHash()
    const gone = requestsFake()
    gone.queued = [record.requestId]
    const subscriptions = openSubscriptions(gone)
    const before = screenOver(storage, gone)
    const reads = jest.spyOn(before.steps, 'requestState')
    const store = createArmStore()
    unawaited(lookForSave(store, before.steps, OPTIONS))
    await advanceTimers(0)
    expect(store.state().follow).toBe('queued')

    // The screen unmounts: its queue stays as it was, the request in it.
    detachSteps(before.steps)
    const readsAtUnmount = reads.mock.calls.length
    const removals = jest.spyOn(storage, 'remove')
    await advanceTimers(FAR_MS)

    expect(reads).toHaveBeenCalledTimes(readsAtUnmount)
    expect(store.state().write.status).toBe('submitting')
    expect(store.state().requestId).toBe(record.requestId)
    expect(store.state().landedUnseen).toBeUndefined()
    expect(removals).not.toHaveBeenCalled()
    expect((await stored(before))?.transactionHash).toBeUndefined()
    expect(before.setupState).not.toHaveBeenCalled()
    // Nothing of the paused follow is left running.
    expect(jest.getTimerCount()).toBe(0)
    expect(subscriptions()).toBe(0)

    // The wallet broadcast it meanwhile; the next screen reads its own live queue and activity.
    const live = requestsFake()
    live.activity = [operationFor(record.requestId, { hash: TX_HASH })]
    const after = screenOver(storage, live)
    unawaited(attachSteps(store, after.steps, OPTIONS))
    await advanceTimers(SHORT_TIMEOUT_MS)

    expect(isSaved(store.state())).toBe(true)
    expect(after.receipts.wait).toHaveBeenCalledWith(TX_HASH, START_BLOCK)
    expect(after.confirmSetup).toHaveBeenCalledTimes(1)
    expect(after.saveSetup).toHaveBeenCalledTimes(1)
    expect(before.confirmSetup).not.toHaveBeenCalled()
    expect(before.saveSetup).not.toHaveBeenCalled()
    expect(reads).toHaveBeenCalledTimes(readsAtUnmount)
    expect(await stored(after)).toBeUndefined()
    expect(after.port.sendAccountBatch).not.toHaveBeenCalled()
    expect(before.port.sendAccountBatch).not.toHaveBeenCalled()
  })
})

describe('a follower checks with the draft the stored save sent', () => {
  /** A second page whose own setup records now hold another draft than the one the first page sent. */
  const pageWithAnotherDraft = (storage: MemoryStorage, requests: RequestsFake) => {
    const page = wireSave(account, script({ backup: 'clear' }), { storage, requests })
    expect(page.draft).not.toEqual(draftOf('encrypted'))
    return page
  }

  const FOLLOWS: {
    named: string
    withHash: boolean
    arrange: (requestId: string, page: WiredSave, requests: RequestsFake) => void
  }[] = [
    { named: 'under its hash', withHash: true, arrange: () => {} },
    {
      named: 'with no hash, broadcast',
      withHash: false,
      arrange: (requestId, _page, requests) => {
        // eslint-disable-next-line no-param-reassign
        requests.activity = [operationFor(requestId, { hash: TX_HASH })]
      }
    },
    {
      named: 'with no hash, gone with a setup on the account',
      withHash: false,
      arrange: (_requestId, page) => {
        page.setupState.mockResolvedValue(setupStateOf(true))
      }
    }
  ]

  FOLLOWS.forEach(({ named, withHash, arrange }) =>
    it(`checks ${named} with the sent draft and prepared write, reads agreed and wipes`, async () => {
      const storage = memoryStorage()
      const requests = requestsFake()
      const { record } = await firstPageLeaves(storage, requests, { withHash })
      expect(record.draft).toEqual(draftOf('encrypted'))
      const page = pageWithAnotherDraft(storage, requests)
      arrange(record.requestId, page, requests)
      const store = createArmStore()

      const arriving = lookForSave(store, page.steps, OPTIONS)
      await advanceTimers(SHORT_TIMEOUT_MS)
      await arriving

      expect(page.confirmSetup).toHaveBeenCalledTimes(1)
      expect(page.confirmSetup).toHaveBeenCalledWith(record.draft, record.prepared)
      expect(isSaved(store.state())).toBe(true)
      expect(page.saveSetup).toHaveBeenCalledTimes(1)
      expect(await stored(page)).toBeUndefined()
      expect(page.port.sendAccountBatch).not.toHaveBeenCalled()
    })
  )

  it('stores at the claim the draft the save commits, with its shape note rebuilt, and a follower checks with that draft', async () => {
    const storage = memoryStorage()
    const requests = requestsFake()
    const stale = shapeNoteOf({ clauses: [], wait: 1, ignoresPause: true })
    const first = wireSave(account, script({ publicMetadata: stale }), { storage, requests })
    first.receipts.wait.mockImplementation(() => pending())
    unawaited(startSave(createArmStore(), first.steps, OPTIONS))
    await advanceTimers(0)
    const record = await stored(first)
    const committed = committedDraftOf(first.draft)
    expect(committed).not.toEqual(first.draft)
    expect(record?.draft).toEqual(committed)

    const page = secondPage(storage, requests)
    const arriving = page.arrive()
    await advanceTimers(SHORT_TIMEOUT_MS)
    await arriving
    expect(page.wired.confirmSetup).toHaveBeenCalledWith(committed, record?.prepared)
    expect(isSaved(page.store.state())).toBe(true)
  })

  it('checks with the sent draft on a start that lost the claim, not with the draft it prepared itself', async () => {
    const storage = memoryStorage()
    const requests = requestsFake()
    const { record } = await firstPageLeaves(storage, requests, { withHash: true })
    const page = pageWithAnotherDraft(storage, requests)
    const store = createArmStore()

    const running = startSave(store, page.steps, OPTIONS)
    await advanceTimers(SHORT_TIMEOUT_MS)
    await running

    expect(page.prepareCommitSetup).toHaveBeenCalledWith(page.draft, undefined)
    expect(page.confirmSetup).toHaveBeenCalledTimes(1)
    expect(page.confirmSetup).toHaveBeenCalledWith(record.draft, record.prepared)
    expect(isSaved(store.state())).toBe(true)
    expect(page.saveSetup).toHaveBeenCalledTimes(1)
    expect(page.port.sendAccountBatch).not.toHaveBeenCalled()
  })
})

describe('the read of the stored save after a void', () => {
  it('releases the void save before it reads again, and follows the save another page claimed meanwhile, with no Save offered', async () => {
    const { storage, record } = await followWithNoHash()
    const requests = requestsFake()
    const page = screenOver(storage, requests)
    const other = screenOver(storage, requests)
    const store = createArmStore()
    const seen: string[] = []
    const steps: SaveSteps = {
      ...page.steps,
      readInFlight: () => {
        seen.push('read')
        return page.steps.readInFlight()
      },
      releaseUnsent: async (requestId) => {
        const { write, lookup, requestId: claim } = store.state()
        seen.push(`release while ${write.status}, lookup ${lookup}, claim ${claim}`)
        await page.steps.releaseUnsent(requestId)
        // Another page claims under a new id between the release and the next read.
        requests.queued = ['claimed meanwhile']
        await other.steps.claim(
          { draft: other.draft, prepared: other.prepared, calls: [] },
          'claimed meanwhile',
          START_BLOCK
        )
      }
    }

    unawaited(lookForSave(store, steps, OPTIONS))
    await advanceTimers(SHORT_TIMEOUT_MS)

    expect(seen).toEqual(['read', 'release while idle, lookup undefined, claim undefined', 'read'])
    expect(store.state().requestId).toBe('claimed meanwhile')
    expect(store.state().write.status).toBe('submitting')
    expect(store.state().follow).toBe('queued')
    expect(offersSave(store)).toBe(false)
    expect((await stored(page))?.requestId).toBe('claimed meanwhile')
    expect(record.requestId).not.toBe('claimed meanwhile')
    expect(page.port.sendAccountBatch).not.toHaveBeenCalled()
  })

  it('offers no Save between the void and the read that answers none, then offers it', async () => {
    const { storage } = await followWithNoHash()
    const page = screenOver(storage, requestsFake())
    const second = deferred<Awaited<ReturnType<SaveSteps['readInFlight']>>>()
    let readsMade = 0
    const steps: SaveSteps = {
      ...page.steps,
      readInFlight: () => {
        readsMade += 1
        return readsMade === 1 ? page.steps.readInFlight() : second.promise
      }
    }
    const store = createArmStore()

    unawaited(lookForSave(store, steps, OPTIONS))
    await advanceTimers(SHORT_TIMEOUT_MS)

    expect(readsMade).toBe(2)
    expect(store.state().write.status).toBe('idle')
    expect(store.state().lookup).toBe('reading')
    expect(offersSave(store)).toBe(false)
    expect(await stored(page)).toBeUndefined()

    second.resolve(await page.steps.readInFlight())
    await advanceTimers(0)
    expect(offersSave(store)).toBe(true)
  })
})

describe('the void of a followed save', () => {
  it('releases at once a request the wallet does not hold where the claim is past its send limit', async () => {
    const storage = memoryStorage()
    const requests = requestsFake()
    const owner = screenOver(storage, requests)
    await owner.inFlight.claim({
      draft: owner.draft,
      prepared: owner.prepared,
      requestId: 'old claim',
      claimedAt: Date.now() - CLAIM_SEND_LIMIT_MS
    })
    const page = secondPage(storage, requests)

    const arriving = page.arrive()
    await advanceTimers(0)
    expect(offersSave(page.store)).toBe(true)
    expect(await stored(page.wired)).toBeUndefined()
    await arriving
    expect(page.wired.port.sendAccountBatch).not.toHaveBeenCalled()
  })

  it('reads a request the wallet does not hold as in flight while the claim is under its send limit, and releases it once the limit passes', async () => {
    const storage = memoryStorage()
    const requests = requestsFake()
    const owner = screenOver(storage, requests)
    await owner.inFlight.claim({
      draft: owner.draft,
      prepared: owner.prepared,
      requestId: 'young claim',
      claimedAt: Date.now()
    })
    const page = secondPage(storage, requests)

    unawaited(page.arrive())
    await advanceTimers(0)
    expect(page.store.state().requestId).toBe('young claim')
    expect(page.store.state().follow).toBe('queued')
    expect(offersSave(page.store)).toBe(false)
    expect(page.wired.setupState).not.toHaveBeenCalled()

    await advanceTimers(CLAIM_SEND_LIMIT_MS - 1)
    expect(offersSave(page.store)).toBe(false)
    expect((await stored(page.wired))?.requestId).toBe('young claim')

    await advanceTimers(1)
    expect(offersSave(page.store)).toBe(true)
    expect(await stored(page.wired)).toBeUndefined()
    expect(page.wired.port.sendAccountBatch).not.toHaveBeenCalled()
  })

  it('keeps a stored save that holds a hash where the request reads gone', async () => {
    const storage = memoryStorage()
    const requests = requestsFake()
    const owner = screenOver(storage, requests)
    await owner.inFlight.claim({
      draft: owner.draft,
      prepared: owner.prepared,
      requestId: 'sent claim',
      claimedAt: Date.now() - CLAIM_SEND_LIMIT_MS
    })
    const page = secondPage(storage, requests)
    // The owner writes its hash while this page reads the setup.
    const setup = deferred<ReturnType<typeof setupStateOf>>()
    page.wired.setupState.mockImplementationOnce(() => setup.promise)
    unawaited(page.arrive())
    await advanceTimers(0)
    expect(page.wired.setupState).toHaveBeenCalledTimes(1)
    await owner.inFlight.markSent('sent claim', TX_HASH)

    setup.resolve(setupStateOf(false))
    await advanceTimers(SHORT_TIMEOUT_MS)
    // The page reads the stored save again, follows its hash and lands, with no Save offered.
    expect(isSaved(page.store.state())).toBe(true)
    expect(page.wired.receipts.wait).toHaveBeenCalledWith(TX_HASH, expect.anything())
    expect(page.wired.port.sendAccountBatch).not.toHaveBeenCalled()
  })

  /**
   * The owner's page claims and then holds where `hold` makes it hold, before
   * its send; the follower arrives meanwhile. Once the answer `hold` returns
   * lets the owner go on, its send reaches the wallet, which queues the
   * request and then broadcasts it.
   */
  const followDuringOwnersReads = async (hold: (owner: WiredSave) => () => void) => {
    const storage = memoryStorage()
    const requests = requestsFake()
    const owner = wireSave(account, script(), { storage, requests })
    const proceed = hold(owner)
    owner.port.sendAccountBatch.mockImplementation(() => pending())
    unawaited(startSave(createArmStore(), owner.steps, OPTIONS))
    await advanceTimers(0)
    const claim = await stored(owner)
    expect(claim).toBeDefined()
    expect(owner.port.sendAccountBatch).not.toHaveBeenCalled()

    const follower = secondPage(storage, requests)
    unawaited(follower.arrive())
    await advanceTimers(0)
    expect(follower.store.state().requestId).toBe(claim!.requestId)
    expect(offersSave(follower.store)).toBe(false)
    expect(follower.wired.setupState).not.toHaveBeenCalled()
    expect(await stored(owner)).toEqual(claim)

    proceed()
    await advanceTimers(0)
    expect(owner.port.sendAccountBatch).toHaveBeenCalledTimes(1)
    requests.queued = [claim!.requestId]
    requests.pushQueue()
    await advanceTimers(0)
    expect(follower.store.state().follow).toBe('queued')
    expect(await stored(owner)).toEqual(claim)

    requests.queued = []
    requests.activity = [operationFor(claim!.requestId, { hash: TX_HASH })]
    requests.pushQueue()
    await advanceTimers(SHORT_TIMEOUT_MS)
    expect(isSaved(follower.store.state())).toBe(true)
    expect(follower.wired.receipts.wait).toHaveBeenCalledWith(TX_HASH, expect.anything())
    expect(owner.port.sendAccountBatch).toHaveBeenCalledTimes(1)
    expect(follower.wired.port.sendAccountBatch).not.toHaveBeenCalled()
  }

  it('waits on a claim whose page still reads its stored save and follows its hash, with one send in all', async () => {
    await followDuringOwnersReads((owner) => {
      const answer = deferred<void>()
      const readInFlight = owner.steps.readInFlight.bind(owner.steps)
      jest.spyOn(owner.steps, 'readInFlight').mockImplementationOnce(async () => {
        const capture = await readInFlight()
        await answer.promise
        return capture
      })
      return () => answer.resolve()
    })
  })

  it('waits on a claim whose page still reads the setup after its claim and follows its hash, with one send in all', async () => {
    await followDuringOwnersReads((owner) => {
      const setup = deferred<ReturnType<typeof setupStateOf>>()
      owner.setupState
        .mockResolvedValueOnce(setupStateOf(false))
        .mockImplementationOnce(() => setup.promise)
      return () => setup.resolve(setupStateOf(false))
    })
  })
})

describe('the start block stored with the claim', () => {
  it('stores the block read just before the claim, and keeps it when the hash is written', async () => {
    const wired = wireSave(account, script())
    wired.receipts.blockNumber.mockResolvedValueOnce(START_BLOCK + 5)
    const sign = deferred<typeof TX_HASH>()
    wired.port.sendAccountBatch.mockImplementationOnce(() => sign.promise)
    wired.receipts.wait.mockImplementation(() => pending())
    const writes = jest.spyOn(wired.storage, 'set')
    unawaited(startSave(createArmStore(), wired.steps, OPTIONS))
    await advanceTimers(0)

    const claimed = await stored(wired)
    expect(claimed?.startBlock).toBe(START_BLOCK + 5)
    expect(claimed?.transactionHash).toBeUndefined()
    const [blockRead] = wired.receipts.blockNumber.mock.invocationCallOrder
    expect(blockRead).toBeGreaterThan(
      Math.max(...wired.reads.nativeBalance.mock.invocationCallOrder)
    )
    expect(blockRead).toBeLessThan(writes.mock.invocationCallOrder[0])

    // The send starts from the claim's block, which the stored save keeps.
    sign.resolve(TX_HASH)
    await advanceTimers(0)
    const marked = await stored(wired)
    expect(marked?.transactionHash).toBe(TX_HASH)
    expect(marked?.startBlock).toBe(START_BLOCK + 5)
  })

  it("stores a claim with no block where the block read fails, then the hash with the send's block", async () => {
    const wired = wireSave(account, script())
    wired.receipts.blockNumber.mockRejectedValueOnce(nodeError())
    const sign = deferred<typeof TX_HASH>()
    wired.port.sendAccountBatch.mockImplementationOnce(() => sign.promise)
    wired.receipts.wait.mockImplementation(() => pending())
    unawaited(startSave(createArmStore(), wired.steps, OPTIONS))
    await advanceTimers(0)

    const claimed = await stored(wired)
    expect(claimed).toBeDefined()
    expect(claimed?.startBlock).toBeUndefined()
    expect(wired.port.sendAccountBatch).toHaveBeenCalledTimes(1)

    sign.resolve(TX_HASH)
    await advanceTimers(0)
    const marked = await stored(wired)
    expect(marked?.transactionHash).toBe(TX_HASH)
    expect(marked?.startBlock).toBe(START_BLOCK)
  })

  it("waits, as a follower of a broadcast request, from the claim's block, which its hash write keeps", async () => {
    const storage = memoryStorage()
    const requests = requestsFake()
    const first = wireSave(account, script(), { storage, requests })
    first.receipts.blockNumber.mockResolvedValue(START_BLOCK - 7)
    first.port.sendAccountBatch.mockImplementation(() => pending())
    unawaited(startSave(createArmStore(), first.steps, OPTIONS))
    await advanceTimers(0)
    const record = await stored(first)
    expect(record?.startBlock).toBe(START_BLOCK - 7)

    requests.activity = [operationFor(record!.requestId, { hash: TX_HASH })]
    const page = secondPage(storage, requests)
    const receipt = deferred<ReturnType<typeof landedReceipt>>()
    page.wired.receipts.wait.mockImplementationOnce(() => receipt.promise)
    const arriving = page.arrive()
    await advanceTimers(0)

    const marked = await stored(page.wired)
    expect(marked?.transactionHash).toBe(TX_HASH)
    expect(marked?.startBlock).toBe(START_BLOCK - 7)
    expect(page.wired.receipts.wait).toHaveBeenCalledWith(TX_HASH, START_BLOCK - 7)

    receipt.resolve(landedReceipt())
    await advanceTimers(SHORT_TIMEOUT_MS)
    await arriving
    expect(isSaved(page.store.state())).toBe(true)
  })

  it('stores the hash a follower read where the claim holds no block and its own block read fails', async () => {
    const storage = memoryStorage()
    const requests = requestsFake()
    const first = wireSave(account, script(), { storage, requests })
    first.receipts.blockNumber.mockRejectedValueOnce(nodeError())
    first.port.sendAccountBatch.mockImplementation(() => pending())
    unawaited(startSave(createArmStore(), first.steps, OPTIONS))
    await advanceTimers(0)
    const record = await stored(first)
    expect(record?.startBlock).toBeUndefined()

    requests.activity = [operationFor(record!.requestId, { hash: TX_HASH })]
    const page = secondPage(storage, requests)
    page.wired.receipts.blockNumber.mockRejectedValue(nodeError())
    page.wired.receipts.wait.mockImplementation(() => pending())
    unawaited(page.arrive())
    await advanceTimers(0)

    const marked = await stored(page.wired)
    expect(marked?.transactionHash).toBe(TX_HASH)
    expect(marked?.startBlock).toBeUndefined()
    expect(page.wired.port.sendAccountBatch).not.toHaveBeenCalled()
  })
})

describe('the block numbers the chain answers', () => {
  ;[-1, 1.5, Number.MAX_SAFE_INTEGER + 1].forEach((block) =>
    it(`stores the claim with no block where the block read answers ${block}, and the save goes on to saved`, async () => {
      const wired = wireSave(account, script())
      wired.receipts.blockNumber.mockResolvedValueOnce(block)
      const sign = deferred<typeof TX_HASH>()
      wired.port.sendAccountBatch.mockImplementationOnce(() => sign.promise)
      const store = createArmStore()
      const running = startSave(store, wired.steps, OPTIONS)
      await advanceTimers(0)

      const claimed = await stored(wired)
      expect(claimed).toBeDefined()
      expect(claimed?.startBlock).toBeUndefined()
      expect(wired.port.sendAccountBatch).toHaveBeenCalledTimes(1)

      sign.resolve(TX_HASH)
      await advanceTimers(SHORT_TIMEOUT_MS)
      await running
      expect(isSaved(store.state())).toBe(true)
      expect(wired.port.sendAccountBatch).toHaveBeenCalledTimes(1)
    })
  )
})

describe('the block the send starts from', () => {
  /**
   * Wraps the stored save's read so `answered` is called the moment the read
   * answers, with the count of block reads asked until then.
   */
  const markAnswers = (wired: WiredSave) => {
    const answered = jest.fn()
    const readInFlight = wired.steps.readInFlight.bind(wired.steps)
    jest.spyOn(wired.steps, 'readInFlight').mockImplementation(async () => {
      const read = await readInFlight()
      answered(wired.receipts.blockNumber.mock.calls.length)
      return read
    })
    return answered
  }

  /** Every call any edge of the save took, by its place in the order of all calls. */
  const edgeCallsOf = (wired: WiredSave, extra: jest.SpyInstance[]): number[] =>
    [
      wired.setupState,
      wired.prepareCommitSetup,
      wired.confirmSetup,
      wired.reads.nativeBalance,
      wired.reads.estimateGas,
      wired.reads.gasPrice,
      wired.port.sendAccountBatch,
      wired.receipts.blockNumber,
      wired.receipts.wait,
      wired.requests.dispatch,
      ...extra
    ].flatMap((edge) => edge.mock.invocationCallOrder)

  it('hands the request to the wallet with no read of the chain or the storage after the stored save answers its own claim', async () => {
    const wired = wireSave(account, script())
    const answered = markAnswers(wired)
    const touches = [
      jest.spyOn(wired.storage, 'get'),
      jest.spyOn(wired.storage, 'set'),
      jest.spyOn(wired.storage, 'remove')
    ]
    // The claim's block read fails, so the send's block is read after the setup read; a
    // block read asked after the stored save answered never answers.
    let claimBlockRead = true
    wired.receipts.blockNumber.mockImplementation(() => {
      if (claimBlockRead) {
        claimBlockRead = false
        return Promise.reject(nodeError())
      }
      return answered.mock.calls.length > 0 ? pending<number>() : Promise.resolve(START_BLOCK)
    })
    wired.receipts.wait.mockImplementation(() => pending())
    const store = createArmStore()
    unawaited(startSave(store, wired.steps, OPTIONS))
    await advanceTimers(0)

    expect(wired.port.sendAccountBatch).toHaveBeenCalledTimes(1)
    expect(answered).toHaveBeenCalledTimes(1)
    const [[blockReadsAtAnswer]] = answered.mock.calls
    expect(wired.receipts.blockNumber).toHaveBeenCalledTimes(blockReadsAtAnswer)

    // The order: the setup read after the claim, the send's block, the stored save, the send.
    const [, claimedSetupRead] = wired.setupState.mock.invocationCallOrder
    const [, sendBlockRead] = wired.receipts.blockNumber.mock.invocationCallOrder
    const [answeredAt] = answered.mock.invocationCallOrder
    const [sentAt] = wired.port.sendAccountBatch.mock.invocationCallOrder
    expect(claimedSetupRead).toBeLessThan(sendBlockRead)
    expect(sendBlockRead).toBeLessThan(answeredAt)
    expect(answeredAt).toBeLessThan(sentAt)
    expect(edgeCallsOf(wired, touches).filter((at) => at > answeredAt && at < sentAt)).toEqual([])
    const { write } = store.state()
    expect(write.status === 'submitting' && write.transactionHash).toBe(TX_HASH)
  })

  it("starts the drive's wait from the claim's block with no block read after the claim", async () => {
    const wired = wireSave(account, script())
    wired.receipts.blockNumber.mockResolvedValueOnce(START_BLOCK + 5)
    wired.receipts.wait.mockImplementation(() => pending())
    const writes = jest.spyOn(wired.storage, 'set')
    unawaited(startSave(createArmStore(), wired.steps, OPTIONS))
    await advanceTimers(0)

    expect(wired.port.sendAccountBatch).toHaveBeenCalledTimes(1)
    expect(wired.receipts.blockNumber).toHaveBeenCalledTimes(1)
    expect(wired.receipts.blockNumber.mock.invocationCallOrder[0]).toBeLessThan(
      writes.mock.invocationCallOrder[0]
    )
    expect(wired.receipts.wait).toHaveBeenCalledWith(TX_HASH, START_BLOCK + 5)
  })

  it('reads the block once after the setup read where the claim holds none, and starts the wait from it', async () => {
    const wired = wireSave(account, script())
    wired.receipts.blockNumber
      .mockRejectedValueOnce(nodeError())
      .mockResolvedValueOnce(START_BLOCK + 3)
    wired.receipts.wait.mockImplementation(() => pending())
    const answered = markAnswers(wired)
    unawaited(startSave(createArmStore(), wired.steps, OPTIONS))
    await advanceTimers(0)

    expect(wired.port.sendAccountBatch).toHaveBeenCalledTimes(1)
    expect(wired.receipts.blockNumber).toHaveBeenCalledTimes(2)
    const [, sendBlockRead] = wired.receipts.blockNumber.mock.invocationCallOrder
    expect(sendBlockRead).toBeGreaterThan(wired.setupState.mock.invocationCallOrder[1])
    expect(sendBlockRead).toBeLessThan(answered.mock.invocationCallOrder[0])
    expect(wired.receipts.wait).toHaveBeenCalledWith(TX_HASH, START_BLOCK + 3)
    expect((await stored(wired))?.startBlock).toBe(START_BLOCK + 3)
  })

  /**
   * After a run that ended on the send's block: nothing sent, the claim
   * released, the retry offered; a read past its limit reads as a failed read.
   */
  const expectEndedNotSent = async (
    wired: WiredSave,
    store: ArmStore,
    status: 'failedNotSent' | 'gasReadError' = 'failedNotSent'
  ) => {
    expect(store.state().write.status).toBe(status)
    expect(canRetry(store.state().write)).toBe(true)
    expect(mayStillLand(store.state().write)).toBe(false)
    expect(store.state().requestId).toBeUndefined()
    expect(await stored(wired)).toBeUndefined()
    expect(wired.port.sendAccountBatch).not.toHaveBeenCalled()
    expect(wired.steps.readInFlight).not.toHaveBeenCalled()
  }

  /** The retry runs the whole path again and sends once. */
  const expectRetrySendsOnce = async (wired: WiredSave, store: ArmStore) => {
    const setupReads = wired.setupState.mock.calls.length
    const retry = startSave(store, wired.steps, OPTIONS)
    await advanceTimers(SHORT_TIMEOUT_MS)
    await retry
    expect(wired.setupState).toHaveBeenCalledTimes(setupReads + 2)
    expect(wired.port.sendAccountBatch).toHaveBeenCalledTimes(1)
    expect(isSaved(store.state())).toBe(true)
  }

  it('ends a block read past its limit as a failed read with nothing sent, the claim released and the retry, and the retry sends once', async () => {
    const wired = wireSave(account, script())
    const late = deferred<number>()
    wired.receipts.blockNumber
      .mockRejectedValueOnce(nodeError())
      .mockImplementationOnce(() => late.promise)
    jest.spyOn(wired.steps, 'readInFlight')
    const store = createArmStore()
    unawaited(startSave(store, wired.steps, OPTIONS))
    await advanceTimers(0)
    expect(await stored(wired)).toBeDefined()

    await advanceTimers(SEND_BLOCK_READ_MS - 1)
    expect(store.state().write.status).toBe('submitting')
    expect(await stored(wired)).toBeDefined()

    await advanceTimers(1)
    await expectEndedNotSent(wired, store, 'gasReadError')

    const before = store.state()
    late.resolve(START_BLOCK)
    await advanceTimers(SHORT_TIMEOUT_MS)
    expect(store.state()).toBe(before)
    expect(wired.port.sendAccountBatch).not.toHaveBeenCalled()

    await expectRetrySendsOnce(wired, store)
  })

  it('ends a block read that fails with nothing sent, the claim released and the retry', async () => {
    const wired = wireSave(account, script())
    wired.receipts.blockNumber.mockRejectedValueOnce(nodeError()).mockRejectedValueOnce(nodeError())
    jest.spyOn(wired.steps, 'readInFlight')
    const store = createArmStore()
    await startSave(store, wired.steps, OPTIONS)

    await expectEndedNotSent(wired, store)
    await expectRetrySendsOnce(wired, store)
  })
  ;[-1, 1.5, Number.MAX_SAFE_INTEGER + 1].forEach((block) =>
    it(`ends a block read that answers ${block} with nothing sent, the claim released and the retry`, async () => {
      const wired = wireSave(account, script())
      wired.receipts.blockNumber.mockResolvedValueOnce(block).mockResolvedValueOnce(block)
      jest.spyOn(wired.steps, 'readInFlight')
      const store = createArmStore()
      await startSave(store, wired.steps, OPTIONS)

      await expectEndedNotSent(wired, store)
      await expectRetrySendsOnce(wired, store)
    })
  )

  it("never hands the owner's first receipt wait a block that is not a safe integer of zero or more", async () => {
    const wired = wireSave(account, script())
    ;[-1, 1.5, Number.MAX_SAFE_INTEGER + 1, -1, 1.5, START_BLOCK].forEach((answer) =>
      wired.receipts.blockNumber.mockResolvedValueOnce(answer)
    )
    const store = createArmStore()
    await startSave(store, wired.steps, OPTIONS)
    await startSave(store, wired.steps, OPTIONS)
    const last = startSave(store, wired.steps, OPTIONS)
    await advanceTimers(SHORT_TIMEOUT_MS)
    await last

    expect(wired.port.sendAccountBatch).toHaveBeenCalledTimes(1)
    expect(wired.receipts.wait).toHaveBeenCalledTimes(1)
    expect(wired.receipts.wait).toHaveBeenCalledWith(TX_HASH, START_BLOCK)
    expect(isSaved(store.state())).toBe(true)
  })
})

describe('a hash write that fails', () => {
  /** The first page claimed at a block behind the chain's and went away before the hash; the wallet broadcast its request. */
  const broadcastAfterLeaving = async () => {
    const storage = memoryStorage()
    const requests = requestsFake()
    const first = wireSave(account, script(), { storage, requests })
    first.receipts.blockNumber.mockResolvedValue(START_BLOCK - 7)
    first.port.sendAccountBatch.mockImplementation(() => pending())
    unawaited(startSave(createArmStore(), first.steps, OPTIONS))
    await advanceTimers(0)
    const record = await stored(first)
    expect(record?.startBlock).toBe(START_BLOCK - 7)
    requests.activity = [operationFor(record!.requestId, { hash: TX_HASH })]
    return secondPage(storage, requests)
  }

  const MARKS: [string, (page: WiredSave) => void][] = [
    [
      'fails',
      (page) => {
        jest.spyOn(page.steps, 'markSent').mockRejectedValueOnce(nodeError())
      }
    ],
    [
      'answers no block',
      (page) => {
        jest.spyOn(page.steps, 'markSent').mockResolvedValueOnce({ status: 'absent' })
      }
    ]
  ]

  MARKS.forEach(([named, arrange]) =>
    it(`waits, as a follower whose hash write ${named}, from the block the stored save holds`, async () => {
      const page = await broadcastAfterLeaving()
      arrange(page.wired)
      const receipt = deferred<ReturnType<typeof landedReceipt>>()
      page.wired.receipts.wait.mockImplementationOnce(() => receipt.promise)

      const arriving = page.arrive()
      await advanceTimers(0)
      expect(page.wired.receipts.wait).toHaveBeenCalledWith(TX_HASH, START_BLOCK - 7)

      receipt.resolve(landedReceipt())
      await advanceTimers(SHORT_TIMEOUT_MS)
      await arriving
      expect(isSaved(page.store.state())).toBe(true)
      expect(page.wired.port.sendAccountBatch).not.toHaveBeenCalled()
    })
  )

  it("keeps the hash and its receipt wait where the owner's own hash write fails, and never reads nothing sent", async () => {
    const wired = wireSave(account, script())
    jest.spyOn(wired.steps, 'markSent').mockRejectedValue(nodeError())
    const receipt = deferred<ReturnType<typeof landedReceipt>>()
    wired.receipts.wait.mockImplementationOnce(() => receipt.promise)
    const store = createArmStore()
    const running = startSave(store, wired.steps, OPTIONS)
    await advanceTimers(0)

    expect(wired.steps.markSent).toHaveBeenCalled()
    expect(wired.receipts.wait).toHaveBeenCalledWith(TX_HASH, START_BLOCK)
    await advanceTimers(RECEIPT_WAIT_MS - 1)
    const { write } = store.state()
    expect(write.status).toBe('submitting')
    expect(write.status === 'submitting' && write.transactionHash).toBe(TX_HASH)
    expect(await stored(wired)).toBeDefined()

    receipt.resolve(landedReceipt())
    await advanceTimers(SHORT_TIMEOUT_MS)
    await running
    expect(isSaved(store.state())).toBe(true)
    expect(wired.port.sendAccountBatch).toHaveBeenCalledTimes(1)
  })
})

describe('the stored save read again before the send', () => {
  it('sends once in the plain case, reading the stored save between the setup read after the claim and the send', async () => {
    const wired = wireSave(account, script())
    const reads = jest.spyOn(wired.steps, 'readInFlight')
    const store = createArmStore()
    const running = startSave(store, wired.steps, OPTIONS)
    await advanceTimers(SHORT_TIMEOUT_MS)
    await running

    expect(isSaved(store.state())).toBe(true)
    expect(wired.port.sendAccountBatch).toHaveBeenCalledTimes(1)
    expect(wired.setupState).toHaveBeenCalledTimes(2)
    expect(reads).toHaveBeenCalledTimes(1)
    const [readAt] = reads.mock.invocationCallOrder
    expect(readAt).toBeGreaterThan(wired.setupState.mock.invocationCallOrder[1])
    expect(readAt).toBeLessThan(wired.port.sendAccountBatch.mock.invocationCallOrder[0])
  })

  /**
   * The owner claims and its setup read after the claim does not answer;
   * meanwhile `meanwhile` runs over the device's storage. Then the read
   * answers no setup.
   */
  const ownerWhoseReadAnswersLate = async (
    meanwhile: (
      ownerRequestId: string,
      storage: MemoryStorage,
      requests: RequestsFake
    ) => Promise<void>
  ) => {
    const storage = memoryStorage()
    const requests = requestsFake()
    const owner = wireSave(account, script(), { storage, requests })
    const late = deferred<ReturnType<typeof setupStateOf>>()
    owner.setupState
      .mockResolvedValueOnce(setupStateOf(false))
      .mockImplementationOnce(() => late.promise)
    const store = createArmStore()
    const running = startSave(store, owner.steps, OPTIONS)
    await advanceTimers(0)
    const claim = await stored(owner)
    expect(claim).toBeDefined()
    expect(store.state().requestId).toBe(claim?.requestId)

    await meanwhile(claim!.requestId, storage, requests)
    const removals = jest.spyOn(storage, 'remove')
    late.resolve(setupStateOf(false))
    await advanceTimers(0)
    return { owner, store, running, removals, requests }
  }

  it("sends nothing and releases nothing where a follower voided the claim and another page claimed and sent meanwhile, and follows that page's save to saved", async () => {
    const others: WiredSave[] = []
    const { owner, store, running, removals, requests } = await ownerWhoseReadAnswersLate(
      async (ownerRequestId, storage, shared) => {
        // A follower voids the owner's claim; the holder saves on another page.
        const follower = wireSave(account, script(), { storage, requests: shared })
        await follower.steps.release(ownerRequestId)
        const other = wireSave(account, script(), { storage, requests: shared })
        others.push(other)
        other.port.sendAccountBatch.mockImplementation(() => pending())
        unawaited(startSave(createArmStore(), other.steps, OPTIONS))
        await advanceTimers(0)
        const second = await stored(other)
        expect(second?.requestId).not.toBe(ownerRequestId)
        // eslint-disable-next-line no-param-reassign
        shared.queued = [second!.requestId]
      }
    )
    const [other] = others
    const second = await stored(owner)

    expect(owner.port.sendAccountBatch).not.toHaveBeenCalled()
    expect(other.port.sendAccountBatch).toHaveBeenCalledTimes(1)
    expect(removals).not.toHaveBeenCalled()
    expect(second?.requestId).toBe(requests.queued[0])
    expect(store.state().requestId).toBe(second?.requestId)
    expect(store.state().write.status).toBe('submitting')
    expect(store.state().follow).toBe('queued')
    expect(offersSave(store)).toBe(false)

    requests.queued = []
    requests.activity = [operationFor(second!.requestId, { hash: TX_HASH })]
    requests.pushQueue()
    await advanceTimers(SHORT_TIMEOUT_MS)
    await running
    expect(isSaved(store.state())).toBe(true)
    expect(owner.port.sendAccountBatch).not.toHaveBeenCalled()
    expect(other.port.sendAccountBatch).toHaveBeenCalledTimes(1)
  })

  it('sends nothing and releases nothing where a follower voided the claim and none is stored, and offers Save', async () => {
    const { owner, store, removals, running } = await ownerWhoseReadAnswersLate(
      async (ownerRequestId, storage, shared) => {
        const follower = wireSave(account, script(), { storage, requests: shared })
        await follower.steps.release(ownerRequestId)
      }
    )
    await running

    expect(owner.port.sendAccountBatch).not.toHaveBeenCalled()
    expect(removals).not.toHaveBeenCalled()
    expect(store.state().requestId).toBeUndefined()
    expect(offersSave(store)).toBe(true)
    expect(await stored(owner)).toBeUndefined()
  })

  it('offers no Save between the read before the send that answers none and the second look, then offers it', async () => {
    const owner = wireSave(account, script())
    const look = deferred<Awaited<ReturnType<SaveSteps['readInFlight']>>>()
    const readInFlight = owner.steps.readInFlight.bind(owner.steps)
    let reads = 0
    jest.spyOn(owner.steps, 'readInFlight').mockImplementation(async () => {
      reads += 1
      if (reads === 1) {
        // A follower voided the claim just before this read.
        const claim = await stored(owner)
        await owner.inFlight.release(claim!.requestId)
        return readInFlight()
      }
      return look.promise
    })
    const store = createArmStore()
    unawaited(startSave(store, owner.steps, OPTIONS))
    await advanceTimers(0)

    expect(reads).toBe(2)
    expect(owner.port.sendAccountBatch).not.toHaveBeenCalled()
    expect(store.state().write.status).toBe('idle')
    expect(store.state().lookup).toBe('reading')
    expect(offersSave(store)).toBe(false)

    look.resolve(await readInFlight())
    await advanceTimers(0)
    expect(offersSave(store)).toBe(true)
    expect(owner.port.sendAccountBatch).not.toHaveBeenCalled()
  })

  it('releases its own claim and reads never sent, with the retry, where the read before the send throws', async () => {
    const wired = wireSave(account, script())
    jest.spyOn(wired.steps, 'readInFlight').mockRejectedValueOnce(new Error('storage unavailable'))
    const store = createArmStore()
    await startSave(store, wired.steps, OPTIONS)

    expect(store.state().write.status).toBe('failedNotSent')
    expect(canRetry(store.state().write)).toBe(true)
    expect(mayStillLand(store.state().write)).toBe(false)
    expect(store.state().requestId).toBeUndefined()
    expect(await stored(wired)).toBeUndefined()
    expect(wired.port.sendAccountBatch).not.toHaveBeenCalled()

    const retry = startSave(store, wired.steps, OPTIONS)
    await advanceTimers(SHORT_TIMEOUT_MS)
    await retry
    expect(wired.port.sendAccountBatch).toHaveBeenCalledTimes(1)
    expect(isSaved(store.state())).toBe(true)
  })

  it("keeps another page's stored save where the read before the send throws after that page claimed in place of a void one", async () => {
    const storage = memoryStorage()
    const requests = requestsFake()
    const wired = wireSave(account, script(), { storage, requests })
    const other = wireSave(account, script(), { storage, requests })
    jest.spyOn(wired.steps, 'readInFlight').mockImplementationOnce(async () => {
      const claim = await stored(wired)
      await other.inFlight.release(claim!.requestId)
      await other.inFlight.claim({
        draft: other.draft,
        prepared: other.prepared,
        requestId: 'claimed meanwhile',
        claimedAt: Date.now()
      })
      throw new Error('storage unavailable')
    })
    const store = createArmStore()
    await startSave(store, wired.steps, OPTIONS)

    expect(store.state().write.status).toBe('failedNotSent')
    expect(canRetry(store.state().write)).toBe(true)
    expect((await stored(wired))?.requestId).toBe('claimed meanwhile')
    expect(wired.port.sendAccountBatch).not.toHaveBeenCalled()
  })
})

describe('the time limit of the setup read after the claim', () => {
  it('releases the claim at the limit as a failed read with nothing sent and the retry, takes nothing from a late answer, and the retry sends once', async () => {
    const wired = wireSave(account, script())
    const late = deferred<ReturnType<typeof setupStateOf>>()
    wired.setupState
      .mockResolvedValueOnce(setupStateOf(false))
      .mockImplementationOnce(() => late.promise)
    const store = createArmStore()
    unawaited(startSave(store, wired.steps, OPTIONS))
    await advanceTimers(0)
    expect(await stored(wired)).toBeDefined()

    await advanceTimers(CLAIMED_SETUP_READ_MS - 1)
    expect(store.state().write.status).toBe('submitting')
    expect(await stored(wired)).toBeDefined()

    await advanceTimers(1)
    expect(store.state().write.status).toBe('gasReadError')
    expect(canRetry(store.state().write)).toBe(true)
    expect(mayStillLand(store.state().write)).toBe(false)
    expect(store.state().requestId).toBeUndefined()
    expect(await stored(wired)).toBeUndefined()
    expect(wired.port.sendAccountBatch).not.toHaveBeenCalled()

    const before = store.state()
    late.resolve(setupStateOf(false))
    await advanceTimers(SHORT_TIMEOUT_MS)
    expect(store.state()).toBe(before)
    expect(wired.port.sendAccountBatch).not.toHaveBeenCalled()
    expect(await stored(wired)).toBeUndefined()

    const retry = startSave(store, wired.steps, OPTIONS)
    await advanceTimers(SHORT_TIMEOUT_MS)
    await retry
    expect(wired.setupState).toHaveBeenCalledTimes(4)
    expect(wired.port.sendAccountBatch).toHaveBeenCalledTimes(1)
    expect(isSaved(store.state())).toBe(true)
  })
})

describe('the age of the claim when the stored save is read before the send', () => {
  /**
   * The stored save's last read before the send captures the storage at once
   * and answers that capture, by the device's clock, when the claim is `age`
   * ms old.
   */
  const answersAtClaimAge = (wired: WiredSave, age: number) => {
    const readInFlight = wired.steps.readInFlight.bind(wired.steps)
    jest.spyOn(wired.steps, 'readInFlight').mockImplementationOnce(async () => {
      const capture = await readInFlight()
      if (capture.status === 'present') {
        jest.setSystemTime(capture.value.claimedAt + age)
      }
      return capture
    })
  }

  it('sends nothing on an answer of its own claim that arrives after an arriving page released it and the holder saved on that page', async () => {
    const storage = memoryStorage()
    const requests = requestsFake()
    const owner = wireSave(account, script(), { storage, requests })
    const answer = deferred<void>()
    const readInFlight = owner.steps.readInFlight.bind(owner.steps)
    jest.spyOn(owner.steps, 'readInFlight').mockImplementationOnce(async () => {
      const capture = await readInFlight()
      await answer.promise
      return capture
    })
    const ownerStore = createArmStore()
    const running = startSave(ownerStore, owner.steps, OPTIONS)
    await advanceTimers(0)
    const claim = await stored(owner)
    expect(claim).toBeDefined()
    expect(ownerStore.state().requestId).toBe(claim?.requestId)
    expect(owner.port.sendAccountBatch).not.toHaveBeenCalled()

    // The follower reads the claim in flight; the owner's page then sleeps past its send limit.
    const follower = secondPage(storage, requests)
    unawaited(follower.arrive())
    await advanceTimers(0)
    expect(offersSave(follower.store)).toBe(false)
    expect(await stored(owner)).toEqual(claim)
    await advanceTimers(CLAIM_SEND_LIMIT_MS)
    expect(offersSave(follower.store)).toBe(true)
    expect(await stored(owner)).toBeUndefined()

    const saving = startSave(follower.store, follower.wired.steps, OPTIONS)
    await advanceTimers(SHORT_TIMEOUT_MS)
    await saving
    expect(isSaved(follower.store.state())).toBe(true)
    expect(follower.wired.port.sendAccountBatch).toHaveBeenCalledTimes(1)
    const saved = follower.store.state()

    answer.resolve()
    await advanceTimers(0)
    await running
    expect(owner.port.sendAccountBatch).not.toHaveBeenCalled()
    expect(ownerStore.state().write.status).toBe('failedNotSent')
    expect(canRetry(ownerStore.state().write)).toBe(true)
    expect(mayStillLand(ownerStore.state().write)).toBe(false)
    expect(follower.store.state()).toBe(saved)
    expect(
      owner.port.sendAccountBatch.mock.calls.length +
        follower.wired.port.sendAccountBatch.mock.calls.length
    ).toBe(1)
  })

  it('sends once on an answer that arrives when the claim is just under the limit', async () => {
    const wired = wireSave(account, script())
    answersAtClaimAge(wired, CLAIM_SEND_LIMIT_MS - 1)
    const store = createArmStore()
    const running = startSave(store, wired.steps, OPTIONS)
    await advanceTimers(SHORT_TIMEOUT_MS)
    await running

    expect(wired.port.sendAccountBatch).toHaveBeenCalledTimes(1)
    expect(isSaved(store.state())).toBe(true)
  })

  it('refuses an answer that arrives when the claim is at the limit, releases the claim, and the retry sends once', async () => {
    const wired = wireSave(account, script())
    answersAtClaimAge(wired, CLAIM_SEND_LIMIT_MS)
    const store = createArmStore()
    await startSave(store, wired.steps, OPTIONS)

    expect(wired.port.sendAccountBatch).not.toHaveBeenCalled()
    expect(store.state().write.status).toBe('failedNotSent')
    expect(canRetry(store.state().write)).toBe(true)
    expect(mayStillLand(store.state().write)).toBe(false)
    expect(store.state().requestId).toBeUndefined()
    expect(await stored(wired)).toBeUndefined()

    const retry = startSave(store, wired.steps, OPTIONS)
    await advanceTimers(SHORT_TIMEOUT_MS)
    await retry
    expect(wired.port.sendAccountBatch).toHaveBeenCalledTimes(1)
    expect(isSaved(store.state())).toBe(true)
  })

  it('ends a read that never answers at its limit with nothing sent, the claim released and the retry', async () => {
    const wired = wireSave(account, script())
    jest.spyOn(wired.steps, 'readInFlight').mockImplementationOnce(() => pending())
    const store = createArmStore()
    unawaited(startSave(store, wired.steps, OPTIONS))
    await advanceTimers(0)
    expect(await stored(wired)).toBeDefined()

    await advanceTimers(SEND_BLOCK_READ_MS - 1)
    expect(store.state().write.status).toBe('submitting')
    expect(await stored(wired)).toBeDefined()

    await advanceTimers(1)
    expect(store.state().write.status).toBe('failedNotSent')
    expect(canRetry(store.state().write)).toBe(true)
    expect(mayStillLand(store.state().write)).toBe(false)
    expect(store.state().requestId).toBeUndefined()
    expect(await stored(wired)).toBeUndefined()
    expect(wired.port.sendAccountBatch).not.toHaveBeenCalled()

    const retry = startSave(store, wired.steps, OPTIONS)
    await advanceTimers(SHORT_TIMEOUT_MS)
    await retry
    expect(wired.port.sendAccountBatch).toHaveBeenCalledTimes(1)
    expect(isSaved(store.state())).toBe(true)
  })
})

describe('a follow that starts after its screen left', () => {
  const WHEN = ['after the next screen attached', 'while no screen is attached'] as const

  WHEN.forEach((when) =>
    it(`follows through the next screen a stored save with no hash whose read answers ${when}`, async () => {
      const { storage, record } = await followWithNoHash()
      const before = screenOver(storage, requestsFake())
      const read = deferred<Awaited<ReturnType<SaveSteps['readInFlight']>>>()
      jest.spyOn(before.steps, 'readInFlight').mockImplementationOnce(() => read.promise)
      const beforeReads = jest.spyOn(before.steps, 'requestState')
      const live = requestsFake()
      live.queued = [record.requestId]
      const after = screenOver(storage, live)
      const afterReads = jest.spyOn(after.steps, 'requestState')
      const store = createArmStore()
      unawaited(attachSteps(store, before.steps, OPTIONS))
      unawaited(lookForSave(store, before.steps, OPTIONS))
      await advanceTimers(0)
      expect(store.state().lookup).toBe('reading')

      // The screen leaves while the read is in flight.
      detachSteps(before.steps)
      const removals = jest.spyOn(storage, 'remove')
      if (when === 'while no screen is attached') {
        read.resolve(await before.inFlight.read())
        await advanceTimers(FAR_MS)
        expect(store.state().requestId).toBe(record.requestId)
        expect(store.state().write.status).toBe('submitting')
        expect(beforeReads).not.toHaveBeenCalled()
        expect(before.setupState).not.toHaveBeenCalled()
        expect(removals).not.toHaveBeenCalled()
        expect(await stored(before)).toBeDefined()
      }
      unawaited(attachSteps(store, after.steps, OPTIONS))
      unawaited(lookForSave(store, after.steps, OPTIONS))
      if (when === 'after the next screen attached') {
        await advanceTimers(0)
        read.resolve(await before.inFlight.read())
      }
      await advanceTimers(0)

      expect(store.state().follow).toBe('queued')
      expect(afterReads).toHaveBeenCalled()
      expect(beforeReads).not.toHaveBeenCalled()

      live.queued = []
      live.activity = [operationFor(record.requestId, { hash: TX_HASH })]
      live.pushQueue()
      await advanceTimers(SHORT_TIMEOUT_MS)
      expect(isSaved(store.state())).toBe(true)
      expect(after.receipts.wait).toHaveBeenCalledWith(TX_HASH, START_BLOCK)
      expect(before.port.sendAccountBatch).not.toHaveBeenCalled()
      expect(after.port.sendAccountBatch).not.toHaveBeenCalled()
    })
  )

  WHEN.forEach((when) =>
    it(`follows through the next screen the save that beat this run's claim ${when}`, async () => {
      const storage = memoryStorage()
      const owner = screenOver(storage, requestsFake())
      const gas = deferred<bigint>()
      owner.reads.nativeBalance.mockImplementationOnce(() => gas.promise)
      const ownerReads = jest.spyOn(owner.steps, 'requestState')
      const store = createArmStore()
      unawaited(attachSteps(store, owner.steps, OPTIONS))
      const running = startSave(store, owner.steps, OPTIONS)
      await advanceTimers(0)
      expect(store.state().write.status).toBe('checkingGas')

      // The screen leaves; another page claims and sends, and goes away before its hash.
      detachSteps(owner.steps)
      const { record } = await firstPageLeaves(storage, requestsFake(), { withHash: false })
      const live = requestsFake()
      live.queued = [record.requestId]
      const after = screenOver(storage, live)
      const afterReads = jest.spyOn(after.steps, 'requestState')
      const removals = jest.spyOn(storage, 'remove')

      if (when === 'while no screen is attached') {
        gas.resolve(1_000_000_000_000_000_000n)
        await advanceTimers(FAR_MS)
        expect(store.state().requestId).toBe(record.requestId)
        expect(store.state().write.status).toBe('submitting')
        expect(ownerReads).not.toHaveBeenCalled()
        expect(owner.setupState).toHaveBeenCalledTimes(1)
        expect(removals).not.toHaveBeenCalled()
        expect((await stored(owner))?.requestId).toBe(record.requestId)
      }
      unawaited(attachSteps(store, after.steps, OPTIONS))
      if (when === 'after the next screen attached') {
        await advanceTimers(0)
        gas.resolve(1_000_000_000_000_000_000n)
      }
      await advanceTimers(0)

      expect(store.state().requestId).toBe(record.requestId)
      expect(store.state().follow).toBe('queued')
      expect(afterReads).toHaveBeenCalled()
      expect(ownerReads).not.toHaveBeenCalled()

      live.queued = []
      live.activity = [operationFor(record.requestId, { hash: TX_HASH })]
      live.pushQueue()
      await advanceTimers(SHORT_TIMEOUT_MS)
      await running
      expect(isSaved(store.state())).toBe(true)
      expect(owner.port.sendAccountBatch).not.toHaveBeenCalled()
      expect(after.port.sendAccountBatch).not.toHaveBeenCalled()
    })
  )

  const RESTS: [string, (requests: RequestsFake, requestId: string) => void][] = [
    [
      'queued',
      (requests, requestId) => {
        // eslint-disable-next-line no-param-reassign
        requests.queued = [requestId]
      }
    ]
  ]

  RESTS.forEach(([reading, arrange]) =>
    it(`reads at once through a screen that attaches while the follow rests on a ${reading} reading`, async () => {
      const { storage, record } = await followWithNoHash()
      const requests = requestsFake()
      arrange(requests, record.requestId)
      const before = screenOver(storage, requests)
      const store = createArmStore()
      unawaited(attachSteps(store, before.steps, OPTIONS))
      unawaited(lookForSave(store, before.steps, OPTIONS))
      await advanceTimers(0)
      expect(store.state().follow).toBe(reading)

      const live = requestsFake()
      live.queued = [record.requestId]
      const after = screenOver(storage, live)
      const afterReads = jest.spyOn(after.steps, 'requestState')
      detachSteps(before.steps)
      unawaited(attachSteps(store, after.steps, OPTIONS))
      await advanceTimers(0)

      expect(afterReads).toHaveBeenCalledTimes(1)
      expect(store.state().follow).toBe('queued')
    })
  )

  it('drops the answer of a request read in flight through the steps of a screen that left, and reads again through the next', async () => {
    const { storage, record } = await followWithNoHash()
    const before = screenOver(storage, requestsFake())
    const answer = deferred<Awaited<ReturnType<SaveSteps['requestState']>>>()
    jest.spyOn(before.steps, 'requestState').mockImplementationOnce(() => answer.promise)
    const store = createArmStore()
    unawaited(attachSteps(store, before.steps, OPTIONS))
    unawaited(lookForSave(store, before.steps, OPTIONS))
    await advanceTimers(0)
    expect(before.steps.requestState).toHaveBeenCalledTimes(1)

    const live = requestsFake()
    live.queued = [record.requestId]
    const after = screenOver(storage, live)
    const afterReads = jest.spyOn(after.steps, 'requestState')
    detachSteps(before.steps)
    unawaited(attachSteps(store, after.steps, OPTIONS))
    await advanceTimers(0)

    // The left screen's read answers broadcast; the next screen's queue still holds the request.
    answer.resolve({ status: 'broadcast', transactionHash: TX_HASH })
    await advanceTimers(0)

    expect(afterReads).toHaveBeenCalledTimes(1)
    expect(store.state().follow).toBe('queued')
    const { write } = store.state()
    expect(write.status === 'submitting' && write.transactionHash).toBeUndefined()
    expect((await stored(after))?.transactionHash).toBeUndefined()
    expect(before.receipts.wait).not.toHaveBeenCalled()
  })

  it('goes on reading where a screen detaches and attaches the same steps again', async () => {
    const { storage, record } = await followWithNoHash()
    const requests = requestsFake()
    const page = screenOver(storage, requests)
    const reads = jest.spyOn(page.steps, 'requestState')
    const store = createArmStore()
    requests.queued = [record.requestId]
    unawaited(attachSteps(store, page.steps, OPTIONS))
    unawaited(lookForSave(store, page.steps, OPTIONS))
    await advanceTimers(0)
    expect(store.state().follow).toBe('queued')

    detachSteps(page.steps)
    unawaited(attachSteps(store, page.steps, OPTIONS))
    unawaited(lookForSave(store, page.steps, OPTIONS))
    const readsAtAttach = reads.mock.calls.length
    await advanceTimers(FOLLOW_REREAD_MS)

    expect(reads.mock.calls.length).toBeGreaterThan(readsAtAttach)
    expect(store.state().follow).toBe('queued')

    requests.queued = []
    requests.activity = [operationFor(record.requestId, { hash: TX_HASH })]
    requests.pushQueue()
    await advanceTimers(SHORT_TIMEOUT_MS)
    expect(isSaved(store.state())).toBe(true)
    expect(page.port.sendAccountBatch).not.toHaveBeenCalled()
  })
})
