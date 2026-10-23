/**
 * @jest-environment jsdom
 *
 * The edit page over a committed path: one title, the management editor's
 * own over the setup's editor, the committed values above the action that
 * opens the review of changes, and every member of a group at its threshold
 * marked still needed, its removal held with the reason beside it, while a
 * member of a group with room to lose one stays removable; a page left before
 * its read of a stored write answered sends the tab nowhere. The client, the
 * reads and the committed level are the screen's seams, each given here; the
 * records sit on an in-memory storage.
 */
import { TextDecoder, TextEncoder } from 'util'

import type {
  ScreensWorld,
  ValidatingClientSeam
} from '@web/modules/social-recovery/management/editor/__fixtures__/types'
import type { Configuration } from '@kohaku-eth/social-recovery'

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

const mockWorld: Pick<ScreensWorld, 'client' | 'reads'> = { client: null, reads: null }

jest.mock('@common/utils/clipboard', () => ({ setStringAsync: async () => true }))
jest.mock('@web/modules/social-recovery/management/overview/useHeldKeys', () => {
  const held: string[] = []
  return { useHeldKeys: () => held }
})
jest.mock('@common/hooks/useNavigation', () => ({
  __esModule: true,
  default: () => ({ navigate: jest.fn() })
}))
// The route's chrome is not drawn here: the stage view renders inside it.
jest.mock('@web/modules/social-recovery/shared/chrome/SetupChrome', () => ({
  __esModule: true,
  default: () => null
}))
jest.mock('@web/modules/social-recovery/shared/chrome/useSetupAccount', () => ({
  __esModule: true,
  default: () => ({})
}))
// A guardian's avatar is an image Jest cannot draw.
jest.mock('@common/components/Avatar', () => ({ __esModule: true, default: () => null }))
jest.mock('@web/modules/social-recovery/shared/client/useRecoveryClient', () => ({
  useRecoveryClient: () => mockWorld.client
}))
jest.mock('@web/modules/social-recovery/management/overview/useOverviewReads', () => ({
  useOverviewReads: () => mockWorld.reads
}))
jest.mock('@web/modules/social-recovery/management/editor/useCommittedLevel', () => ({
  useCommittedLevel: () => ({ level: { status: 'answered', value: 'public' }, retry: () => {} })
}))

/* eslint-disable @typescript-eslint/no-var-requires, global-require */
const React: typeof import('react') = require('react')
const {
  act,
  mount,
  settle,
  t
}: typeof import('@web/modules/social-recovery/cancel/__fixtures__/mount') = require('@web/modules/social-recovery/cancel/__fixtures__/mount')
const review: typeof import('@web/modules/social-recovery/setup/review/__fixtures__/review') = require('@web/modules/social-recovery/setup/review/__fixtures__/review')
const {
  EditStageView
}: typeof import('@web/modules/social-recovery/management/editor/EditScreen') = require('@web/modules/social-recovery/management/editor/EditScreen')
const ValuesBlock: typeof import('@web/modules/social-recovery/management/editor/ValuesBlock').default =
  require('@web/modules/social-recovery/management/editor/ValuesBlock').default
const {
  editSessionOf
}: typeof import('@web/modules/social-recovery/management/editor/session') = require('@web/modules/social-recovery/management/editor/session')
const {
  newSendRequestId
}: typeof import('@web/modules/social-recovery/shared/client') = require('@web/modules/social-recovery/shared/client')
const {
  MANAGE_INTENT_MARKS
}: typeof import('@web/modules/social-recovery/shared/writes') = require('@web/modules/social-recovery/shared/writes')
const {
  createWalletRecords
}: typeof import('@web/modules/social-recovery/shared/records') = require('@web/modules/social-recovery/shared/records')
const {
  makeStorage
}: typeof import('@web/modules/social-recovery/shared/records/__fixtures__/storage') = require('@web/modules/social-recovery/shared/records/__fixtures__/storage')
/* eslint-enable @typescript-eslint/no-var-requires, global-require */

const { ACCOUNT, ALICE, BOB, CHAIN_ID } = review
const EDITOR = 'socialRecovery.management.editor'
const CAROL = { ...ALICE, config: `0x${'0c'.repeat(32)}` as const }
const DAVE = { ...ALICE, config: `0x${'0d'.repeat(32)}` as const }

// A group that needs both of its members, and a group that needs one of two.
const COMMITTED: Configuration = {
  clauses: [review.group(2, ALICE, BOB), review.group(1, CAROL, DAVE)],
  wait: 172_800,
  ignoresPause: true
}

