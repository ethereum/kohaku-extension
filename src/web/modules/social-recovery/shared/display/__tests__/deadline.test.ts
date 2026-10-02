import {
  renderDateTimeInZone,
  renderDeadline,
  renderRemaining,
  Translate
} from '@web/modules/social-recovery/shared/display'

const expectRefusal = (fn: () => unknown, message: string) => {
  expect(fn).toThrow(TypeError)
  expect(fn).toThrow(new TypeError(message))
}

// 13 Aug 18:04 in Berlin (CEST, UTC+2) is 16:04 UTC.
const DEADLINE = new Date('2026-08-13T16:04:00Z')
const MINUTE = 60 * 1000
const HOUR = 60 * MINUTE
const before = (ms: number) => new Date(DEADLINE.getTime() - ms)

describe('countdown words come from en.json alone', () => {
  it('reads the registered keys with a count and passes no fallback text', () => {
    const calls: [string, Record<string, unknown> | undefined][] = []
    const t: Translate = (key, options) => {
      calls.push([key, options])
      return `<${key}>`
    }
    expect(renderRemaining(50 * HOUR + 30 * MINUTE, t)).toBe(
      '<socialRecovery.display.remainingHours>'
    )
    expect(renderRemaining(20 * MINUTE, t)).toBe('<socialRecovery.display.remainingMinutes>')
    expect(calls).toEqual([
      ['socialRecovery.display.remainingHours', { count: 50 }],
      ['socialRecovery.display.remainingMinutes', { count: 20 }]
    ])
  })
})

describe('deadline', () => {
  it('renders the date, time and zone in Europe/Berlin with the hours left', () => {
    expect(
      renderDeadline({ deadline: DEADLINE, now: before(23 * HOUR), timeZone: 'Europe/Berlin' })
    ).toEqual({
      date: '13 Aug, 18:04 CEST',
      zone: 'CEST',
      remaining: '23 hours',
      passed: false,
      line: 'Valid until 13 Aug, 18:04 CEST · 23 hours left'
    })
  })

  it('renders the same instant in America/New_York with its own time and zone', () => {
    expect(
      renderDeadline({ deadline: DEADLINE, now: before(23 * HOUR), timeZone: 'America/New_York' })
    ).toEqual({
      date: '13 Aug, 12:04 GMT-4',
      zone: 'GMT-4',
      remaining: '23 hours',
      passed: false,
      line: 'Valid until 13 Aug, 12:04 GMT-4 · 23 hours left'
    })
  })

  it('is deterministic for a fixed now', () => {
    const now = before(23 * HOUR)
    const a = renderDeadline({ deadline: DEADLINE, now, timeZone: 'Europe/Berlin' })
    const b = renderDeadline({ deadline: DEADLINE, now: new Date(now), timeZone: 'Europe/Berlin' })
    expect(a).toEqual(b)
  })

  it('counts whole hours down, then whole minutes under one hour', () => {
    const remaining = (ms: number) =>
      renderDeadline({ deadline: DEADLINE, now: before(ms), timeZone: 'Europe/Berlin' }).remaining
    expect(remaining(50 * HOUR + 30 * MINUTE)).toBe('50 hours')
    expect(remaining(HOUR + 59 * MINUTE)).toBe('1 hour')
    expect(remaining(HOUR)).toBe('1 hour')
    expect(remaining(20 * MINUTE)).toBe('20 minutes')
  })

  it('rounds minutes down: 59 minutes 30 seconds reads 59 minutes', () => {
    expect(
      renderDeadline({
        deadline: DEADLINE,
        now: before(59 * MINUTE + 30 * 1000),
        timeZone: 'Europe/Berlin'
      }).remaining
    ).toBe('59 minutes')
  })

  it('reads at least 1 minute while any time is left', () => {
    expect(
      renderDeadline({ deadline: DEADLINE, now: before(30 * 1000), timeZone: 'Europe/Berlin' })
        .remaining
    ).toBe('1 minute')
  })

  it('renders no countdown once the deadline has passed', () => {
    expect(
      renderDeadline({ deadline: DEADLINE, now: DEADLINE, timeZone: 'Europe/Berlin' })
    ).toEqual({
      date: '13 Aug, 18:04 CEST',
      zone: 'CEST',
      remaining: null,
      passed: true,
      line: null
    })
  })
})

describe('a value that is not a valid time', () => {
  const BAD_TIMES: [Date | number, string][] = [
    [NaN, 'Not a time: NaN'],
    [new Date(NaN), 'Not a time: Invalid Date'],
    [Infinity, 'Not a time: Infinity'],
    [1e16, 'Not a time: 10000000000000000']
  ]

  it('the date and zone renderer refuses NaN, an invalid Date, Infinity and a time past the Date range', () => {
    BAD_TIMES.forEach(([at, message]) =>
      expectRefusal(() => renderDateTimeInZone(at, 'Europe/Berlin'), message)
    )
  })

  it('the deadline refuses the same values as its deadline or as its now', () => {
    BAD_TIMES.forEach(([value, message]) => {
      expectRefusal(
        () =>
          renderDeadline({ deadline: value, now: before(23 * HOUR), timeZone: 'Europe/Berlin' }),
        message
      )
      expectRefusal(
        () => renderDeadline({ deadline: DEADLINE, now: value, timeZone: 'Europe/Berlin' }),
        message
      )
    })
  })

  it('the date and zone renderer still renders a valid Date or epoch milliseconds', () => {
    const berlin = { date: '13 Aug, 18:04 CEST', zone: 'CEST' }
    expect(renderDateTimeInZone(DEADLINE, 'Europe/Berlin')).toEqual(berlin)
    expect(renderDateTimeInZone(DEADLINE.getTime(), 'Europe/Berlin')).toEqual(berlin)
  })

  it('accepts the last time a Date can hold and refuses one millisecond past it', () => {
    expect(() => renderDateTimeInZone(8.64e15, 'UTC')).not.toThrow()
    expectRefusal(() => renderDateTimeInZone(8.64e15 + 1, 'UTC'), 'Not a time: 8640000000000001')
  })

  it('the time left refuses NaN, Infinity and -Infinity', () => {
    expectRefusal(() => renderRemaining(NaN), 'Not a time: NaN')
    expectRefusal(() => renderRemaining(Infinity), 'Not a time: Infinity')
    expectRefusal(() => renderRemaining(-Infinity), 'Not a time: -Infinity')
  })
})
