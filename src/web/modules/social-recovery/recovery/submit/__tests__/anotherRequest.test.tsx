/**
 * @jest-environment jsdom
 *
 * A page left open on one gathering while another tab abandons it and
 * gathers again for the same account: the page's run belongs to its own
 * request, so it neither claims, sends, writes a hash on, follows nor lands
 * the session the other tab gathered. Each page has its own records over the
 * device's one storage. The clock is Jest's.
 */
import type { Hex } from '@kohaku-eth/social-recovery'
import type { SubmitStore } from '@web/modules/social-recovery/recovery/submit'

import type { Mounted } from '@web/modules/social-recovery/recovery/submit/__tests__/harness'
import {
  advanceTimers,
  attemptOf,
  CHAIN_ID,
  CLAIM_NOW as NOW,
  claimOf,
  flushTimers as flush,
  gatherAgain,
  landedReceipt,
  leaveClaim,
  mockWallet,
  mountSubmit,
  openDevice,
  openWorld,
  pageOn,
  regathered,
  sessionOf,
  stepsOf,
  submit,
  TX_HASH
} from '@web/modules/social-recovery/recovery/submit/__tests__/harness'
import { deferred } from '@web/modules/social-recovery/shared/chrome/__fixtures__/deferred'

/* eslint-disable @typescript-eslint/no-var-requires, global-require */
const {
  checklistPathOf
}: typeof import('@web/modules/social-recovery/recovery/checklist') = require('@web/modules/social-recovery/recovery/checklist')
const {
  sendRefusal
}: typeof import('@web/modules/social-recovery/shared/client') = require('@web/modules/social-recovery/shared/client')
const {
  mayStillLand
}: typeof import('@web/modules/social-recovery/shared/writes') = require('@web/modules/social-recovery/shared/writes')
/* eslint-enable @typescript-eslint/no-var-requires, global-require */

const { BALANCE_POLL_MS, checkAgain, isLanded, lookForClaim, startSubmission } = submit
submit

