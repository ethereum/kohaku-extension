/**
 * @jest-environment jsdom
 */
import { WEB_ROUTES } from '@common/modules/router/constants/common'
import {
  attemptCancelled,
  attemptStarted,
  batchAwaitingSelection,
  CHAIN_ID,
  CLAIM_BLOCK,
  claimElsewhere,
  consume,
  elapse,
  executionOf,
  hashElsewhere,
  landedReceipt,
  minedAndReverted,
  mockWallet,
  mountWait,
  mountWaitInAnotherPage,
  moveDeviceClock,
  openWorld,
  OTHER_REQUEST,
  OTHER_TX_HASH,
  PAYLOAD,
  PAYLOAD_HASH,
  replacedByAnother,
  START_BLOCK,
  t,
  tick,
  TX_HASH,
  useWaitClock
} from '@web/modules/social-recovery/recovery/wait/__tests__/harness'
import type { Mounted, World } from '@web/modules/social-recovery/recovery/wait/__tests__/harness'
import type { Hex } from '@kohaku-eth/social-recovery'
import type { ProviderTransactionReceipt } from '@web/modules/social-recovery/shared/client'
import { recordKeys } from '@web/modules/social-recovery/shared/records'
import type { StoredSession } from '@web/modules/social-recovery/shared/records'
import { deferred } from '@web/modules/social-recovery/shared/chrome/__fixtures__/deferred'

const POLL_MS = 30_000
const REREAD_MS = 5_000
/** The block the execution's own claim reads before it, as the fake chain answers it. */
const OWN_CLAIM_BLOCK = START_BLOCK + 8

const donePath = (world: World) =>
  `/${WEB_ROUTES.socialRecoveryRecoveryDone}?account=${world.account}`

/** Holds the execution's receipt until the test releases or fails it. */
const holdReceipt = (world: World) => {
  const receipt = deferred<ProviderTransactionReceipt>()
  world.kit.receipts.wait.mockImplementation(() => receipt.promise)
  return receipt
}

/** Holds the wallet's window on the send until the test answers its hash or refuses it. */
const holdSend = (world: World) => {
  const hash = deferred<Hex>()
  world.port.send.mockImplementation(() => hash.promise)
  return hash
}

const claimRangeReads = (world: World) =>
  world.kit.fetch.mock.calls.filter(([, range]) => range.from === CLAIM_BLOCK)

