/**
 * @jest-environment jsdom
 *
 * The warning's hand-over and step 2 of 3 mounted whole: the gate on a direct
 * open, the extension password stored through the wallet's keystore setup,
 * and the move to the key step.
 */
import { act } from 'react-dom/test-utils'

import {
  byTestId,
  dispatched,
  flush,
  isDisabled,
  mount,
  movesAway,
  press,
  resetEdge,
  setController,
  text,
  typeInto,
  unmount,
  visits,
  where
} from '@web/modules/social-recovery/onboarding/fast-track/__fixtures__/harness'

const FAST_TRACK = '/social-recovery/fast-track'
const KEY_STEP = '/social-recovery/fast-track/key'
const ACKNOWLEDGED = { acknowledged: true }
const PASSWORD = 'lantern-orchid-42'
const MISMATCH = 'The two passwords you typed do not match.'

const fieldOf = (testID: string) => byTestId(testID) as HTMLInputElement

// The show/hide control sits beside the field, inside the field's own frame.
const toggleOf = async (testID: string) => {
  const toggle = fieldOf(testID).parentElement?.nextElementSibling as HTMLElement | null
  if (!toggle) {
    throw new Error(`no show/hide control: ${testID}`)
  }
  await act(async () => {
    toggle.click()
  })
}

const acknowledgeWarning = async () => {
  await press('recovery-warning-acknowledge')
  await press('recovery-warning-continue')
  await flush()
}

const typePasswords = async (password: string, repeat: string) => {
  await typeInto('fast-track-password-field', password)
  await typeInto('fast-track-password-repeat', repeat)
  await flush()
}

