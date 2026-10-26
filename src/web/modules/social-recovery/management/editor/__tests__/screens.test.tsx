/**
 * @jest-environment jsdom
 *
 * The review of changes and the removal over given reads: the review's save
 * held until the trust rows of the added rows rendered and held with nothing
 * changed, the warning beside it for an added row never tested, the sentence
 * that saving cancels the recovery in progress only while an attempt is open,
 * and the save refused while the setup is not authorized and an attempt is
 * open; the removal's typed confirmation with its own cancel sentence, which
 * that refusal leaves alone, its end found already standing, drawn apart and
 * wiping this device, a check after its landing that disagreed, which leads
 * to the overview, and a write another tab stored meanwhile, which sends
 * the holder to that write's screen once the tab is back in view. The client,
 * the reads and the run are the screens' seams, each given here; the records
 * sit on an in-memory storage.
 */
import { TextDecoder, TextEncoder } from 'util'

import type {
  ScreensWorld,
  CheckStop,
  EditChangeCase,
  EditScreenSetup,
  ManageIntent
} from '@web/modules/social-recovery/management/editor/__fixtures__/types'
import type { EditSession } from '@web/modules/social-recovery/management/editor/types'
import type { Clause } from '@kohaku-eth/social-recovery'

// The spinner's animation needs a native module jsdom lacks; a plain view stands in.
jest.mock('@common/components/Spinner', () => {
  /* eslint-disable @typescript-eslint/no-var-requires, global-require */
  const mockReact: typeof import('react') = require('react')
  const { View: MockView }: typeof import('react-native') = require('react-native')
  /* eslint-enable @typescript-eslint/no-var-requires, global-require */
  return {
    __esModule: true,
    default: () => mockReact.createElement(MockView, { testID: 'spinner' })
  }
})

Object.assign(globalThis, { TextEncoder, TextDecoder })

jest.mock('@web/modules/social-recovery/shared/client/deployment-env', () => ({
  SEPOLIA_DEPLOYMENT_VARIABLE: 'SOCIAL_RECOVERY_SEPOLIA_DEPLOYMENT',
  sepoliaDeploymentVariable: () => undefined
}))

const mockWorld: ScreensWorld = {} as ScreensWorld

jest.mock('@common/utils/clipboard', () => ({ setStringAsync: async () => true }))
jest.mock('@web/modules/social-recovery/management/overview/useHeldKeys', () => {
  const held: string[] = []
  return { useHeldKeys: () => held }
})
jest.mock('@common/hooks/useNavigation', () => ({
  __esModule: true,
  default: () => ({ navigate: jest.fn() })
}))
// The route's chrome is not drawn here: the stage views render inside it.
jest.mock('@web/modules/social-recovery/shared/chrome/SetupChrome', () => ({
  __esModule: true,
  default: () => null
}))
jest.mock('@web/modules/social-recovery/shared/chrome/useSetupAccount', () => ({
  __esModule: true,
  default: () => ({})
}))

jest.mock('@web/modules/social-recovery/shared/client/useRecoveryClient', () => ({
  useRecoveryClient: () => mockWorld.client
}))
jest.mock('@web/modules/social-recovery/management/overview/useOverviewReads', () => ({
  useOverviewReads: () => mockWorld.reads
}))
jest.mock('@web/modules/social-recovery/shared/client/useAccountFacts', () => ({
  useAccountFacts: () => mockWorld.facts
}))
jest.mock('@web/modules/social-recovery/management/editor/useWriteSeams', () => ({
  useWriteSeams: () => ({})
}))
// The chain moves a block at once, so a check read again after each new block runs without a wait.
jest.mock('@web/modules/social-recovery/setup/arm/block', () => ({
  ...jest.requireActual('@web/modules/social-recovery/setup/arm/block'),
  waitForNewBlock: async () => undefined
}))
jest.mock('@web/modules/social-recovery/setup/arm/useArmRun', () => ({
  useArmRun: () => mockWorld.run
}))
jest.mock('@web/modules/social-recovery/setup/review/useTrustReads', () => ({
  useTrustReads: () => mockWorld.trust
}))
jest.mock('@web/modules/social-recovery/setup/review/useAccountReads', () => ({
  useAccountReads: () => mockWorld.accountReads
}))

