/**
 * @jest-environment jsdom
 *
 * The checklist's route reads the entry record of the account its search
 * names before it shows the checklist: a spinner until the read answers, the
 * failure with its retry, and the account step where the account has no entry
 * record. The extension's storage is the harness's in-memory double; the two
 * chromes stand in as plain frames and the checklist as a marker, since only
 * which state shows matters here.
 */
import type { RecordStorage } from '@web/modules/social-recovery/shared/records'

import type { Mounted } from '@web/modules/social-recovery/recovery/checklist/__tests__/harness'
import {
  ACCOUNT,
  entryOf,
  makeStorage,
  mount,
  NOW,
  seedEntry,
  t
} from '@web/modules/social-recovery/recovery/checklist/__tests__/harness'

const mockStorage: { current: RecordStorage | null } = { current: null }
const mockNavigate = jest.fn()

jest.mock('@web/modules/social-recovery/shared/chrome/useSetupAccount')

jest.mock('@web/modules/social-recovery/shared/records/extensionStorage', () => ({
  get extensionRecordStorage() {
    return mockStorage.current
  }
}))
jest.mock('@common/hooks/useNavigation', () => ({
  __esModule: true,
  default: () => ({ navigate: mockNavigate })
}))
// A declaration, so the harness's own imports can load the stand-ins before this line runs.
function mockFrame(name: string) {
  const R = jest.requireActual('react')
  return {
    __esModule: true,
    default: ({ children }: { children?: unknown }) =>
      R.createElement('div', { 'data-testid': name }, children)
  }
}
jest.mock('@web/modules/social-recovery/shared/chrome/PlainChrome', () => mockFrame('plain-chrome'))
jest.mock('@web/modules/social-recovery/shared/chrome/SetupChrome', () => mockFrame('setup-chrome'))
jest.mock('@web/modules/social-recovery/recovery/checklist/ChecklistView', () =>
  mockFrame('checklist-view')
)
jest.mock('@web/modules/social-recovery/shared/client/useRecoveryClient', () => ({
  useRecoveryClient: () => ({ status: 'loading', retry: () => undefined })
}))
jest.mock('@web/modules/social-recovery/shared/client/useAccountFacts', () => ({
  useAccountFacts: () => ({ status: 'loading', retry: () => undefined })
}))
jest.mock('@web/modules/social-recovery/shared/ceremony/screen', () => ({
  browserReportStore: () => undefined,
  browserReportSubscribe: () => () => undefined,
  pagePasskeysServed: () => false
}))

/* eslint-disable @typescript-eslint/no-var-requires, global-require */
const React: typeof import('react') = require('react')
const { MemoryRouter }: typeof import('react-router-dom') = require('react-router-dom')
const {
  createWalletRecords
}: typeof import('@web/modules/social-recovery/shared/records') = require('@web/modules/social-recovery/shared/records')
const {
  accountStepPath,
  checklistPathOf
}: typeof import('@web/modules/social-recovery/recovery/checklist/search') = require('@web/modules/social-recovery/recovery/checklist/search')
const ChecklistScreen: typeof import('@web/modules/social-recovery/recovery/checklist/ChecklistScreen').default =
  require('@web/modules/social-recovery/recovery/checklist/ChecklistScreen').default
/* eslint-enable @typescript-eslint/no-var-requires, global-require */

const mountChecklistScreen = () =>
  mount(() => (
    <MemoryRouter
      initialEntries={[checklistPathOf(ACCOUNT)]}
      future={{ v7_startTransition: true, v7_relativeSplatPath: true }}
    >
      <ChecklistScreen />
    </MemoryRouter>
  ))

describe('the checklist route’s entry record read', () => {
  let view: Mounted | undefined

  beforeEach(() => {
    mockNavigate.mockClear()
  })

  afterEach(() => {
    view?.unmount()
    view = undefined
  })

  const seeded = async () => {
    const storage = makeStorage()
    await seedEntry(createWalletRecords({ storage, now: () => NOW }), entryOf('logged-in'))
    return storage
  }

  it('shows a spinner and no checklist while the entry record read has not answered', async () => {
    const storage = await seeded()
    mockStorage.current = { ...storage, get: () => new Promise<never>(() => {}) }

    view = await mountChecklistScreen()

    expect(view.byTestId('checklist-entry-loading')).not.toBeNull()
    expect(view.byTestId('checklist-entry-failed')).toBeNull()
    expect(view.byTestId('checklist-view')).toBeNull()
    expect(mockNavigate).not.toHaveBeenCalled()
  })

  it('renders failed with a retry where the entry record read fails, and the checklist once the retry reads it', async () => {
    const storage = await seeded()
    let unreadable = true
    mockStorage.current = {
      ...storage,
      get: async (key, defaultValue) => {
        if (unreadable) {
          throw new Error('storage unavailable')
        }
        return storage.get(key, defaultValue)
      }
    }

    view = await mountChecklistScreen()

    expect(view.byTestId('checklist-entry-failed')?.textContent).toContain(
      t('socialRecovery.wait.readFailedTitle')
    )
    expect(view.byTestId('checklist-view')).toBeNull()

    unreadable = false
    await view.press('checklist-entry-retry')

    expect(view.byTestId('checklist-entry-failed')).toBeNull()
    expect(view.byTestId('checklist-view')).not.toBeNull()
    expect(view.byTestId('checklist-stage')).not.toBeNull()
    expect(mockNavigate).not.toHaveBeenCalled()
  })

  it('goes to the account step where the account has no entry record', async () => {
    mockStorage.current = makeStorage()

    view = await mountChecklistScreen()

    expect(mockNavigate).toHaveBeenCalledWith(accountStepPath(), { replace: true })
    expect(view.byTestId('checklist-view')).toBeNull()
  })
})
