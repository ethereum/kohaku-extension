/**
 * @jest-environment jsdom
 *
 * The claim of the submission on the live session across pages of one
 * device: two tabs, or a page and the one a reload opens, each with its own
 * records over the same storage and its own send port. A page that finds a
 * claim under a hash follows it and sends nothing; a claim with no hash means
 * the send did not go out, so the page that finds it releases it and offers
 * the start again, while the page whose send runs keeps its own state. The
 * clock is Jest's.
 */
import type { SubmitStore } from '@web/modules/social-recovery/recovery/submit'

import {
  advanceTimers,
  attemptOf,
  batchPlanOf,
  claimOf,
  CLAIM_NOW as NOW,
  flushTimers as flush,
  frozenAfterClaim,
  keyedAccount,
  landedReceipt,
  landedSession,
  leaveClaim,
  LEFT_CLAIM,
  openDevice,
  pageOn,
  pageOf,
  selectionWallet,
  sessionOf,
  START_BLOCK,
  stepsOf,
  submit,
  TX_HASH
} from '@web/modules/social-recovery/recovery/submit/__tests__/harness'
import { SEND_SETTLE_MS } from '@web/modules/social-recovery/shared/client'
import { deferred } from '@web/modules/social-recovery/shared/chrome/__fixtures__/deferred'
import type { SubmitPage } from '@web/modules/social-recovery/recovery/submit/__tests__/harness'

const { isLanded, lookForClaim, startSubmission } = submit