/* eslint-disable @typescript-eslint/no-var-requires, global-require */
const React: typeof import('react') = require('react')
const {
  act,
  mount,
  settle,
  t
}: typeof import('@web/modules/social-recovery/cancel/__fixtures__/mount') = require('@web/modules/social-recovery/cancel/__fixtures__/mount')
const {
  REMOVAL_DRAFT
}: typeof import('@web/modules/social-recovery/management/overview/constants') = require('@web/modules/social-recovery/management/overview/constants')
const {
  newSendRequestId
}: typeof import('@web/modules/social-recovery/shared/client') = require('@web/modules/social-recovery/shared/client')
const {
  MANAGE_INTENT_MARKS
}: typeof import('@web/modules/social-recovery/shared/writes') = require('@web/modules/social-recovery/shared/writes')
const review: typeof import('@web/modules/social-recovery/setup/review/__fixtures__/review') = require('@web/modules/social-recovery/setup/review/__fixtures__/review')
const {
  ReviewStageView
}: typeof import('@web/modules/social-recovery/management/editor/ReviewScreen') = require('@web/modules/social-recovery/management/editor/ReviewScreen')
const {
  RemoveStageView
}: typeof import('@web/modules/social-recovery/management/editor/RemoveScreen') = require('@web/modules/social-recovery/management/editor/RemoveScreen')
const {
  recordsOfConfiguration,
  writeLoadedRecords
}: typeof import('@web/modules/social-recovery/management/editor/load') = require('@web/modules/social-recovery/management/editor/load')
const {
  editSessionOf,
  holdNewPassword
}: typeof import('@web/modules/social-recovery/management/editor/session') = require('@web/modules/social-recovery/management/editor/session')
const {
  createWalletRecords,
  setRecoveryPassword
}: typeof import('@web/modules/social-recovery/shared/records') = require('@web/modules/social-recovery/shared/records')
const {
  makeStorage
}: typeof import('@web/modules/social-recovery/shared/records/__fixtures__/storage') = require('@web/modules/social-recovery/shared/records/__fixtures__/storage')
/* eslint-enable @typescript-eslint/no-var-requires, global-require */

const { ACCOUNT, ALICE, BOB, BOOK, CHAIN_ID, SHIPPED } = review
const REVIEW = 'socialRecovery.management.review'
const REMOVE = 'socialRecovery.management.remove'

const COMMITTED: Clause[] = [review.group(1, ALICE)]

const baseline: EditSession = {
  configuration: { clauses: COMMITTED, wait: 172_800, ignoresPause: true },
  setupNonce: 1n,
  setupCommitment: `0x${'ab'.repeat(32)}`,
  level: 'private',
  password: 'kept'
}

const readsOf = (attemptOpen: boolean, authorized = true) => ({
  facts: {
    status: 'answered',
    value: { setup: { ...review.setupStateOf(true), isAuthorized: authorized }, attemptOpen }
  },
  path: { kind: 'none' },
  ask: { status: 'idle' },
  notices: { status: 'pending' },
  cached: null,
  retry: jest.fn(),
  retryPath: jest.fn(),
  retryNotices: jest.fn(),
  unlock: jest.fn(),
  askAgain: jest.fn()
})

const ACCOUNT_READS = {
  removedKey: { status: 'answered', value: { kind: 'named', key: review.REMOVED_KEY } },
  fitCheck: { status: 'answered', value: { basis: 'deployed-code', fits: true } },
  setupState: { status: 'answered', value: review.setupStateOf(true) },
  description: { status: 'answered', value: review.descriptionOf() },
  retry: jest.fn()
}

const idleRun = () => ({
  state: {
    write: { status: 'idle', write: 'save', run: 0 },
    after: { stage: 'none' },
    lookup: 'none'
  },
  start: jest.fn(),
  recheck: jest.fn(),
  reread: jest.fn(),
  checkAgain: jest.fn(),
  lookAgain: jest.fn(),
  checkSetup: jest.fn(),
  endWhereSetUp: jest.fn(),
  saveAgain: jest.fn()
})

/** Sets the screens' seams: the edit's path, whether its rows' trust reads answered, and the attempt. */
const given = async ({
  clauses,
  trustAnswered,
  attemptOpen,
  authorized = true,
  committed = COMMITTED,
  wait,
  password = 'kept'
}: EditScreenSetup) => {
  const storage = makeStorage()
  const records = createWalletRecords({ storage })
  const session = editSessionOf(storage, CHAIN_ID, ACCOUNT)
  const setup = records.setup(CHAIN_ID, ACCOUNT)
  const started: EditSession = {
    ...baseline,
    configuration: { ...baseline.configuration, clauses: committed },
    password
  }
  await writeLoadedRecords(setup, recordsOfConfiguration(started.configuration, 'private'))
  const loaded = await setup.setupDraft.read()
  if (loaded.status !== 'present') {
    throw new Error('no draft loaded')
  }
  await setup.writeDraftAndPath({ ...loaded.value, clauses, wait: wait ?? loaded.value.wait })
  await session.write(started)
  setRecoveryPassword(CHAIN_ID, ACCOUNT, 'card password')
  if (password === 'changed') {
    holdNewPassword(CHAIN_ID, ACCOUNT, 'a new card password')
  }
  Object.assign(mockWorld, {
    client: {
      status: 'ready',
      client: {
        chain: 'sepolia',
        descriptor: { shippedMethods: SHIPPED },
        moduleReads: {},
        setup: {},
        walletReads: {}
      },
      reads: {},
      receipts: {},
      retry: jest.fn()
    },
    reads: readsOf(attemptOpen, authorized),
    facts: { status: 'ready', facts: { key: review.REMOVED_KEY } },
    run: idleRun(),
    trust: {
      reads: trustAnswered ? review.readsOf([[BOOK.methods.ecdsa, review.answered()]]) : {},
      retry: jest.fn()
    },
    accountReads: ACCOUNT_READS
  })
  return { records, session }
}

