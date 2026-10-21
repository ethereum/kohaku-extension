/**
 * @jest-environment jsdom
 *
 * A submission on its way to the chain, as the pages of one device read it:
 * a claim with no hash found on arrival, released whatever its age where the
 * wallet holds no request for it and followed while its queue holds one, on a
 * batch's route and on a key's own send alike, a hash the wallet answers after another page
 * released the claim, a hash the node lost (dropped only on a second reading
 * at a higher block or a minute later), the hash stored on the claim before
 * the receipt wait, the deposit step left, a revert that names an attempt
 * already running, and a landing another page made first. Each page has its
 * own records over the device's one storage. The clock is Jest's.
 */
import type { Attempt, Hex } from '@kohaku-eth/social-recovery'
import type { WriteEvent } from '@web/modules/social-recovery/shared/writes'
import type { SendingPlan, SubmitStore } from '@web/modules/social-recovery/recovery/submit'

import type { Device } from '@web/modules/social-recovery/recovery/submit/__tests__/harness'
import {
  advanceTimers,
  attemptOf,
  batchPlan,
  CHAIN_ID,
  CLAIM_NOW as NOW,
  claimOf,
  DEVICE_PLAN,
  flushTimers as flush,
  kitError,
  landedReceipt,
  landedSession,
  leaveClaim,
  LEFT_CLAIM,
  minedAndReverted,
  openDevice,
  pageOf,
  pageOn,
  requestQueue,
  sendPort,
  sessionOf,
  START_BLOCK,
  stepsOf,
  submit,
  TX_HASH
} from '@web/modules/social-recovery/recovery/submit/__tests__/harness'
import { deferred } from '@web/modules/social-recovery/shared/chrome/__fixtures__/deferred'

const { BALANCE_POLL_MS, checkAgain, FOLLOW_REREAD_MS, isLanded, lookForClaim, startSubmission } =
  submit
const {
  DROPPED_AFTER_MS,
  DROPPED_RECHECK_MS
}: typeof import('@web/modules/social-recovery/shared/writes') = require('@web/modules/social-recovery/shared/writes')

const OTHER_HASH: Hex = '0x1111111111111111111111111111111111111111111111111111111111111111'

/** A receipt wait that never answers, so a run keeps waiting on its hash. */
const never = () => deferred<never>().promise

/** The device's session accessor over a fresh read, for a write another page makes. */
const otherPage = async (device: Device) => {
  const accessor = device.records().recoverySession(CHAIN_ID, device.account)
  const read = await accessor.read()
  if (read.status !== 'present') {
    throw new Error('no session stored')
  }
  return { accessor, revision: read.revision }
}

let planSeed = 0xc2000

