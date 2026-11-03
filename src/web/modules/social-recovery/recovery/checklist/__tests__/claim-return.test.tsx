/**
 * @jest-environment jsdom
 *
 * The return from the claim ceremony through the checklist's own route, under
 * a router and the web navigation: the route reads the entry record, the
 * checklist takes the report the ceremony tab wrote, and the search drops the
 * ceremony id once the claim settles. The passkey row keeps the outcome
 * across that change of search: a ceremony that did not pass leaves its note
 * and its retry, and a passed one counts with its answered line. The
 * recovery client, the receiving account's facts and the report channel are
 * the harness's fakes; the extension's storage is its in-memory double.
 */
import type { Configuration } from '@kohaku-eth/social-recovery'
import type { CeremonyOutcome } from '@web/modules/social-recovery/shared/ceremony'

import type {
  FakeKit,
  MockWorld,
  Mounted,
  ReportChannel,
  TestRecords,
  ChromeStubProps
} from '@web/modules/social-recovery/recovery/checklist/__tests__/harness'
import {
  ACCOUNT,
  CHAIN_ID,
  configurationOf,
  fakeKit,
  gatheringOf,
  GUARDIANS,
  guardianCredential,
  mount,
  passkeyCredential,
  replyOf,
  reportChannel,
  requestOf,
  seedCache,
  seedEntry,
  seedSession,
  storedSession,
  t,
  testRecords
} from '@web/modules/social-recovery/recovery/checklist/__tests__/harness'

const mockWorld: MockWorld = { storage: null, channel: null, kit: null }

jest.mock('@web/modules/social-recovery/shared/chrome/useSetupAccount')

jest.mock('@web/modules/social-recovery/shared/records/extensionStorage', () => ({
  get extensionRecordStorage() {
    return mockWorld.storage
  }
}))
// The web build's navigation, whose function changes with every location.
jest.mock('@common/hooks/useNavigation', () =>
  jest.requireActual('@common/hooks/useNavigation/useNavigation.web')
)
// A declaration, so the harness's own imports can load the stand-ins before this line runs.
function mockFrame(name: string) {
  const R = jest.requireActual('react')
  return {
    __esModule: true,
    default: ({ children, counter }: ChromeStubProps) => {
      const { t: translate } = jest.requireActual('@common/config/localization').default
      return R.createElement(
        'div',
        { 'data-testid': name },
        counter
          ? R.createElement(
              'div',
              { 'data-testid': counter.testID },
              translate(counter.labelKey, { step: counter.step, total: counter.total })
            )
          : null,
        children
      )
    }
  }
}
jest.mock('@web/modules/social-recovery/shared/chrome/PlainChrome', () => mockFrame('plain-chrome'))
jest.mock('@web/modules/social-recovery/shared/chrome/SetupChrome', () => mockFrame('setup-chrome'))
jest.mock('@web/modules/social-recovery/shared/client/useRecoveryClient', () => ({
  useRecoveryClient: () => {
    const state = mockWorld.kit?.state
    return state?.status === 'ready'
      ? { status: 'ready', client: state.client, retry: () => undefined }
      : { status: 'loading', retry: () => undefined }
  }
}))
jest.mock('@web/modules/social-recovery/shared/client/useAccountFacts', () => ({
  useAccountFacts: () => ({
    status: 'ready',
    facts: {
      account: { addr: '0x4444444444444444444444444444444444444444' },
      key: { addr: '0x4444444444444444444444444444444444444444' }
    },
    retry: () => undefined
  })
}))
jest.mock('@web/modules/social-recovery/shared/ceremony/screen', () => ({
  get browserReportStore() {
    return mockWorld.channel?.store
  },
  browserReportSubscribe: (key: string, onValue: (value: unknown) => void) =>
    mockWorld.channel?.subscribe(key, onValue) ?? (() => undefined),
  pagePasskeysServed: () => true
}))

/* eslint-disable @typescript-eslint/no-var-requires, global-require */
const React: typeof import('react') = require('react')
const { MemoryRouter, useLocation }: typeof import('react-router-dom') = require('react-router-dom')
const {
  dismissed,
  failed,
  passed,
  relyingPartyOf
}: typeof import('@web/modules/social-recovery/shared/ceremony') = require('@web/modules/social-recovery/shared/ceremony')
const {
  checklistPathOf,
  claimRequestRecordOf
}: typeof import('@web/modules/social-recovery/recovery/checklist') = require('@web/modules/social-recovery/recovery/checklist')
const ChecklistScreen: typeof import('@web/modules/social-recovery/recovery/checklist/ChecklistScreen').default =
  require('@web/modules/social-recovery/recovery/checklist/ChecklistScreen').default
