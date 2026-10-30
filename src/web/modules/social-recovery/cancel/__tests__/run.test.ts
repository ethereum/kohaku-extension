import { accountBatchRefusal, isSendRefusal } from '@web/modules/social-recovery/shared/client'
import {
  attachCancelSteps,
  attemptReaderOf,
  CLAIM_SEND_LIMIT_MS,
  cancelClaimsOf,
  checkCancelAgain,
  createCancelStore,
  detachCancelSteps,
  FOLLOW_POLL_MS,
  OWN_SEND_READ_MS,
  recheckCancel,
  startCancel,
  UNTRACKED_FOLLOW_MS
} from '@web/modules/social-recovery/cancel'
import type { CancelClaims, CancelHold, CancelStore } from '@web/modules/social-recovery/cancel'
import {
  dismissAttempt,
  pollAccounts,
  readWatcherRecord
} from '@web/modules/social-recovery/watcher'
import {
  ACCOUNT,
  ATTEMPT,
  LANDED_BLOCK,
  NEW_KEY,
  OTHER_HASH,
  PAYLOAD,
  SEPOLIA,
  SHORT,
  START_BLOCK,
  TX_HASH,
  cancelOn,
  executeOn,
  landedReceipt,
  minedAndReverted,
  openChain,
  openOn,
  ownerCancelAt,
  runWorld
} from '@web/modules/social-recovery/cancel/__fixtures__/run'
import {
  DEPLOYMENT,
  HEAD,
  RETIRED_DEPLOYMENT,
  OLD_KEY,
  atBlock,
  cancelledEvent,
  payloadTo,
  startedEvent,
  stateWith
} from '@web/modules/social-recovery/watcher/__fixtures__/harness'

// The real one, kept apart from the fake timers a test installs.
const immediate = setImmediate

const settled = async () => {
  for (let round = 0; round < 20; round += 1) {
    // eslint-disable-next-line no-await-in-loop
    await new Promise((resolve) => {
      immediate(resolve)
    })
  }
}

const OWNED = { stage: 'cancelled', attemptId: ATTEMPT, newKey: NEW_KEY }