const editPage = async (
  records: ReturnType<typeof createWalletRecords> = createWalletRecords({ storage: makeStorage() }),
  navigate: (to: string) => void = jest.fn(),
  movedBy: bigint | undefined = undefined
) => {
  const storage = makeStorage()
  const session = editSessionOf(storage, CHAIN_ID, ACCOUNT)
  Object.assign(mockWorld, {
    client: {
      status: 'ready',
      client: {
        chain: 'sepolia',
        setup: { validateSetup: jest.fn() },
        moduleReads: {},
        walletReads: {}
      },
      reads: {},
      receipts: {},
      retry: jest.fn()
    },
    reads: {
      facts: {
        status: 'answered',
        value: {
          setup: { ...review.setupStateOf(true), setupNonce: 2n },
          attemptOpen: false,
          ...(movedBy !== undefined ? { movedBy } : {})
        }
      },
      path: { kind: 'readable', configuration: COMMITTED },
      ask: { status: 'idle' },
      notices: { status: 'pending' },
      cached: null,
      retry: jest.fn(),
      retryPath: jest.fn(),
      retryNotices: jest.fn(),
      unlock: jest.fn(),
      askAgain: jest.fn()
    }
  })
  const view = await mount(
    React.createElement(EditStageView, {
      records,
      session,
      chainId: CHAIN_ID,
      account: ACCOUNT,
      navigate
    })
  )
  return { view, records }
}

// Types into a threshold field the way a key press does, through the input's own value setter.
const typeThreshold = async (field: HTMLElement | null, value: string) => {
  const input = field as HTMLInputElement
  const setValue = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set
  act(() => {
    setValue?.call(input, value)
    input.dispatchEvent(new Event('input', { bubbles: true }))
  })
  await settle()
}

const before = (first: HTMLElement | null, second: HTMLElement | null): boolean => {
  if (!first || !second) {
    return false
  }
  const order = Array.from(document.querySelectorAll('[data-testid]'))
  return order.indexOf(first) < order.indexOf(second)
}