const reviewOver = async (options: Parameters<typeof given>[0]) => {
  const { records, session } = await given(options)
  return mount(
    React.createElement(ReviewStageView, {
      records,
      session,
      chainId: CHAIN_ID,
      account: ACCOUNT,
      navigate: jest.fn()
    })
  )
}

const removalWith = async (attemptOpen: boolean, authorized = true) => {
  const { records, session } = await given({
    clauses: COMMITTED,
    trustAnswered: true,
    attemptOpen,
    authorized
  })
  const navigate = jest.fn()
  const element = React.createElement(RemoveStageView, {
    records,
    session,
    chainId: CHAIN_ID,
    account: ACCOUNT,
    navigate
  })
  const view = await mount(element)
  return { view, element, records, session, navigate }
}

const removalOver = async (attemptOpen: boolean, authorized = true) =>
  (await removalWith(attemptOpen, authorized)).view

describe('the save of an edit that adds no row', () => {
  // The trust reads never answer here: an edit that adds no row has none to wait for.
  const noTrust = { trustAnswered: false, attemptOpen: false }
  const TWO = [review.group(2, ALICE, BOB)]
  const cases: EditChangeCase[] = [
    {
      name: 'a threshold change',
      options: { ...noTrust, committed: TWO, clauses: [review.group(1, ALICE, BOB)] },
      change: 'manage-change-rule'
    },
    {
      name: 'a waiting period change',
      options: { ...noTrust, clauses: COMMITTED, wait: 259_200 },
      change: 'manage-change-waitingPeriod'
    },
    {
      name: 'a removal',
      options: { ...noTrust, committed: TWO, clauses: [review.group(1, ALICE)] },
      change: 'manage-change-members'
    },
    {
      name: 'a new password at a hidden level',
      options: { ...noTrust, clauses: COMMITTED, password: 'changed' },
      change: 'manage-change-password'
    }
  ]
  cases.forEach(({ name, options, change }) =>
    it(`enables Save for ${name}`, async () => {
      const view = await reviewOver(options)
      expect(view.byTestId(change)).not.toBeNull()
      expect(view.byTestId('manage-review-not-tested')).toBeNull()
      expect(view.isDisabled('manage-review-save')).toBe(false)
      view.unmount()
    })
  )

  it('keeps Save held with nothing changed, and says so', async () => {
    const view = await reviewOver({ ...noTrust, clauses: COMMITTED })
    expect(view.textOf('manage-review-unchanged')).toBe(t(`${REVIEW}.unchanged`))
    expect(view.isDisabled('manage-review-save')).toBe(true)
    expect(view.byTestId('manage-review-save-checking')).toBeNull()
    view.unmount()
  })

  it('keeps Save held for an added row until its trust read rendered', async () => {
    const view = await reviewOver({ ...noTrust, clauses: [review.group(1, ALICE, BOB)] })
    expect(view.isDisabled('manage-review-save')).toBe(true)
    view.unmount()
  })
})