describe("the owner's cancel run", () => {
  let store: CancelStore

  beforeEach(() => {
    store = createCancelStore()
  })

  it('sends the cancel once, and reads cancelled only after the receipt landed and the read agrees', async () => {
    const world = runWorld()
    await startCancel(store, world.steps, ATTEMPT)

    expect(world.sendAccountBatch).toHaveBeenCalledTimes(1)
    const [account, calls, , kit, requestId] = world.sendAccountBatch.mock.calls[0]
    expect(account).toBe(ACCOUNT)
    expect(calls).toHaveLength(1)
    expect(kit).toBeUndefined()
    expect(requestId).toBe('request-1')
    expect(store.state().write.status).toBe('landed')
    expect(store.state().after).toEqual(OWNED)
    expect(await world.steps.claims.read()).toBeUndefined()
  })

  it('names the newer attempt the landed cancel ended, by its new key', async () => {
    const world = runWorld()
    world.wait.mockImplementation(async (hash) => {
      // Another road ended the meant attempt, a newer one opened, and the cancel ended that one.
      cancelOn(world.chain, 'cancelByProofs')
      cancelOn(world.chain, 'cancelByOwner', ATTEMPT + 1n, payloadTo(OLD_KEY))
      return landedReceipt(hash)
    })
    await startCancel(store, world.steps, ATTEMPT)

    expect(store.state().after).toEqual({
      stage: 'cancelled',
      attemptId: ATTEMPT + 1n,
      newKey: OLD_KEY
    })
  })

  it('names the attempt the cancel ended where a newer one opened after it, and the record holds the newer', async () => {
    const world = runWorld()
    world.wait.mockImplementation(async (hash) => {
      cancelOn(world.chain, 'cancelByOwner')
      openOn(world.chain, ATTEMPT + 1n, payloadTo(OLD_KEY))
      return landedReceipt(hash)
    })
    await startCancel(store, world.steps, ATTEMPT)

    expect(store.state().after).toEqual(OWNED)
    const record = await readWatcherRecord(world.storage, SEPOLIA, ACCOUNT)
    expect(record?.reading?.attempt?.attemptId).toBe(ATTEMPT + 1n)
  })

  it('reads another road where the read after the landing names one', async () => {
    const world = runWorld()
    world.wait.mockImplementation(async (hash) => {
      cancelOn(world.chain, 'cancelByProofs')
      return landedReceipt(hash)
    })
    await startCancel(store, world.steps, ATTEMPT)

    expect(store.state().after).toEqual({
      stage: 'otherRoad',
      attemptId: ATTEMPT,
      road: 'cancelByProofs'
    })
  })

  it('reads not sent, with the retry, where the wallet refused the cancel, and releases the claim', async () => {
    const world = runWorld()
    world.sendAccountBatch.mockRejectedValueOnce(accountBatchRefusal('refused', ACCOUNT))
    await startCancel(store, world.steps, ATTEMPT)

    const { write } = store.state()
    expect(write.status).toBe('failedNotSent')
    expect(world.wait).not.toHaveBeenCalled()
    expect(await world.steps.claims.read()).toBeUndefined()

    await startCancel(store, world.steps, ATTEMPT)
    expect(world.sendAccountBatch).toHaveBeenCalledTimes(2)
    expect(store.state().after).toEqual(OWNED)
  })

  it("adds nothing where the run's claim is no longer its own, and reads its gate's refusal", async () => {
    const world = runWorld()
    const original = world.sendAccountBatch.getMockImplementation()!
    world.sendAccountBatch.mockImplementationOnce(async (...args) => {
      const held = await world.steps.claims.read()
      await world.steps.claims.release(held!.requestId)
      return original(...args)
    })
    await startCancel(store, world.steps, ATTEMPT)

    const { write } = store.state()
    expect(write.status).toBe('failedNotSent')
    expect(
      write.status === 'failedNotSent' && isSendRefusal(write.error) && write.error.reason
    ).toBe('timeout')
    expect(world.wait).not.toHaveBeenCalled()
  })

  it('keeps the claim of a cancel that may still reach the chain, and sends no other', async () => {
    const world = runWorld()
    world.sendAccountBatch.mockRejectedValueOnce(accountBatchRefusal('not-a-transaction', ACCOUNT))
    await startCancel(store, world.steps, ATTEMPT)

    const { write } = store.state()
    expect(write.status === 'failedNotSent' && write.mayStillLand).toBe(true)
    expect(await world.steps.claims.read()).toMatchObject({ requestId: 'request-1' })

    // A second page follows the stored cancel and sends nothing.
    const second = createCancelStore()
    await startCancel(second, world.steps, ATTEMPT)
    expect(world.sendAccountBatch).toHaveBeenCalledTimes(1)
    expect(second.state().write.status).toBe('submitting')
  })

  it('releases the claim of a cancel that may still land once the attempt reads ended, and shows the terminal', async () => {
    const world = runWorld()
    world.sendAccountBatch.mockRejectedValueOnce(accountBatchRefusal('not-a-transaction', ACCOUNT))
    await startCancel(store, world.steps, ATTEMPT)
    // The operation another party sends lands later; the wallet holds no request.
    cancelOn(world.chain, 'cancelByOwner')
    world.requestHold.mockResolvedValue({ status: 'free' })

    const second = createCancelStore()
    await attachCancelSteps(second, world.steps)
    await settled()

    expect(await world.steps.claims.read()).toBeUndefined()
    expect(second.state().write.status).toBe('idle')
    expect(second.state().after).toEqual({ stage: 'cancelled', attemptId: ATTEMPT })
    expect(world.sendAccountBatch).toHaveBeenCalledTimes(1)
    detachCancelSteps(second, world.steps)
  })

  it('releases a followed claim held nowhere and offers the newer attempt where another one is open', async () => {
    const world = runWorld()
    world.requestHold.mockResolvedValue({ status: 'free' })
    await world.steps.claims.claim({
      attemptId: ATTEMPT,
      requestId: 'elsewhere',
      startBlock: START_BLOCK
    })
    cancelOn(world.chain, 'cancelByProofs')
    openOn(world.chain, ATTEMPT + 1n, payloadTo(OLD_KEY))

    await attachCancelSteps(store, world.steps)
    await settled()

    expect(await world.steps.claims.read()).toBeUndefined()
    expect(store.state().write.status).toBe('idle')
    expect(store.state().gone?.attempt?.attemptId).toBe(ATTEMPT + 1n)
    detachCancelSteps(store, world.steps)
  })

  it("never releases another tab's claim between its claim and its add", async () => {
    const world = runWorld()
    // The request is not in the wallet yet, so the second tab reads it held nowhere.
    world.requestHold.mockResolvedValue({ status: 'free' })
    const second = createCancelStore()
    const original = world.sendAccountBatch.getMockImplementation()!
    world.sendAccountBatch.mockImplementationOnce(async (...args) => {
      attachCancelSteps(second, world.steps).catch(() => undefined)
      await settled()
      return original(...args)
    })
    await startCancel(store, world.steps, ATTEMPT)

    expect(world.sendAccountBatch).toHaveBeenCalledTimes(1)
    expect(store.state().write.status).toBe('landed')
    expect(store.state().after).toEqual(OWNED)
    expect(second.state().write.status).toBe('submitting')
    expect(second.state().follow).toBe('held')
    detachCancelSteps(second, world.steps)
  })

  it('names the road where the cancel reverted because another road had ended the attempt', async () => {
    const world = runWorld()
    world.wait.mockImplementation(async (hash) => {
      cancelOn(world.chain, 'setupWrite')
      throw minedAndReverted(hash)
    })
    await startCancel(store, world.steps, ATTEMPT)

    const { write } = store.state()
    expect(write.status).toBe('failedReverted')
    if (write.status === 'failedReverted') {
      expect(write.cause).toEqual({ kind: 'attemptGone', ended: 'setupWrite' })
    }
    expect(await world.steps.claims.read()).toBeUndefined()
  })

  it("names the account's controller where the cancel reverted because the attempt executed", async () => {
    const world = runWorld()
    world.wait.mockImplementation(async (hash) => {
      executeOn(world.chain)
      throw minedAndReverted(hash)
    })
    await startCancel(store, world.steps, ATTEMPT)

    const { write } = store.state()
    expect(write.status === 'failedReverted' && write.cause).toEqual({
      kind: 'attemptGone',
      ended: 'executed',
      controller: NEW_KEY
    })
  })

  it('reads the plain revert, with the retry, where the attempt still runs after the revert', async () => {
    const world = runWorld()
    world.wait.mockImplementation(async (hash) => {
      throw minedAndReverted(hash)
    })
    await startCancel(store, world.steps, ATTEMPT)

    const { write } = store.state()
    expect(write.status === 'failedReverted' && write.cause.kind).toBe('unnamed')
  })

  it('shows the deposit step where the key holds too little, and sends after the funds arrive', async () => {
    const world = runWorld()
    world.checkGas.mockResolvedValueOnce(SHORT)
    await startCancel(store, world.steps, ATTEMPT)

    const { write } = store.state()
    expect(write.status).toBe('needsDeposit')
    expect(write.status === 'needsDeposit' && write.step.payer).toBe('accountKey')
    expect(world.sendAccountBatch).not.toHaveBeenCalled()

    await recheckCancel(store, world.steps)
    expect(world.sendAccountBatch).toHaveBeenCalledTimes(1)
    expect(store.state().after).toEqual(OWNED)
  })

  it('sends nothing where the read before the send finds the attempt gone', async () => {
    const chain = openChain()
    executeOn(chain)
    const world = runWorld(chain)
    await startCancel(store, world.steps, ATTEMPT)

    expect(world.sendAccountBatch).not.toHaveBeenCalled()
    expect(store.state().write.status).toBe('idle')
    expect(store.state().gone?.ended).toMatchObject({ road: 'executed', controller: NEW_KEY })
  })

  it('sends nothing, and keeps the newer attempt to offer, where another attempt is open', async () => {
    const chain = openChain()
    openOn(chain, ATTEMPT + 1n, payloadTo(OLD_KEY))
    const world = runWorld(chain)
    await startCancel(store, world.steps, ATTEMPT)

    expect(world.sendAccountBatch).not.toHaveBeenCalled()
    expect(store.state().gone?.attempt?.attemptId).toBe(ATTEMPT + 1n)
  })

  it('sends nothing and releases its claim where the read after the claim finds the attempt gone', async () => {
    const world = runWorld()
    const claims: CancelClaims = world.steps.claims
    world.steps.claims = {
      ...claims,
      claim: async (claim) => {
        const answer = await claims.claim(claim)
        cancelOn(world.chain, 'cancelByProofs')
        return answer
      }
    }
    await startCancel(store, world.steps, ATTEMPT)

    expect(world.sendAccountBatch).not.toHaveBeenCalled()
    expect(store.state().write.status).toBe('idle')
    expect(store.state().gone?.ended).toMatchObject({
      road: 'cancelled',
      cancelledBy: 'cancelByProofs'
    })
    expect(await claims.read()).toBeUndefined()
  })

  it('reads the check as failed, with nothing sent, where the attempt read fails', async () => {
    const chain = openChain()
    chain.setState(ACCOUNT, new Error('node down'))
    const world = runWorld(chain)
    await startCancel(store, world.steps, ATTEMPT)

    expect(store.state().write.status).toBe('gasReadError')
    expect(world.sendAccountBatch).not.toHaveBeenCalled()
  })

  it('follows a cancel another page stored under its hash, sending nothing, to its terminal', async () => {
    const world = runWorld()
    const claims = cancelClaimsOf(world.storage, SEPOLIA, ACCOUNT)
    await claims.claim({ attemptId: ATTEMPT, requestId: 'elsewhere', startBlock: START_BLOCK })
    await claims.markSent('elsewhere', OTHER_HASH)
    await attachCancelSteps(store, world.steps)
    await settled()

    expect(world.sendAccountBatch).not.toHaveBeenCalled()
    expect(world.wait).toHaveBeenCalledWith(OTHER_HASH, START_BLOCK)
    expect(store.state().after).toEqual({ stage: 'cancelled', attemptId: ATTEMPT, newKey: NEW_KEY })
    detachCancelSteps(store, world.steps)
  })

  it('offers the start again where the wallet holds a stored request nowhere past its send limit', async () => {
    let clock = 1_000_000
    const world = runWorld(openChain(), () => clock)
    world.requestHold.mockResolvedValue({ status: 'free' })
    await world.steps.claims.claim({
      attemptId: ATTEMPT,
      requestId: 'elsewhere',
      startBlock: START_BLOCK
    })
    clock += CLAIM_SEND_LIMIT_MS + 1
    await attachCancelSteps(store, world.steps)
    await settled()

    expect(store.state().write.status).toBe('idle')
    expect(await world.steps.claims.read()).toBeUndefined()
    expect(world.sendAccountBatch).not.toHaveBeenCalled()

    await startCancel(store, world.steps, ATTEMPT)
    expect(world.sendAccountBatch).toHaveBeenCalledTimes(1)
    expect(world.wait).toHaveBeenCalledWith(TX_HASH, START_BLOCK)
    detachCancelSteps(store, world.steps)
  })

  it('follows a request the wallet broadcast meanwhile under its hash', async () => {
    const world = runWorld()
    world.requestHold.mockResolvedValue({ status: 'broadcast', transactionHash: OTHER_HASH })
    await world.steps.claims.claim({
      attemptId: ATTEMPT,
      requestId: 'elsewhere',
      startBlock: START_BLOCK
    })
    await attachCancelSteps(store, world.steps)
    await settled()

    expect(world.sendAccountBatch).not.toHaveBeenCalled()
    expect(world.wait).toHaveBeenCalledWith(OTHER_HASH, START_BLOCK)
    expect(store.state().after).toEqual({ stage: 'cancelled', attemptId: ATTEMPT, newKey: NEW_KEY })
    detachCancelSteps(store, world.steps)
  })

  it("names the attempt the receipt's own cancel log ended, an id the page never read", async () => {
    const world = runWorld()
    world.receiptCancel.mockResolvedValue(
      atBlock(cancelledEvent(ATTEMPT + 5n, 'cancelByOwner'), LANDED_BLOCK)
    )
    await startCancel(store, world.steps, ATTEMPT)

    expect(world.receiptCancel).toHaveBeenCalledWith(TX_HASH, START_BLOCK)
    expect(store.state().after).toMatchObject({ stage: 'cancelled', attemptId: ATTEMPT + 5n })
  })

  it('never takes a later cancel from another device for this one where the receipt names its attempt', async () => {
    const world = runWorld()
    world.wait.mockImplementation(async (hash) => {
      cancelOn(world.chain, 'cancelByOwner')
      // A newer attempt opened right after, and the owner cancelled it from another device.
      cancelOn(world.chain, 'cancelByOwner', ATTEMPT + 1n, payloadTo(OLD_KEY), OTHER_HASH)
      return landedReceipt(hash)
    })
    world.receiptCancel.mockResolvedValue(
      atBlock(cancelledEvent(ATTEMPT, 'cancelByOwner'), LANDED_BLOCK)
    )
    await startCancel(store, world.steps, ATTEMPT)

    expect(store.state().after).toEqual(OWNED)
  })

  it('keeps the claim of a held request whose attempt ended, and shows the ending beside the follow', async () => {
    const world = runWorld()
    await world.steps.claims.claim({
      attemptId: ATTEMPT,
      requestId: 'elsewhere',
      startBlock: START_BLOCK
    })
    cancelOn(world.chain, 'cancelByProofs')

    // The follow goes on while the wallet holds the request, so the attach is not awaited.
    const following = attachCancelSteps(store, world.steps)
    await settled()

    expect(await world.steps.claims.read()).toMatchObject({ requestId: 'elsewhere' })
    expect(store.state().write.status).toBe('submitting')
    expect(store.state().follow).toBe('held')
    expect(store.state().followGone?.ended).toMatchObject({ cancelledBy: 'cancelByProofs' })
    expect(world.withdrawRequest).toHaveBeenCalledWith('elsewhere')
    expect(world.sendAccountBatch).not.toHaveBeenCalled()
    detachCancelSteps(store, world.steps)
    await following
  })

  it('withdraws a held request whose attempt ended, then releases the claim and shows the ending', async () => {
    jest.useFakeTimers('modern')
    try {
      const world = runWorld()
      world.withdrawRequest.mockImplementation(() => {
        world.requestHold.mockResolvedValue({ status: 'free' })
      })
      await world.steps.claims.claim({
        attemptId: ATTEMPT,
        requestId: 'elsewhere',
        startBlock: START_BLOCK
      })
      cancelOn(world.chain, 'cancelByProofs')
      attachCancelSteps(store, world.steps).catch(() => undefined)
      await settled()
      expect(world.withdrawRequest).toHaveBeenCalledWith('elsewhere')
      expect(await world.steps.claims.read()).toMatchObject({ requestId: 'elsewhere' })

      jest.advanceTimersByTime(FOLLOW_POLL_MS)
      await settled()

      expect(await world.steps.claims.read()).toBeUndefined()
      expect(store.state().write.status).toBe('idle')
      expect(store.state().gone?.ended).toMatchObject({ cancelledBy: 'cancelByProofs' })
      expect(world.sendAccountBatch).not.toHaveBeenCalled()
      detachCancelSteps(store, world.steps)
    } finally {
      jest.useRealTimers()
    }
  })

  it('keeps the follow and the claim where the withdrawal of a held request fails', async () => {
    jest.useFakeTimers('modern')
    try {
      const world = runWorld()
      world.withdrawRequest.mockImplementation(() => {
        throw new Error('the wallet cannot withdraw this request')
      })
      await world.steps.claims.claim({
        attemptId: ATTEMPT,
        requestId: 'elsewhere',
        startBlock: START_BLOCK
      })
      cancelOn(world.chain, 'cancelByProofs')
      attachCancelSteps(store, world.steps).catch(() => undefined)
      await settled()
      for (let round = 0; round < 6; round += 1) {
        jest.advanceTimersByTime(FOLLOW_POLL_MS)
        // eslint-disable-next-line no-await-in-loop
        await settled()
      }

      expect(world.withdrawRequest).toHaveBeenCalledTimes(2)
      expect(await world.steps.claims.read()).toMatchObject({ requestId: 'elsewhere' })
      expect(store.state().write.status).toBe('submitting')
      expect(store.state().follow).toBe('held')
      expect(store.state().followGone?.ended).toMatchObject({ cancelledBy: 'cancelByProofs' })
      detachCancelSteps(store, world.steps)
      jest.advanceTimersByTime(FOLLOW_POLL_MS)
      await settled()
    } finally {
      jest.useRealTimers()
    }
  })

  it('reads the hold each round of a follow and the attempt every fifth', async () => {
    jest.useFakeTimers('modern')
    try {
      const world = runWorld()
      const readAttempt = jest.fn(world.steps.readAttempt)
      world.steps.readAttempt = readAttempt
      await world.steps.claims.claim({
        attemptId: ATTEMPT,
        requestId: 'elsewhere',
        startBlock: START_BLOCK
      })
      attachCancelSteps(store, world.steps).catch(() => undefined)
      await settled()
      for (let round = 0; round < 10; round += 1) {
        jest.advanceTimersByTime(FOLLOW_POLL_MS)
        // eslint-disable-next-line no-await-in-loop
        await settled()
      }

      expect(world.requestHold).toHaveBeenCalledTimes(11)
      expect(readAttempt).toHaveBeenCalledTimes(3)
      detachCancelSteps(store, world.steps)
      jest.advanceTimersByTime(FOLLOW_POLL_MS)
      await settled()
    } finally {
      jest.useRealTimers()
    }
  })

  it('writes the record only where a page read finds the reading changed', async () => {
    const world = runWorld()
    const set = jest.spyOn(world.storage, 'set')
    await world.steps.readAttempt()
    await world.steps.readAttempt()
    expect(set).toHaveBeenCalledTimes(1)

    cancelOn(world.chain, 'cancelByProofs')
    await world.steps.readAttempt()
    expect(set).toHaveBeenCalledTimes(2)
  })

  it('writes nothing for a page read of an older block and answers the stored newer reading, so an earlier poll of a newer block is still written', async () => {
    const world = runWorld()
    const alarmPoll = (polledAt: number) =>
      pollAccounts({
        reads: world.chain.reads,
        deployment: DEPLOYMENT,
        accounts: [ACCOUNT],
        chainId: SEPOLIA,
        storage: world.storage,
        now: () => polledAt,
        polledAt,
        limitMs: 5_000,
        scanLimitMs: 5_000
      })
    world.chain.head.number = HEAD + 2
    await alarmPoll(1_000)

    // The page's node answers an older block, with a reading that changed.
    cancelOn(world.chain, 'cancelByProofs')
    world.chain.head.number = HEAD
    const pageRead = attemptReaderOf({
      reads: world.chain.reads,
      deployment: DEPLOYMENT,
      account: ACCOUNT,
      chainId: SEPOLIA,
      storage: world.storage,
      now: () => 3_000,
      limitMs: 5_000
    })
    const answered = await pageRead()
    expect(answered.block.number).toBe(HEAD + 2)
    expect(answered.attempt?.attemptId).toBe(ATTEMPT)
    expect(answered.ended).toBeUndefined()
    let record = await readWatcherRecord(world.storage, SEPOLIA, ACCOUNT)
    expect(record?.reading?.block.number).toBe(HEAD + 2)
    expect(record?.polledAt).toBe(1_000)

    // An alarm poll that started before the page's, at a newer block.
    world.chain.head.number = HEAD + 3
    await alarmPoll(2_000)
    record = await readWatcherRecord(world.storage, SEPOLIA, ACCOUNT)
    expect(record?.reading?.block.number).toBe(HEAD + 3)
    expect(record?.reading?.ended).toMatchObject({ cancelledBy: 'cancelByProofs' })
  })

  it('reads the attempt again where the run found it gone', async () => {
    const chain = openChain()
    cancelOn(chain, 'cancelByProofs')
    const world = runWorld(chain)
    await startCancel(store, world.steps, ATTEMPT)
    expect(store.state().gone?.attempt).toBeUndefined()

    openOn(world.chain, ATTEMPT + 1n, payloadTo(OLD_KEY))
    await checkCancelAgain(store, world.steps)

    expect(store.state().write.status).toBe('idle')
    expect(store.state().gone?.attempt?.attemptId).toBe(ATTEMPT + 1n)
    expect(world.sendAccountBatch).not.toHaveBeenCalled()
  })

  it("never names an owner's cancel of another transaction where the receipt's logs cannot be read", async () => {
    const world = runWorld()
    world.wait.mockImplementation(async (hash) => {
      cancelOn(world.chain, 'cancelByOwner', ATTEMPT, payloadTo(NEW_KEY), hash)
      // One block later another transaction of the owner's key cancels the next attempt.
      const newer = payloadTo(OLD_KEY)
      world.chain.setState(
        ACCOUNT,
        stateWith({ attemptId: ATTEMPT + 1n, state: 'Cancelled', payload: newer })
      )
      world.chain.setEvents(ACCOUNT, ATTEMPT + 1n, {
        started: startedEvent(ATTEMPT + 1n, newer),
        cancelled: ownerCancelAt(ATTEMPT + 1n, LANDED_BLOCK + 1, OTHER_HASH)
      })
      return landedReceipt(hash)
    })
    await startCancel(store, world.steps, ATTEMPT)

    expect(world.receiptCancel).toHaveBeenCalledTimes(1)
    expect(store.state().after).toEqual(OWNED)
  })

  it('answers the stored newer reading where the page reads an older block with no attempt', async () => {
    const world = runWorld()
    world.chain.head.number = HEAD + 2
    await pollAccounts({
      reads: world.chain.reads,
      deployment: DEPLOYMENT,
      accounts: [ACCOUNT],
      chainId: SEPOLIA,
      storage: world.storage,
      now: () => 1_000,
      polledAt: 1_000,
      limitMs: 5_000,
      scanLimitMs: 5_000
    })
    world.chain.setState(ACCOUNT, stateWith())
    world.chain.head.number = HEAD
    const pageRead = attemptReaderOf({
      reads: world.chain.reads,
      deployment: DEPLOYMENT,
      account: ACCOUNT,
      chainId: SEPOLIA,
      storage: world.storage,
      now: () => 3_000,
      limitMs: 5_000
    })

    const answered = await pageRead()
    expect(answered.block.number).toBe(HEAD + 2)
    expect(answered.attempt?.attemptId).toBe(ATTEMPT)
  })

  it('lends no stored reading of a retired deployment, keeps none of its dismissals, and writes its own deployment', async () => {
    const world = runWorld()
    await pollAccounts({
      reads: world.chain.reads,
      deployment: RETIRED_DEPLOYMENT,
      accounts: [ACCOUNT],
      chainId: SEPOLIA,
      storage: world.storage,
      now: () => 1_000,
      polledAt: 1_000,
      limitMs: 5_000,
      scanLimitMs: 5_000
    })
    await dismissAttempt(SEPOLIA, ACCOUNT, ATTEMPT, world.storage)
    world.chain.reads.attemptEventsOf.mockClear()
    const pageRead = attemptReaderOf({
      reads: world.chain.reads,
      deployment: DEPLOYMENT,
      account: ACCOUNT,
      chainId: SEPOLIA,
      storage: world.storage,
      now: () => 3_000,
      limitMs: 5_000
    })

    const answered = await pageRead()

    expect(world.chain.reads.attemptEventsOf).toHaveBeenCalled()
    expect(answered.deployment).toEqual(DEPLOYMENT)
    const record = await readWatcherRecord(world.storage, SEPOLIA, ACCOUNT)
    expect(record?.reading?.deployment).toEqual(DEPLOYMENT)
    expect(record?.dismissed).toEqual([])
  })

  it('takes up a follow with the steps a screen built again, without stopping it', async () => {
    jest.useFakeTimers('modern')
    try {
      const world = runWorld()
      await world.steps.claims.claim({
        attemptId: ATTEMPT,
        requestId: 'elsewhere',
        startBlock: START_BLOCK
      })
      attachCancelSteps(store, world.steps).catch(() => undefined)
      await settled()
      const before = world.requestHold.mock.calls.length

      // The screen builds its steps again: the old ones detach, the new ones attach.
      const rebuiltHold = jest.fn(async (): Promise<CancelHold> => ({ status: 'held' }))
      const rebuilt = { ...world.steps, requestHold: rebuiltHold }
      detachCancelSteps(store, world.steps)
      attachCancelSteps(store, rebuilt).catch(() => undefined)
      await settled()
      for (let round = 0; round < 5; round += 1) {
        jest.advanceTimersByTime(FOLLOW_POLL_MS)
        // eslint-disable-next-line no-await-in-loop
        await settled()
      }

      expect(world.requestHold).toHaveBeenCalledTimes(before)
      expect(rebuiltHold).toHaveBeenCalledTimes(5)
      expect(store.state().write.status).toBe('submitting')
      expect(store.state().follow).toBe('held')
      detachCancelSteps(store, rebuilt)
      jest.advanceTimersByTime(FOLLOW_POLL_MS)
      await settled()
    } finally {
      jest.useRealTimers()
    }
  })

  it('withdraws its own waiting request once the attempt ended and another opened, and shows the ending', async () => {
    jest.useFakeTimers('modern')
    try {
      const world = runWorld()
      let refuse: (error: Error) => void = () => {}
      world.sendAccountBatch.mockImplementation(
        () =>
          new Promise((_resolve, reject) => {
            refuse = reject
          })
      )
      startCancel(store, world.steps, ATTEMPT).catch(() => undefined)
      await settled()
      expect(world.sendAccountBatch).toHaveBeenCalledTimes(1)

      // The sign window stays open while another road ends the attempt and a newer one opens.
      cancelOn(world.chain, 'cancelByProofs')
      openOn(world.chain, ATTEMPT + 1n, payloadTo(OLD_KEY))
      jest.advanceTimersByTime(OWN_SEND_READ_MS)
      await settled()

      expect(world.withdrawRequest).toHaveBeenCalledWith('request-1')
      expect(store.state().write.status).toBe('submitting')
      expect(store.state().followGone?.attempt?.attemptId).toBe(ATTEMPT + 1n)
      expect(await world.steps.claims.read()).toMatchObject({ requestId: 'request-1' })

      // The wallet drops the withdrawn request, and the send answers its refusal.
      refuse(accountBatchRefusal('refused', ACCOUNT))
      await settled()

      expect(store.state().write.status).toBe('idle')
      expect(store.state().gone?.attempt?.attemptId).toBe(ATTEMPT + 1n)
      expect(await world.steps.claims.read()).toBeUndefined()
      expect(world.sendAccountBatch).toHaveBeenCalledTimes(1)
      expect(world.wait).not.toHaveBeenCalled()
    } finally {
      jest.useRealTimers()
    }
  })

  it('reads nothing more for its own request once the send answered', async () => {
    jest.useFakeTimers('modern')
    try {
      const world = runWorld()
      const readAttempt = jest.fn(world.steps.readAttempt)
      world.steps.readAttempt = readAttempt
      await startCancel(store, world.steps, ATTEMPT)
      const reads = readAttempt.mock.calls.length
      jest.advanceTimersByTime(OWN_SEND_READ_MS * 3)
      await settled()

      expect(readAttempt).toHaveBeenCalledTimes(reads)
      expect(world.withdrawRequest).not.toHaveBeenCalled()
    } finally {
      jest.useRealTimers()
    }
  })

  it('ends the follow of an operation the wallet cannot follow to a hash once its attempt ends', async () => {
    const world = runWorld()
    world.requestHold.mockResolvedValue({ status: 'untracked' })
    await world.steps.claims.claim({
      attemptId: ATTEMPT,
      requestId: 'elsewhere',
      startBlock: START_BLOCK
    })
    cancelOn(world.chain, 'cancelByOwner')

    await attachCancelSteps(store, world.steps)
    await settled()

    expect(await world.steps.claims.read()).toBeUndefined()
    expect(store.state().write.status).toBe('idle')
    expect(store.state().after).toEqual({ stage: 'cancelled', attemptId: ATTEMPT })
    expect(world.withdrawRequest).not.toHaveBeenCalled()
    expect(world.sendAccountBatch).not.toHaveBeenCalled()
    detachCancelSteps(store, world.steps)
  })

  it('releases the claim of an operation the wallet cannot follow past its bound, and shows the reading', async () => {
    jest.useFakeTimers('modern')
    try {
      let clock = 1_000_000
      const world = runWorld(openChain(), () => clock)
      world.requestHold.mockResolvedValue({ status: 'untracked' })
      await world.steps.claims.claim({
        attemptId: ATTEMPT,
        requestId: 'elsewhere',
        startBlock: START_BLOCK
      })
      attachCancelSteps(store, world.steps).catch(() => undefined)
      await settled()
      expect(store.state().write.status).toBe('submitting')
      expect(store.state().follow).toBe('held')

      clock += UNTRACKED_FOLLOW_MS + 1
      for (let round = 0; round < 5; round += 1) {
        jest.advanceTimersByTime(FOLLOW_POLL_MS)
        // eslint-disable-next-line no-await-in-loop
        await settled()
      }

      expect(await world.steps.claims.read()).toBeUndefined()
      expect(store.state().write.status).toBe('idle')
      expect(store.state().gone?.attempt?.attemptId).toBe(ATTEMPT)
      expect(world.sendAccountBatch).not.toHaveBeenCalled()
      detachCancelSteps(store, world.steps)
    } finally {
      jest.useRealTimers()
    }
  })

  it('keeps the claim of an operation the wallet cannot follow while its bound runs with the attempt open', async () => {
    jest.useFakeTimers('modern')
    try {
      let clock = 1_000_000
      const world = runWorld(openChain(), () => clock)
      world.requestHold.mockResolvedValue({ status: 'untracked' })
      await world.steps.claims.claim({
        attemptId: ATTEMPT,
        requestId: 'elsewhere',
        startBlock: START_BLOCK
      })
      attachCancelSteps(store, world.steps).catch(() => undefined)
      await settled()

      clock += UNTRACKED_FOLLOW_MS - 1
      for (let round = 0; round < 5; round += 1) {
        jest.advanceTimersByTime(FOLLOW_POLL_MS)
        // eslint-disable-next-line no-await-in-loop
        await settled()
      }

      expect(await world.steps.claims.read()).toMatchObject({ requestId: 'elsewhere' })
      expect(store.state().write.status).toBe('submitting')
      expect(store.state().gone).toBeUndefined()
      detachCancelSteps(store, world.steps)
    } finally {
      jest.useRealTimers()
    }
  })

  it('keeps the claim of an operation the wallet cannot follow when its attempt ends by proofs and a newer one opens, offering no send until the bound', async () => {
    jest.useFakeTimers('modern')
    try {
      let clock = 1_000_000
      const world = runWorld(openChain(), () => clock)
      world.requestHold.mockResolvedValue({ status: 'untracked' })
      await world.steps.claims.claim({
        attemptId: ATTEMPT,
        requestId: 'elsewhere',
        startBlock: START_BLOCK
      })
      cancelOn(world.chain, 'cancelByProofs')
      openOn(world.chain, ATTEMPT + 1n, PAYLOAD)
      attachCancelSteps(store, world.steps).catch(() => undefined)
      await settled()
      for (let round = 0; round < 5; round += 1) {
        jest.advanceTimersByTime(FOLLOW_POLL_MS)
        // eslint-disable-next-line no-await-in-loop
        await settled()
      }

      // The operation may still land on the newer attempt: the claim stands and nothing is offered.
      expect(await world.steps.claims.read()).toMatchObject({ requestId: 'elsewhere' })
      expect(store.state().write.status).toBe('submitting')
      expect(store.state().followGone?.attempt?.attemptId).toBe(ATTEMPT + 1n)
      expect(store.state().gone).toBeUndefined()
      expect(world.withdrawRequest).not.toHaveBeenCalled()
      expect(world.sendAccountBatch).not.toHaveBeenCalled()

      clock += UNTRACKED_FOLLOW_MS + 1
      for (let round = 0; round < 5; round += 1) {
        jest.advanceTimersByTime(FOLLOW_POLL_MS)
        // eslint-disable-next-line no-await-in-loop
        await settled()
      }

      expect(await world.steps.claims.read()).toBeUndefined()
      expect(store.state().write.status).toBe('idle')
      expect(store.state().gone?.attempt?.attemptId).toBe(ATTEMPT + 1n)
      expect(world.sendAccountBatch).not.toHaveBeenCalled()
      detachCancelSteps(store, world.steps)
    } finally {
      jest.useRealTimers()
    }
  })

  it('shows the cancelled terminal where an operation the wallet cannot follow lands as the owner cancel after a newer attempt opened', async () => {
    jest.useFakeTimers('modern')
    try {
      const world = runWorld()
      world.requestHold.mockResolvedValue({ status: 'untracked' })
      await world.steps.claims.claim({
        attemptId: ATTEMPT,
        requestId: 'elsewhere',
        startBlock: START_BLOCK
      })
      cancelOn(world.chain, 'cancelByProofs')
      openOn(world.chain, ATTEMPT + 1n, PAYLOAD)
      attachCancelSteps(store, world.steps).catch(() => undefined)
      await settled()
      expect(store.state().write.status).toBe('submitting')

      cancelOn(world.chain, 'cancelByOwner', ATTEMPT + 1n)
      for (let round = 0; round < 5; round += 1) {
        jest.advanceTimersByTime(FOLLOW_POLL_MS)
        // eslint-disable-next-line no-await-in-loop
        await settled()
      }

      expect(await world.steps.claims.read()).toBeUndefined()
      expect(store.state().write.status).toBe('idle')
      expect(store.state().after).toEqual({ stage: 'cancelled', attemptId: ATTEMPT + 1n })
      expect(world.sendAccountBatch).not.toHaveBeenCalled()
      detachCancelSteps(store, world.steps)
    } finally {
      jest.useRealTimers()
    }
  })

  it('releases the claim of an operation the wallet cannot follow once its attempt ended by another road with none open', async () => {
    const world = runWorld()
    world.requestHold.mockResolvedValue({ status: 'untracked' })
    await world.steps.claims.claim({
      attemptId: ATTEMPT,
      requestId: 'elsewhere',
      startBlock: START_BLOCK
    })
    cancelOn(world.chain, 'cancelByProofs')

    await attachCancelSteps(store, world.steps)
    await settled()

    expect(await world.steps.claims.read()).toBeUndefined()
    expect(store.state().write.status).toBe('idle')
    expect(store.state().gone?.ended).toMatchObject({
      attemptId: ATTEMPT,
      cancelledBy: 'cancelByProofs'
    })
    expect(world.sendAccountBatch).not.toHaveBeenCalled()
    detachCancelSteps(store, world.steps)
  })
})