describe('a submission on its way to the chain', () => {
  const stores: { store: SubmitStore; steps: ReturnType<typeof stepsOf> }[] = []

  beforeEach(() => {
    jest.useFakeTimers()
  })

  afterEach(() => {
    stores.forEach(({ store, steps }) => submit.detachSteps(store, steps))
    stores.length = 0
    jest.useRealTimers()
  })

  const track = <P extends { store: SubmitStore; steps: ReturnType<typeof stepsOf> }>(page: P) => {
    stores.push(page)
    return page
  }

  describe('a claim with no hash found on arrival', () => {
    /** A claim `age` ms old whose request the wallet's queue holds nowhere and never broadcast is released, and the start offered. */
    const releasedOnArrival = async (age: number, plan: SendingPlan) => {
      const device = await openDevice()
      await leaveClaim(device, NOW - age)
      const { port: requests } = requestQueue({ status: 'gone' })
      const page = track(pageOn(device, () => NOW, { plan, requests }))
      lookForClaim(page.store, page.steps).catch(() => undefined)
      await flush()
      expect(await claimOf(device)).toBeNull()
      expect(page.store.state().write.status).toBe('idle')
      expect(page.store.state().lookup).toBe('none')
      expect(device.kit.fetch).not.toHaveBeenCalled()
      expect(page.port.send).not.toHaveBeenCalled()
      expect(page.port.sendAccountBatch).not.toHaveBeenCalled()
    }

    it('is released and the start offered a second after its claim, on a batch’s route', async () => {
      await releasedOnArrival(1_000, await batchPlan((planSeed += 1)))
    })

    it('is released and the start offered long after its claim, on a batch’s route', async () => {
      await releasedOnArrival(2 * DROPPED_AFTER_MS, await batchPlan((planSeed += 1)))
    })

    it('is released and the start offered where the wallet holds a key’s own send nowhere', async () => {
      await releasedOnArrival(1_000, DEVICE_PLAN)
    })

    it('queues a key’s own send under the claim’s request id', async () => {
      const device = await openDevice()
      const page = track(pageOn(device))
      startSubmission(page.store, page.steps).catch(() => undefined)
      await flush()
      const { requestId } = page.store.state()
      expect(requestId).toEqual(expect.any(String))
      expect(page.port.send).toHaveBeenCalledWith(
        expect.anything(),
        expect.anything(),
        expect.objectContaining({ requestId })
      )
    })

    it('reads a claim whose key’s own send the wallet still queues as in flight on a reload, and offers no start', async () => {
      const device = await openDevice()
      const { port: requests } = requestQueue({ status: 'queued' })
      await leaveClaim(device, NOW - 1_000)
      const page = track(pageOn(device, () => NOW, { plan: DEVICE_PLAN, requests }))
      lookForClaim(page.store, page.steps).catch(() => undefined)
      await flush()
      await advanceTimers(FOLLOW_REREAD_MS)
      await flush()
      expect(page.store.state().write.status).toBe('submitting')
      expect(page.store.state().follow?.requestId).toBe(LEFT_CLAIM)
      expect((await claimOf(device))?.requestId).toBe(LEFT_CLAIM)
      expect(page.port.send).not.toHaveBeenCalled()
    })

    it('writes the hash of a key’s own send the wallet broadcast before the page wrote it, and follows it to the landing', async () => {
      const device = await openDevice()
      const { port: requests } = requestQueue({ status: 'broadcast', hash: TX_HASH })
      await leaveClaim(device, NOW - 1_000)
      const receipt = deferred<ReturnType<typeof landedReceipt>>()
      device.kit.receipts.wait.mockImplementation(() => receipt.promise)
      const page = track(pageOn(device, () => NOW, { plan: DEVICE_PLAN, requests }))
      lookForClaim(page.store, page.steps).catch(() => undefined)
      await flush()
      expect(await claimOf(device)).toEqual(
        expect.objectContaining({ requestId: LEFT_CLAIM, transactionHash: TX_HASH })
      )
      expect(device.kit.receipts.wait).toHaveBeenCalledWith(TX_HASH, START_BLOCK)

      device.kit.chain.attempt = attemptOf(device.gathering)
      receipt.resolve(landedReceipt())
      await flush()
      expect(isLanded(page.store.state())).toBe(true)
      expect(page.port.send).not.toHaveBeenCalled()
    })

    it('reads a claim whose request the wallet still queues as in flight, offers no start, and releases it once the queue lets the request go', async () => {
      const device = await openDevice()
      const plan = await batchPlan((planSeed += 1))
      const { port: requests, queue } = requestQueue({ status: 'queued' })
      await leaveClaim(device, NOW - 2 * DROPPED_AFTER_MS)
      const page = track(pageOn(device, () => NOW, { plan, requests }))
      lookForClaim(page.store, page.steps).catch(() => undefined)
      await flush()
      await advanceTimers(FOLLOW_REREAD_MS)
      await flush()
      expect(page.store.state().write.status).toBe('submitting')
      expect(page.store.state().follow?.requestId).toBe(LEFT_CLAIM)
      expect((await claimOf(device))?.requestId).toBe(LEFT_CLAIM)
      expect(page.port.sendAccountBatch).not.toHaveBeenCalled()

      queue.answer = { status: 'gone' }
      await advanceTimers(FOLLOW_REREAD_MS)
      await flush()
      expect(await claimOf(device)).toBeNull()
      expect(page.store.state().write.status).toBe('idle')
      expect(page.store.state().lookup).toBe('none')
      expect(page.port.sendAccountBatch).not.toHaveBeenCalled()
    })

    it('writes the hash the wallet broadcast under the claim’s request on the claim, and follows it to the landing', async () => {
      const device = await openDevice()
      const plan = await batchPlan((planSeed += 1))
      const { port: requests } = requestQueue({ status: 'broadcast', hash: TX_HASH })
      await leaveClaim(device, NOW - 1_000)
      const page = track(pageOn(device, () => NOW, { plan, requests }))
      lookForClaim(page.store, page.steps).catch(() => undefined)
      await flush()
      expect(device.kit.receipts.wait).toHaveBeenCalledWith(TX_HASH, START_BLOCK)
      expect(isLanded(page.store.state())).toBe(true)
      expect(page.port.sendAccountBatch).not.toHaveBeenCalled()
    })

    it('follows the hash the claim took before its release, and never removes it', async () => {
      const device = await openDevice()
      await leaveClaim(device, NOW - 1_000)
      const receipt = deferred<ReturnType<typeof landedReceipt>>()
      device.kit.receipts.wait.mockImplementation(() => receipt.promise)
      const page = track(pageOn(device))
      const release = page.steps.releaseClaim
      page.steps.releaseClaim = async (requestId, hashes) => {
        const { accessor, revision } = await otherPage(device)
        await accessor.setSubmissionHash(LEFT_CLAIM, TX_HASH, revision)
        return release(requestId, hashes)
      }
      lookForClaim(page.store, page.steps).catch(() => undefined)
      await flush()
      expect(await claimOf(device)).toEqual(
        expect.objectContaining({ requestId: LEFT_CLAIM, transactionHash: TX_HASH })
      )
      expect(page.store.state().write).toEqual(
        expect.objectContaining({ status: 'submitting', transactionHash: TX_HASH })
      )
      expect(device.kit.receipts.wait).toHaveBeenCalledWith(TX_HASH, START_BLOCK)

      device.kit.chain.attempt = attemptOf(device.gathering)
      receipt.resolve(landedReceipt())
      await flush()
      expect(isLanded(page.store.state())).toBe(true)
      expect(page.port.send).not.toHaveBeenCalled()
    })
  })

  describe('a hash the wallet answers after another page released the claim', () => {
    it('writes the claim back with its hash, so every page follows it', async () => {
      const device = await openDevice()
      const page = track(pageOn(device))
      const hash = deferred<Hex>()
      page.port.send.mockImplementation(() => hash.promise)
      device.kit.receipts.wait.mockImplementation(never)
      startSubmission(page.store, page.steps).catch(() => undefined)
      await flush()
      const { requestId } = page.store.state()
      expect((await claimOf(device))?.requestId).toBe(requestId)

      const { accessor, revision } = await otherPage(device)
      await accessor.releaseSubmission(requestId as string, revision)
      expect(await claimOf(device)).toBeNull()

      hash.resolve(TX_HASH)
      await flush()
      expect(await claimOf(device)).toEqual(
        expect.objectContaining({ requestId, transactionHash: TX_HASH, startBlock: START_BLOCK })
      )

      const second = track(pageOn(device))
      lookForClaim(second.store, second.steps).catch(() => undefined)
      startSubmission(second.store, second.steps).catch(() => undefined)
      await flush()
      expect(second.store.state().write).toEqual(
        expect.objectContaining({ status: 'submitting', transactionHash: TX_HASH })
      )
      expect(second.port.send).not.toHaveBeenCalled()
      expect(page.port.send).toHaveBeenCalledTimes(1)
    })

    it('leaves another page’s claim in its place untouched', async () => {
      const device = await openDevice()
      const page = track(pageOn(device))
      const hash = deferred<Hex>()
      page.port.send.mockImplementation(() => hash.promise)
      device.kit.receipts.wait.mockImplementation(never)
      startSubmission(page.store, page.steps).catch(() => undefined)
      await flush()
      const { accessor, revision } = await otherPage(device)
      await accessor.releaseSubmission(page.store.state().requestId as string, revision)
      await leaveClaim(device, NOW)

      hash.resolve(TX_HASH)
      await flush()
      const claim = await claimOf(device)
      expect(claim?.requestId).toBe(LEFT_CLAIM)
      expect(claim?.transactionHash).toBeUndefined()
    })
  })

  describe('a hash the node lost', () => {
    it('keeps the claim on the reading at arrival, releases it a minute later and offers the start again', async () => {
      const device = await openDevice()
      await leaveClaim(device, NOW - DROPPED_AFTER_MS - 1, TX_HASH)
      device.kit.receipts.transactionKnown.mockResolvedValue('unknown')
      device.kit.receipts.wait.mockImplementation(never)
      let clock = NOW
      const page = track(pageOn(device, () => clock))
      lookForClaim(page.store, page.steps).catch(() => undefined)
      await flush()
      expect(device.kit.receipts.transactionKnown).toHaveBeenCalledWith(TX_HASH)
      expect((await claimOf(device))?.transactionHash).toBe(TX_HASH)
      expect(page.store.state().write.status).toBe('submitting')

      clock = NOW + DROPPED_RECHECK_MS
      await advanceTimers(DROPPED_RECHECK_MS)
      await flush()
      expect(await claimOf(device)).toBeNull()
      expect(page.store.state().write.status).toBe('idle')

      device.kit.receipts.wait.mockImplementation(async (hash: Hex) => {
        device.kit.chain.attempt = attemptOf(device.gathering)
        return landedReceipt(hash)
      })
      await startSubmission(page.store, page.steps)
      await flush()
      expect(page.port.send).toHaveBeenCalledTimes(1)
      expect(isLanded(page.store.state())).toBe(true)
    })

    it('reads nothing as dropped until check again, and drops it on a second check at a higher block', async () => {
      const device = await openDevice()
      await leaveClaim(device, NOW - 1_000, TX_HASH)
      device.kit.receipts.wait.mockImplementation(never)
      let clock = NOW
      const page = track(pageOn(device, () => clock))
      lookForClaim(page.store, page.steps).catch(() => undefined)
      await flush()
      expect(page.store.state().write.status).toBe('submitting')

      clock = NOW + DROPPED_AFTER_MS
      device.kit.receipts.transactionKnown.mockResolvedValue('unknown')
      await advanceTimers(DROPPED_AFTER_MS)
      await flush()
      expect(page.store.state().write).toEqual(
        expect.objectContaining({ status: 'submitting', transactionHash: TX_HASH })
      )
      expect((await claimOf(device))?.transactionHash).toBe(TX_HASH)

      await checkAgain(page.store, page.steps)
      await flush()
      expect(page.store.state().write.status).toBe('submitting')
      expect((await claimOf(device))?.transactionHash).toBe(TX_HASH)

      device.kit.receipts.blockNumber.mockResolvedValue(START_BLOCK + 1)
      await checkAgain(page.store, page.steps)
      await flush()
      expect(page.store.state().write.status).toBe('idle')
      expect(await claimOf(device)).toBeNull()
      expect(page.port.send).not.toHaveBeenCalled()
    })

    it('keeps the claim while the node still knows the hash', async () => {
      const device = await openDevice()
      await leaveClaim(device, NOW - DROPPED_AFTER_MS - 1, TX_HASH)
      device.kit.receipts.wait.mockImplementation(never)
      const page = track(pageOn(device))
      lookForClaim(page.store, page.steps).catch(() => undefined)
      await flush()
      expect(device.kit.receipts.transactionKnown).toHaveBeenCalledWith(TX_HASH)
      expect((await claimOf(device))?.transactionHash).toBe(TX_HASH)
      expect(page.store.state().write.status).toBe('submitting')
    })

    it('keeps a claim younger than the dropped age, whatever the node says', async () => {
      const device = await openDevice()
      await leaveClaim(device, NOW - DROPPED_AFTER_MS + 60_000, TX_HASH)
      device.kit.receipts.transactionKnown.mockResolvedValue('unknown')
      device.kit.receipts.wait.mockImplementation(never)
      const page = track(pageOn(device))
      lookForClaim(page.store, page.steps).catch(() => undefined)
      await flush()
      expect((await claimOf(device))?.transactionHash).toBe(TX_HASH)
      expect(page.store.state().write.status).toBe('submitting')
    })

    it('lands the attempt the manager holds as this request’s own on the second reading, with nothing released', async () => {
      const device = await openDevice()
      await leaveClaim(device, NOW - DROPPED_AFTER_MS - 1, TX_HASH)
      device.kit.receipts.transactionKnown.mockResolvedValue('unknown')
      device.kit.receipts.wait.mockImplementation(never)
      device.kit.chain.attempt = attemptOf(device.gathering)
      const page = track(pageOn(device))
      lookForClaim(page.store, page.steps).catch(() => undefined)
      await flush()
      expect(isLanded(page.store.state())).toBe(false)

      device.kit.receipts.blockNumber.mockResolvedValue(START_BLOCK + 1)
      await checkAgain(page.store, page.steps)
      await flush()
      expect(isLanded(page.store.state())).toBe(true)
      expect(await sessionOf(device.records(), device.account)).toEqual(
        landedSession(device.account, device.gathering)
      )
    })
  })

  describe('a revert that names an attempt already running', () => {
    /**
     * Steps whose send answers a hash, then the revert the wallet decoded as
     * `cause`, with `attempt` the attempt the manager then holds.
     */
    const revertingSteps = (device: Device, cause: string, attempt: Attempt) => {
      const { chain } = device.kit
      const steps = stepsOf({
        kit: device.kit,
        port: sendPort(),
        records: device.records(),
        account: device.account,
        gathering: device.gathering,
        plan: DEVICE_PLAN,
        chosen: new Set([0, 1, 2, 3]),
        now: () => NOW
      })
      const send: typeof steps.send = async (_prepared, dispatch, run, startBlock) => {
        dispatch({ type: 'sent', run, transactionHash: TX_HASH, startBlock })
        chain.attempt = attempt
        dispatch({
          type: 'error',
          run,
          error: minedAndReverted(),
          cause: kitError(cause)
        } as WriteEvent)
      }
      return { ...steps, send }
    }

    it('lands where the attempt the manager holds is this request’s own', async () => {
      const device = await openDevice()
      const steps = revertingSteps(device, 'AttemptAlreadyActive', attemptOf(device.gathering))
      const store = track({ store: pageOf(steps), steps }).store
      await startSubmission(store, steps)
      await flush()
      expect(isLanded(store.state())).toBe(true)
      expect(await sessionOf(device.records(), device.account)).toEqual(
        landedSession(device.account, device.gathering)
      )
    })

    it('keeps the refusal where the attempt running is another one', async () => {
      const device = await openDevice()
      const steps = revertingSteps(
        device,
        'AttemptAlreadyActive',
        attemptOf(device.gathering, { attemptId: 7n })
      )
      const store = track({ store: pageOf(steps), steps }).store
      await startSubmission(store, steps)
      await flush()
      expect(isLanded(store.state())).toBe(false)
      expect(submit.revertedRunning(store.state().write)).toBe(true)
      expect((await sessionOf(device.records(), device.account))?.state).toBe('live')
    })

    it('lands a followed hash whose revert names the attempt where the attempt is ours', async () => {
      const device = await openDevice()
      await leaveClaim(device, NOW - 1_000, OTHER_HASH)
      const base = stepsOf({
        kit: device.kit,
        port: sendPort(),
        records: device.records(),
        account: device.account,
        gathering: device.gathering,
        plan: DEVICE_PLAN,
        chosen: new Set([0, 1, 2, 3]),
        now: () => NOW
      })
      const steps = {
        ...base,
        waitAgain: (async (transactionHash, _startBlock, dispatch, run) => {
          device.kit.chain.attempt = attemptOf(device.gathering)
          dispatch({
            type: 'error',
            run,
            error: minedAndReverted(transactionHash),
            cause: kitError('WrongAttemptId')
          } as WriteEvent)
        }) as typeof base.waitAgain
      }
      const { store } = track({ store: pageOf(steps), steps })
      await lookForClaim(store, steps)
      await flush()
      expect(isLanded(store.state())).toBe(true)
    })
  })

  describe('the two readings before a hash reads as dropped', () => {
    /** A page that arrives on an old claim whose hash the node does not know, waiting on its receipt. */
    const arriveOnLostHash = async (clock: () => number = () => NOW) => {
      const device = await openDevice()
      await leaveClaim(device, NOW - DROPPED_AFTER_MS - 1, TX_HASH)
      device.kit.receipts.transactionKnown.mockResolvedValue('unknown')
      device.kit.receipts.wait.mockImplementation(never)
      const page = track(pageOn(device, clock))
      lookForClaim(page.store, page.steps).catch(() => undefined)
      await flush()
      return { device, page }
    }

    /** Whether the stored claim still carries the lost hash and the page still waits on it. */
    const stillWaits = async (device: Device, store: SubmitStore) =>
      (await claimOf(device))?.transactionHash === TX_HASH &&
      store.state().write.status === 'submitting'

    const dropped = async (device: Device, store: SubmitStore) =>
      (await claimOf(device)) === null && store.state().write.status === 'idle'

    it('drops nothing on one reading, and waits on the receipt', async () => {
      const { device, page } = await arriveOnLostHash()
      expect(device.kit.receipts.transactionKnown).toHaveBeenCalledWith(TX_HASH)
      expect(await stillWaits(device, page.store)).toBe(true)
      expect(device.kit.receipts.wait).toHaveBeenCalledWith(TX_HASH, START_BLOCK)
      expect(page.port.send).not.toHaveBeenCalled()
    })

    it('drops nothing on a second reading at the same block within the minute, and drops at a higher block', async () => {
      const { device, page } = await arriveOnLostHash()
      await checkAgain(page.store, page.steps)
      await flush()
      expect(await stillWaits(device, page.store)).toBe(true)

      device.kit.receipts.blockNumber.mockResolvedValue(START_BLOCK + 1)
      await checkAgain(page.store, page.steps)
      await flush()
      expect(await dropped(device, page.store)).toBe(true)
      expect(page.port.send).not.toHaveBeenCalled()
    })

    it('drops nothing on a lower block, which a lagging node reads', async () => {
      const { device, page } = await arriveOnLostHash()
      device.kit.receipts.blockNumber.mockResolvedValue(START_BLOCK - 3)
      await checkAgain(page.store, page.steps)
      await flush()
      expect(await stillWaits(device, page.store)).toBe(true)
    })

    it('takes the second reading by itself a minute later while a page is attached', async () => {
      let clock = NOW
      const { device, page } = await arriveOnLostHash(() => clock)
      await advanceTimers(DROPPED_RECHECK_MS)
      await flush()
      expect(await stillWaits(device, page.store)).toBe(true)

      clock = NOW + DROPPED_RECHECK_MS
      await advanceTimers(DROPPED_RECHECK_MS)
      await flush()
      expect(await dropped(device, page.store)).toBe(true)
    })

    it('takes no second reading while no page is attached', async () => {
      let clock = NOW
      const { device, page } = await arriveOnLostHash(() => clock)
      submit.detachSteps(page.store, page.steps)
      clock = NOW + 2 * DROPPED_RECHECK_MS
      await advanceTimers(2 * DROPPED_RECHECK_MS)
      await flush()
      expect(await stillWaits(device, page.store)).toBe(true)
    })

    /** After a first reading, one check at a higher block that `between` makes not a reading of a lost hash. */
    const clearedBy = async (between: (device: Device) => Promise<void>) => {
      const { device, page } = await arriveOnLostHash()
      await between(device)
      device.kit.receipts.blockNumber.mockResolvedValue(START_BLOCK + 1)
      await checkAgain(page.store, page.steps)
      await flush()
      device.kit.receipts.transactionKnown.mockResolvedValue('unknown')
      device.kit.receipts.blockNumber.mockResolvedValue(START_BLOCK + 2)
      await checkAgain(page.store, page.steps)
      await flush()
      const keptAfterOne = await stillWaits(device, page.store)
      device.kit.receipts.blockNumber.mockResolvedValue(START_BLOCK + 3)
      await checkAgain(page.store, page.steps)
      await flush()
      return { keptAfterOne, droppedAfterTwo: await dropped(device, page.store) }
    }

    it('starts the count again after a reading where the node knows the hash', async () => {
      const outcome = await clearedBy(async (device) => {
        device.kit.receipts.transactionKnown.mockResolvedValue('known')
      })
      expect(outcome).toEqual({ keptAfterOne: true, droppedAfterTwo: true })
    })

    it('starts the count again after a reading that failed', async () => {
      const outcome = await clearedBy(async (device) => {
        device.kit.receipts.transactionKnown.mockRejectedValue(new Error('node down'))
      })
      expect(outcome).toEqual({ keptAfterOne: true, droppedAfterTwo: true })
    })

    it('starts the count again after a reading that found another page’s claim on the session', async () => {
      const { device, page } = await arriveOnLostHash()
      const away = await otherPage(device)
      await away.accessor.releaseSubmission(LEFT_CLAIM, away.revision)
      const free = await otherPage(device)
      await free.accessor.claimSubmission(
        { requestId: 'another-page', startBlock: START_BLOCK, claimedAt: NOW },
        free.revision
      )
      device.kit.receipts.blockNumber.mockResolvedValue(START_BLOCK + 1)
      await checkAgain(page.store, page.steps)
      await flush()

      const back = await otherPage(device)
      await back.accessor.releaseSubmission('another-page', back.revision)
      await leaveClaim(device, NOW - DROPPED_AFTER_MS - 1, TX_HASH)
      device.kit.receipts.blockNumber.mockResolvedValue(START_BLOCK + 2)
      await checkAgain(page.store, page.steps)
      await flush()
      expect(await stillWaits(device, page.store)).toBe(true)

      device.kit.receipts.blockNumber.mockResolvedValue(START_BLOCK + 3)
      await checkAgain(page.store, page.steps)
      await flush()
      expect(await dropped(device, page.store)).toBe(true)
    })
  })

  describe('the hash on the claim before the receipt', () => {
    it('stores the hash on the claim before the receipt wait starts', async () => {
      const device = await openDevice()
      const page = track(pageOn(device))
      const atWait: unknown[] = []
      device.kit.receipts.wait.mockImplementation(async () => {
        atWait.push(await claimOf(device))
        return deferred<never>().promise
      })
      startSubmission(page.store, page.steps).catch(() => undefined)
      await flush()
      expect(atWait).toEqual([
        expect.objectContaining({
          requestId: page.store.state().requestId,
          transactionHash: TX_HASH
        })
      ])
    })

    it('leaves no claim behind where the receipt answers reverted at once', async () => {
      const device = await openDevice()
      const page = track(pageOn(device))
      device.kit.receipts.wait.mockRejectedValue(minedAndReverted())
      startSubmission(page.store, page.steps).catch(() => undefined)
      await flush()
      expect(page.store.state().write.status).toBe('failedReverted')
      expect(await claimOf(device)).toBeNull()
      expect((await sessionOf(device.records(), device.account))?.state).toBe('live')
    })
  })

  describe('leaving the deposit step', () => {
    it('drops the prepared start, so a key funded later sends nothing, and a new start prepares again', async () => {
      const device = await openDevice()
      device.kit.reads.nativeBalance.mockResolvedValue(0n)
      const page = track(pageOn(device))
      startSubmission(page.store, page.steps).catch(() => undefined)
      await flush()
      expect(page.store.state().write.status).toBe('needsDeposit')

      submit.leaveDeposit(page.store)
      expect(page.store.state().write.status).toBe('idle')
      device.kit.reads.nativeBalance.mockResolvedValue(1_000_000_000_000_000_000n)
      await advanceTimers(2 * BALANCE_POLL_MS)
      await flush()
      expect(page.port.send).not.toHaveBeenCalled()
      expect(await claimOf(device)).toBeNull()
      expect(device.kit.prepareStartAttempt).toHaveBeenCalledTimes(1)

      await startSubmission(page.store, page.steps)
      await flush()
      expect(device.kit.prepareStartAttempt).toHaveBeenCalledTimes(2)
      expect(page.port.send).toHaveBeenCalledTimes(1)
      expect(isLanded(page.store.state())).toBe(true)
    })
  })

  describe('a landing another page made first', () => {
    it('reads landed where the retried landing finds the session landed', async () => {
      const device = await openDevice()
      await leaveClaim(device, NOW - 1_000, TX_HASH)
      const records = device.records()
      const other = device.records()
      let raced = 0
      const racing = {
        ...records,
        landSubmission: (async (chainId, account, revision) => {
          if (raced === 0) {
            raced += 1
            const read = await other.recoverySession(CHAIN_ID, account).read()
            if (read.status === 'present') {
              await other.landSubmission(chainId, account, read.revision)
            }
          }
          return records.landSubmission(chainId, account, revision)
        }) as typeof records.landSubmission
      }
      const steps = stepsOf({
        kit: device.kit,
        port: sendPort(),
        records: racing,
        account: device.account,
        gathering: device.gathering,
        plan: DEVICE_PLAN,
        chosen: new Set([0, 1, 2, 3]),
        now: () => NOW
      })
      const { store } = track({ store: pageOf(steps), steps })
      await lookForClaim(store, steps)
      await flush()
      expect(raced).toBe(1)
      expect(isLanded(store.state())).toBe(true)
      expect(store.state().after).toBe('landed')
      expect(await sessionOf(device.records(), device.account)).toEqual(
        landedSession(device.account, device.gathering)
      )
    })
  })
})