describe('the claim of the execution', () => {
  useWaitClock()
  const views: Mounted[] = []
  const mount = async (mounting: Promise<Mounted>) => {
    const view = await mounting
    views.push(view)
    return view
  }

  afterEach(() => {
    views.splice(0).forEach((view) => view.unmount())
  })

  it('writes the claim on the countdown before the send, with its request id and the block read before it, and the hash after', async () => {
    const world = await openWorld()
    elapse(world.kit)
    holdReceipt(world)
    let atSend: Awaited<ReturnType<typeof executionOf>>
    world.port.send.mockImplementation(async () => {
      atSend = await executionOf(world.records, world.account)
      return TX_HASH
    })
    const pressedAt = Date.now()
    const view = await mount(mountWait(world.account))

    await view.press('wait-execute')
    expect(world.port.send).toHaveBeenCalledTimes(1)
    expect(atSend).toEqual({
      requestId: expect.any(String),
      startBlock: OWN_CLAIM_BLOCK,
      claimedAt: pressedAt
    })
    expect(await executionOf(world.records, world.account)).toEqual({
      requestId: atSend?.requestId,
      startBlock: OWN_CLAIM_BLOCK,
      claimedAt: pressedAt,
      transactionHash: TX_HASH
    })
  })

  it('sends once where the holder presses while the look for a claim still reads the countdown, and the late answer moves nothing', async () => {
    const world = await openWorld()
    elapse(world.kit)
    holdReceipt(world)
    const key = recordKeys.recoverySession(CHAIN_ID, world.account)
    const { get } = world.storage
    const lookup = deferred<void>()
    let lookups = 0
    world.storage.get = async (name, fallback) => {
      if (name === key && /lookForClaim/.test(new Error().stack ?? '')) {
        lookups += 1
        await lookup.promise
      }
      return get(name, fallback)
    }
    const view = await mount(mountWait(world.account))
    expect(lookups).toBe(1)
    expect(view.isDisabled('wait-execute')).toBe(false)

    await view.press('wait-execute')
    expect(world.port.send).toHaveBeenCalledTimes(1)
    const claim = await executionOf(world.records, world.account)
    expect(claim?.transactionHash).toBe(TX_HASH)

    lookup.resolve()
    await tick(0)
    await tick(POLL_MS)
    expect(lookups).toBe(1)
    expect(world.port.send).toHaveBeenCalledTimes(1)
    expect(world.kit.prepareExecuteHandover).toHaveBeenCalledTimes(1)
    expect(world.kit.receipts.wait).toHaveBeenCalledTimes(1)
    expect(view.byTestId('wait-execute-submitting')).not.toBeNull()
    expect(await executionOf(world.records, world.account)).toEqual(claim)
  })

  /** Holds the look for a claim's read of the countdown until the test lets it go. */
  const holdLookup = (world: World) => {
    const key = recordKeys.recoverySession(CHAIN_ID, world.account)
    const { storage } = world
    const { get } = storage
    const lookup = deferred<void>()
    storage.get = async (name, fallback) => {
      if (name === key && /lookForClaim/.test(new Error().stack ?? '')) {
        await lookup.promise
      }
      return get(name, fallback)
    }
    return lookup
  }

  it("follows another page's claim under a hash where the holder presses while the look for a claim still reads the countdown", async () => {
    const world = await openWorld()
    elapse(world.kit)
    holdReceipt(world)
    const lookup = holdLookup(world)
    const view = await mount(mountWait(world.account))

    await claimElsewhere(world.records, world.account, { transactionHash: OTHER_TX_HASH })
    await view.press('wait-execute')
    lookup.resolve()
    await tick(0)
    expect(view.byTestId('wait-execute-submitting')).not.toBeNull()
    expect(world.kit.receipts.wait).toHaveBeenCalledWith(OTHER_TX_HASH, CLAIM_BLOCK)
    expect(world.kit.prepareExecuteHandover).not.toHaveBeenCalled()
    expect(world.port.send).not.toHaveBeenCalled()
    expect((await executionOf(world.records, world.account))?.requestId).toBe(OTHER_REQUEST)
  })

  it("releases another page's claim with no hash where the holder presses while the look for a claim still reads the countdown, sends nothing, and offers execute again", async () => {
    const world = await openWorld()
    elapse(world.kit)
    const lookup = holdLookup(world)
    const view = await mount(mountWait(world.account))

    await claimElsewhere(world.records, world.account)
    await view.press('wait-execute')
    lookup.resolve()
    await tick(0)
    expect(await executionOf(world.records, world.account)).toBeUndefined()
    expect(view.byTestId('wait-execute-submitting')).toBeNull()
    expect(view.isDisabled('wait-execute')).toBe(false)
    expect(world.kit.prepareExecuteHandover).not.toHaveBeenCalled()
    expect(world.port.send).not.toHaveBeenCalled()

    await view.press('wait-execute')
    expect(world.port.send).toHaveBeenCalledTimes(1)
  })

  it("sends a smart account's batch under the claim's own request id", async () => {
    const world = await openWorld({ receiving: 'smart' })
    elapse(world.kit)
    holdReceipt(world)
    const view = await mount(mountWait(world.account))

    await view.press('wait-execute')
    const claim = await executionOf(world.records, world.account)
    expect(world.port.sendAccountBatch).toHaveBeenCalledTimes(1)
    expect(world.port.sendAccountBatch.mock.calls[0][4]).toBe(claim?.requestId)
    expect(claim?.transactionHash).toBe(TX_HASH)
  })

  it('claims over a fresh read where another page moved the countdown between the read and the claim', async () => {
    const world = await openWorld()
    elapse(world.kit)
    holdReceipt(world)
    const key = recordKeys.recoverySession(CHAIN_ID, world.account)
    const { get, set } = world.storage
    let moveNextRead = false
    world.storage.get = async (name, fallback) => {
      const stored = await get(name, fallback)
      if (moveNextRead && name === key) {
        moveNextRead = false
        await set(key, { ...(stored as object), revision: '0x0123456789abcdef01234567' })
      }
      return stored
    }
    // The block read comes right before the claim reads the countdown.
    world.kit.receipts.blockNumber.mockImplementationOnce(async () => {
      moveNextRead = true
      return OWN_CLAIM_BLOCK
    })
    const view = await mount(mountWait(world.account))

    await view.press('wait-execute')
    expect(moveNextRead).toBe(false)
    expect(world.port.send).toHaveBeenCalledTimes(1)
    expect((await executionOf(world.records, world.account))?.transactionHash).toBe(TX_HASH)
  })

  it('lets a second page release the claim with no hash and offer execute, while the first page keeps its send, writes the claim back with its hash and reaches the done screen', async () => {
    const world = await openWorld()
    elapse(world.kit)
    const hash = holdSend(world)
    const receipt = holdReceipt(world)
    const first = await mount(mountWait(world.account))
    await first.press('wait-execute')
    expect(world.port.send).toHaveBeenCalledTimes(1)
    const own = (await executionOf(world.records, world.account))?.requestId

    const second = await mount(mountWaitInAnotherPage(world.account))
    expect(await executionOf(world.records, world.account)).toBeUndefined()
    expect(second.byTestId('wait-execute-submitting')).toBeNull()
    expect(second.isDisabled('wait-execute')).toBe(false)
    // The page whose send runs is no arrival: it keeps its own state.
    expect(first.byTestId('wait-execute-submitting')).not.toBeNull()

    hash.resolve(TX_HASH)
    await tick(0)
    expect(await executionOf(world.records, world.account)).toEqual(
      expect.objectContaining({ requestId: own, transactionHash: TX_HASH })
    )
    expect(world.kit.receipts.wait).toHaveBeenCalledWith(TX_HASH, OWN_CLAIM_BLOCK)

    receipt.resolve(landedReceipt())
    consume(world.kit, world.account)
    await tick(POLL_MS)
    expect(first.paths()).toContain(donePath(world))
    expect(world.port.send).toHaveBeenCalledTimes(1)
    expect(world.kit.prepareExecuteHandover).toHaveBeenCalledTimes(1)
  })

  it('follows a claim under a hash another page wrote after this page offered execute, and prepares and sends nothing on a press', async () => {
    const world = await openWorld()
    elapse(world.kit)
    holdReceipt(world)
    const view = await mount(mountWait(world.account))
    expect(view.isDisabled('wait-execute')).toBe(false)

    await claimElsewhere(world.records, world.account, { transactionHash: OTHER_TX_HASH })
    await view.press('wait-execute')
    expect(view.byTestId('wait-execute-submitting')).not.toBeNull()
    expect(world.kit.receipts.wait).toHaveBeenCalledWith(OTHER_TX_HASH, CLAIM_BLOCK)
    expect(world.kit.prepareExecuteHandover).not.toHaveBeenCalled()
    expect(world.port.send).not.toHaveBeenCalled()
  })

  it('releases a claim with no hash another page wrote after this page offered execute, and prepares and sends nothing on that press', async () => {
    const world = await openWorld()
    elapse(world.kit)
    const view = await mount(mountWait(world.account))

    await claimElsewhere(world.records, world.account)
    await view.press('wait-execute')
    expect(await executionOf(world.records, world.account)).toBeUndefined()
    expect(view.byTestId('wait-execute-submitting')).toBeNull()
    expect(view.isDisabled('wait-execute')).toBe(false)
    expect(world.kit.prepareExecuteHandover).not.toHaveBeenCalled()
    expect(world.port.send).not.toHaveBeenCalled()
  })

  it('follows a claim under a hash another page wrote while this page checked the gas, and sends nothing', async () => {
    const world = await openWorld()
    elapse(world.kit)
    holdReceipt(world)
    const estimate = deferred<bigint>()
    world.kit.reads.estimateGas.mockImplementation(() => estimate.promise)
    const view = await mount(mountWait(world.account))
    await view.press('wait-execute')

    await claimElsewhere(world.records, world.account, { transactionHash: OTHER_TX_HASH })
    estimate.resolve(300_000n)
    await tick(0)
    expect(world.port.send).not.toHaveBeenCalled()
    expect(view.byTestId('wait-execute-submitting')).not.toBeNull()
    expect(view.byTestId('wait-execute')).toBeNull()
    expect((await executionOf(world.records, world.account))?.requestId).toBe(OTHER_REQUEST)
  })

  it('releases a claim with no hash another page wrote while this page checked the gas, sends nothing, and offers execute again', async () => {
    const world = await openWorld()
    elapse(world.kit)
    const estimate = deferred<bigint>()
    world.kit.reads.estimateGas.mockImplementation(() => estimate.promise)
    const view = await mount(mountWait(world.account))
    await view.press('wait-execute')

    await claimElsewhere(world.records, world.account)
    estimate.resolve(300_000n)
    await tick(0)
    expect(world.port.send).not.toHaveBeenCalled()
    expect(await executionOf(world.records, world.account)).toBeUndefined()
    expect(view.byTestId('wait-execute-submitting')).toBeNull()
    expect(view.isDisabled('wait-execute')).toBe(false)
  })

  it('releases the claim where the wallet refused the send, and the retry claims again', async () => {
    const world = await openWorld()
    elapse(world.kit)
    world.refusing.refusing = true
    const view = await mount(mountWait(world.account))

    await view.press('wait-execute')
    expect(view.byTestId('wait-execute-failedNotSent')).not.toBeNull()
    expect(await executionOf(world.records, world.account)).toBeUndefined()

    world.refusing.refusing = false
    holdReceipt(world)
    await view.pressText(t('socialRecovery.writes.tryAgain'))
    expect(world.port.send).toHaveBeenCalledTimes(2)
    expect((await executionOf(world.records, world.account))?.transactionHash).toBe(TX_HASH)
  })

  it('releases the claim where another transaction of the key replaced the send', async () => {
    const world = await openWorld()
    elapse(world.kit)
    world.kit.receipts.wait.mockRejectedValue(replacedByAnother())
    const view = await mount(mountWait(world.account))

    await view.press('wait-execute')
    expect(view.byTestId('wait-execute-failedNotSent')).not.toBeNull()
    expect(await executionOf(world.records, world.account)).toBeUndefined()
  })

  it('releases the claim where the execution reverted', async () => {
    const world = await openWorld()
    elapse(world.kit)
    world.kit.receipts.wait.mockRejectedValue(minedAndReverted())
    const view = await mount(mountWait(world.account))

    await view.press('wait-execute')
    expect(view.byTestId('wait-execute-failedReverted')).not.toBeNull()
    expect(await executionOf(world.records, world.account)).toBeUndefined()
  })

  it('keeps the claim while the send is on its way', async () => {
    const world = await openWorld()
    elapse(world.kit)
    holdReceipt(world)
    const view = await mount(mountWait(world.account))

    await view.press('wait-execute')
    await tick(POLL_MS)
    expect(view.byTestId('wait-execute-submitting')).not.toBeNull()
    expect((await executionOf(world.records, world.account))?.transactionHash).toBe(TX_HASH)
  })

  it('lets the send add its request while the countdown holds its claim, and never once another page released it and claimed under its own request', async () => {
    const world = await openWorld()
    elapse(world.kit)
    holdSend(world)
    const view = await mount(mountWait(world.account))
    await view.press('wait-execute')
    const claim = await executionOf(world.records, world.account)
    if (!claim) {
      throw new Error('no claim')
    }
    const [, , options] = world.port.send.mock.calls[0]
    expect(await options.canAdd()).toBe(true)

    const countdown = world.records.countdown(CHAIN_ID, world.account)
    const read = await countdown.read()
    await countdown.releaseExecution(
      claim.requestId,
      read.status === 'present' ? read.revision : null
    )
    expect(await options.canAdd()).toBe(false)
    await claimElsewhere(world.records, world.account)
    expect(await options.canAdd()).toBe(false)
  })

  it('adds nothing where another page released the claim while the wallet selected the account, and offers the retry', async () => {
    const world = await openWorld({ receiving: 'smart' })
    elapse(world.kit)
    const wallet = batchAwaitingSelection(world)
    const view = await mount(mountWait(world.account))
    await view.press('wait-execute')
    const claim = await executionOf(world.records, world.account)
    if (!claim) {
      throw new Error('no claim')
    }
    expect(claim.transactionHash).toBeUndefined()

    const countdown = world.records.countdown(CHAIN_ID, world.account)
    const read = await countdown.read()
    await countdown.releaseExecution(
      claim.requestId,
      read.status === 'present' ? read.revision : null
    )
    expect(view.byTestId('wait-execute-submitting')).not.toBeNull()

    const landing = wallet.selectAccount()
    await tick()
    await landing
    expect(wallet.added()).toEqual([])
    expect(view.byTestId('wait-execute-failedNotSent')).not.toBeNull()
    expect(await executionOf(world.records, world.account)).toBeUndefined()
    expect(view.hasButton(t('socialRecovery.writes.tryAgain'))).toBe(true)
  })

  it('writes the claim back with its hash where another page released it while the wallet held the send', async () => {
    const world = await openWorld()
    elapse(world.kit)
    const hash = holdSend(world)
    holdReceipt(world)
    const view = await mount(mountWait(world.account))
    await view.press('wait-execute')
    const claim = await executionOf(world.records, world.account)
    if (!claim) {
      throw new Error('no claim')
    }

    const countdown = world.records.countdown(CHAIN_ID, world.account)
    const read = await countdown.read()
    await countdown.releaseExecution(
      claim.requestId,
      read.status === 'present' ? read.revision : null
    )
    expect(await executionOf(world.records, world.account)).toBeUndefined()

    hash.resolve(TX_HASH)
    await tick(0)
    expect(await executionOf(world.records, world.account)).toEqual({
      ...claim,
      transactionHash: TX_HASH
    })
  })

  it('ends the countdown from a fresh read after a claim moved it, where the attempt was cancelled', async () => {
    const world = await openWorld()
    elapse(world.kit)
    holdReceipt(world)
    const view = await mount(mountWait(world.account))
    await view.press('wait-execute')
    expect((await executionOf(world.records, world.account))?.transactionHash).toBe(TX_HASH)

    const { chain } = world.kit
    chain.attempt = { ...chain.attempt, state: 'Cancelled' }
    chain.events = [...chain.events, attemptCancelled(world.account, 'cancelByOwner')]
    await tick(POLL_MS)
    await view.press('wait-cancelled-action')
    expect(view.byTestId('wait-leave-failed')).toBeNull()
    expect(view.paths()).toEqual([`/${WEB_ROUTES.socialRecoveryRecovery}`])
    expect((await world.records.countdown(CHAIN_ID, world.account).read()).status).toBe('absent')
    expect((await world.records.recoveryEntry(CHAIN_ID, world.account).read()).status).toBe(
      'absent'
    )
  })
})