describe('the review of changes', () => {
  it('says it opens the draft in a waiting block, with no save, while the stored edit is read', async () => {
    const { records, session } = await given({
      clauses: COMMITTED,
      trustAnswered: true,
      attemptOpen: false
    })
    jest.spyOn(session, 'read').mockImplementation(() => new Promise(() => {}))
    const view = await mount(
      React.createElement(ReviewStageView, {
        records,
        session,
        chainId: CHAIN_ID,
        account: ACCOUNT,
        navigate: jest.fn()
      })
    )
    expect(view.textOf('manage-review-loading')).toBe(t('socialRecovery.loading.draft'))
    expect(
      view.byTestId('manage-review-loading')?.querySelector('[data-testid="loading-block"]')
    ).not.toBeNull()
    expect(view.byTestId('manage-review-save')).toBeNull()
    view.unmount()
  })

  it('holds the save until the trust rows of the added rows answered', async () => {
    const view = await reviewOver({
      clauses: [review.group(1, ALICE, BOB)],
      trustAnswered: false,
      attemptOpen: false
    })
    expect(view.byTestId('manage-change-members')).not.toBeNull()
    expect(view.isDisabled('manage-review-save')).toBe(true)
    expect(view.textOf('manage-review-save-checking')).toBe(t('socialRecovery.loading.saveChecks'))
    expect(
      view.byTestId('manage-review-save-checking')?.querySelector('[data-testid="loading-row"]')
    ).not.toBeNull()
    view.unmount()

    const answered = await reviewOver({
      clauses: [review.group(1, ALICE, BOB)],
      trustAnswered: true,
      attemptOpen: false
    })
    expect(answered.isDisabled('manage-review-save')).toBe(false)
    answered.unmount()
  })

  it('holds the save with nothing changed, and says so', async () => {
    const view = await reviewOver({ clauses: COMMITTED, trustAnswered: true, attemptOpen: false })
    expect(view.textOf('manage-review-unchanged')).toBe(t(`${REVIEW}.unchanged`))
    expect(view.isDisabled('manage-review-save')).toBe(true)
    view.unmount()
  })

  it('carries the sentence that saving cancels the recovery only while an attempt is open', async () => {
    const open = await reviewOver({
      clauses: [review.group(1, ALICE, BOB)],
      trustAnswered: true,
      attemptOpen: true
    })
    expect(open.textOf('manage-review-cancels')).toBe(t(`${REVIEW}.cancelsLine`))
    open.unmount()

    const closed = await reviewOver({
      clauses: [review.group(1, ALICE, BOB)],
      trustAnswered: true,
      attemptOpen: false
    })
    expect(closed.byTestId('manage-review-cancels')).toBeNull()
    closed.unmount()
  })

  it('warns beside the save for an added row never tested, and never for a committed one', async () => {
    const view = await reviewOver({
      clauses: [review.group(1, ALICE, BOB)],
      trustAnswered: true,
      attemptOpen: false
    })
    expect(view.byTestId('manage-review-not-tested')).not.toBeNull()
    expect(view.byTestId('manage-review-not-tested-0-1')).not.toBeNull()
    expect(view.byTestId('manage-review-not-tested-0-0')).toBeNull()
    expect(view.isDisabled('manage-review-save')).toBe(false)
    view.unmount()
  })

  it('refuses the save while the setup is not authorized and an attempt is open', async () => {
    const view = await reviewOver({
      clauses: [review.group(1, ALICE, BOB)],
      trustAnswered: true,
      attemptOpen: true,
      authorized: false
    })
    expect(view.textOf('manage-review-dormant-refused')).toContain(t(`${REVIEW}.dormantRefused`))
    expect(view.byTestId('manage-review-cancels')).toBeNull()
    expect(view.isDisabled('manage-review-save')).toBe(true)
    view.unmount()

    const authorized = await reviewOver({
      clauses: [review.group(1, ALICE, BOB)],
      trustAnswered: true,
      attemptOpen: true
    })
    expect(authorized.byTestId('manage-review-dormant-refused')).toBeNull()
    expect(authorized.isDisabled('manage-review-save')).toBe(false)
    authorized.unmount()
  })

  it('leads back to the editor in its own words', async () => {
    const view = await reviewOver({ clauses: COMMITTED, trustAnswered: true, attemptOpen: false })
    expect(view.textOf('manage-review-back')).toBe(t(`${REVIEW}.backToEditor`))
    view.unmount()
  })

  it('starts the save from its action once it is enabled', async () => {
    const view = await reviewOver({
      clauses: [review.group(1, ALICE, BOB)],
      trustAnswered: true,
      attemptOpen: false
    })
    await view.press('manage-review-save')
    expect(mockWorld.run.start).toHaveBeenCalledTimes(1)
    view.unmount()
  })

  it('opens the Recovery Card after a saved change as one the overview opened', async () => {
    const { records, session } = await given({
      clauses: COMMITTED,
      trustAnswered: true,
      attemptOpen: false,
      password: 'changed'
    })
    mockWorld.run = {
      ...idleRun(),
      state: {
        write: { status: 'landed', write: 'ownerWrite', transactionHash: '0x01', run: 1 },
        after: { stage: 'saved' },
        lookup: 'none'
      }
    }
    const navigate = jest.fn()
    const view = await mount(
      React.createElement(ReviewStageView, {
        records,
        session,
        chainId: CHAIN_ID,
        account: ACCOUNT,
        navigate
      })
    )
    await view.press('manage-review-saved-card')
    expect(navigate).toHaveBeenCalledWith('/social-recovery/setup/card?level=hidden&from=manage')
    view.unmount()
  })
})

describe('the removal', () => {
  const typeWord = async (view: Awaited<ReturnType<typeof removalOver>>, word: string) => {
    const field = view.byTestId('manage-remove-word')
    const input = field instanceof HTMLInputElement ? field : field?.querySelector('input')
    if (!input) {
      throw new Error('no field to type into')
    }
    await act(async () => {
      Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set?.call(input, word)
      input.dispatchEvent(new Event('input', { bubbles: true }))
    })
  }

  it('warns, and enables the removal only on the exact word', async () => {
    const view = await removalOver(false)
    expect(view.textOf('manage-remove-warning')).toContain(t(`${REMOVE}.warning`))
    expect(view.isDisabled('manage-remove-action')).toBe(true)
    await typeWord(view, t(`${REMOVE}.word`).toLowerCase())
    expect(view.isDisabled('manage-remove-action')).toBe(true)
    await typeWord(view, t(`${REMOVE}.word`))
    expect(view.isDisabled('manage-remove-action')).toBe(false)
    await view.press('manage-remove-action')
    expect(mockWorld.run.start).toHaveBeenCalledTimes(1)
    view.unmount()
  })

  it('carries the sentence that removing cancels the recovery only while an attempt is open', async () => {
    const open = await removalOver(true)
    expect(open.textOf('manage-remove-cancels')).toBe(t(`${REMOVE}.cancelsLine`))
    open.unmount()
    const closed = await removalOver(false)
    expect(closed.byTestId('manage-remove-cancels')).toBeNull()
    closed.unmount()
  })
})

