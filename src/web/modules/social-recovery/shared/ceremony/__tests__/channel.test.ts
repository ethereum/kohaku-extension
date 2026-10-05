/**
 * A report of a passed claim carries approval material that must not outlive
 * its use, so a report expires ten minutes after `reportedAt`, is delivered
 * only for the id, call and method the caller expects, and leaves storage once
 * taken or heard.
 */
import { ceremony } from './harness'

const T0 = 1_790_000_000_000

/** A storage double over a Map; every member is a spy. */
const mapStore = (entries: [string, unknown][] = []) => {
  const map = new Map<string, unknown>(entries)
  return {
    map,
    get: jest.fn(async (key: string, fallback?: unknown) =>
      map.has(key) ? map.get(key) : fallback
    ),
    set: jest.fn(async (key: string, value: unknown) => {
      map.set(key, value)
      return null
    }),
    remove: jest.fn(async (key: string) => {
      map.delete(key)
      return null
    })
  }
}

/** A subscription double: `emit` plays a storage change for one key. */
const subscriptions = () => {
  const listeners = new Map<string, Set<(value: unknown) => void>>()
  const subscribe = jest.fn((key: string, onValue: (value: unknown) => void) => {
    const set = listeners.get(key) ?? new Set()
    set.add(onValue)
    listeners.set(key, set)
    return () => set.delete(onValue)
  })
  const emit = (key: string, value: unknown) => listeners.get(key)?.forEach((l) => l(value))
  return { subscribe, emit }
}

const EXPECTED = { id: 'req-1', call: 'createClaim', method: 'passkey' } as const

type Identity = Parameters<ReturnType<typeof ceremony>['ceremonyReport']>[0]

const reportAt = (reportedAt: number, identity: Partial<Identity> = {}) => {
  const { ceremonyReport, passed } = ceremony()
  return ceremonyReport(
    { ...EXPECTED, ...identity },
    passed({ reply: { proof: '0x01' } }),
    reportedAt
  )
}

const key = (id: string = EXPECTED.id) => ceremony().ceremonyResultKey(id)

describe('a report the tab writes', () => {
  it('expires ten minutes after it was reported', () => {
    expect(reportAt(T0).expiresAt).toBe(T0 + 10 * 60 * 1000)
  })

  it('lives under the key of its request id', () => {
    expect(key('req-1')).toBe('socialRecoveryCeremonyResult:req-1')
  })
})

describe('takeCeremonyReport', () => {
  it('delivers the expected report within its expiry and removes it', async () => {
    const store = mapStore([[key(), reportAt(T0)]])
    const report = await ceremony().takeCeremonyReport(EXPECTED, store, T0 + 60_000)
    expect(report).toMatchObject({ ...EXPECTED, reportedAt: T0 })
    expect(store.remove).toHaveBeenCalledWith(key())
    expect(store.map.has(key())).toBe(false)
  })

  it('delivers it once: a second take reads null', async () => {
    const store = mapStore([[key(), reportAt(T0)]])
    await ceremony().takeCeremonyReport(EXPECTED, store, T0 + 1)
    expect(await ceremony().takeCeremonyReport(EXPECTED, store, T0 + 2)).toBeNull()
  })

  it('hands back the very object the store returns', async () => {
    const stored = reportAt(T0)
    const store = mapStore([[key(), stored]])
    expect(await ceremony().takeCeremonyReport(EXPECTED, store, T0 + 1)).toBe(stored)
  })

  it('reads no report from unparsed text, since the store parses what it returns', async () => {
    const store = mapStore([[key(), JSON.stringify(reportAt(T0))]])
    expect(await ceremony().takeCeremonyReport(EXPECTED, store, T0 + 1)).toBeNull()
  })

  it('reads null at its expiry and removes it', async () => {
    const store = mapStore([[key(), reportAt(T0)]])
    const report = await ceremony().takeCeremonyReport(EXPECTED, store, T0 + 10 * 60 * 1000)
    expect(report).toBeNull()
    expect(store.map.has(key())).toBe(false)
  })

  it('delivers it one millisecond before its expiry', async () => {
    const store = mapStore([[key(), reportAt(T0)]])
    expect(
      await ceremony().takeCeremonyReport(EXPECTED, store, T0 + 10 * 60 * 1000 - 1)
    ).not.toBeNull()
  })

  it('reads null for a report stamped in the future past a minute of skew', async () => {
    const store = mapStore([[key(), reportAt(T0 + 2 * 60 * 1000)]])
    expect(await ceremony().takeCeremonyReport(EXPECTED, store, T0)).toBeNull()
  })

  it('reads null and removes a malformed value', async () => {
    const store = mapStore([[key(), { id: 'req-1', outcome: 'passed' }]])
    expect(await ceremony().takeCeremonyReport(EXPECTED, store, T0)).toBeNull()
    expect(store.map.has(key())).toBe(false)
  })

  const OTHERS: [string, Partial<Identity>][] = [
    ['another call', { call: 'testAccess' }],
    ['another method', { method: 'zkpassport' }],
    ['another id', { id: 'req-2' }]
  ]
  OTHERS.forEach(([title, identity]) =>
    it(`reads null and leaves a report for ${title} in place`, async () => {
      const stored = reportAt(T0, identity)
      const store = mapStore([[key(), stored]])
      expect(await ceremony().takeCeremonyReport(EXPECTED, store, T0 + 1)).toBeNull()
      expect(store.map.get(key())).toBe(stored)
    })
  )

  it('reads null where nothing was written', async () => {
    const store = mapStore()
    expect(await ceremony().takeCeremonyReport(EXPECTED, store, T0)).toBeNull()
    expect(store.remove).not.toHaveBeenCalled()
  })
})

