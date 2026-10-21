import { ERRORS_MANAGER_ABI } from '@kohaku-eth/social-recovery'
import { encodeErrorResult } from 'viem'

import {
  createWatcherReads,
  deploymentDescriptor,
  providerReadFailure
} from '@web/modules/social-recovery/shared/client'
import { addressOf } from '@web/modules/social-recovery/shared/client/__fixtures__/addresses'
import { ScriptedNode } from '@web/modules/social-recovery/shared/client/scripted'
import type { AttemptScan } from '@web/modules/social-recovery/shared/client/types'
import {
  dismissAttempt,
  pollAccounts,
  readWatcherRecord,
  updateWatcherRecord
} from '@web/modules/social-recovery/watcher'

import {
  ACCOUNT,
  atBlock,
  cancelledEvent,
  COMMITTED_AT,
  consumedEvent,
  DEPLOYMENT,
  RETIRED_DEPLOYMENT,
  ENDED_TIME,
  HEAD,
  HEAD_TIME,
  memoryStorage,
  NEW_KEY,
  OLD_KEY,
  OPENED_BLOCK,
  OPENED_TIME,
  OTHER_ACCOUNT,
  payloadTo,
  scriptedChain,
  SEPOLIA,
  startedEvent,
  stateWith
} from '@web/modules/social-recovery/watcher/__fixtures__/harness'

const NOW = 1_800_000_123_000
const KIT_ACCOUNT = addressOf('kit-account')
// The transaction of the consume log the scripted chain answers.
const CONSUME_HASH = consumedEvent(4n).at.transactionHash

const setUp = (accounts = [ACCOUNT]) => {
  const chain = scriptedChain()
  accounts.forEach((account) => chain.deploy(account))
  const storage = memoryStorage()
  const poll = (limitMs = 1_000, scanLimitMs = 1_000, polledAt = NOW) =>
    pollAccounts({
      reads: chain.reads,
      deployment: DEPLOYMENT,
      accounts,
      chainId: SEPOLIA,
      storage,
      now: () => NOW,
      polledAt,
      limitMs,
      scanLimitMs
    })
  const record = (account = ACCOUNT) => readWatcherRecord(storage, SEPOLIA, account)
  return { chain, storage, poll, record }
}

const PAYLOAD = payloadTo(NEW_KEY)

/** The blocks of each attempt scan the poll asked for, and the log each stops at. */
const scansOf = (chain: ReturnType<typeof scriptedChain>) =>
  chain.reads.attemptEventsOf.mock.calls.map(([, , { from, to, until }]) => ({ from, to, until }))