describe('the removal around the refusals and other writes', () => {
  const typeWord = async (view: Awaited<ReturnType<typeof removalOver>>) => {
    const field = view.byTestId('manage-remove-word')
    const input = field instanceof HTMLInputElement ? field : field?.querySelector('input')
    if (!input) {
      throw new Error('no field to type into')
    }
    await act(async () => {
      Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set?.call(
        input,
        t(`${REMOVE}.word`)
      )
      input.dispatchEvent(new Event('input', { bubbles: true }))
    })
  }

  it('removes a dormant setup while an attempt is open, since its clear cancels the attempt', async () => {
    const view = await removalOver(true, false)
    await typeWord(view)
    expect(view.isDisabled('manage-remove-action')).toBe(false)
    expect(view.textOf('manage-remove-cancels')).toBe(t(`${REMOVE}.cancelsLine`))
    expect(view.textOf('manage-remove-keep')).toBe(t(`${REMOVE}.keep`))
    view.unmount()
  })

  it('draws an end found already standing apart from its own removal, and keeps nothing here', async () => {
    const { records, session } = await given({
      clauses: COMMITTED,
      trustAnswered: true,
      attemptOpen: false
    })
    await records.decryptedSetupCache(CHAIN_ID, ACCOUNT).write({
      configuration: baseline.configuration,
      setupNonce: 1n
    })
    mockWorld.run = {
      ...idleRun(),
      state: {
        write: { status: 'idle', write: 'ownerWrite', run: 1 },
        after: { stage: 'none' },
        stop: 'already-set-up'
      }
    }
    const view = await mount(
      React.createElement(RemoveStageView, {
        records,
        session,
        chainId: CHAIN_ID,
        account: ACCOUNT,
        navigate: jest.fn()
      })
    )

    expect(view.byTestId('manage-remove-ended')).not.toBeNull()
    expect(view.byTestId('manage-remove-done')).toBeNull()
    expect(view.textOf('manage-remove-done-title')).toBe(t(`${REMOVE}.alreadyTitle`))
    expect(view.textOf('manage-remove-done-lead')).toBe(t(`${REMOVE}.alreadyBody`))
    expect((await records.setup(CHAIN_ID, ACCOUNT).setupDraft.read()).status).toBe('absent')
    expect((await records.decryptedSetupCache(CHAIN_ID, ACCOUNT).read()).status).toBe('absent')
    expect(await session.read()).toBeUndefined()
    view.unmount()
  })

  it('sends the holder to the review once the tab is back in view over an edit another tab stored', async () => {
    const { view, records, navigate } = await removalWith(false)
    expect(navigate).not.toHaveBeenCalled()

    const claim = await records.saveInFlight(CHAIN_ID, ACCOUNT).claim({
      draft: REMOVAL_DRAFT,
      prepared: { kind: 'call', target: ACCOUNT, value: 0n, data: '0x' } as never,
      requestId: `${newSendRequestId()}${MANAGE_INTENT_MARKS.manageEdit}`,
      claimedAt: Date.now()
    })
    expect(claim.claimed).toBe(true)
    await act(async () => {
      window.dispatchEvent(new Event('focus'))
    })
    await settle()

    expect(navigate).toHaveBeenCalledWith('social-recovery/manage/review')
    view.unmount()
  })

  it('opens the overview where the check after the landing disagreed, and leaves the read again of the run to an unread one', async () => {
    const { records, session } = await given({
      clauses: COMMITTED,
      trustAnswered: true,
      attemptOpen: false
    })
    const checked = (stage: CheckStop) => {
      mockWorld.run = {
        ...idleRun(),
        state: {
          write: { status: 'landed', write: 'ownerWrite', transactionHash: '0x01', run: 1 },
          after: { stage },
          lookup: 'none'
        }
      }
      const navigate = jest.fn()
      const element = React.createElement(RemoveStageView, {
        records,
        session,
        chainId: CHAIN_ID,
        account: ACCOUNT,
        navigate
      })
      return { navigate, element }
    }

    const disagreed = checked('disagreed')
    const view = await mount(disagreed.element)
    expect(view.byTestId('manage-remove-check-failed')).toBeNull()
    await view.press('manage-remove-check-disagreed-overview')
    expect(disagreed.navigate).toHaveBeenCalledWith('social-recovery/manage')
    expect(mockWorld.run.reread).not.toHaveBeenCalled()
    view.unmount()

    const unread = checked('unread')
    const again = await mount(unread.element)
    expect(again.byTestId('manage-remove-check-disagreed')).toBeNull()
    await again.press('manage-remove-check-failed-retry')
    expect(mockWorld.run.reread).toHaveBeenCalledTimes(1)
    expect(unread.navigate).not.toHaveBeenCalled()
    again.unmount()
  })

  it('reads a disagreed removal again, disagreed while the chain still reads a setup, as removed once the chain reads both gone, and retries a read that failed', async () => {
    const { records, session } = await given({
      clauses: COMMITTED,
      trustAnswered: true,
      attemptOpen: false
    })
    const setupState = jest.fn()
    Object.assign((mockWorld.client as { client: { setup: object } }).client.setup, {
      setupState
    })
    mockWorld.run = {
      ...idleRun(),
      state: {
        write: { status: 'landed', write: 'ownerWrite', transactionHash: '0x01', run: 1 },
        after: { stage: 'disagreed', check: 'mismatch' },
        lookup: 'none',
        prepared: { draft: REMOVAL_DRAFT, prepared: {}, calls: [] }
      }
    }
    const navigate = jest.fn()
    const view = await mount(
      React.createElement(RemoveStageView, {
        records,
        session,
        chainId: CHAIN_ID,
        account: ACCOUNT,
        navigate
      })
    )
    expect(view.text()).toContain(t(`${REMOVE}.disagreedTitle`))
    expect(view.text()).not.toContain(t('socialRecovery.management.overview.reads.failedTitle'))
    expect(view.byTestId('manage-remove-check-disagreed-overview')).not.toBeNull()

    // The chain still reads the setup on every read of the check.
    setupState.mockResolvedValue(review.setupStateOf(true))
    await view.press('manage-remove-check-disagreed-read-again')
    await settle()
    expect(setupState).toHaveBeenCalled()
    expect(view.text()).toContain(t(`${REMOVE}.disagreedTitle`))
    expect(view.isDisabled('manage-remove-check-disagreed-read-again')).toBe(false)
    expect(view.byTestId('manage-remove-check-failed')).toBeNull()
    expect(view.byTestId('manage-remove-done')).toBeNull()
    expect((await records.setup(CHAIN_ID, ACCOUNT).setupDraft.read()).status).toBe('present')

    setupState.mockClear()
    setupState.mockRejectedValueOnce(new Error('the read did not return'))
    await view.press('manage-remove-check-disagreed-read-again')
    await settle()
    expect(setupState).toHaveBeenCalledTimes(1)
    expect(view.byTestId('manage-remove-check-disagreed')).toBeNull()
    expect(view.byTestId('manage-remove-done')).toBeNull()

    setupState.mockResolvedValueOnce(review.setupStateOf(false))
    await view.press('manage-remove-check-failed-retry')
    await settle()
    expect(setupState).toHaveBeenCalledTimes(2)
    expect(view.byTestId('manage-remove-done')).not.toBeNull()
    expect((await records.setup(CHAIN_ID, ACCOUNT).setupDraft.read()).status).not.toBe('present')
    expect(mockWorld.run.reread).not.toHaveBeenCalled()
    expect(navigate).not.toHaveBeenCalled()
    view.unmount()
  })

  it('reads the stored write again where the run stops for another screen, and routes there', async () => {
    const { view, element, records, navigate } = await removalWith(false)
    await records.saveInFlight(CHAIN_ID, ACCOUNT).claim({
      draft: REMOVAL_DRAFT,
      prepared: { kind: 'call', target: ACCOUNT, value: 0n, data: '0x' } as never,
      requestId: `${newSendRequestId()}${MANAGE_INTENT_MARKS.manageEdit}`,
      claimedAt: Date.now()
    })
    expect(navigate).not.toHaveBeenCalled()

    mockWorld.run = {
      ...idleRun(),
      state: {
        write: { status: 'idle', write: 'ownerWrite', run: 1 },
        after: { stage: 'none' },
        stop: 'held-by-another-write'
      }
    }
    await view.render(React.cloneElement(element))

    expect(navigate).toHaveBeenCalledWith('social-recovery/manage/review')
    view.unmount()
  })

  it('opens the overview where the run stops for another screen whose write was released meanwhile', async () => {
    const { view, element, records, navigate } = await removalWith(false)
    const requestId = `${newSendRequestId()}${MANAGE_INTENT_MARKS.manageEdit}`
    const inFlight = records.saveInFlight(CHAIN_ID, ACCOUNT)
    await inFlight.claim({
      draft: REMOVAL_DRAFT,
      prepared: { kind: 'call', target: ACCOUNT, value: 0n, data: '0x' } as never,
      requestId,
      claimedAt: Date.now()
    })
    await inFlight.release(requestId)

    mockWorld.run = {
      ...idleRun(),
      state: {
        write: { status: 'idle', write: 'ownerWrite', run: 1 },
        after: { stage: 'none' },
        stop: 'held-by-another-write'
      }
    }
    await view.render(React.cloneElement(element))

    expect(navigate).toHaveBeenCalledWith('social-recovery/manage')
    expect(navigate).not.toHaveBeenCalledWith('social-recovery/manage/review')
    view.unmount()
  })
})

