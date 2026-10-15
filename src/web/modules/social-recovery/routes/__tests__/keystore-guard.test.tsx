/**
 * @jest-environment jsdom
 *
 * The registry mounts as the wallet mounts it, at `social-recovery/*` beside
 * the wallet's unlock screen, with the keystore state faked and every screen a
 * stand-in. A locked keystore on an owner route must reach the unlock screen
 * with the page it left as its return target; the open routes run locked.
 */
import { createRoot } from 'react-dom/client'
import { act } from 'react-dom/test-utils'
import { TextDecoder, TextEncoder } from 'util'

Object.assign(globalThis, { TextEncoder, TextDecoder })
;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true

const mockKeystore = { isReadyToStoreKeys: true, isUnlocked: true }
const mockUnlockVisits: unknown[] = []

jest.mock('@web/hooks/useKeystoreControllerState', () => ({
  __esModule: true,
  default: () => mockKeystore
}))

const mockPassThrough = () => {
  const R = jest.requireActual('react')
  const { Outlet } = jest.requireActual('react-router-dom')
  return { __esModule: true, default: () => R.createElement(Outlet) }
}
const mockScreen = (name: string) => {
  const R = jest.requireActual('react')
  return { __esModule: true, default: () => R.createElement('div', { 'data-testid': name }) }
}

// The chrome's account latch is the chrome's own, tested in its folder.
jest.mock('@web/modules/social-recovery/shared/chrome/useSetupAccount')

jest.mock('@web/modules/router/components/AuthenticatedRoute', () => mockPassThrough())
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
  mockScreen('fast-track')
)
jest.mock('@web/modules/social-recovery/onboarding/fast-track/KeyStepScreen', () =>
  mockScreen('key-step')
)
jest.mock('@web/modules/social-recovery/onboarding/fast-track/GasStepScreen', () =>
  mockScreen('gas-step')
)
jest.mock('@web/modules/social-recovery/recovery/checklist/ChecklistScreen', () =>
  mockScreen('checklist')
)
jest.mock('@web/modules/social-recovery/recovery/checklist/InProgressScreen', () =>
  mockScreen('in-progress')
)
jest.mock('@web/modules/social-recovery/recovery/submit/SubmitScreen', () => mockScreen('submit'))
jest.mock('@web/modules/social-recovery/recovery/wait/WaitScreen', () => mockScreen('wait'))
jest.mock('@web/modules/social-recovery/recovery/done/DoneScreen', () => mockScreen('done'))
jest.mock('@web/modules/social-recovery/guardian-page/ApproveScreen', () => mockScreen('approve'))

/* eslint-disable @typescript-eslint/no-var-requires, global-require */
const React: typeof import('react') = require('react')
const {
  MemoryRouter,
  Route,
  Routes,
  useLocation
}: typeof import('react-router-dom') = require('react-router-dom')
const {
  ROUTES,
  WEB_ROUTES
}: typeof import('@common/modules/router/constants/common') = require('@common/modules/router/constants/common')
const SocialRecoveryRoutes: typeof import('@web/modules/social-recovery/routes/SocialRecoveryRoutes').default =
  require('@web/modules/social-recovery/routes/SocialRecoveryRoutes').default
/* eslint-enable @typescript-eslint/no-var-requires, global-require */

const UnlockStub = () => {
  const location = useLocation()
  mockUnlockVisits.push(location.state)
  return <div data-testid="unlock" />
}

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
        <Routes>
          <Route path={ROUTES.keyStoreUnlock} element={<UnlockStub />} />
          <Route path={`${WEB_ROUTES.socialRecovery}/*`} element={<SocialRecoveryRoutes />} />
        </Routes>
      </MemoryRouter>
    )
  })
  return {
    has: (id: string) => !!container.querySelector(`[data-testid="${id}"]`),
    unmount: () => {
      act(() => root.unmount())
      container.remove()
    }
  }
}

const lock = () => {
  mockKeystore.isReadyToStoreKeys = true
  mockKeystore.isUnlocked = false
}

afterEach(() => {
  mockKeystore.isReadyToStoreKeys = true
  mockKeystore.isUnlocked = true
  mockUnlockVisits.length = 0
})

describe('the keystore guard of the recovery routes', () => {
  it('sends a locked keystore on an owner route to the unlock screen with the page to come back to', async () => {
    lock()
    const mounted = await mountAt(
      `/${WEB_ROUTES.socialRecovery}/setup/review?account=0x0000000000000000000000000000000000030001#card`
    )
    expect(mounted.has('unlock')).toBe(true)
    expect(mounted.has('review')).toBe(false)
    expect(mockUnlockVisits[mockUnlockVisits.length - 1]).toEqual({
      returnTo: {
        pathname: `/${WEB_ROUTES.socialRecovery}/setup/review`,
        search: '?account=0x0000000000000000000000000000000000030001',
        hash: '#card'
      }
    })
    mounted.unmount()
  })

  it('sends a locked keystore on the recovery entry to the unlock screen too', async () => {
    lock()
    const mounted = await mountAt(`/${WEB_ROUTES.socialRecovery}/recovery`)
    expect(mounted.has('unlock')).toBe(true)
    expect(mounted.has('entry')).toBe(false)
    expect(mockUnlockVisits[mockUnlockVisits.length - 1]).toEqual({
      returnTo: { pathname: `/${WEB_ROUTES.socialRecovery}/recovery`, search: '', hash: '' }
    })
    mounted.unmount()
  })

  it('renders the owner route once the keystore is unlocked', async () => {
    const mounted = await mountAt(`/${WEB_ROUTES.socialRecovery}/setup/review`)
    expect(mounted.has('review')).toBe(true)
    expect(mounted.has('unlock')).toBe(false)
    mounted.unmount()
  })

  it('renders the owner route while no keystore exists yet to unlock', async () => {
    mockKeystore.isReadyToStoreKeys = false
    mockKeystore.isUnlocked = false
    const mounted = await mountAt(`/${WEB_ROUTES.socialRecovery}/setup`)
    expect(mounted.has('presets')).toBe(true)
    expect(mounted.has('unlock')).toBe(false)
    mounted.unmount()
  })

  it('renders the fast track and the ceremony with the keystore locked', async () => {
    lock()
    const fastTrack = await mountAt(`/${WEB_ROUTES.socialRecovery}/fast-track`)
    expect(fastTrack.has('fast-track')).toBe(true)
    expect(fastTrack.has('unlock')).toBe(false)
    fastTrack.unmount()

    const ceremony = await mountAt(`/${WEB_ROUTES.socialRecovery}/ceremony`)
    expect(ceremony.has('ceremony')).toBe(true)
    expect(ceremony.has('unlock')).toBe(false)
    ceremony.unmount()
    expect(mockUnlockVisits).toHaveLength(0)
  })
})