describe('a reloaded page', () => {
  useWaitClock()
  const views: Mounted[] = []
  const mount = async (mounting: Promise<Mounted>) => {
    const view = await mounting
    views.push(view)
    return view
  }

  afterEach(() => {
    views.splice(0).forEach((view) => view.unmount())
  })

  it('releases its own earlier claim with no hash, offers execute, and sends once on the press', async () => {
    const world = await openWorld()
    elapse(world.kit)
    holdSend(world)
    const before = await mountWait(world.account)
    await before.press('wait-execute')
    before.unmount()
    expect(await executionOf(world.records, world.account)).toBeDefined()

    world.port.send.mockImplementation(async () => TX_HASH)
    holdReceipt(world)
    const after = await mount(mountWaitInAnotherPage(world.account))
    expect(await executionOf(world.records, world.account)).toBeUndefined()
    expect(after.byTestId('wait-execute-submitting')).toBeNull()
    expect(after.isDisabled('wait-execute')).toBe(false)
    expect(world.port.send).toHaveBeenCalledTimes(1)

    await after.press('wait-execute')
    expect(world.port.send).toHaveBeenCalledTimes(2)
    expect((await executionOf(world.records, world.account))?.transactionHash).toBe(TX_HASH)
  })

  it('waits on the receipt of the hash its own claim carries, and reaches the done screen with nothing sent again', async () => {
    const world = await openWorld()
    elapse(world.kit)
    const receipt = holdReceipt(world)
    const before = await mountWait(world.account)
    await before.press('wait-execute')
    before.unmount()
    world.kit.receipts.wait.mockClear()

    const after = await mount(mountWaitInAnotherPage(world.account))
    expect(world.kit.receipts.wait).toHaveBeenCalledWith(TX_HASH, OWN_CLAIM_BLOCK)
    expect(after.byTestId('wait-execute')).toBeNull()

    receipt.resolve(landedReceipt())
    consume(world.kit, world.account)
    await tick(POLL_MS)
    expect(after.paths()).toEqual([donePath(world)])
    expect(world.port.send).toHaveBeenCalledTimes(1)
  })
})