describe('the edit page', () => {
  it('sends an edit opened by its address to the overview once a recovery moved control away from this wallet', async () => {
    const navigate = jest.fn()
    const { view } = await editPage(undefined, navigate, 3n)

    expect(navigate).toHaveBeenCalledWith('social-recovery/manage')
    expect(view.byTestId('manage-edit-reads')).toBeNull()
    expect(view.byTestId('editor-continue')).toBeNull()
    view.unmount()
  })

  it('says it reads the setup in a waiting block, with no editor, while the setup state has not answered', async () => {
    const first = await editPage()
    first.view.unmount()
    Object.assign(mockWorld, {
      reads: { ...(mockWorld.reads as object), facts: { status: 'pending' } }
    })
    const view = await mount(
      React.createElement(EditStageView, {
        records: first.records,
        session: editSessionOf(makeStorage(), CHAIN_ID, ACCOUNT),
        chainId: CHAIN_ID,
        account: ACCOUNT,
        navigate: jest.fn()
      })
    )

    expect(view.textOf('manage-edit-reads-reading')).toBe(t('socialRecovery.loading.lookup'))
    expect(
      view.byTestId('manage-edit-reads-reading')?.querySelector('[data-testid="loading-block"]')
    ).not.toBeNull()
    expect(view.byTestId('editor-continue')).toBeNull()
    view.unmount()
  })

  it('shows one title, the values above the review action, and that action in its words', async () => {
    const { view } = await editPage()

    expect(view.byTestId('manage-edit-title')).toBeNull()
    expect(view.textOf('editor-title')).toBe(t(`${EDITOR}.title`))
    expect(view.text().split(t(`${EDITOR}.title`))).toHaveLength(2)
    expect(view.text()).not.toContain(t('socialRecovery.editor.title'))
    expect(view.textOf('editor-continue')).toBe(t(`${EDITOR}.review`))
    expect(view.byTestId('manage-values')).not.toBeNull()
    expect(before(view.byTestId('manage-values'), view.byTestId('editor-continue'))).toBe(true)
    expect(view.textOf('manage-value-wait-change')).toBe(t(`${EDITOR}.values.change`))
    view.unmount()
  })

  it('holds the changes of the values while the path is checked, as the editor holds its own edits, and keeps the cancel', async () => {
    const { view } = await editPage()
    const { validateSetup } = (mockWorld.client as unknown as ValidatingClientSeam).client.setup
    let fail: (reason: Error) => void = () => {}
    validateSetup.mockImplementation(
      () =>
        new Promise((_, reject) => {
          fail = reject
        })
    )
    const held = ['manage-value-wait-change', 'manage-value-privacy-change']
    held.forEach((id) => expect(view.isDisabled(id)).toBe(false))

    await view.press('editor-continue')
    expect(validateSetup).toHaveBeenCalledTimes(1)
    expect(view.byTestId('editor-waiting')).not.toBeNull()
    expect(view.isDisabled('editor-continue')).toBe(true)
    held.forEach((id) => expect(view.isDisabled(id)).toBe(true))
    expect(view.isDisabled('manage-edit-cancel')).toBe(false)

    await act(async () => fail(new Error('node unavailable')))
    await settle()
    expect(view.byTestId('editor-waiting')).toBeNull()
    held.forEach((id) => expect(view.isDisabled(id)).toBe(false))
    view.unmount()
  })

  it('marks every member its group cannot lose with the reason, and offers one action in place of its remove', async () => {
    const { view, records } = await editPage()

    ;[0, 1].forEach((member) => {
      expect(view.byTestId(`editor-member-0-${member}-still-needed`)).not.toBeNull()
      expect(view.byTestId(`editor-member-0-${member}-remove`)).toBeNull()
      expect(view.textOf(`editor-member-0-${member}-lower-and-remove`)).toBe(
        t(`${EDITOR}.stillNeeded.action`)
      )
      expect(view.textOf(`editor-member-0-${member}-still-needed-reason`)).toBe(
        t(`${EDITOR}.stillNeeded.body`, { required: 2, count: 2 })
      )
    })
    expect(view.byTestId('editor-member-1-0-still-needed')).toBeNull()
    expect(view.byTestId('editor-member-1-0-lower-and-remove')).toBeNull()
    expect(view.isDisabled('editor-member-1-0-remove')).toBe(false)

    await view.press('editor-member-1-0-remove')
    const removed = await records.setup(CHAIN_ID, ACCOUNT).setupDraft.read()
    expect(removed.status === 'present' && removed.value.clauses[1].credentials).toHaveLength(1)
    view.unmount()
  })

  it('lowers the threshold by one and removes the held member in one tap, and the group holds no chip after', async () => {
    const { view, records } = await editPage()

    await view.press('editor-member-0-0-lower-and-remove')
    await settle()
    const edited = await records.setup(CHAIN_ID, ACCOUNT).setupDraft.read()
    expect(edited.status === 'present' && edited.value.clauses[0]).toEqual({
      threshold: 1,
      credentials: [COMMITTED.clauses[0].credentials[1]]
    })
    expect(view.byTestId('editor-member-0-0-still-needed')).toBeNull()
    expect(view.byTestId('editor-member-0-0-lower-and-remove')).toBeNull()
    expect(view.byTestId('editor-member-0-0-remove')).not.toBeNull()
    view.unmount()
  })

  it('keeps a typed threshold above the members when a member is removed, and the refusal stays', async () => {
    const { view, records } = await editPage()

    await typeThreshold(view.byTestId('editor-group-0-threshold'), '3')
    expect(view.byTestId('editor-group-0-above-members')).not.toBeNull()
    await view.press('editor-member-0-0-remove')
    await settle()
    const edited = await records.setup(CHAIN_ID, ACCOUNT).setupDraft.read()
    expect(edited.status === 'present' && edited.value.clauses[0]).toEqual({
      threshold: 3,
      credentials: [COMMITTED.clauses[0].credentials[1]]
    })
    expect(view.byTestId('editor-group-0-above-members')).not.toBeNull()
    view.unmount()
  })

  it('sends the tab nowhere where the page was left before its read of a stored write answered', async () => {
    const records = createWalletRecords({ storage: makeStorage() })
    let answer: (read: unknown) => void = () => undefined
    const { saveInFlight } = records
    records.saveInFlight = (...args) => ({
      ...saveInFlight(...args),
      read: () =>
        new Promise((resolve) => {
          answer = resolve as (read: unknown) => void
        })
    })
    const navigate = jest.fn()
    const { view } = await editPage(records, navigate)
    expect(view.textOf('manage-edit-opening')).toBe(t('socialRecovery.loading.draft'))
    expect(
      view.byTestId('manage-edit-opening')?.querySelector('[data-testid="loading-block"]')
    ).not.toBeNull()

    view.unmount()
    answer({
      status: 'present',
      value: { requestId: `${newSendRequestId()}${MANAGE_INTENT_MARKS.manageRemove}` }
    })
    await new Promise((resolve) => {
      setTimeout(resolve, 0)
    })

    expect(navigate).not.toHaveBeenCalled()
  })

  it('shows the recovery password as changed or kept beside the action that changes it', async () => {
    const onStage = jest.fn()
    const valuesWith = (passwordChanged: boolean) =>
      mount(
        React.createElement(ValuesBlock, {
          draft: {
            wait: COMMITTED.wait,
            clauses: COMMITTED.clauses,
            ignoresPause: true,
            privacy: { publicMetadata: '0x', backup: 'encrypted' }
          },
          addressBook: review.BOOK,
          passwordChanged,
          stale: passwordChanged,
          disabled: false,
          onStage
        })
      )
    const cases: { changed: boolean; value: string }[] = [
      { changed: true, value: t(`${EDITOR}.values.passwordChanged`) },
      { changed: false, value: t(`${EDITOR}.values.passwordKept`) }
    ]
    // Awaited one after the other: each case mounts and unmounts its own page.
    await cases.reduce(async (previous, { changed, value }) => {
      await previous
      const view = await valuesWith(changed)
      expect(view.textOf('manage-value-password-text')).toBe(value)
      expect(view.text()).not.toContain(t(`${EDITOR}.changes.password`))
      expect(view.textOf('manage-value-password-change')).toBe(t(`${EDITOR}.password.action`))
      await view.press('manage-value-password-change')
      expect(onStage).toHaveBeenLastCalledWith('password')
      view.unmount()
    }, Promise.resolve())
  })
})
