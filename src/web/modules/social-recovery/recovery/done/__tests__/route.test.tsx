/**
 * @jest-environment jsdom
 *
 * The module's route registry mounts the done screen at `recovery/done`
 * behind the owner's guards: the keystore unlocked and an account. The
 * guards and every screen are stand-ins here, so the registry alone decides
 * what renders.
 */
import { createRoot } from 'react-dom/client'
import { act } from 'react-dom/test-utils'
import { TextDecoder, TextEncoder } from 'util'

Object.assign(globalThis, { TextEncoder, TextDecoder })
;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true

const mockGuards = { unlocked: true, authenticated: true }

const mockGuard = (name: 'unlocked' | 'authenticated') => {
  const R = jest.requireActual('react')
  const { Outlet } = jest.requireActual('react-router-dom')
  return {
    __esModule: true,
    default: () =>
      mockGuards[name]
        ? R.createElement('div', { 'data-testid': `guard-${name}` }, R.createElement(Outlet))
        : R.createElement('div', { 'data-testid': `refused-${name}` })
  }
}
const mockScreen = (name: string) => {
  const R = jest.requireActual('react')
  return { __esModule: true, default: () => R.createElement('div', { 'data-testid': name }) }
}

// The chrome's account latch is the chrome's own, tested in its folder.
jest.mock('@web/modules/social-recovery/shared/chrome/useSetupAccount')

jest.mock('@web/modules/router/components/KeystoreUnlockedRoute', () => mockGuard('unlocked'))
jest.mock('@web/modules/router/components/AuthenticatedRoute', () => mockGuard('authenticated'))
jest.mock('@web/modules/social-recovery/setup/arm/ArmScreen', () => mockScreen('arm'))
jest.mock('@web/modules/social-recovery/setup/enroll/EnrollScreen', () => mockScreen('enroll'))
jest.mock('@web/modules/social-recovery/setup/review/ReviewScreen', () => mockScreen('review'))
jest.mock('@web/modules/social-recovery/setup/card/RecoveryCardScreen', () => mockScreen('card'))
jest.mock('@web/modules/social-recovery/setup/privacy/PrivacyScreen', () => mockScreen('privacy'))
jest.mock('@web/modules/social-recovery/setup/privacy/WaitingPeriodScreen', () =>
  mockScreen('waiting-period')
)
jest.mock('@web/modules/social-recovery/setup/editor/EditorScreen', () => mockScreen('editor'))
jest.mock('@web/modules/social-recovery/setup/presets/PresetsScreen', () => mockScreen('presets'))
jest.mock('@web/modules/social-recovery/shared/ceremony/screen', () => mockScreen('ceremony'))
jest.mock('@web/modules/social-recovery/onboarding/recover/RecoverScreen', () =>
  mockScreen('recover')
)
jest.mock('@web/modules/social-recovery/recovery/entry/EntryScreen', () => mockScreen('entry'))
jest.mock('@web/modules/social-recovery/recovery/entry/AccountStepScreen', () =>
  mockScreen('account-step')
)
jest.mock('@web/modules/social-recovery/recovery/entry/ReadoutScreen', () => mockScreen('readout'))
jest.mock('@web/modules/social-recovery/onboarding/fast-track/FastTrackScreen', () =>
  mockScreen('fasttrack')
)
jest.mock('@web/modules/social-recovery/onboarding/fast-track/KeyStepScreen', () =>
  mockScreen('keystep')
)
jest.mock('@web/modules/social-recovery/onboarding/fast-track/GasStepScreen', () =>
  mockScreen('gasstep')
)
jest.mock('@web/modules/social-recovery/recovery/checklist/ChecklistScreen', () =>
  mockScreen('checklist')
)
jest.mock('@web/modules/social-recovery/recovery/checklist/InProgressScreen', () =>
  mockScreen('in-progress')
)
jest.mock('@web/modules/social-recovery/recovery/submit/SubmitScreen', () => mockScreen('submit'))
jest.mock('@web/modules/social-recovery/recovery/wait/WaitScreen', () => mockScreen('wait'))
jest.mock('@web/modules/social-recovery/recovery/done/DoneScreen', () => mockScreen('done-screen'))

/* eslint-disable @typescript-eslint/no-var-requires, global-require */
const React: typeof import('react') = require('react')
const { MemoryRouter }: typeof import('react-router-dom') = require('react-router-dom')
const SocialRecoveryRoutes: typeof import('@web/modules/social-recovery/routes/SocialRecoveryRoutes').default =
  require('@web/modules/social-recovery/routes/SocialRecoveryRoutes').default
/* eslint-enable @typescript-eslint/no-var-requires, global-require */

const mountAt = async (path: string) => {
  const container = document.createElement('div')
  document.body.appendChild(container)
  const root = createRoot(container)
  await act(async () => {
    root.render(
      <MemoryRouter
        initialEntries={[path]}
        future={{ v7_startTransition: true, v7_relativeSplatPath: true }}
      >
        <SocialRecoveryRoutes />
      </MemoryRouter>
    )
  })
  const has = (id: string) => !!container.querySelector(`[data-testid="${id}"]`)
  const inside = (outer: string, inner: string) =>
    !!container.querySelector(`[data-testid="${outer}"] [data-testid="${inner}"]`)
  return {
    has,
    inside,
    unmount: () => {
      act(() => root.unmount())
      container.remove()
    }
  }
}

const DONE_PATH = '/recovery/done?account=0x0000000000000000000000000000000000030001'

afterEach(() => {
  mockGuards.unlocked = true
  mockGuards.authenticated = true
})

describe('the done screen route', () => {
  it('mounts the done screen inside both owner guards', async () => {
    const mounted = await mountAt(DONE_PATH)
    expect(mounted.inside('guard-unlocked', 'guard-authenticated')).toBe(true)
    expect(mounted.inside('guard-authenticated', 'done-screen')).toBe(true)
    expect(mounted.has('wait')).toBe(false)
    mounted.unmount()
  })

  it('renders no done screen while the keystore is locked or no account exists', async () => {
    mockGuards.unlocked = false
    const locked = await mountAt(DONE_PATH)
    expect(locked.has('done-screen')).toBe(false)
    locked.unmount()

    mockGuards.unlocked = true
    mockGuards.authenticated = false
    const noAccount = await mountAt(DONE_PATH)
    expect(noAccount.has('done-screen')).toBe(false)
    noAccount.unmount()
  })
})
