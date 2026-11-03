import i18n from '@common/config/localization'
import { renderWaitLength } from '@web/modules/social-recovery/shared/display'
import type { WaitHelpers } from '@web/modules/social-recovery/setup/privacy/__fixtures__/types'

const t = (key: string, params?: Record<string, unknown>): string => String(i18n.t(key, params))

const helpersWithFloor = (minutes: string | undefined): WaitHelpers => {
  let helpers: WaitHelpers | undefined
  jest.isolateModules(() => {
    if (minutes === undefined) {
      delete process.env.SOCIAL_RECOVERY_WAIT_FLOOR_MINUTES
    } else {
      process.env.SOCIAL_RECOVERY_WAIT_FLOOR_MINUTES = minutes
    }
    // eslint-disable-next-line global-require, @typescript-eslint/no-var-requires
    helpers = require('@web/modules/social-recovery/setup/privacy/wait') as WaitHelpers
  })
  delete process.env.SOCIAL_RECOVERY_WAIT_FLOOR_MINUTES
  return helpers as WaitHelpers
}

describe('the waiting period floor of a test build', () => {
  it('keeps a day as the floor and hours as the unit where nothing is set', () => {
    const wait = helpersWithFloor(undefined)
    expect(wait.readCustomWait('23', 720)).toEqual({ status: 'belowMinimum' })
    expect(wait.readCustomWait('24', 720)).toEqual({ status: 'accepted', hours: 24 })
    expect(wait.secondsOfHours(24)).toBe(86_400)
    expect(wait.choiceOfSeconds(30 * 3600)).toEqual({ kind: 'custom', text: '30' })
    expect(wait.CUSTOM_UNIT_IS_MINUTES).toBe(false)
    expect(renderWaitLength(wait.WAIT_FLOOR_SECONDS, t)).toBe('24 hours')
    expect(renderWaitLength(wait.DEFAULT_WAIT_SECONDS, t)).toBe('48 hours')
  })

  it('drops the floor to the minutes set and counts the custom entry in minutes', () => {
    const wait = helpersWithFloor('5')
    expect(wait.readCustomWait('4', 720)).toEqual({ status: 'belowMinimum' })
    const five = wait.readCustomWait('5', 720)
    expect(five.status).toBe('accepted')
    expect(wait.secondsOfHours(five.status === 'accepted' ? five.hours : 0)).toBe(300)
    expect(wait.choiceOfSeconds(300)).toEqual({ kind: 'custom', text: '5' })
    expect(wait.choiceOfSeconds(48 * 3600)).toEqual({ kind: 'chip', id: 'hours48' })
    expect(wait.readCustomWait('43201', 720)).toEqual({ status: 'pastCeiling' })
    expect(wait.CUSTOM_UNIT_IS_MINUTES).toBe(true)
    expect(renderWaitLength(wait.WAIT_FLOOR_SECONDS, t)).toBe('5 minutes')
    expect(renderWaitLength(wait.DEFAULT_WAIT_SECONDS, t)).toBe('48 hours')
  })

  const NOT_A_FLOOR: readonly string[] = ['0', '', 'abc', '1.5', '-5']
  NOT_A_FLOOR.forEach((value) => {
    it(`ignores a floor of "${value}", which is no whole positive number of minutes`, () => {
      const wait = helpersWithFloor(value)
      expect(wait.readCustomWait('1', 720)).toEqual({ status: 'belowMinimum' })
      expect(wait.secondsOfHours(1)).toBe(3600)
      expect(wait.CUSTOM_UNIT_IS_MINUTES).toBe(false)
    })
  })

  it('ignores a floor above the release floor, keeping a day and hours', () => {
    const wait = helpersWithFloor('2880')
    expect(wait.readCustomWait('23', 720)).toEqual({ status: 'belowMinimum' })
    expect(wait.readCustomWait('24', 720)).toEqual({ status: 'accepted', hours: 24 })
    expect(wait.secondsOfHours(24)).toBe(86_400)
    expect(wait.choiceOfSeconds(30 * 3600)).toEqual({ kind: 'custom', text: '30' })
  })
})