describe('readCeremonyReport', () => {
  it('reads the expected report and removes nothing', async () => {
    const store = mapStore([[key(), reportAt(T0)]])
    expect(await ceremony().readCeremonyReport(EXPECTED, store, T0 + 1)).toMatchObject(EXPECTED)
    expect(store.remove).not.toHaveBeenCalled()
  })

  it('hands back the very object the store returns', async () => {
    const stored = reportAt(T0)
    const store = mapStore([[key(), stored]])
    expect(await ceremony().readCeremonyReport(EXPECTED, store, T0 + 1)).toBe(stored)
  })

  it('reads null for a report the store returns as unparsed text', async () => {
    const store = mapStore([[key(), JSON.stringify(reportAt(T0))]])
    expect(await ceremony().readCeremonyReport(EXPECTED, store, T0 + 1)).toBeNull()
    expect(store.remove).not.toHaveBeenCalled()
  })

  it('reads null past the expiry or for another call', async () => {
    const store = mapStore([[key(), reportAt(T0)]])
    expect(await ceremony().readCeremonyReport(EXPECTED, store, T0 + 10 * 60 * 1000)).toBeNull()
    expect(
      await ceremony().readCeremonyReport({ ...EXPECTED, call: 'enroll' }, store, T0 + 1)
    ).toBeNull()
  })
})

describe('listenForCeremonyReport', () => {
  it('delivers the expected report once it is written, then removes it', async () => {
    const store = mapStore()
    const { subscribe, emit } = subscriptions()
    const onReport = jest.fn()
    ceremony().listenForCeremonyReport(EXPECTED, subscribe, store, onReport, () => T0 + 1)
    const report = reportAt(T0)
    store.map.set(key(), report)
    emit(key(), report)
    await Promise.resolve()
    expect(onReport).toHaveBeenCalledTimes(1)
    expect(onReport).toHaveBeenCalledWith(report)
    expect(store.remove).toHaveBeenCalledWith(key())
    expect(store.map.has(key())).toBe(false)
  })

  it('listens on the key of the expected id alone', () => {
    const { subscribe } = subscriptions()
    ceremony().listenForCeremonyReport(EXPECTED, subscribe, mapStore(), jest.fn())
    expect(subscribe).toHaveBeenCalledTimes(1)
    expect(subscribe.mock.calls[0][0]).toBe(key())
  })

  const UNDELIVERED: [string, () => unknown][] = [
    ['another call', () => reportAt(T0, { call: 'testAccess' })],
    ['another method', () => reportAt(T0, { method: 'aadhaar' })],
    ['another id', () => reportAt(T0, { id: 'req-9' })],
    ['a report past its expiry', () => reportAt(T0 - 10 * 60 * 1000)],
    ['a malformed value', () => ({ id: 'req-1' })]
  ]
  UNDELIVERED.forEach(([title, make]) =>
    it(`delivers nothing and removes nothing for ${title}`, async () => {
      const value = make()
      const store = mapStore([[key(), value]])
      const { subscribe, emit } = subscriptions()
      const onReport = jest.fn()
      ceremony().listenForCeremonyReport(EXPECTED, subscribe, store, onReport, () => T0 + 1)
      emit(key(), value)
      await Promise.resolve()
      expect(onReport).not.toHaveBeenCalled()
      expect(store.remove).not.toHaveBeenCalled()
    })
  )

  it('delivers nothing for unparsed text, since the subscription parses what it hands over', async () => {
    const store = mapStore()
    const { subscribe, emit } = subscriptions()
    const onReport = jest.fn()
    ceremony().listenForCeremonyReport(EXPECTED, subscribe, store, onReport, () => T0 + 1)
    emit(key(), JSON.stringify(reportAt(T0)))
    expect(onReport).not.toHaveBeenCalled()
  })

  it('stops listening once unsubscribed', () => {
    const { subscribe, emit } = subscriptions()
    const onReport = jest.fn()
    const unsubscribe = ceremony().listenForCeremonyReport(
      EXPECTED,
      subscribe,
      mapStore(),
      onReport,
      () => T0 + 1
    )
    unsubscribe()
    emit(key(), reportAt(T0))
    expect(onReport).not.toHaveBeenCalled()
  })
})

describe('sweepCeremonyReports', () => {
  it('removes expired and malformed reports and leaves fresh ones and other keys', async () => {
    const fresh = reportAt(T0)
    const store = mapStore([
      [key('fresh'), { ...fresh, id: 'fresh' }],
      [key('old'), { ...reportAt(T0 - 11 * 60 * 1000), id: 'old' }],
      [key('broken'), 'not a report'],
      ['someOtherKey', { id: 'x' }]
    ])
    const removed = await ceremony().sweepCeremonyReports(store, [...store.map.keys()], T0 + 1)
    expect(removed).toBe(2)
    expect([...store.map.keys()].sort()).toEqual([key('fresh'), 'someOtherKey'].sort())
  })

  it('removes a fresh report the store returns as unparsed text, as no report', async () => {
    const store = mapStore([[key(), JSON.stringify(reportAt(T0))]])
    expect(await ceremony().sweepCeremonyReports(store, [key()], T0 + 1)).toBe(1)
    expect(store.map.has(key())).toBe(false)
  })
})