describe('the waits of the review and the removal', () => {
  const HASH = `0x${'ab'.repeat(32)}` as const
  const runAt = (state: Record<string, unknown>) => {
    mockWorld.run = { ...idleRun(), state: { ...idleRun().state, ...state } }
  }
  const mountReview = async (state: Record<string, unknown>) => {
    const { records, session } = await given({
      clauses: COMMITTED,
      trustAnswered: true,
      attemptOpen: false,
      wait: 259_200
    })
    runAt(state)
    return mount(
      React.createElement(ReviewStageView, {
        records,
        session,
        chainId: CHAIN_ID,
        account: ACCOUNT,
        navigate: jest.fn()
      })
    )
  }
  const mountRemoval = async (state: Record<string, unknown>) => {
    const { records, session } = await given({
      clauses: COMMITTED,
      trustAnswered: true,
      attemptOpen: false
    })
    runAt(state)
    return mount(
      React.createElement(RemoveStageView, {
        records,
        session,
        chainId: CHAIN_ID,
        account: ACCOUNT,
        navigate: jest.fn()
      })
    )
  }
  const CHECKING_GAS = { write: { status: 'checkingGas', write: 'ownerWrite' } }
  const CONFIRMING = {
    write: {
      status: 'landed',
      write: 'ownerWrite',
      transactionHash: HASH,
      receipt: { transactionHash: HASH, status: 1 }
    },
    after: { stage: 'confirming' }
  }

  it('says it looks up the setup in place of the save while the stored write is read', async () => {
    const view = await mountReview({ lookup: 'reading' })
    expect(view.textOf('manage-review-lookup')).toBe(t('socialRecovery.loading.unfinishedSave'))
    expect(
      view.byTestId('manage-review-lookup')?.querySelector('[data-testid="loading-row"]')
    ).not.toBeNull()
    expect(view.byTestId('manage-review-save')).toBeNull()
    view.unmount()
  })

  it('keeps the save on screen, held, beside the line that says the fee is checked while the gas check runs', async () => {
    const view = await mountReview(CHECKING_GAS)
    expect(view.byTestId('manage-review-arrival')).not.toBeNull()
    expect(view.byTestId('manage-review-account')).not.toBeNull()
    expect(view.byTestId('manage-review-rule-line-0')).not.toBeNull()
    expect(view.textOf('manage-review-run-checkingGas')).toContain(t('socialRecovery.loading.fee'))
    expect(
      view.byTestId('manage-review-run-checkingGas')?.querySelector('[data-testid="loading-row"]')
    ).not.toBeNull()
    expect(view.isDisabled('manage-review-save')).toBe(true)
    await view.press('manage-review-save')
    expect(mockWorld.run.start).not.toHaveBeenCalled()
    view.unmount()
  })

  it('keeps the landed hash beside the line that says the result is read after the save lands', async () => {
    const view = await mountReview(CONFIRMING)
    expect(view.textOf('manage-review-confirming')).toContain(t('socialRecovery.loading.landed'))
    expect(
      view.byTestId('manage-review-confirming')?.querySelector('[data-testid="loading-block"]')
    ).not.toBeNull()
    expect(view.byTestId('manage-review-confirming-hash')).not.toBeNull()
    view.unmount()
  })

  it('keeps the reviewed changes on screen, with the landed line in place of the save, while the result is read', async () => {
    const view = await mountReview(CONFIRMING)
    expect(view.byTestId('manage-review-arrival')).not.toBeNull()
    expect(view.byTestId('manage-review-account')).not.toBeNull()
    expect(view.byTestId('manage-review-rule-line-0')).not.toBeNull()
    expect(
      view
        .byTestId('manage-review-arrival')
        ?.querySelector('[data-testid="manage-review-confirming"]')
    ).not.toBeNull()
    expect(view.textOf('manage-review-confirming')).toContain(t('socialRecovery.loading.landed'))
    expect(view.byTestId('manage-review-save')).toBeNull()
    view.unmount()
  })

  it('says it looks up the setup in place of the removal while the stored write is read', async () => {
    const view = await mountRemoval({ lookup: 'reading' })
    expect(view.textOf('manage-remove-lookup')).toBe(t('socialRecovery.loading.unfinishedSave'))
    expect(
      view.byTestId('manage-remove-lookup')?.querySelector('[data-testid="loading-row"]')
    ).not.toBeNull()
    expect(view.byTestId('manage-remove-action')).toBeNull()
    view.unmount()
  })

  it('keeps the removal on screen, held, beside the line that says the fee is checked while the gas check runs', async () => {
    const view = await mountRemoval(CHECKING_GAS)
    expect(view.textOf('manage-remove-body')).toBe(t(`${REMOVE}.body`))
    const field = view.byTestId('manage-remove-word')
    const input = field instanceof HTMLInputElement ? field : field?.querySelector('input')
    expect(input?.readOnly || input?.disabled).toBe(true)
    expect(view.textOf('manage-remove-run-checkingGas')).toContain(t('socialRecovery.loading.fee'))
    expect(
      view.byTestId('manage-remove-run-checkingGas')?.querySelector('[data-testid="loading-row"]')
    ).not.toBeNull()
    expect(view.isDisabled('manage-remove-action')).toBe(true)
    await view.press('manage-remove-action')
    expect(mockWorld.run.start).not.toHaveBeenCalled()
    view.unmount()
  })

  it('keeps the landed hash beside the line that says the result is read after the removal lands', async () => {
    const view = await mountRemoval(CONFIRMING)
    expect(view.textOf('manage-remove-confirming')).toContain(t('socialRecovery.loading.landed'))
    expect(
      view.byTestId('manage-remove-confirming')?.querySelector('[data-testid="loading-block"]')
    ).not.toBeNull()
    expect(view.byTestId('manage-remove-confirming-hash')).not.toBeNull()
    view.unmount()
  })

  it('keeps the removal on screen, its word read-only, with the landed line in place of the action, while the result is read', async () => {
    const view = await mountRemoval(CONFIRMING)
    expect(view.textOf('manage-remove-body')).toBe(t(`${REMOVE}.body`))
    const field = view.byTestId('manage-remove-word')
    const input = field instanceof HTMLInputElement ? field : field?.querySelector('input')
    expect(input?.readOnly || input?.disabled).toBe(true)
    expect(
      view
        .byTestId('manage-remove-arrival')
        ?.querySelector('[data-testid="manage-remove-confirming"]')
    ).not.toBeNull()
    expect(view.textOf('manage-remove-confirming')).toContain(t('socialRecovery.loading.landed'))
    expect(view.byTestId('manage-remove-action')).toBeNull()
    view.unmount()
  })
})

