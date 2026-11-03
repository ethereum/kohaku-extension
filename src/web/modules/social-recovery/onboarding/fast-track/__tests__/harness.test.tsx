/**
 * @jest-environment jsdom
 *
 * The harness itself: a controller state a test pushes reaches the mounted step.
 */
import {
  byTestId,
  mount,
  resetEdge,
  setController,
  unmount,
  where
} from '@web/modules/social-recovery/onboarding/fast-track/__fixtures__/harness'

describe('the fast track harness', () => {
  afterEach(() => {
    unmount()
    resetEdge()
  })

  it('re-renders a mounted step when a test pushes a controller state', async () => {
    await mount('/social-recovery/fast-track', { acknowledged: true })
    expect(byTestId('fast-track-password')).not.toBeNull()

    await setController('keystore', { hasPasswordSecret: true, isUnlocked: true })

    expect(byTestId('fast-track-key')).not.toBeNull()
    expect(where()).toBe('/social-recovery/fast-track/key')
  })
})
