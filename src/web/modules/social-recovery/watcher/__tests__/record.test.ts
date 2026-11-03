import type { WatcherRecord } from '@web/modules/social-recovery/watcher'
import {
  dismissAttempt,
  readWatcherRecord,
  storedWatcherRecordOf,
  TICK_LIMIT_MS,
  updateWatcherRecord,
  watcherKeyOf,
  watcherRecordFrom
} from '@web/modules/social-recovery/watcher'
import {
  ACCOUNT,
  DEPLOYMENT,
  HEAD,
  HEAD_TIME,
  memoryStorage,
  NEW_KEY,
  SEPOLIA
} from '@web/modules/social-recovery/watcher/__fixtures__/harness'

const RECORD: WatcherRecord = {
  reading: {
    account: ACCOUNT,
    block: { number: HEAD, timestamp: HEAD_TIME },
    hasSetup: true,
    dormant: true,
    attempt: {
      attemptId: 12345678901234567890n,
      setupNonce: 3n,
      payloadHash: `0x${'11'.repeat(32)}`,
      consumableAfter: HEAD_TIME + 3600,
      executionDue: false,
      openingGap: 'not-found',
      scannedTo: HEAD
    },
    ended: { attemptId: 2n, road: 'executed', controller: NEW_KEY, endingGap: 'not-found' }
  },
  failed: { at: 5, message: 'node down' },
  dismissed: [2n]
}

