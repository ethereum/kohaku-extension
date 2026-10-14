/**
 * @jest-environment jsdom
 *
 * The recovery in progress's route takes its chrome from its own first read
 * of the list and mounts the list once, under that chrome: the plain header
 * where every recovery came by the fast track, the settings chrome otherwise.
 * The extension's storage is the harness's in-memory double; the two chromes
 * stand in as plain frames, since only which one holds the list matters here.
 */
import type { RecordStorage } from '@web/modules/social-recovery/shared/records'

import type { Mounted } from '@web/modules/social-recovery/recovery/checklist/__tests__/harness'
import {
  ACCOUNT,
  each,
  entryOf,
  gatheringOf,
  makeStorage,
  mount,
  MIXED_PATH,
  NOW,
  SECOND_ACCOUNT,
  seedEntry,
  seedSession,
  settle,
  t
} from '@web/modules/social-recovery/recovery/checklist/__tests__/harness'

const mockStorage: { current: RecordStorage | null } = { current: null }
const mockViewMounts: string[] = []

// The chrome's account latch is the chrome's own, tested in its folder.
jest.mock('@web/modules/social-recovery/shared/chrome/useSetupAccount')

jest.mock('@web/modules/social-recovery/shared/records/extensionStorage', () => ({
  get extensionRecordStorage() {
    return mockStorage.current
  }
}))
jest.mock('@common/hooks/useNavigation', () => ({
  __esModule: true,
  default: () => ({ navigate: () => undefined })
}))
jest.mock('@web/modules/social-recovery/recovery/checklist/useSessionHeadline', () => ({
  __esModule: true,
  default: () => ({ done: 1, total: 3 })
}))
const mockFrame = (name: string) => {
  const R = jest.requireActual('react')
  return {
    __esModule: true,
    default: ({ children }: { children?: unknown }) =>
      R.createElement('div', { 'data-testid': name }, children)
  }
}
jest.mock('@web/modules/social-recovery/shared/chrome/PlainChrome', () => mockFrame('plain-chrome'))
jest.mock('@web/modules/social-recovery/shared/chrome/SetupChrome', () => mockFrame('setup-chrome'))
jest.mock('@web/modules/social-recovery/recovery/checklist/InProgressView', () => {
  const R = jest.requireActual('react')
  const actual = jest.requireActual(
    '@web/modules/social-recovery/recovery/checklist/InProgressView'
  )
  return {
    __esModule: true,
    default: (props: Record<string, unknown>) => {
      R.useEffect(() => {
        mockViewMounts.push('mounted')
      }, [])
      return R.createElement(actual.default, props)
    }
  }
})

/* eslint-disable @typescript-eslint/no-var-requires, global-require */
const {
  createWalletRecords
}: typeof import('@web/modules/social-recovery/shared/records') = require('@web/modules/social-recovery/shared/records')
const InProgressScreen: typeof import('@web/modules/social-recovery/recovery/checklist/InProgressScreen').default =
  require('@web/modules/social-recovery/recovery/checklist/InProgressScreen').default
/* eslint-enable @typescript-eslint/no-var-requires, global-require */

describe('the recovery in progress route', () => {
  let view: Mounted | undefined

  beforeEach(() => {
    mockStorage.current = makeStorage()
    mockViewMounts.splice(0)
  })

  afterEach(() => {
    view?.unmount()
    view = undefined
  })

  each([
    ['every recovery came by the fast track', 'fresh-install', 'fresh-install', 'plain-chrome'],
    ['one recovery came from the settings', 'fresh-install', 'logged-in', 'setup-chrome']
  ] as const)(
    'mounts the list once, under its final chrome, where %s',
    async ([, first, second, chrome]) => {
      const records = createWalletRecords({
        storage: mockStorage.current as RecordStorage,
        now: () => NOW
      })
      await seedEntry(records, entryOf(first), ACCOUNT)
      await seedSession(records, gatheringOf(MIXED_PATH, 1, ACCOUNT), ACCOUNT)
      await seedEntry(records, entryOf(second), SECOND_ACCOUNT)
      await seedSession(records, gatheringOf(MIXED_PATH, 1, SECOND_ACCOUNT), SECOND_ACCOUNT)

      view = await mount(() => <InProgressScreen />)

      const list = view.byTestId('in-progress')
      expect(list?.closest(`[data-testid="${chrome}"]`)).not.toBeNull()
      expect(view.byTestId('in-progress-route-loading')).toBeNull()
      expect(mockViewMounts).toEqual(['mounted'])
    }
  )

  it('renders a failed first read under the settings chrome with the failure and its retry', async () => {
    const storage = makeStorage()
    let unreadable = true
    mockStorage.current = {
      ...storage,
      getAll: async () => {
        if (unreadable) {
          throw new Error('storage unreadable')
        }
        return storage.getAll?.() ?? {}
      }
    }
    const records = createWalletRecords({ storage, now: () => NOW })
    await seedEntry(records, entryOf('logged-in'), ACCOUNT)
    await seedSession(records, gatheringOf(MIXED_PATH, 1, ACCOUNT), ACCOUNT)

    view = await mount(() => <InProgressScreen />)
    await settle()

    const failure = view.byTestId('in-progress-failed')
    expect(failure?.closest('[data-testid="setup-chrome"]')).not.toBeNull()
    expect(failure?.textContent).toContain(t('socialRecovery.wait.readFailedTitle'))
    expect(failure?.textContent).toContain(t('socialRecovery.client.unavailableBody'))
    expect(view.byTestId('in-progress-route-loading')).toBeNull()
    expect(view.byTestId(`in-progress-${ACCOUNT.toLowerCase()}`)).toBeNull()

    unreadable = false
    await view.press('in-progress-retry')

    expect(view.byTestId('in-progress-failed')).toBeNull()
    const row = view.byTestId(`in-progress-${ACCOUNT.toLowerCase()}`)
    expect(row?.closest('[data-testid="setup-chrome"]')).not.toBeNull()
  })
})