describe('a claim with no hash found on arrival', () => {
  useWaitClock()
  let view: Mounted | undefined

  afterEach(() => {
    view?.unmount()
    view = undefined
  })

  /** A claim `ageMs` old whose request the wallet holds nowhere is released and execute offered, with no events read. */
  const releasedOnArrival = async (world: World, ageMs: number) => {
    elapse(world.kit)
    await claimElsewhere(world.records, world.account, { claimedAt: Date.now() - ageMs })
    // The wallet's queue holds no request under the claim, and its activity lists none.
    mockWallet.activity = []
    view = await mountWait(world.account)
    await tick(REREAD_MS)
    expect(await executionOf(world.records, world.account)).toBeUndefined()
    expect(view.byTestId('wait-execute-submitting')).toBeNull()
    expect(view.isDisabled('wait-execute')).toBe(false)
    expect(claimRangeReads(world)).toEqual([])
    expect(world.port.send).not.toHaveBeenCalled()
    expect(world.port.sendAccountBatch).not.toHaveBeenCalled()
  }

  it('is released and execute offered a minute after its claim where the smart account sends', async () => {
    await releasedOnArrival(await openWorld({ route: 'logged-in', receiving: 'smart' }), 60_000)
  })

  it('is released and execute offered long after its claim where the key sends', async () => {
    await releasedOnArrival(
      await openWorld({ route: 'logged-in', receiving: 'basic' }),
      31 * 60_000
    )
  })

  it('is released and execute offered hours after its claim on a fresh install', async () => {
    await releasedOnArrival(
      await openWorld({ route: 'fresh-install', receiving: 'basic' }),
      3 * 60 * 60_000
    )
  })

  it("is read in flight on a reload while the wallet's queue holds the key's own send, and offers no execute", async () => {
    const world = await openWorld({ route: 'fresh-install', receiving: 'basic' })
    elapse(world.kit)
    await claimElsewhere(world.records, world.account)
    mockWallet.queued = [OTHER_REQUEST]
    view = await mountWait(world.account)
    await tick(REREAD_MS)
    await tick(REREAD_MS)
    expect(view.byTestId('wait-execute-submitting')).not.toBeNull()
    expect(view.byTestId('wait-execute')).toBeNull()
    expect((await executionOf(world.records, world.account))?.requestId).toBe(OTHER_REQUEST)
    expect(world.port.send).not.toHaveBeenCalled()
  })

  it('is followed under the hash the wallet broadcast the key’s own send with before the page wrote it', async () => {
    const world = await openWorld({ route: 'fresh-install', receiving: 'basic' })
    elapse(world.kit)
    holdReceipt(world)
    await claimElsewhere(world.records, world.account)
    mockWallet.activity = [
      {
        status: 'broadcasted-but-not-confirmed',
        identifiedBy: { type: 'Transaction' },
        txnId: OTHER_TX_HASH,
        calls: [{ fromUserRequestId: OTHER_REQUEST }]
      }
    ]
    view = await mountWait(world.account)
    await tick(REREAD_MS)
    expect(world.kit.receipts.wait).toHaveBeenCalledWith(OTHER_TX_HASH, CLAIM_BLOCK)
    expect((await executionOf(world.records, world.account))?.transactionHash).toBe(OTHER_TX_HASH)
    expect(view.byTestId('wait-execute-submitting')).not.toBeNull()
    expect(world.port.send).not.toHaveBeenCalled()
  })

  it("is read in flight while the wallet's queue holds its request, offers no execute, and is released once the queue lets the request go", async () => {
    const world = await openWorld({ receiving: 'smart' })
    elapse(world.kit)
    await claimElsewhere(world.records, world.account)
    mockWallet.queued = [OTHER_REQUEST]
    view = await mountWait(world.account)
    await tick(REREAD_MS)
    await tick(REREAD_MS)
    expect(view.byTestId('wait-execute-submitting')).not.toBeNull()
    expect(view.byTestId('wait-execute')).toBeNull()
    expect((await executionOf(world.records, world.account))?.requestId).toBe(OTHER_REQUEST)

    mockWallet.queued = []
    mockWallet.activity = []
    await tick(REREAD_MS)
    await tick(REREAD_MS)
    expect(await executionOf(world.records, world.account)).toBeUndefined()
    expect(view.byTestId('wait-execute-submitting')).toBeNull()
    expect(view.isDisabled('wait-execute')).toBe(false)
    expect(world.port.sendAccountBatch).not.toHaveBeenCalled()
  })

  it('is followed under the hash the wallet broadcast its request with, written on the claim', async () => {
    const world = await openWorld({ receiving: 'smart' })
    elapse(world.kit)
    holdReceipt(world)
    await claimElsewhere(world.records, world.account)
    mockWallet.activity = [
      {
        status: 'broadcasted-but-not-confirmed',
        identifiedBy: { type: 'Transaction' },
        txnId: OTHER_TX_HASH,
        calls: [{ fromUserRequestId: OTHER_REQUEST }]
      }
    ]
    view = await mountWait(world.account)
    await tick(REREAD_MS)
    expect(world.kit.receipts.wait).toHaveBeenCalledWith(OTHER_TX_HASH, CLAIM_BLOCK)
    expect((await executionOf(world.records, world.account))?.transactionHash).toBe(OTHER_TX_HASH)
    expect(view.byTestId('wait-execute-submitting')).not.toBeNull()
    expect(world.port.sendAccountBatch).not.toHaveBeenCalled()
  })

  it('is followed under the hash it took before its release, never released', async () => {
    const world = await openWorld()
    elapse(world.kit)
    holdReceipt(world)
    await claimElsewhere(world.records, world.account)
    const key = recordKeys.recoverySession(CHAIN_ID, world.account)
    const { get } = world.storage
    world.storage.get = async (name, fallback) => {
      // The other page writes its hash after the look for a claim read none, as the release reads it.
      if (name === key && /followClaim/.test(new Error().stack ?? '')) {
        world.storage.get = get
        await hashElsewhere(world.records, world.account)
      }
      return get(name, fallback)
    }
    view = await mountWait(world.account)
    await tick(0)
    expect(await executionOf(world.records, world.account)).toEqual(
      expect.objectContaining({ requestId: OTHER_REQUEST, transactionHash: OTHER_TX_HASH })
    )
    expect(view.byTestId('wait-execute-submitting')).not.toBeNull()
    expect(world.kit.receipts.wait).toHaveBeenCalledWith(OTHER_TX_HASH, CLAIM_BLOCK)
    expect(world.port.send).not.toHaveBeenCalled()
  })
})