describe('the watcher record', () => {
  it('lives under the account in lowercase on its chain', () => {
    expect(watcherKeyOf(SEPOLIA, ACCOUNT)).toBe(
      `socialRecovery:watcher:11155111:${ACCOUNT.toLowerCase()}`
    )
  })

  it("reads back the consume's transaction of an executed ending, reads an ending stored without one, and refuses one that is not a hash", async () => {
    const storage = memoryStorage()
    const hash = `0x${'2a'.repeat(32)}` as const
    const executed = {
      attemptId: 2n,
      road: 'executed' as const,
      controller: NEW_KEY,
      at: HEAD_TIME
    }
    const withEnding = (ended: unknown): WatcherRecord =>
      ({ ...RECORD, reading: RECORD.reading && { ...RECORD.reading, ended } } as WatcherRecord)

    await updateWatcherRecord(storage, SEPOLIA, ACCOUNT, () =>
      withEnding({ ...executed, transactionHash: hash })
    )
    expect((await readWatcherRecord(storage, SEPOLIA, ACCOUNT))?.reading?.ended).toEqual({
      ...executed,
      transactionHash: hash
    })

    await updateWatcherRecord(storage, SEPOLIA, ACCOUNT, () => withEnding(executed))
    const earlier = (await readWatcherRecord(storage, SEPOLIA, ACCOUNT))?.reading?.ended
    expect(earlier).toEqual(executed)
    expect(earlier && 'transactionHash' in earlier).toBe(false)

    const stored = storedWatcherRecordOf(withEnding({ ...executed, transactionHash: hash }))
    const garbled = {
      ...stored,
      reading: stored.reading && {
        ...stored.reading,
        ended: { ...stored.reading.ended, transactionHash: 'not a hash' }
      }
    }
    expect(watcherRecordFrom({ savedAt: 1, value: stored })).toBeDefined()
    expect(watcherRecordFrom({ savedAt: 1, value: garbled })).toBeUndefined()
  })

  it('reads back the deployment a reading was read from, and reads a reading that names none', async () => {
    const storage = memoryStorage()
    const reading = RECORD.reading && { ...RECORD.reading, deployment: DEPLOYMENT }
    await updateWatcherRecord(storage, SEPOLIA, ACCOUNT, () => ({ ...RECORD, reading }))
    expect((await readWatcherRecord(storage, SEPOLIA, ACCOUNT))?.reading?.deployment).toEqual(
      DEPLOYMENT
    )

    await updateWatcherRecord(storage, SEPOLIA, ACCOUNT, () => RECORD)
    const earlier = await readWatcherRecord(storage, SEPOLIA, ACCOUNT)
    expect(earlier?.reading?.attempt?.setupNonce).toBe(3n)
    expect(earlier?.reading?.deployment).toBeUndefined()
  })

  it('reads a reading whose deployment is not two addresses as no record', () => {
    const stored = storedWatcherRecordOf(RECORD)
    const malformed = [{ manager: DEPLOYMENT.manager }, { manager: 'nope', action: 'nope' }, 'x']
    malformed.forEach((deployment) => {
      const value = { ...stored, reading: { ...stored.reading, deployment } }
      expect(watcherRecordFrom({ value, savedAt: 1 })).toBeUndefined()
    })
  })

  it('reads back what it wrote, every bigint whole', async () => {
    const storage = memoryStorage()
    await updateWatcherRecord(storage, SEPOLIA, ACCOUNT, () => RECORD, { now: () => 9 })

    expect(await readWatcherRecord(storage, SEPOLIA, ACCOUNT)).toEqual(RECORD)
    expect(JSON.parse(storage.entries.get(watcherKeyOf(SEPOLIA, ACCOUNT)) ?? '')).toMatchObject({
      savedAt: 9,
      value: { dismissed: ['2'] }
    })
  })

  it('reads a stored value that is not a watcher record as none', () => {
    const stored = { value: storedWatcherRecordOf(RECORD), savedAt: 1 }
    const malformed = [
      undefined,
      false,
      { value: stored.value },
      { ...stored, value: { ...stored.value, dismissed: [2] } },
      { ...stored, value: { ...stored.value, failed: { at: 'now' } } },
      {
        ...stored,
        value: {
          ...stored.value,
          reading: { ...stored.value.reading, attempt: { attemptId: '1' } }
        }
      },
      {
        ...stored,
        value: { ...stored.value, reading: { ...stored.value.reading, ended: { road: 'lost' } } }
      },
      {
        ...stored,
        value: {
          ...stored.value,
          reading: {
            ...stored.value.reading,
            ended: { attemptId: '2', road: 'cancelled', endingGap: 'lost' }
          }
        }
      },
      {
        ...stored,
        value: {
          ...stored.value,
          reading: {
            ...stored.value.reading,
            attempt: { ...stored.value.reading?.attempt, scannedTo: -1 }
          }
        }
      }
    ]
    malformed.forEach((value) => expect(watcherRecordFrom(value)).toBeUndefined())
    expect(watcherRecordFrom(stored)).toEqual(RECORD)
  })

  it('drops a write from a poll one tick older, and writes one from a clock set back', async () => {
    const storage = memoryStorage()
    const stamped = 10 * TICK_LIMIT_MS
    await updateWatcherRecord(storage, SEPOLIA, ACCOUNT, () => RECORD, { polledAt: stamped })

    const older = await updateWatcherRecord(storage, SEPOLIA, ACCOUNT, () => ({ dismissed: [] }), {
      polledAt: stamped - TICK_LIMIT_MS
    })
    expect(older).toEqual({ ...RECORD, polledAt: stamped })
    expect(await readWatcherRecord(storage, SEPOLIA, ACCOUNT)).toEqual({
      ...RECORD,
      polledAt: stamped
    })

    const setBack = stamped - 5 * TICK_LIMIT_MS
    await updateWatcherRecord(storage, SEPOLIA, ACCOUNT, () => ({ dismissed: [] }), {
      polledAt: setBack
    })
    expect(await readWatcherRecord(storage, SEPOLIA, ACCOUNT)).toEqual({
      dismissed: [],
      polledAt: setBack
    })
  })

  it('dismisses an attempt once, keeping the reading', async () => {
    const storage = memoryStorage()
    await updateWatcherRecord(storage, SEPOLIA, ACCOUNT, () => RECORD)

    await dismissAttempt(SEPOLIA, ACCOUNT, 7n, storage)
    await dismissAttempt(SEPOLIA, ACCOUNT, 7n, storage)

    const read = await readWatcherRecord(storage, SEPOLIA, ACCOUNT)
    expect(read?.dismissed).toEqual([2n, 7n])
    expect(read?.reading).toEqual(RECORD.reading)
  })

  it('dismisses an attempt of an account with no record yet', async () => {
    const storage = memoryStorage()
    await dismissAttempt(SEPOLIA, ACCOUNT, 7n, storage)

    expect(await readWatcherRecord(storage, SEPOLIA, ACCOUNT)).toEqual({ dismissed: [7n] })
  })
})