describe('the claim of the submission', () => {
  const pages: SubmitPage[] = []

  beforeEach(() => {
    jest.useFakeTimers()
  })

  afterEach(() => {
    pages.forEach(({ store, steps }) => submit.detachSteps(store, steps))
    pages.length = 0
    jest.useRealTimers()
  })

  const track = <P extends { store: SubmitStore; steps: ReturnType<typeof stepsOf> }>(page: P) => {
    pages.push(page)
    return page
  }

  const claimOn = async (device: Awaited<ReturnType<typeof openDevice>>) => {
    const stored = await sessionOf(device.records(), device.account)
    return stored?.state === 'live' ? stored.submission : undefined
  }

  it('lets a second tab follow the first tab’s hash and send nothing', async () => {
    const device = await openDevice()
    const receipt = deferred<ReturnType<typeof landedReceipt>>()
    device.kit.receipts.wait.mockImplementation(async () => {
      const landed = await receipt.promise
      device.kit.chain.attempt = attemptOf(device.gathering)
      return landed
    })
    const first = track(pageOn(device))
    startSubmission(first.store, first.steps).catch(() => undefined)
    await flush()
    expect(first.port.send).toHaveBeenCalledTimes(1)
    const stored = await sessionOf(device.records(), device.account)
    expect(stored?.state === 'live' && stored.submission?.transactionHash).toBe(TX_HASH)

    const second = track(pageOn(device))
    lookForClaim(second.store, second.steps).catch(() => undefined)
    startSubmission(second.store, second.steps).catch(() => undefined)
    await flush()
    expect(second.port.send).not.toHaveBeenCalled()
    expect(second.store.state().write).toEqual(
      expect.objectContaining({ status: 'submitting', transactionHash: TX_HASH })
    )

    receipt.resolve(landedReceipt())
    await flush()
    expect(isLanded(first.store.state())).toBe(true)
    expect(second.store.state().followed).toBe(first.store.state().requestId)
    expect(second.store.state().write.status).toBe('landed')
    expect(await sessionOf(device.records(), device.account)).toEqual(
      landedSession(device.account, device.gathering)
    )
    expect(first.port.send).toHaveBeenCalledTimes(1)
    expect(second.port.send).not.toHaveBeenCalled()
  })

  it('lets a reloaded page follow its own earlier claim under a hash instead of sending again', async () => {
    const device = await openDevice()
    const receipt = deferred<ReturnType<typeof landedReceipt>>()
    device.kit.receipts.wait.mockImplementation(() => receipt.promise)
    const before = track(pageOn(device))
    startSubmission(before.store, before.steps).catch(() => undefined)
    await flush()

    const reloaded = track(pageOn(device))
    lookForClaim(reloaded.store, reloaded.steps).catch(() => undefined)
    startSubmission(reloaded.store, reloaded.steps).catch(() => undefined)
    await flush()
    expect(reloaded.port.send).not.toHaveBeenCalled()
    expect(reloaded.store.state().write).toEqual(
      expect.objectContaining({ status: 'submitting', transactionHash: TX_HASH })
    )
  })

  it('reads a claim a page left under a hash as in flight on a reload: it waits for the receipt and lands, with nothing sent or released', async () => {
    const device = await openDevice()
    await leaveClaim(device, NOW - 1_000, TX_HASH)
    const receipt = deferred<ReturnType<typeof landedReceipt>>()
    device.kit.receipts.wait.mockImplementation(async () => {
      const landed = await receipt.promise
      device.kit.chain.attempt = attemptOf(device.gathering)
      return landed
    })
    const page = track(pageOn(device))
    lookForClaim(page.store, page.steps).catch(() => undefined)
    await flush()
    expect(page.store.state().write).toEqual(
      expect.objectContaining({ status: 'submitting', transactionHash: TX_HASH })
    )
    expect(device.kit.receipts.wait).toHaveBeenCalledWith(TX_HASH, START_BLOCK)
    expect((await claimOn(device))?.requestId).toBe(LEFT_CLAIM)

    receipt.resolve(landedReceipt())
    await flush()
    expect(isLanded(page.store.state())).toBe(true)
    expect(page.port.send).not.toHaveBeenCalled()
  })

  it('reads a claim with no hash on a reload as a send that did not go out: the claim is gone and the start is offered', async () => {
    const device = await openDevice()
    // A claim made a moment ago reads so too: its age plays no part.
    await leaveClaim(device, NOW - 1_000)
    const page = track(pageOn(device))
    lookForClaim(page.store, page.steps).catch(() => undefined)
    await flush()
    expect(await claimOn(device)).toBeUndefined()
    expect(page.store.state().write.status).toBe('idle')
    expect(page.store.state().lookup).toBe('none')
    expect(page.port.send).not.toHaveBeenCalled()
    expect(device.kit.fetch).not.toHaveBeenCalled()

    await startSubmission(page.store, page.steps)
    await flush()
    expect(page.port.send).toHaveBeenCalledTimes(1)
    expect(isLanded(page.store.state())).toBe(true)
  })

  it('lands with nothing sent where the start offered after a released claim finds this request’s attempt already started', async () => {
    const device = await openDevice()
    await leaveClaim(device, NOW - 1_000)
    device.kit.chain.attempt = attemptOf(device.gathering)
    const page = track(pageOn(device))
    lookForClaim(page.store, page.steps).catch(() => undefined)
    await flush()
    expect(page.store.state().write.status).toBe('idle')

    await startSubmission(page.store, page.steps)
    await flush()
    expect(isLanded(page.store.state())).toBe(true)
    expect(page.port.send).not.toHaveBeenCalled()
  })

  it('lets a second tab release the first tab’s claim with no hash and offer the start, while the first tab keeps its send and lands it', async () => {
    const device = await openDevice()
    const first = track(pageOn(device))
    const hash = deferred<`0x${string}`>()
    first.port.send.mockImplementation(() => hash.promise)
    startSubmission(first.store, first.steps).catch(() => undefined)
    await flush()
    const own = first.store.state().requestId
    expect((await claimOn(device))?.requestId).toBe(own)

    const second = track(pageOn(device))
    lookForClaim(second.store, second.steps).catch(() => undefined)
    await flush()
    expect(await claimOn(device)).toBeUndefined()
    expect(second.store.state().write.status).toBe('idle')
    expect(second.port.send).not.toHaveBeenCalled()
    // The page whose send runs is no arrival: it keeps its claim and its state.
    const { write } = first.store.state()
    expect(write.status).toBe('submitting')
    expect(write.status === 'submitting' && write.transactionHash).toBeFalsy()
    expect(first.store.state().requestId).toBe(own)

    hash.resolve(TX_HASH)
    await flush()
    expect(isLanded(first.store.state())).toBe(true)
    expect(first.port.send).toHaveBeenCalledTimes(1)
    expect(second.port.send).not.toHaveBeenCalled()
  })

  it('releases another tab’s claim with no hash found on Start, sends nothing, and offers the start again', async () => {
    const device = await openDevice()
    const page = track(pageOn(device))
    lookForClaim(page.store, page.steps).catch(() => undefined)
    await flush()
    expect(page.store.state().lookup).toBe('none')
    await leaveClaim(device, NOW)

    await startSubmission(page.store, page.steps)
    await flush()
    expect(page.port.send).not.toHaveBeenCalled()
    expect(await claimOn(device)).toBeUndefined()
    expect(page.store.state().write.status).toBe('idle')

    await startSubmission(page.store, page.steps)
    await flush()
    expect(page.port.send).toHaveBeenCalledTimes(1)
    expect(isLanded(page.store.state())).toBe(true)
  })

  it('adds nothing for a claim another page released and took while the wallet selected the account, and adds that page’s start once', async () => {
    jest.setSystemTime(NOW)
    const device = await openDevice()
    const smart = await keyedAccount(901)
    const shared = selectionWallet(smart.account)
    const base = {
      kit: device.kit,
      account: device.account,
      gathering: device.gathering,
      plan: batchPlanOf(smart),
      chosen: new Set([0, 1, 2, 3]),
      requests: shared.port,
      now: () => Date.now()
    }
    const steps = stepsOf({ ...base, port: shared.realSendPort(), records: device.records() })
    const first = track({ store: pageOf(steps), steps })
    startSubmission(first.store, steps).catch(() => undefined)
    await flush()
    const firstId = first.store.state().requestId
    expect((await claimOf(device))?.requestId).toBe(firstId)
    expect(shared.adds()).toEqual([])

    const secondSteps = stepsOf({ ...base, port: shared.realSendPort(), records: device.records() })
    const second = track({ store: pageOf(secondSteps), steps: secondSteps })
    lookForClaim(second.store, secondSteps).catch(() => undefined)
    await flush()
    expect(await claimOf(device)).toBeNull()
    expect(second.store.state().write.status).toBe('idle')

    startSubmission(second.store, secondSteps).catch(() => undefined)
    await flush()
    const secondId = second.store.state().requestId
    expect(secondId).not.toBe(firstId)
    expect((await claimOf(device))?.requestId).toBe(secondId)

    shared.selectListed()
    await flush()
    expect(shared.adds()).toEqual([secondId])
    await advanceTimers(SEND_SETTLE_MS + 1)
    await flush()
    expect(first.store.state().write).toMatchObject({
      status: 'failedNotSent',
      error: { reason: 'timeout' }
    })
    expect(shared.adds()).toEqual([secondId])
  })

  it('adds nothing where another page released the claim and started again before the add, with the account selected already, and offers the retry', async () => {
    jest.setSystemTime(NOW)
    const device = await openDevice()
    const smart = await keyedAccount(903)
    const shared = selectionWallet(smart.account)
    shared.wallet.selected = smart.account.addr
    const base = {
      kit: device.kit,
      account: device.account,
      gathering: device.gathering,
      plan: batchPlanOf(smart),
      chosen: new Set([0, 1, 2, 3]),
      requests: shared.port,
      now: () => Date.now()
    }
    // The first page's reads of the session hold once its claim is written, as a page the browser froze.
    const { steps, thaw } = frozenAfterClaim(
      stepsOf({ ...base, port: shared.realSendPort(), records: device.records() })
    )
    const first = track({ store: pageOf(steps), steps })
    startSubmission(first.store, steps).catch(() => undefined)
    await flush()
    const firstId = first.store.state().requestId
    expect((await claimOf(device))?.requestId).toBe(firstId)
    expect(shared.adds()).toEqual([])

    const secondSteps = stepsOf({ ...base, port: shared.realSendPort(), records: device.records() })
    const second = track({ store: pageOf(secondSteps), steps: secondSteps })
    lookForClaim(second.store, secondSteps).catch(() => undefined)
    await flush()
    expect(await claimOf(device)).toBeNull()
    startSubmission(second.store, secondSteps).catch(() => undefined)
    await flush()
    const secondId = second.store.state().requestId
    expect(shared.adds()).toEqual([secondId])

    thaw()
    await flush()
    await advanceTimers(SEND_SETTLE_MS + 1)
    await flush()
    expect(first.store.state().write).toMatchObject({
      status: 'failedNotSent',
      error: { reason: 'timeout' }
    })
    expect(shared.adds()).toEqual([secondId])
  })

  it('adds nothing where another page released the claim while the wallet selected the account, and offers the retry', async () => {
    jest.setSystemTime(NOW)
    const device = await openDevice()
    const smart = await keyedAccount(902)
    const shared = selectionWallet(smart.account)
    const base = {
      kit: device.kit,
      account: device.account,
      gathering: device.gathering,
      plan: batchPlanOf(smart),
      chosen: new Set([0, 1, 2, 3]),
      requests: shared.port,
      now: () => Date.now()
    }
    const steps = stepsOf({ ...base, port: shared.realSendPort(), records: device.records() })
    const page = track({ store: pageOf(steps), steps })
    startSubmission(page.store, steps).catch(() => undefined)
    await flush()
    const requestId = page.store.state().requestId
    expect((await claimOf(device))?.requestId).toBe(requestId)

    const secondSteps = stepsOf({ ...base, port: shared.realSendPort(), records: device.records() })
    const second = track({ store: pageOf(secondSteps), steps: secondSteps })
    lookForClaim(second.store, secondSteps).catch(() => undefined)
    await flush()
    expect(await claimOf(device)).toBeNull()

    shared.selectListed()
    await flush()
    expect(shared.adds()).toEqual([])
    await advanceTimers(SEND_SETTLE_MS + 1)
    await flush()
    expect(page.store.state().write).toMatchObject({
      status: 'failedNotSent',
      error: { reason: 'timeout' }
    })
    expect(shared.adds()).toEqual([])
  })
})
