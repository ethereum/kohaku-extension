import i18n from '@common/config/localization'
import { renderWaitLength } from '@web/modules/social-recovery/shared/display'
import type { Translate } from '@web/modules/social-recovery/shared/display'

describe('a waiting period length', () => {
  const recorded = () => {
    const calls: [string, Record<string, unknown> | undefined][] = []
    const t: Translate = (key, options) => {
      calls.push([key, options])
      return `<${key}>`
    }
    return { calls, t }
  }

  it('reads whole minutes under one hour, rounded down', () => {
    const { calls, t } = recorded()
    renderWaitLength(300n, t)
    renderWaitLength(3599n, t)
    renderWaitLength(59n, t)
    expect(calls).toEqual([
      ['socialRecovery.display.remainingMinutes', { count: 5 }],
      ['socialRecovery.display.remainingMinutes', { count: 59 }],
      ['socialRecovery.display.remainingMinutes', { count: 0 }]
    ])
  })

  it('reads whole hours alone, and hours with their minutes otherwise', () => {
    const { calls, t } = recorded()
    renderWaitLength(3600n, t)
    renderWaitLength(86_400n + 59n, t)
    renderWaitLength(3900n, t)
    expect(calls).toEqual([
      ['socialRecovery.display.remainingHours', { count: 1 }],
      ['socialRecovery.display.remainingHours', { count: 24 }],
      ['socialRecovery.display.remainingHours', { count: 1 }],
      ['socialRecovery.display.remainingMinutes', { count: 5 }],
      [
        'socialRecovery.display.hoursAndMinutes',
        {
          hours: '<socialRecovery.display.remainingHours>',
          minutes: '<socialRecovery.display.remainingMinutes>'
        }
      ]
    ])
  })

  it('renders the English through en.json, with its plural', () => {
    const t: Translate = (key, options) => String(i18n.t(key, options))
    expect(renderWaitLength(300n, t)).toBe('5 minutes')
    expect(renderWaitLength(60n, t)).toBe('1 minute')
    expect(renderWaitLength(86_400n, t)).toBe('24 hours')
    expect(renderWaitLength(3600n, t)).toBe('1 hour')
    expect(renderWaitLength(3900n, t)).toBe('1 hour 5 minutes')
    expect(renderWaitLength(9000n, t)).toBe('2 hours 30 minutes')
    expect(renderWaitLength(3660n, t)).toBe('1 hour 1 minute')
  })
})