describe('a countdown another tab replaced with another attempt', () => {
  useWaitClock()
  const views: Mounted[] = []
  const mount = async (mounting: Promise<Mounted>) => {
    const view = await mounting
    views.push(view)
    return view
  }

  afterEach(() => {
    views.splice(0).forEach((view) => view.unmount())
  })

  const NEXT_ATTEMPT = 2n

  /** The stored countdown, as the storage holds it. */
  const storedCountdown = async (world: World): Promise<StoredSession> =>
    (await world.storage.get(recordKeys.recoverySession(CHAIN_ID, world.account))) as StoredSession

  /**
   * Stores the countdown of a later submission for the same account, as another
   * tab lands it: the next attempt id under a new revision, with no claim, or
   * with a copy of the claim the old countdown carries; the chain then holds
   * that attempt, opened and due.
   */
  const replaceCountdown = async (world: World, keepClaim = false): Promise<void> => {
    const key = recordKeys.recoverySession(CHAIN_ID, world.account)
    const stored = await storedCountdown(world)
    const execution =
      keepClaim && stored.value.state === 'landed' ? stored.value.execution : undefined
    await world.storage.set(key, {
      ...stored,
      revision: '0x0a0b0c0d0e0f0a0b0c0d0e0f',
      value: {
        state: 'landed',
        account: world.account,
        attemptId: NEXT_ATTEMPT.toString(),
        setupNonce: '1',
        payloadHash: PAYLOAD_HASH,
        ...(execution ? { execution } : {}),
        ...(stored.value.state === 'landed' ? { deployment: stored.value.deployment } : {})
      }
    })
    const { chain } = world.kit
    chain.attempt = { ...chain.attempt, attemptId: NEXT_ATTEMPT }
    chain.events = [...chain.events, attemptStarted(world.account, PAYLOAD, NEXT_ATTEMPT)]
  }

  /** Presses execute on the screen of the later attempt and expects one send under a claim on its countdown. */
  const expectExecuteOfNextAttempt = async (view: Mounted, world: World, sends: number) => {
    expect(view.byTestId('wait-execute')).not.toBeNull()
    await view.press('wait-execute')
    expect(world.kit.prepareExecuteHandover).toHaveBeenLastCalledWith(
      expect.objectContaining({ attemptId: NEXT_ATTEMPT }),
      PAYLOAD,
      { from: expect.stringMatching(/^0x[0-9a-fA-F]{40}$/) }
    )
    expect(world.port.send).toHaveBeenCalledTimes(sends)
    const stored = await storedCountdown(world)
    expect(stored.value).toEqual(
      expect.objectContaining({
        attemptId: NEXT_ATTEMPT.toString(),
        execution: expect.objectContaining({ transactionHash: TX_HASH })
      })
    )
  }

  it('releases nothing on a new countdown that replaced the one whose claim with no hash it found, and offers execute for it', async () => {
    const world = await openWorld()
    elapse(world.kit)
    holdReceipt(world)
    await claimElsewhere(world.records, world.account)
    const key = recordKeys.recoverySession(CHAIN_ID, world.account)
    const { get } = world.storage
    world.storage.get = async (name, fallback) => {
      // Another tab lands a later attempt after the look for a claim read this one's claim.
      if (name === key && /followClaim/.test(new Error().stack ?? '')) {
        world.storage.get = get
        await replaceCountdown(world)
      }
      return get(name, fallback)
    }
    const view = await mount(mountWait(world.account))
    const replaced = await storedCountdown(world)
    await tick(0)
    expect(await storedCountdown(world)).toEqual(replaced)
    expect(view.byTestId('wait-execute-submitting')).toBeNull()
    expect(world.port.send).not.toHaveBeenCalled()

    await expectExecuteOfNextAttempt(view, world, 1)
  })

  it('claims nothing on the new countdown and sends nothing where it replaced the one the run checked the gas for, then offers execute for it', async () => {
    const world = await openWorld()
    elapse(world.kit)
    holdReceipt(world)
    const estimate = deferred<bigint>()
    world.kit.reads.estimateGas.mockImplementation(() => estimate.promise)
    const view = await mount(mountWait(world.account))
    await view.press('wait-execute')
    expect(world.kit.prepareExecuteHandover).toHaveBeenCalledTimes(1)

    await replaceCountdown(world)
    const replaced = await storedCountdown(world)
    estimate.resolve(300_000n)
    await tick(0)
    expect(world.port.send).not.toHaveBeenCalled()
    expect(await storedCountdown(world)).toEqual(replaced)

    await tick(0)
    await expectExecuteOfNextAttempt(view, world, 1)
  })

  it('writes no hash on the new countdown where it replaced the run between the claim and the send, and waits on the receipt of its own hash', async () => {
    const world = await openWorld()
    elapse(world.kit)
    const hash = holdSend(world)
    holdReceipt(world)
    const view = await mount(mountWait(world.account))
    await view.press('wait-execute')
    expect((await executionOf(world.records, world.account))?.requestId).toEqual(expect.any(String))

    await replaceCountdown(world)
    const replaced = await storedCountdown(world)
    hash.resolve(TX_HASH)
    await tick(0)
    expect(await storedCountdown(world)).toEqual(replaced)
    expect(world.kit.receipts.wait).toHaveBeenCalledWith(TX_HASH, OWN_CLAIM_BLOCK)
    expect(view.byTestId('wait-execute')).not.toBeNull()
  })

  it('releases nothing on the new countdown where it replaced the run between the two readings of a send no node knows', async () => {
    const world = await openWorld()
    elapse(world.kit)
    holdReceipt(world)
    world.kit.receipts.transactionKnown.mockResolvedValue('unknown')
    const view = await mount(mountWait(world.account))
    await view.press('wait-execute')

    moveDeviceClock(61 * 60_000)
    await tick(POLL_MS)
    expect(world.kit.receipts.transactionKnown).toHaveBeenCalledWith(TX_HASH)
    expect(view.byTestId('wait-execute-submitting')).not.toBeNull()

    await replaceCountdown(world)
    const replaced = await storedCountdown(world)
    await tick(60_000)
    expect(await storedCountdown(world)).toEqual(replaced)

    await expectExecuteOfNextAttempt(view, world, 2)
  })

  it('releases nothing on the new countdown where it carries the same claim between the two readings of a send no node knows', async () => {
    const world = await openWorld()
    elapse(world.kit)
    holdReceipt(world)
    world.kit.receipts.transactionKnown.mockResolvedValue('unknown')
    const view = await mount(mountWait(world.account))
    await view.press('wait-execute')

    moveDeviceClock(61 * 60_000)
    await tick(POLL_MS)
    expect(world.kit.receipts.transactionKnown).toHaveBeenCalledWith(TX_HASH)

    await replaceCountdown(world, true)
    const replaced = await storedCountdown(world)
    await tick(60_000)
    expect(await storedCountdown(world)).toEqual(replaced)
    expect((await executionOf(world.records, world.account))?.transactionHash).toBe(TX_HASH)
    expect(world.port.send).toHaveBeenCalledTimes(1)
  })

  it('claims and writes its hash on a countdown another page rewrote with the same attempt, its payload hash spelled in capitals', async () => {
    const world = await openWorld()
    elapse(world.kit)
    holdReceipt(world)
    const estimate = deferred<bigint>()
    world.kit.reads.estimateGas.mockImplementation(() => estimate.promise)
    const view = await mount(mountWait(world.account))
    await view.press('wait-execute')

    const key = recordKeys.recoverySession(CHAIN_ID, world.account)
    const stored = await storedCountdown(world)
    await world.storage.set(key, {
      ...stored,
      revision: '0x0f0e0d0c0b0a0f0e0d0c0b0a',
      value: { ...stored.value, payloadHash: `0x${PAYLOAD_HASH.slice(2).toUpperCase()}` }
    })
    estimate.resolve(300_000n)
    await tick(0)
    expect(world.port.send).toHaveBeenCalledTimes(1)
    expect(await executionOf(world.records, world.account)).toEqual(
      expect.objectContaining({ requestId: expect.any(String), transactionHash: TX_HASH })
    )
  })
})