describe('a gathering another tab abandoned and opened again', () => {
  const pages: { store: SubmitStore; steps: ReturnType<typeof stepsOf> }[] = []
  let view: Mounted | undefined

  beforeEach(() => {
    jest.useFakeTimers()
  })

  afterEach(() => {
    view?.unmount()
    view = undefined
    pages.forEach(({ store, steps }) => submit.detachSteps(store, steps))
    pages.length = 0
    jest.useRealTimers()
  })

  const track = <P extends { store: SubmitStore; steps: ReturnType<typeof stepsOf> }>(page: P) => {
    pages.push(page)
    return page
  }

  it('sends nothing on Start in the first tab, leaves the new session live with no claim, and goes to the checklist', async () => {
    const world = await openWorld()
    view = await mountSubmit(world.account, { useTimers: true })
    expect(view.isDisabled('submit-action')).toBe(false)

    const next = regathered(world.gathering)
    await gatherAgain(world.records, world.account, next, world.entry)
    await view.press('submit-action')
    expect(world.port.sendAccountBatch).not.toHaveBeenCalled()
    expect(world.port.send).not.toHaveBeenCalled()
    expect(world.kit.prepareStartAttempt).not.toHaveBeenCalled()
    const stored = await sessionOf(world.records, world.account)
    expect(stored?.state).toBe('live')
    expect(stored?.state === 'live' && stored.gathering.request).toEqual(next.request)
    expect(stored?.state === 'live' && stored.submission).toBeFalsy()
    expect(mockWallet.navigate).toHaveBeenLastCalledWith(checklistPathOf(world.account), {
      replace: true
    })
  })

  it('claims and sends nothing where the other tab gathered again during the deposit step', async () => {
    const device = await openDevice()
    device.kit.reads.nativeBalance.mockResolvedValue(0n)
    const page = track(pageOn(device))
    startSubmission(page.store, page.steps).catch(() => undefined)
    await flush()
    expect(page.store.state().write.status).toBe('needsDeposit')

    const next = regathered(device.gathering)
    await gatherAgain(device.records(), device.account, next)
    device.kit.reads.nativeBalance.mockResolvedValue(1_000_000_000_000_000_000n)
    await advanceTimers(BALANCE_POLL_MS)
    await flush()
    expect(page.port.send).not.toHaveBeenCalled()
    expect(page.store.state().toChecklist).toBe(true)
    const stored = await sessionOf(device.records(), device.account)
    expect(stored?.state === 'live' && stored.gathering.request).toEqual(next.request)
    expect(await claimOf(device)).toBeNull()
  })

  it('writes no hash on the new session where the wallet answers the send after the other tab gathered again', async () => {
    const device = await openDevice()
    const page = track(pageOn(device))
    const hash = deferred<Hex>()
    page.port.send.mockImplementation(() => hash.promise)
    device.kit.receipts.wait.mockImplementation(() => deferred<never>().promise)
    startSubmission(page.store, page.steps).catch(() => undefined)
    await flush()
    expect(page.port.send).toHaveBeenCalledTimes(1)

    await gatherAgain(device.records(), device.account, regathered(device.gathering))
    hash.resolve(TX_HASH)
    await flush()
    expect(await claimOf(device)).toBeNull()
    expect((await sessionOf(device.records(), device.account))?.state).toBe('live')
  })

  it('lands nothing on the new session where the first tab’s start lands after the other tab gathered again', async () => {
    const device = await openDevice()
    const page = track(pageOn(device))
    const receipt = deferred<ReturnType<typeof landedReceipt>>()
    device.kit.receipts.wait.mockImplementation(() => receipt.promise)
    startSubmission(page.store, page.steps).catch(() => undefined)
    await flush()

    const next = regathered(device.gathering)
    await gatherAgain(device.records(), device.account, next)
    device.kit.chain.attempt = attemptOf(device.gathering)
    receipt.resolve(landedReceipt())
    await flush()
    expect(isLanded(page.store.state())).toBe(false)
    expect(page.store.state().toChecklist).toBe(true)
    const stored = await sessionOf(device.records(), device.account)
    expect(stored?.state === 'live' && stored.gathering.request).toEqual(next.request)
  })

  it('follows no claim of the new session on arrival, and goes to the checklist on Start', async () => {
    const device = await openDevice()
    const next = regathered(device.gathering)
    const records = device.records()
    const written = await gatherAgain(records, device.account, next)
    const claimed = await records
      .recoverySession(CHAIN_ID, device.account)
      .claimSubmission({ requestId: 'new-page', startBlock: 1, claimedAt: NOW }, written.revision)
    if (!claimed.claimed) {
      throw new Error('no claim written')
    }
    await records
      .recoverySession(CHAIN_ID, device.account)
      .setSubmissionHash('new-page', TX_HASH, claimed.record.revision)
    const page = track(pageOn(device))
    await lookForClaim(page.store, page.steps)
    await flush()
    expect(page.store.state().write.status).toBe('idle')
    expect(page.store.state().followed).toBeUndefined()
    expect(device.kit.receipts.wait).not.toHaveBeenCalled()

    await startSubmission(page.store, page.steps)
    await flush()
    expect(page.store.state().toChecklist).toBe(true)
    expect(page.port.send).not.toHaveBeenCalled()
    expect((await claimOf(device))?.requestId).toBe('new-page')
  })

  it('releases a claim with no hash on arrival, then goes to the checklist on Start where another tab gathered again', async () => {
    const device = await openDevice()
    await leaveClaim(device, NOW - 1_000)
    const page = track(pageOn(device))
    lookForClaim(page.store, page.steps).catch(() => undefined)
    await flush()
    expect(await claimOf(device)).toBeNull()
    expect(page.store.state().write.status).toBe('idle')

    await gatherAgain(device.records(), device.account, regathered(device.gathering))
    await startSubmission(page.store, page.steps)
    await flush()
    expect(page.store.state().toChecklist).toBe(true)
    expect(page.port.send).not.toHaveBeenCalled()
    expect(await claimOf(device)).toBeNull()
  })

  it('follows and lands nothing on check again from a send that may still land, after the other tab gathered again', async () => {
    const device = await openDevice()
    const page = track(pageOn(device))
    page.port.send.mockImplementation(async (key) => {
      throw sendRefusal('not-a-transaction', key)
    })
    await startSubmission(page.store, page.steps)
    await flush()
    expect(page.store.state().write.status).toBe('failedNotSent')
    expect(mayStillLand(page.store.state().write)).toBe(true)

    const next = regathered(device.gathering)
    const records = device.records()
    const written = await gatherAgain(records, device.account, next)
    const claimed = await records
      .recoverySession(CHAIN_ID, device.account)
      .claimSubmission({ requestId: 'new-page', startBlock: 1, claimedAt: NOW }, written.revision)
    if (!claimed.claimed) {
      throw new Error('no claim written')
    }
    await records
      .recoverySession(CHAIN_ID, device.account)
      .setSubmissionHash('new-page', TX_HASH, claimed.record.revision)
    device.kit.chain.attempt = attemptOf(device.gathering)
    await checkAgain(page.store, page.steps)
    await flush()
    expect(isLanded(page.store.state())).toBe(false)
    expect(page.store.state().followed).toBeUndefined()
    expect(page.store.state().write.status).toBe('failedNotSent')
    expect(device.kit.receipts.wait).not.toHaveBeenCalled()
    const stored = await sessionOf(records, device.account)
    expect(stored?.state).toBe('live')
    expect(stored?.state === 'live' && stored.gathering.request).toEqual(next.request)
    expect((await claimOf(device))?.requestId).toBe('new-page')
    expect(page.port.send).toHaveBeenCalledTimes(1)
  })
})