describe('the review and the removal once a recovery moved control away from this wallet', () => {
  /** The overview's facts read that an executed attempt left no key this wallet holds signing. */
  const moveControl = () => {
    const reads = readsOf(false)
    mockWorld.reads = {
      ...reads,
      facts: { ...reads.facts, value: { ...reads.facts.value, movedBy: 3n } }
    }
  }

  /**
   * The screen's own write stored as sent and its run following it, then the
   * facts read that control moved away: the run stays drawn and the screen
   * stays.
   */
  const followingOwnWrite = async (
    stage: typeof ReviewStageView | typeof RemoveStageView,
    intent: ManageIntent
  ) => {
    const { records, session } = await given({
      clauses: COMMITTED,
      trustAnswered: true,
      attemptOpen: false
    })
    const requestId = `${newSendRequestId()}${MANAGE_INTENT_MARKS[intent]}`
    const inFlight = records.saveInFlight(CHAIN_ID, ACCOUNT)
    await inFlight.claim({
      draft: REMOVAL_DRAFT,
      prepared: { kind: 'call', target: ACCOUNT, value: 0n, data: '0x' } as never,
      requestId,
      claimedAt: Date.now()
    })
    await inFlight.markSent(requestId, '0x01', 1)
    mockWorld.run = {
      ...idleRun(),
      state: {
        write: { status: 'submitting', write: 'ownerWrite', transactionHash: '0x01', run: 1 },
        after: { stage: 'none' },
        lookup: 'none'
      }
    }
    moveControl()
    const navigate = jest.fn()
    const view = await mount(
      React.createElement(stage, {
        records,
        session,
        chainId: CHAIN_ID,
        account: ACCOUNT,
        navigate
      })
    )
    await settle()
    return { view, navigate }
  }

  it('keeps a removal following its own write in flight drawn once control moved away', async () => {
    const { view, navigate } = await followingOwnWrite(RemoveStageView, 'manageRemove')
    expect(navigate).not.toHaveBeenCalledWith('social-recovery/manage')
    expect(view.byTestId('manage-remove-run-submitting')).not.toBeNull()
    expect(view.textOf('manage-remove-body')).toBe(t(`${REMOVE}.body`))
    view.unmount()
  })

  it('keeps a review following its own save in flight drawn once control moved away', async () => {
    const { view, navigate } = await followingOwnWrite(ReviewStageView, 'manageEdit')
    expect(navigate).not.toHaveBeenCalledWith('social-recovery/manage')
    expect(view.byTestId('manage-review-run-submitting')).not.toBeNull()
    expect(view.byTestId('manage-review-account')).not.toBeNull()
    view.unmount()
  })

  it('sends a removal opened by its address to the overview, with nothing of the removal drawn', async () => {
    const { records, session } = await given({
      clauses: COMMITTED,
      trustAnswered: true,
      attemptOpen: false
    })
    moveControl()
    const navigate = jest.fn()
    const view = await mount(
      React.createElement(RemoveStageView, {
        records,
        session,
        chainId: CHAIN_ID,
        account: ACCOUNT,
        navigate
      })
    )
    expect(navigate).toHaveBeenCalledWith('social-recovery/manage')
    expect(view.byTestId('manage-remove-reads')).toBeNull()
    expect(view.byTestId('manage-remove-arrival')).toBeNull()
    view.unmount()
  })

  it('sends a review opened by its address to the overview, with no save drawn', async () => {
    const { records, session } = await given({
      clauses: [review.group(1, ALICE, BOB)],
      trustAnswered: true,
      attemptOpen: false
    })
    moveControl()
    const navigate = jest.fn()
    const view = await mount(
      React.createElement(ReviewStageView, {
        records,
        session,
        chainId: CHAIN_ID,
        account: ACCOUNT,
        navigate
      })
    )
    expect(navigate).toHaveBeenCalledWith('social-recovery/manage')
    expect(view.byTestId('manage-review-reads')).toBeNull()
    expect(view.byTestId('manage-review-save')).toBeNull()
    view.unmount()
  })
})