describe('the fast track route', () => {
  beforeEach(() => {
    resetEdge()
  })

  afterEach(() => {
    unmount()
  })

  describe('the warning', () => {
    it('meets a direct open with the warning and no password field', async () => {
      await mount(FAST_TRACK)

      expect(byTestId('recovery-warning')).not.toBeNull()
      expect(byTestId('fast-track-password')).toBeNull()
      expect(byTestId('fast-track-password-field')).toBeNull()
    })

    it('shows step 2 at once to a holder who comes from the warning', async () => {
      await mount('/social-recovery/recover')
      await acknowledgeWarning()

      expect(where()).toBe(FAST_TRACK)
      expect(byTestId('recovery-warning')).toBeNull()
      expect(byTestId('fast-track-password')).not.toBeNull()
      expect(byTestId('fast-track-password-step')?.textContent).toBe(
        'Set up this device · Step 2 of 3'
      )
    })

    it('opens step 2 once the holder acknowledges the warning on a direct open', async () => {
      await mount(FAST_TRACK)
      await acknowledgeWarning()

      expect(byTestId('fast-track-password')).not.toBeNull()
    })

    it('meets the warning again on a reload after the arrival', async () => {
      await mount(FAST_TRACK, ACKNOWLEDGED)

      expect(byTestId('fast-track-password')).not.toBeNull()

      await mount(FAST_TRACK, visits[visits.length - 1].state)

      expect(byTestId('recovery-warning')).not.toBeNull()
    })
  })

  describe('step 2, the extension password', () => {
    it('stores the password through the keystore, unlocked', async () => {
      await mount(FAST_TRACK, ACKNOWLEDGED)
      await typePasswords(PASSWORD, PASSWORD)

      expect(isDisabled('fast-track-password-continue')).toBe(false)
      await press('fast-track-password-continue')
      await flush()

      expect(dispatched('KEYSTORE_CONTROLLER_ADD_SECRET')).toMatchObject([
        { params: { secretId: 'password', secret: PASSWORD, leaveUnlocked: true } }
      ])
    })

    it('keeps continue disabled while the two passwords differ or the password is too short', async () => {
      await mount(FAST_TRACK, ACKNOWLEDGED)
      await typePasswords(PASSWORD, `${PASSWORD}x`)

      expect(isDisabled('fast-track-password-continue')).toBe(true)

      await typePasswords('short', 'short')

      expect(isDisabled('fast-track-password-continue')).toBe(true)
      await press('fast-track-password-continue')
      await flush()
      expect(dispatched('KEYSTORE_CONTROLLER_ADD_SECRET')).toEqual([])
    })

    it('says the passwords differ in its own line under the repeat field, and drops it once they agree', async () => {
      await mount(FAST_TRACK, ACKNOWLEDGED)
      await typePasswords(PASSWORD, `${PASSWORD}x`)

      expect(byTestId('fast-track-password-mismatch')?.textContent).toBe(MISMATCH)
      expect(text().split(MISMATCH)).toHaveLength(2)
      expect(byTestId('fast-track-password-mismatch')?.style.fontSize).toBe(
        byTestId('fast-track-password-rule')?.style.fontSize
      )

      await typeInto('fast-track-password-repeat', PASSWORD)
      await flush()

      expect(byTestId('fast-track-password-mismatch')).toBeNull()
      expect(text()).not.toContain(MISMATCH)
    })

    it('hides both passwords and lets the holder show each one, the repeat as the first', async () => {
      await mount(FAST_TRACK, ACKNOWLEDGED)
      await typePasswords(PASSWORD, PASSWORD)

      expect(fieldOf('fast-track-password-field').type).toBe('password')
      expect(fieldOf('fast-track-password-repeat').type).toBe('password')

      await toggleOf('fast-track-password-repeat')

      expect(fieldOf('fast-track-password-repeat').type).toBe('text')
      expect(fieldOf('fast-track-password-field').type).toBe('password')

      await toggleOf('fast-track-password-repeat')

      expect(fieldOf('fast-track-password-repeat').type).toBe('password')
      expect(fieldOf('fast-track-password-repeat').value).toBe(PASSWORD)
    })

    it('moves on to the key step only once the secret is stored and the keystore unlocked', async () => {
      await mount(FAST_TRACK, ACKNOWLEDGED)
      await typePasswords(PASSWORD, PASSWORD)
      await press('fast-track-password-continue')
      await flush()

      await setController('keystore', { statuses: { addSecret: 'LOADING' } })
      expect(movesAway()).toEqual([])

      await setController('keystore', { hasPasswordSecret: true })
      expect(movesAway()).toEqual([])

      await setController('keystore', { isUnlocked: true, statuses: { addSecret: 'SUCCESS' } })
      await flush()

      expect(movesAway()[0]).toMatchObject({
        to: KEY_STEP.slice(1),
        replace: true,
        state: ACKNOWLEDGED
      })
      expect(byTestId('fast-track-key')).not.toBeNull()
    })

    it('skips the step on a device that already has a password, keeping the count', async () => {
      await setController('keystore', { hasPasswordSecret: true, isUnlocked: true })

      await mount(FAST_TRACK, ACKNOWLEDGED)

      expect(byTestId('fast-track-password-field')).toBeNull()
      expect(dispatched('KEYSTORE_CONTROLLER_ADD_SECRET')).toEqual([])
      expect(movesAway()[0]).toMatchObject({
        to: KEY_STEP.slice(1),
        replace: true,
        state: ACKNOWLEDGED
      })
      expect(byTestId('fast-track-key-step')?.textContent).toBe('Set up this device · Step 3 of 3')
    })

    it('skips the step on a device with a password and a locked keystore, on to the unlock', async () => {
      await setController('keystore', { hasPasswordSecret: true, isUnlocked: false })

      await mount(FAST_TRACK, ACKNOWLEDGED)

      expect(byTestId('fast-track-password-field')).toBeNull()
      expect(where()).toBe('/keystore-unlock')
    })

    it('goes back to the warning', async () => {
      await mount(FAST_TRACK, ACKNOWLEDGED)

      await press('fast-track-password-back')
      await flush()

      expect(movesAway()).toMatchObject([{ to: 'social-recovery/recover', replace: false }])
      expect(byTestId('recovery-warning')).not.toBeNull()
    })

    it('never calls anything a seed', async () => {
      await mount(FAST_TRACK, ACKNOWLEDGED)

      expect(text()).toContain('recovery phrase')
      expect(text()).not.toMatch(/seed/i)
    })
  })
})
