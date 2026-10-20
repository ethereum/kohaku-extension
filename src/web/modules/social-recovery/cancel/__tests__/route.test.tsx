/**
 * @jest-environment jsdom
 *
 * The cancel's route in the registry: the owner's group renders it once the
 * keystore is unlocked, and a locked keystore goes to the unlock screen first.
 */
import { createRoot } from 'react-dom/client'
import { act } from 'react-dom/test-utils'
import { TextDecoder, TextEncoder } from 'util'

Object.assign(globalThis, { TextEncoder, TextDecoder })
;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true

const mockKeystore = { isReadyToStoreKeys: true, isUnlocked: true }

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
jest.mock('@web/modules/social-recovery/cancel/CancelScreen', () => mockScreen('cancel'))
jest.mock('@web/modules/social-recovery/management/overview/OverviewScreen', () =>
  mockScreen('overview')
)
jest.mock('@web/modules/social-recovery/management/editor/EditScreen', () =>
  mockScreen('manage-edit')
)
jest.mock('@web/modules/social-recovery/management/editor/ReviewScreen', () =>
  mockScreen('manage-review')
)
jest.mock('@web/modules/social-recovery/management/editor/RemoveScreen', () =>
  mockScreen('manage-remove')
)

/* eslint-disable @typescript-eslint/no-var-requires, global-require */
const React: typeof import('react') = require('react')
const {
  MemoryRouter,
  Route,
  Routes
}: typeof import('react-router-dom') = require('react-router-dom')
const {
  ROUTES,
  WEB_ROUTES
}: typeof import('@common/modules/router/constants/common') = require('@common/modules/router/constants/common')
const SocialRecoveryRoutes: typeof import('@web/modules/social-recovery/routes/SocialRecoveryRoutes').default =
  require('@web/modules/social-recovery/routes/SocialRecoveryRoutes').default
const {
  cancelPathOf
}: typeof import('@web/modules/social-recovery/cancel') = require('@web/modules/social-recovery/cancel')
/* eslint-enable @typescript-eslint/no-var-requires, global-require */

const ACCOUNT = '0x00000000000000000000000000000000000A11cE'

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
          <Route path={ROUTES.keyStoreUnlock} element={<div data-testid="unlock" />} />
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

afterEach(() => {
  mockKeystore.isUnlocked = true
})

describe("the cancel's route", () => {
  it('renders the cancel at its route with the account in the search', async () => {
    const mounted = await mountAt(cancelPathOf(ACCOUNT as `0x${string}`))
    expect(cancelPathOf(ACCOUNT as `0x${string}`)).toBe(
      `/${WEB_ROUTES.socialRecoveryCancel}?account=${ACCOUNT}`
    )
    expect(mounted.has('cancel')).toBe(true)
    mounted.unmount()
  })

  it('sends a locked keystore to the unlock screen first', async () => {
    mockKeystore.isUnlocked = false
    const mounted = await mountAt(cancelPathOf(ACCOUNT as `0x${string}`))
    expect(mounted.has('unlock')).toBe(true)
    expect(mounted.has('cancel')).toBe(false)
    mounted.unmount()
  })
})
