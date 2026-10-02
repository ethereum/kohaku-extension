/**
 * @jest-environment jsdom
 */
/**
 * The tab's browser defaults carry a report from the tab to its caller. The
 * store's own `get` parses the richJson text it holds, and the subscription
 * parses a changed value the same way before the channel reads it: a bigint
 * comes back as a bigint, a value that is not text passes as it came, and
 * text that is not JSON reaches no caller.
 */
import {
  browserDefaults,
  ceremony,
  ChangeListener
} from '@web/modules/social-recovery/shared/ceremony/__tests__/harness'

const T0 = 1_790_000_000_000

const EXPECTED = { id: 'req-1', call: 'createClaim', method: 'passkey' } as const

const key = () => ceremony().ceremonyResultKey(EXPECTED.id)

const reportAt = (reportedAt: number, value: unknown = { reply: { proof: '0x01' } }) => {
  const { ceremonyReport, passed } = ceremony()
  return ceremonyReport(EXPECTED, passed(value), reportedAt)
}

/** A report whose passed value carries a bigint, as richJson text writes it. */
const reportTextWithBigint = () =>
  JSON.stringify(reportAt(T0, { amount: { $bigint: '12345678901234567890' } }))

const AMOUNT = BigInt('12345678901234567890')

const isBigint = (value: unknown, expected: bigint): boolean =>
  typeof value === 'bigint' && value === expected

/** What the subscription hands on for the change `fire` plays. */
const heard = (fire: () => void) => {
  const onValue = jest.fn()
  const unsubscribe = browserDefaults().browserReportSubscribe(key(), onValue)
  fire()
  unsubscribe()
  return onValue
}

describe('outside an extension, on storage events', () => {
  /** The `storage` event another page's write fires in this one. */
  const written = (storageKey: string, newValue: string | null) =>
    window.dispatchEvent(new StorageEvent('storage', { key: storageKey, newValue }))

  afterEach(() => localStorage.clear())

  it('hands on a report written as JSON text, parsed', () => {
    const report = reportAt(T0)
    const onValue = heard(() => written(key(), JSON.stringify(report)))
    expect(onValue).toHaveBeenCalledTimes(1)
    expect(onValue).toHaveBeenCalledWith(report)
  })

  it('revives a { $bigint } field as a bigint', () => {
    const onValue = heard(() => written(key(), '{"amount":{"$bigint":"7"}}'))
    expect(onValue).toHaveBeenCalledTimes(1)
    const delivered = onValue.mock.calls[0][0] as Record<string, unknown>
    expect(Object.keys(delivered)).toEqual(['amount'])
    expect(isBigint(delivered.amount, BigInt(7))).toBe(true)
  })

  it('delivers nothing for text that is not JSON', () => {
    const onValue = heard(() => written(key(), 'not a report {'))
    expect(onValue).not.toHaveBeenCalled()
  })

  it("hands the listener another page's report with its bigint revived, then removes it", () => {
    const { browserReportStore, browserReportSubscribe } = browserDefaults()
    localStorage.setItem(key(), reportTextWithBigint())
    const onReport = jest.fn()
    const unsubscribe = ceremony().listenForCeremonyReport(
      EXPECTED,
      browserReportSubscribe,
      browserReportStore,
      onReport,
      () => T0 + 1
    )
    written(key(), localStorage.getItem(key()))
    unsubscribe()
    expect(onReport).toHaveBeenCalledTimes(1)
    expect(isBigint(onReport.mock.calls[0][0].outcome.value.amount, AMOUNT)).toBe(true)
    expect(localStorage.getItem(key())).toBeNull()
  })
})

describe('in the extension, on storage.onChanged', () => {
  const local = new Map<string, unknown>()
  const changeListeners = new Set<ChangeListener>()
  const fakeBrowser = {
    storage: {
      local: {
        get: async () => Object.fromEntries(local),
        set: async (items: Record<string, unknown>) => {
          Object.entries(items).forEach(([k, v]) => local.set(k, v))
        },
        remove: async (keys: string[]) => {
          keys.forEach((k) => local.delete(k))
        }
      },
      onChanged: {
        addListener: (listener: ChangeListener) => changeListeners.add(listener),
        removeListener: (listener: ChangeListener) => changeListeners.delete(listener)
      }
    }
  }

  /** A change the extension's local storage reports for one key. */
  const changed = (storageKey: string, newValue: unknown) =>
    changeListeners.forEach((listener) => listener({ [storageKey]: { newValue } }, 'local'))

  beforeAll(() => {
    jest.resetModules()
    jest.doMock('@web/constants/browserapi', () => ({
      ...jest.requireActual('@web/constants/browserapi'),
      browser: fakeBrowser,
      isExtension: true
    }))
  })

  afterAll(() => {
    jest.dontMock('@web/constants/browserapi')
    jest.resetModules()
  })

  afterEach(() => local.clear())

  it('hands on a report written as JSON text, parsed', () => {
    const report = reportAt(T0)
    const onValue = heard(() => changed(key(), JSON.stringify(report)))
    expect(onValue).toHaveBeenCalledTimes(1)
    expect(onValue).toHaveBeenCalledWith(report)
  })

  it('passes a value that is not text as it came', () => {
    const report = reportAt(T0)
    const onValue = heard(() => changed(key(), report))
    expect(onValue).toHaveBeenCalledTimes(1)
    expect(onValue.mock.calls[0][0]).toBe(report)
  })

  it('revives a { $bigint } field as a bigint', () => {
    const onValue = heard(() => changed(key(), '{"amount":{"$bigint":"7"}}'))
    expect(onValue).toHaveBeenCalledTimes(1)
    const delivered = onValue.mock.calls[0][0] as Record<string, unknown>
    expect(Object.keys(delivered)).toEqual(['amount'])
    expect(isBigint(delivered.amount, BigInt(7))).toBe(true)
  })

  it('delivers nothing for text that is not JSON', () => {
    const onValue = heard(() => changed(key(), 'not a report {'))
    expect(onValue).not.toHaveBeenCalled()
  })

  it('takes a report the store holds as richJson text, parsed once, with its bigint revived', async () => {
    local.set(key(), reportTextWithBigint())
    const { browserReportStore } = browserDefaults()
    const report = await ceremony().takeCeremonyReport(EXPECTED, browserReportStore, T0 + 1)
    expect({ id: report?.id, call: report?.call, method: report?.method }).toEqual(EXPECTED)
    const outcome = report?.outcome as { value?: { amount?: unknown } } | undefined
    expect(isBigint(outcome?.value?.amount, AMOUNT)).toBe(true)
    expect(local.has(key())).toBe(false)
  })
})