/* eslint-enable @typescript-eslint/no-var-requires, global-require */

const CEREMONY_ID = 'request-1'

const SearchProbe = () => {
  const { search } = useLocation()
  return <div data-testid="probe-search">{search}</div>
}

describe('the passkey row on the return from its claim ceremony', () => {
  let view: Mounted | undefined
  let world: TestRecords
  let kit: FakeKit
  let channel: ReportChannel
  let path: Configuration

  /** The tab writes its report and returns to the checklist path the row gave it. */
  const returnFrom = async (outcome: CeremonyOutcome<unknown>) => {
    await channel.report(CEREMONY_ID, 'createClaim', outcome, Date.now())
    view = await mount(() => (
      <MemoryRouter
        initialEntries={[checklistPathOf(ACCOUNT, CEREMONY_ID)]}
        future={{ v7_startTransition: true, v7_relativeSplatPath: true }}
      >
        <ChecklistScreen />
        <SearchProbe />
      </MemoryRouter>
    ))
    return view
  }

  beforeEach(async () => {
    path = configurationOf([
      {
        threshold: 1,
        credentials: [passkeyCredential('Laptop passkey', relyingPartyOf(window.location).rpIdHash)]
      },
      { threshold: 1, credentials: [guardianCredential(GUARDIANS[0])] }
    ])
    const gathering = gatheringOf(path, 1)
    world = testRecords()
    await seedEntry(world.records)
    await seedCache(world.records, path)
    await seedSession(world.records, gathering)
    await world.records
      .ceremonyRequest(CEREMONY_ID)
      .write(
        claimRequestRecordOf(
          'passkey',
          { account: ACCOUNT, chainId: CHAIN_ID, request: requestOf(gathering, 0) },
          { handOff: false }
        )
      )
    kit = fakeKit(path)
    channel = reportChannel()
    mockWorld.storage = world.storage
    mockWorld.channel = channel
    mockWorld.kit = kit
  })

  afterEach(() => {
    view?.unmount()
    view = undefined
  })

  const expectNoteAndRetry = (mounted: Mounted, noteKey: string) => {
    expect(mounted.byTestId('probe-search')?.textContent).toBe(`?account=${ACCOUNT}`)
    expect(mounted.byTestId('checklist-row-0-note')?.textContent).toBe(t(noteKey))
    expect(mounted.byTestId('checklist-row-0-retry')).not.toBeNull()
    expect(mounted.byTestId('checklist-progress')?.textContent).toBe(
      t('socialRecovery.checklist.progress', { done: 0, total: 2 })
    )
  }

  it('keeps the failed note and the retry once the search drops the ceremony id', async () => {
    const mounted = await returnFrom(failed('thrown'))

    expectNoteAndRetry(mounted, 'socialRecovery.ceremony.failedNote')
    expect((await world.records.ceremonyRequest(CEREMONY_ID).read()).status).toBe('absent')
  })

  it('keeps the dismissal note and the retry once the search drops the ceremony id', async () => {
    const mounted = await returnFrom(dismissed('cancelled', 'NotAllowedError'))

    expectNoteAndRetry(mounted, 'socialRecovery.ceremony.cancelledNote')
  })

  it('keeps the browser error name under the note once the search drops the ceremony id', async () => {
    const mounted = await returnFrom(failed('browser-error', 'SecurityError'))

    expectNoteAndRetry(mounted, 'socialRecovery.ceremony.failedNote')
    expect(mounted.text()).toContain('SecurityError')
  })

  it('counts a passed claim with its answered line once the search drops the ceremony id', async () => {
    const gathering = gatheringOf(path, 1)
    const reply = replyOf(gathering, 0)

    const mounted = await returnFrom(passed({ reply }))

    expect(kit.addApproverReply).toHaveBeenCalledWith(gathering, reply)
    const after = await storedSession(world.records)
    expect(after?.value.state === 'live' && after.value.gathering.replies).toEqual([reply])
    expect(mounted.byTestId('probe-search')?.textContent).toBe(`?account=${ACCOUNT}`)
    expect(mounted.byTestId('checklist-row-0-chip')?.textContent).toBe(
      t('socialRecovery.status.collection.complete')
    )
    expect(mounted.byTestId('checklist-row-0-answered')).not.toBeNull()
    expect(mounted.byTestId('checklist-progress')?.textContent).toBe(
      t('socialRecovery.checklist.progress', { done: 1, total: 2 })
    )
  })
})