describe('a poll of the watched accounts', () => {
  it('writes a reading with no attempt and no badge where none is open, naming the deployment it read', async () => {
    const { chain, poll, record } = setUp()
    chain.setState(ACCOUNT, stateWith())

    expect(await poll()).toBe(0)
    const written = await record()
    expect(written?.reading).toEqual({
      account: ACCOUNT,
      block: { number: HEAD, timestamp: HEAD_TIME },
      hasSetup: true,
      dormant: false,
      deployment: DEPLOYMENT
    })
    expect(written?.failed).toBeUndefined()
  })

  it('pins every read of the poll to the latest block, read once', async () => {
    const { chain, poll } = setUp([ACCOUNT, OTHER_ACCOUNT])
    chain.setState(ACCOUNT, stateWith({ attemptId: 1n, state: 'Waiting', payload: PAYLOAD }))
    chain.setState(OTHER_ACCOUNT, stateWith())

    await poll()

    expect(chain.reads.latestBlock).toHaveBeenCalledTimes(1)
    expect(chain.reads.stateOf.mock.calls.map(([, block]) => block)).toEqual([HEAD, HEAD])
    expect(chain.reads.isAuthorized.mock.calls.map(([, block]) => block)).toEqual([HEAD, HEAD])
    expect(chain.reads.attemptEventsOf).toHaveBeenCalledWith(
      ACCOUNT,
      1n,
      expect.objectContaining({ from: COMMITTED_AT, to: HEAD, until: 'opening' })
    )
  })

  it('reads an open attempt with its countdown and no key until its opening is read, then the decoded key', async () => {
    const { chain, poll, record } = setUp()
    chain.setState(ACCOUNT, stateWith({ attemptId: 4n, state: 'Waiting', payload: PAYLOAD }))

    expect(await poll()).toBe(1)
    const first = (await record())?.reading
    expect(first?.dormant).toBe(false)
    expect(first?.attempt).toMatchObject({
      attemptId: 4n,
      consumableAfter: HEAD_TIME + 3600,
      executionDue: false,
      openingGap: 'not-found'
    })
    expect(first?.attempt?.newKey).toBeUndefined()
    expect(first?.attempt?.openedAt).toBeUndefined()

    chain.head.number = HEAD + 1
    chain.setEvents(ACCOUNT, 4n, { started: startedEvent(4n, PAYLOAD) })
    expect(await poll()).toBe(1)
    const second = (await record())?.reading?.attempt
    expect(second).toMatchObject({ newKey: NEW_KEY, removedKey: OLD_KEY, openedAt: OPENED_TIME })
    expect(second?.openingGap).toBeUndefined()
  })

  it('reads the opening once per attempt and payload', async () => {
    const { chain, poll } = setUp()
    chain.setState(ACCOUNT, stateWith({ attemptId: 4n, state: 'Waiting', payload: PAYLOAD }))
    chain.setEvents(ACCOUNT, 4n, { started: startedEvent(4n, PAYLOAD) })

    await poll()
    await poll()

    expect(chain.reads.attemptEventsOf).toHaveBeenCalledTimes(1)
  })

  it("reads the opening of a new manager's attempt afresh beside a reading of the same attempt id on a retired manager", async () => {
    const { chain, storage, poll, record } = setUp()
    chain.setState(ACCOUNT, stateWith({ attemptId: 1n, state: 'Waiting', payload: PAYLOAD }))
    chain.setEvents(ACCOUNT, 1n, { started: startedEvent(1n, PAYLOAD) })
    const retired = { manager: addressOf('retired-manager'), action: DEPLOYMENT.action }
    await pollAccounts({
      reads: chain.reads,
      deployment: retired,
      accounts: [ACCOUNT],
      chainId: SEPOLIA,
      storage,
      now: () => NOW,
      limitMs: 1_000,
      scanLimitMs: 1_000
    })
    expect((await record())?.reading?.attempt?.newKey).toBe(NEW_KEY)

    await poll()

    expect(chain.reads.attemptEventsOf).toHaveBeenCalledTimes(2)
    expect((await record())?.reading).toMatchObject({
      deployment: DEPLOYMENT,
      attempt: { attemptId: 1n, newKey: NEW_KEY }
    })
  })

  it('names no key from an opening whose payload is not the one the attempt committed', async () => {
    const { chain, poll, record } = setUp()
    chain.setState(ACCOUNT, stateWith({ attemptId: 4n, state: 'Waiting', payload: PAYLOAD }))
    chain.setEvents(ACCOUNT, 4n, { started: startedEvent(4n, payloadTo(OLD_KEY)) })

    await poll()

    const attempt = (await record())?.reading?.attempt
    expect(attempt?.newKey).toBeUndefined()
    expect(attempt?.openingGap).toBe('not-found')
  })

  it('keeps the countdown and names no key where the opening read fails or does not decode', async () => {
    const { chain, poll, record } = setUp()
    chain.setState(ACCOUNT, stateWith({ attemptId: 4n, state: 'Waiting', payload: PAYLOAD }))
    chain.setEvents(ACCOUNT, 4n, new Error('logs refused'))

    expect(await poll()).toBe(1)
    expect((await record())?.reading?.attempt).toMatchObject({
      attemptId: 4n,
      openingGap: 'read-failed'
    })
    expect((await record())?.failed).toBeUndefined()

    const undecodable = '0x1234'
    chain.setState(ACCOUNT, stateWith({ attemptId: 5n, state: 'Waiting', payload: undecodable }))
    chain.setEvents(ACCOUNT, 5n, { started: startedEvent(5n, undecodable) })
    await poll()
    const attempt = (await record())?.reading?.attempt
    expect(attempt).toMatchObject({ attemptId: 5n, openingGap: 'undecodable' })
    expect(attempt?.newKey).toBeUndefined()
  })

  it('keeps the last reading, marks it failed and keeps the badge where a read throws', async () => {
    const { chain, poll, record } = setUp()
    chain.setState(ACCOUNT, stateWith({ attemptId: 4n, state: 'Waiting', payload: PAYLOAD }))
    await poll()
    const good = (await record())?.reading

    chain.setState(ACCOUNT, new Error('node down'))
    expect(await poll()).toBe(1)

    const written = await record()
    expect(written?.reading).toEqual(good)
    expect(written?.failed).toEqual({ at: NOW, message: 'node down' })
  })

  it('badges a failed poll of an account with no attempt, never reading it as no attempt', async () => {
    const { chain, poll, record } = setUp()
    chain.setState(ACCOUNT, new Error('node down'))

    expect(await poll()).toBe(1)
    const written = await record()
    expect(written?.reading).toBeUndefined()
    expect(written?.failed?.message).toBe('node down')
  })

  it('stores a failure with no URL from the error and at most 200 characters', async () => {
    const url = 'https://rpc.example/v3/secret-key'
    const withShort = Object.assign(
      new Error(`server response 500 (info={"requestUrl":"${url}","responseStatus":"500"})`),
      { shortMessage: 'server response 500 Internal Server Error' }
    )
    const cases = [
      {
        thrown: providerReadFailure('call', withShort),
        message: 'The provider could not answer call: server response 500 Internal Server Error'
      },
      {
        thrown: providerReadFailure('block', new Error(`request to ${url} failed`)),
        message: 'The provider could not answer block: request to <url> failed'
      },
      {
        thrown: new Error('missing response from wss://rpc.example/ws/secret-key'),
        message: 'missing response from <url>'
      },
      { thrown: new Error('x'.repeat(500)), message: 'x'.repeat(200) }
    ]
    const stored = await Promise.all(
      cases.map(async ({ thrown }) => {
        const { chain, poll, record } = setUp()
        chain.setState(ACCOUNT, thrown)
        const count = await poll()
        return { count, message: (await record())?.failed?.message }
      })
    )

    expect(stored).toEqual(cases.map(({ message }) => ({ count: 1, message })))
    stored.forEach(({ message }) => expect(message).not.toContain('secret-key'))
  })

  it('reads a poll that does not answer within its limit as failed', async () => {
    const { chain, poll, record } = setUp()
    chain.setState(ACCOUNT, stateWith())
    await poll()
    chain.reads.stateOf.mockImplementationOnce(
      () =>
        new Promise(() => {
          // never answers
        })
    )

    expect(await poll(20)).toBe(1)
    const written = await record()
    expect(written?.failed?.message).toMatch(/No answer in 20 ms/)
    expect(written?.reading?.hasSetup).toBe(true)
  })

  it('clears the failure on the next good poll', async () => {
    const { chain, poll, record } = setUp()
    chain.setState(ACCOUNT, new Error('node down'))
    await poll()

    chain.setState(ACCOUNT, stateWith())
    expect(await poll()).toBe(0)
    expect((await record())?.failed).toBeUndefined()
  })

  it('drops an attempt the next poll no longer reads', async () => {
    const { chain, poll, record } = setUp()
    chain.setState(ACCOUNT, stateWith({ attemptId: 4n, state: 'Waiting', payload: PAYLOAD }))
    await poll()

    chain.setState(ACCOUNT, stateWith())
    expect(await poll()).toBe(0)
    const reading = (await record())?.reading
    expect(reading?.attempt).toBeUndefined()
    expect(reading?.ended).toBeUndefined()
  })

  it('reads a cancelled attempt as ended by its road', async () => {
    const { chain, poll, record } = setUp()
    chain.setState(ACCOUNT, stateWith({ attemptId: 4n, state: 'Cancelled', payload: PAYLOAD }))
    chain.setEvents(ACCOUNT, 4n, { cancelled: cancelledEvent(4n, 'cancelByOwner') })

    expect(await poll()).toBe(0)
    const reading = (await record())?.reading
    expect(reading?.attempt).toBeUndefined()
    expect(reading?.ended).toEqual({
      attemptId: 4n,
      road: 'cancelled',
      cancelledBy: 'cancelByOwner',
      at: ENDED_TIME
    })
  })

  it('reads a consumed attempt as executed, naming the controller and when control moved', async () => {
    const { chain, poll, record } = setUp()
    chain.setState(ACCOUNT, stateWith({ attemptId: 4n, state: 'Consumed', payload: PAYLOAD }))
    chain.setEvents(ACCOUNT, 4n, {
      started: startedEvent(4n, PAYLOAD),
      consumed: consumedEvent(4n)
    })

    expect(await poll()).toBe(0)
    expect((await record())?.reading?.ended).toEqual({
      attemptId: 4n,
      road: 'executed',
      controller: NEW_KEY,
      at: ENDED_TIME,
      transactionHash: CONSUME_HASH
    })
  })

  it('reads an ending whose logs did not answer with the road alone, and reads them again', async () => {
    const { chain, poll, record } = setUp()
    chain.setState(ACCOUNT, stateWith({ attemptId: 4n, state: 'Consumed', payload: PAYLOAD }))
    chain.setEvents(ACCOUNT, 4n, new Error('logs refused'))
    await poll()
    expect((await record())?.reading?.ended).toEqual({ attemptId: 4n, road: 'executed' })

    chain.setEvents(ACCOUNT, 4n, {
      started: startedEvent(4n, PAYLOAD),
      consumed: consumedEvent(4n)
    })
    await poll()
    expect((await record())?.reading?.ended).toMatchObject({ controller: NEW_KEY, at: ENDED_TIME })
  })

  it('reads a wait that ended with nobody executing as execution due', async () => {
    const { chain, poll, record } = setUp()
    chain.setState(
      ACCOUNT,
      stateWith({ attemptId: 4n, state: 'Waiting', payload: PAYLOAD, consumableAfter: HEAD_TIME })
    )

    expect(await poll()).toBe(1)
    expect((await record())?.reading?.attempt?.executionDue).toBe(true)
  })

  it('reads a setup the account no longer authorizes as dormant', async () => {
    const { chain, poll, record } = setUp()
    chain.setState(ACCOUNT, stateWith({ attemptId: 4n, state: 'Waiting', payload: PAYLOAD }))
    chain.unauthorize(ACCOUNT)

    await poll()
    const reading = (await record())?.reading
    expect(reading?.dormant).toBe(true)
    expect(reading?.attempt?.attemptId).toBe(4n)
  })

  it('reads an account with no code as holding no setup, without asking the registry', async () => {
    const chain = scriptedChain()
    const storage = memoryStorage()
    await pollAccounts({
      reads: chain.reads,
      deployment: DEPLOYMENT,
      accounts: [ACCOUNT],
      chainId: SEPOLIA,
      storage,
      now: () => NOW,
      limitMs: 1_000,
      scanLimitMs: 1_000
    })

    expect(chain.reads.stateOf).not.toHaveBeenCalled()
    expect((await readWatcherRecord(storage, SEPOLIA, ACCOUNT))?.reading).toMatchObject({
      hasSetup: false,
      dormant: false
    })
  })

  it('counts attempt 1 of this deployment on the badge though attempt 1 of a retired one was dismissed', async () => {
    const { chain, storage, poll, record } = setUp()
    chain.setState(ACCOUNT, stateWith({ attemptId: 1n, state: 'Waiting', payload: PAYLOAD }))
    await pollAccounts({
      reads: chain.reads,
      deployment: RETIRED_DEPLOYMENT,
      accounts: [ACCOUNT],
      chainId: SEPOLIA,
      storage,
      now: () => NOW,
      polledAt: NOW,
      limitMs: 1_000,
      scanLimitMs: 1_000
    })
    await dismissAttempt(SEPOLIA, ACCOUNT, 1n, storage)

    expect(await poll()).toBe(1)
    expect((await record())?.dismissed).toEqual([])
  })

  it('stops counting a dismissed attempt on the badge, and counts the next attempt', async () => {
    const { chain, storage, poll, record } = setUp()
    chain.setState(ACCOUNT, stateWith({ attemptId: 4n, state: 'Waiting', payload: PAYLOAD }))
    expect(await poll()).toBe(1)

    await dismissAttempt(SEPOLIA, ACCOUNT, 4n, storage)
    expect(await poll()).toBe(0)
    expect((await record())?.reading?.attempt?.attemptId).toBe(4n)
    expect((await record())?.dismissed).toEqual([4n])

    chain.setState(ACCOUNT, stateWith({ attemptId: 5n, state: 'Waiting', payload: PAYLOAD }))
    expect(await poll()).toBe(1)
  })

  it('writes one record per watched account', async () => {
    const { chain, poll, record } = setUp([ACCOUNT, OTHER_ACCOUNT])
    chain.setState(ACCOUNT, stateWith({ attemptId: 4n, state: 'Waiting', payload: PAYLOAD }))
    chain.setState(OTHER_ACCOUNT, stateWith())

    expect(await poll()).toBe(1)
    expect((await record(ACCOUNT))?.reading?.attempt?.attemptId).toBe(4n)
    expect((await record(OTHER_ACCOUNT))?.reading?.account).toBe(OTHER_ACCOUNT)
    expect((await record(OTHER_ACCOUNT))?.reading?.attempt).toBeUndefined()
  })

  it('scans for a missing opening once from the setup block, then from a margin below the last scan', async () => {
    const { chain, poll, record } = setUp()
    chain.setState(ACCOUNT, stateWith({ attemptId: 4n, state: 'Waiting', payload: PAYLOAD }))

    await poll()
    expect((await record())?.reading?.attempt).toMatchObject({
      openingGap: 'not-found',
      scannedTo: HEAD
    })

    chain.head.number = HEAD + 5
    chain.setEvents(ACCOUNT, 4n, { started: startedEvent(4n, PAYLOAD) })
    await poll()
    expect(scansOf(chain)).toEqual([
      { from: COMMITTED_AT, to: HEAD, until: 'opening' },
      { from: HEAD - 64, to: HEAD + 5, until: 'opening' }
    ])
    const attempt = (await record())?.reading?.attempt
    expect(attempt?.newKey).toBe(NEW_KEY)
    expect(attempt?.scannedTo).toBeUndefined()
  })

  it('keeps the state reading where the log scan does not answer within its own limit', async () => {
    const { chain, poll, record } = setUp()
    chain.setState(ACCOUNT, stateWith({ attemptId: 4n, state: 'Waiting', payload: PAYLOAD }))
    chain.reads.attemptEventsOf.mockImplementationOnce(
      () =>
        new Promise(() => {
          // never answers
        })
    )

    expect(await poll(1_000, 20)).toBe(1)
    const written = await record()
    expect(written?.failed).toBeUndefined()
    expect(written?.reading?.attempt).toMatchObject({ attemptId: 4n, openingGap: 'read-failed' })
  })

  it('names the controller an earlier reading decoded and scans for the consume log alone', async () => {
    const { chain, poll, record } = setUp()
    chain.setState(ACCOUNT, stateWith({ attemptId: 4n, state: 'Waiting', payload: PAYLOAD }))
    chain.setEvents(ACCOUNT, 4n, { started: startedEvent(4n, PAYLOAD) })
    await poll()

    chain.setState(ACCOUNT, stateWith({ attemptId: 4n, state: 'Consumed', payload: PAYLOAD }))
    chain.setEvents(ACCOUNT, 4n, { consumed: consumedEvent(4n) })
    await poll()

    expect(chain.reads.attemptEventsOf).toHaveBeenLastCalledWith(ACCOUNT, 4n, {
      from: COMMITTED_AT,
      to: HEAD,
      until: 'ending'
    })
    expect((await record())?.reading?.ended).toEqual({
      attemptId: 4n,
      road: 'executed',
      controller: NEW_KEY,
      at: ENDED_TIME,
      transactionHash: CONSUME_HASH
    })
  })

  it('reads a cancel log a later poll finds after a first scan found none', async () => {
    const { chain, poll, record } = setUp()
    chain.setState(ACCOUNT, stateWith({ attemptId: 4n, state: 'Cancelled', payload: PAYLOAD }))

    await poll()
    expect((await record())?.reading?.ended).toEqual({
      attemptId: 4n,
      road: 'cancelled',
      notFoundAt: HEAD
    })

    chain.head.number = HEAD + 3
    chain.setEvents(ACCOUNT, 4n, { cancelled: cancelledEvent(4n, 'cancelByOwner') })
    await poll()
    expect(scansOf(chain)[1]).toEqual({ from: HEAD - 64, to: HEAD + 3, until: 'ending' })
    expect((await record())?.reading?.ended).toEqual({
      attemptId: 4n,
      road: 'cancelled',
      cancelledBy: 'cancelByOwner',
      at: ENDED_TIME
    })
  })

  it('settles an ending whose log is still missing a margin of blocks past the first scan, and reads it no more', async () => {
    const { chain, poll, record } = setUp()
    chain.setState(ACCOUNT, stateWith({ attemptId: 4n, state: 'Cancelled', payload: PAYLOAD }))
    await poll()

    chain.head.number = HEAD + 63
    await poll()
    expect((await record())?.reading?.ended).toEqual({
      attemptId: 4n,
      road: 'cancelled',
      notFoundAt: HEAD
    })

    chain.head.number = HEAD + 64
    await poll()
    expect((await record())?.reading?.ended).toEqual({
      attemptId: 4n,
      road: 'cancelled',
      endingGap: 'not-found'
    })

    chain.setEvents(ACCOUNT, 4n, { cancelled: cancelledEvent(4n, 'cancelByOwner') })
    chain.head.number = HEAD + 65
    await poll()
    expect(chain.reads.attemptEventsOf).toHaveBeenCalledTimes(3)
    expect((await record())?.reading?.ended).toMatchObject({ endingGap: 'not-found' })
  })

  it('keeps the consume time it read while it looks again for a missing opening', async () => {
    const { chain, poll, record } = setUp()
    chain.setState(ACCOUNT, stateWith({ attemptId: 4n, state: 'Consumed', payload: PAYLOAD }))
    chain.setEvents(ACCOUNT, 4n, { consumed: consumedEvent(4n) })
    await poll()
    expect((await record())?.reading?.ended).toEqual({
      attemptId: 4n,
      road: 'executed',
      at: ENDED_TIME,
      transactionHash: CONSUME_HASH,
      notFoundAt: HEAD
    })

    chain.head.number = HEAD + 1
    chain.setEvents(ACCOUNT, 4n, { started: startedEvent(4n, PAYLOAD) })
    await poll()
    expect((await record())?.reading?.ended).toEqual({
      attemptId: 4n,
      road: 'executed',
      controller: NEW_KEY,
      at: ENDED_TIME,
      transactionHash: CONSUME_HASH
    })
  })

  it('reads an opening a later scan finds below the last scanned block', async () => {
    const { chain, poll, record } = setUp()
    chain.setState(ACCOUNT, stateWith({ attemptId: 4n, state: 'Waiting', payload: PAYLOAD }))
    await poll()
    expect((await record())?.reading?.attempt?.scannedTo).toBe(HEAD)

    chain.placeEvents(ACCOUNT, 4n, { started: atBlock(startedEvent(4n, PAYLOAD), HEAD - 10) })
    chain.head.number = HEAD + 5
    await poll()

    const attempt = (await record())?.reading?.attempt
    expect(attempt).toMatchObject({ newKey: NEW_KEY, removedKey: OLD_KEY })
    expect(attempt?.openingGap).toBeUndefined()
  })

  it('keeps the chunks a scan read before its limit, and scans the rest on the next poll', async () => {
    const { chain, poll, record } = setUp()
    chain.setState(ACCOUNT, stateWith({ attemptId: 4n, state: 'Waiting', payload: PAYLOAD }))
    let cut: AttemptScan | undefined
    chain.reads.attemptEventsOf.mockImplementationOnce((_account, _id, scan) => {
      cut = scan
      scan.onChunk?.(HEAD - 999)
      return new Promise(() => {
        // the next chunk never answers
      })
    })

    await poll(1_000, 20)
    expect((await record())?.reading?.attempt).toMatchObject({
      openingGap: 'read-failed',
      scannedTo: HEAD,
      scannedFrom: HEAD - 999
    })
    expect(cut?.stop?.()).toBe(true)

    chain.head.number = HEAD + 5
    await poll()
    expect(scansOf(chain).slice(1)).toEqual([
      { from: HEAD - 64, to: HEAD + 5, until: 'opening' },
      { from: COMMITTED_AT, to: HEAD - 1_000, until: 'opening' }
    ])
    const attempt = (await record())?.reading?.attempt
    expect(attempt).toMatchObject({ openingGap: 'not-found', scannedTo: HEAD + 5 })
    expect(attempt?.scannedFrom).toBeUndefined()
  })

  it('writes a reading of a block below the stored one as a failed poll, keeping the last reading and the badge', async () => {
    const { chain, poll, record } = setUp()
    chain.setState(ACCOUNT, stateWith({ attemptId: 4n, state: 'Waiting', payload: PAYLOAD }))
    chain.head.number = HEAD + 10
    await poll()
    const good = (await record())?.reading

    chain.head.number = HEAD
    chain.setState(ACCOUNT, stateWith())
    expect(await poll()).toBe(1)
    const written = await record()
    expect(written?.reading).toEqual(good)
    expect(written?.failed?.message).toMatch(/older block than the last reading/)

    chain.setState(ACCOUNT, new Error('node down'))
    await poll()
    expect((await record())?.failed?.message).toBe('node down')
    expect((await record())?.reading).toEqual(good)
  })

  it('drops the reading and the failure of a poll that started before the stored one', async () => {
    const { chain, poll, record } = setUp()
    chain.setState(ACCOUNT, stateWith({ attemptId: 4n, state: 'Waiting', payload: PAYLOAD }))
    await poll(1_000, 1_000, NOW + 60_000)
    const good = await record()

    chain.head.number = HEAD + 10
    chain.setState(ACCOUNT, stateWith())
    expect(await poll()).toBe(1)
    expect(await record()).toEqual(good)

    chain.setState(ACCOUNT, new Error('node down'))
    await poll()
    expect(await record()).toEqual(good)

    await poll(1_000, 1_000, NOW + 120_000)
    expect((await record())?.failed?.message).toBe('node down')
  })

  const timeCuts: { name: string; cut: (chain: ReturnType<typeof scriptedChain>) => void }[] = [
    {
      name: 'its time read threw',
      cut: (chain) => chain.reads.blockTime.mockRejectedValueOnce(new Error('block refused'))
    },
    {
      name: 'its time read did not answer within the limit',
      cut: (chain) =>
        chain.reads.blockTime.mockImplementationOnce(
          () =>
            new Promise(() => {
              // never answers
            })
        )
    }
  ]
  timeCuts.forEach(({ name, cut }) => {
    it(`reads an opening found on the poll before in its block alone, where ${name}`, async () => {
      const { chain, poll, record } = setUp()
      chain.setState(ACCOUNT, stateWith({ attemptId: 4n, state: 'Waiting', payload: PAYLOAD }))
      chain.placeEvents(ACCOUNT, 4n, { started: startedEvent(4n, PAYLOAD) })
      cut(chain)

      await poll(1_000, 20)
      const first = (await record())?.reading?.attempt
      expect(first).toMatchObject({ openingGap: 'read-failed', openingBlock: OPENED_BLOCK })
      expect(first?.scannedTo).toBeUndefined()

      chain.head.number = HEAD + 5
      await poll()
      expect(scansOf(chain).slice(1)).toEqual([
        { from: OPENED_BLOCK, to: OPENED_BLOCK, until: 'opening' }
      ])
      const second = (await record())?.reading?.attempt
      expect(second).toMatchObject({ newKey: NEW_KEY, openedAt: OPENED_TIME })
      expect(second?.openingBlock).toBeUndefined()
    })
  })

  it("names the manager's revert in the failure of the poll", async () => {
    const descriptor = deploymentDescriptor('sepolia')
    const node = new ScriptedNode({ descriptor, account: KIT_ACCOUNT })
    node.failRead('stateOf', {
      kind: 'revert',
      data: encodeErrorResult({
        abi: ERRORS_MANAGER_ABI,
        errorName: 'PolicyManager_WrongSetupNonce',
        args: [2n, 3n]
      })
    })
    const storage = memoryStorage()

    await pollAccounts({
      reads: createWatcherReads({ provider: node, descriptor }),
      deployment: DEPLOYMENT,
      accounts: [KIT_ACCOUNT],
      chainId: SEPOLIA,
      storage,
      now: () => NOW,
      limitMs: 1_000,
      scanLimitMs: 1_000
    })

    expect((await readWatcherRecord(storage, SEPOLIA, KIT_ACCOUNT))?.failed?.message).toMatch(
      /WrongSetupNonce/
    )
  })

  it('keeps a failure that carries no block beside a newer reading', async () => {
    const { chain, storage, poll, record } = setUp()
    chain.setState(ACCOUNT, stateWith())
    chain.head.number = HEAD + 10
    await poll()

    chain.reads.latestBlock.mockRejectedValueOnce(new Error('node down'))
    await poll()
    expect((await record())?.failed?.message).toBe('node down')

    await updateWatcherRecord(storage, SEPOLIA, ACCOUNT, (current) => ({
      ...current,
      failed: { at: NOW, message: 'accounts unavailable' },
      dismissed: current?.dismissed ?? []
    }))
    expect((await record())?.failed?.message).toBe('accounts unavailable')
    expect((await record())?.reading?.block.number).toBe(HEAD + 10)
  })

  it('settles an executed ending whose opening does not decode', async () => {
    const { chain, poll, record } = setUp()
    const undecodable = '0x1234'
    chain.setState(ACCOUNT, stateWith({ attemptId: 4n, state: 'Consumed', payload: undecodable }))
    chain.setEvents(ACCOUNT, 4n, {
      started: startedEvent(4n, undecodable),
      consumed: consumedEvent(4n)
    })

    await poll()
    await poll()

    expect(chain.reads.attemptEventsOf).toHaveBeenCalledTimes(1)
    expect((await record())?.reading?.ended).toEqual({
      attemptId: 4n,
      road: 'executed',
      at: ENDED_TIME,
      transactionHash: CONSUME_HASH,
      endingGap: 'undecodable'
    })
  })

  it('reads another attempt a reorganization brought, never with the key of the one it replaced', async () => {
    const { chain, poll, record } = setUp()
    chain.setState(ACCOUNT, stateWith({ attemptId: 4n, state: 'Waiting', payload: PAYLOAD }))
    chain.setEvents(ACCOUNT, 4n, { started: startedEvent(4n, PAYLOAD) })
    await poll()
    expect((await record())?.reading?.attempt?.newKey).toBe(NEW_KEY)

    const other = payloadTo(OLD_KEY)
    chain.setState(ACCOUNT, stateWith({ attemptId: 5n, state: 'Waiting', payload: other }))
    await poll()

    const attempt = (await record())?.reading?.attempt
    expect(attempt).toMatchObject({ attemptId: 5n, openingGap: 'not-found' })
    expect(attempt?.newKey).toBeUndefined()
    expect(chain.reads.attemptEventsOf).toHaveBeenLastCalledWith(
      ACCOUNT,
      5n,
      expect.objectContaining({ from: COMMITTED_AT, to: HEAD, until: 'opening' })
    )
  })

  it('keeps a dismissal written while a poll runs, both writes through the record queue', async () => {
    const { chain, storage, poll, record } = setUp()
    chain.setState(ACCOUNT, stateWith({ attemptId: 4n, state: 'Waiting', payload: PAYLOAD }))
    await poll()
    const { get } = storage
    // Each read answers late, so two writes that did not queue would each write back what they read.
    storage.get = (async (key: string) => {
      const held = await get(key)
      await new Promise((resolve) => {
        setTimeout(resolve, 5)
      })
      return held
    }) as typeof storage.get

    await Promise.all([poll(), dismissAttempt(SEPOLIA, ACCOUNT, 4n, storage)])

    const written = await record()
    expect(written?.dismissed).toEqual([4n])
    expect(written?.reading?.attempt?.attemptId).toBe(4n)
  })
})
