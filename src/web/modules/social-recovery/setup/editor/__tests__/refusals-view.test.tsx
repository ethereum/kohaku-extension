/**
 * @jest-environment jsdom
 *
 * The editor's own refusals at continue and its rules panel, mounted over the
 * setup records on an in-memory storage with a fake path check. A shape this
 * wallet refuses stays on screen named in the wallet's words and never
 * reaches the path check; an edit clears it; a path with no refusal goes to
 * the path check. The rules panel is always there, the same nine lines.
 *
 * jsdom has no `TextEncoder`, which viem needs when its modules load, so the
 * test sets Node's first and loads the modules after it.
 */
import { TextDecoder, TextEncoder } from 'util'

import type {
  Clause,
  Finding,
  SetupDraft,
  ValidationResult
} from '@web/modules/social-recovery/sdk-interfaces'

import type { Root, Validate } from '@web/modules/social-recovery/setup/editor/__tests__/harness'

Object.assign(globalThis, { TextEncoder, TextDecoder })

// React only runs effects and state updates inside act() when this flag is set.
;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true

const React = jest.requireActual<typeof import('react')>('react')
const { createRoot } = jest.requireActual<typeof import('react-dom/client')>('react-dom/client')
const { act } = jest.requireActual<typeof import('react-dom/test-utils')>('react-dom/test-utils')
const en = jest.requireActual<typeof import('@common/config/localization/translations/en.json')>(
  '@common/config/localization/translations/en.json'
)
const i18n = jest.requireActual<typeof import('@common/config/localization')>(
  '@common/config/localization'
).default
const { WEB_ROUTES } = jest.requireActual<typeof import('@common/modules/router/constants/common')>(
  '@common/modules/router/constants/common'
)
const EditorView = jest.requireActual<
  typeof import('@web/modules/social-recovery/setup/editor/EditorView')
>('@web/modules/social-recovery/setup/editor/EditorView').default
const { emptySlotOf } = jest.requireActual<
  typeof import('@web/modules/social-recovery/setup/editor/operations')
>('@web/modules/social-recovery/setup/editor/operations')
const { AADHAAR, ALICE, BOB, BOOK, makeRecords, PASSKEY, PASSPORT, presetPath } =
  jest.requireActual<typeof import('@web/modules/social-recovery/setup/editor/__tests__/harness')>(
    '@web/modules/social-recovery/setup/editor/__tests__/harness'
  )

const { refusals, rules } = en.socialRecovery.editor
const groupLabel = (n: number) => i18n.t('socialRecovery.shape.group', { n })
const EMPTY_GROUP_SLOT = i18n.t('socialRecovery.editor.refusals.emptyGroupSlot')

/** Two to the 48 seconds, the first wait a 48-bit field cannot hold. */
const TWO_TO_THE_48 = 281474976710656n

const draftOf = (clauses: Clause[], wait = 259200n): SetupDraft => ({
  wait,
  clauses,
  ignoresPause: false,
  privacy: { publicMetadata: '0x', backup: 'encrypted' }
})

const NO_FINDING: ValidationResult = { errors: [], warnings: [] }
const finding = (code: Finding['code']): Finding => ({ code, subject: 'setup', values: {} })

let container: HTMLDivElement
let root: Root

beforeEach(() => {
  container = document.createElement('div')
  document.body.appendChild(container)
  root = createRoot(container)
})

afterEach(() => {
  act(() => root.unmount())
  container.remove()
})

const settle = () =>
  act(async () => {
    await new Promise((resolve) => {
      setTimeout(resolve, 0)
    })
  })

const byTestId = (id: string) => container.querySelector<HTMLElement>(`[data-testid="${id}"]`)
const refusalItems = () =>
  Array.from(
    container.querySelectorAll<HTMLElement>('[data-testid="editor-wallet-refusal-item"]'),
    (item) => [
      item.querySelector('[data-testid="editor-wallet-refusal-place"]')?.textContent ?? null,
      item.querySelector('[data-testid="editor-wallet-refusal"]')?.textContent
    ]
  )
const allByTestId = (id: string) =>
  Array.from(
    container.querySelectorAll<HTMLElement>(`[data-testid="${id}"]`),
    (node) => node.textContent
  )

const press = async (id: string) => {
  const node = byTestId(id)
  if (!node) {
    throw new Error(`nothing on screen with the test id ${id}`)
  }
  act(() => node.click())
  await settle()
}

const typeThreshold = async (id: string, value: string) => {
  const input = byTestId(id) as HTMLInputElement
  const setValue = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set
  act(() => {
    setValue?.call(input, value)
    input.dispatchEvent(new Event('input', { bubbles: true }))
  })
  await settle()
}

const mount = async ({
  clauses,
  wait,
  validate = async () => NO_FINDING
}: { clauses?: Clause[]; wait?: bigint; validate?: Validate } = {}) => {
  const { records, storage } = makeRecords()
  if (clauses) {
    await records.setupDraft.write(draftOf(clauses, wait))
    await records.path.write(clauses)
  }
  const validateSetup = jest.fn(validate)
  const navigate = jest.fn()
  await act(async () => {
    root.render(
      <EditorView
        records={records}
        client={{ status: 'ready', setup: { validateSetup } }}
        addressBook={BOOK}
        navigate={navigate}
      />
    )
  })
  await settle()
  return { validateSetup, navigate, storage }
}

const PANEL = [
  rules.requiredAnswers,
  rules.enoughMembers,
  rules.thresholdAtLeastOne,
  rules.thresholdCeiling,
  rules.memberCeiling,
  rules.oneRowPerMethod,
  rules.atLeastOneMethod,
  rules.smallEnough,
  rules.zeroThresholdOwnRule
]

describe('continue with a shape this wallet refuses', () => {
  it('renders the refusal, stays, and never runs the path check', async () => {
    const { validateSetup, navigate } = await mount({ clauses: presetPath() })
    await typeThreshold('editor-group-1-threshold', '4')
    await press('editor-continue')
    expect(allByTestId('editor-wallet-refusal')).toEqual([refusals.thresholdAboveMembers])
    expect(validateSetup).not.toHaveBeenCalled()
    expect(navigate).not.toHaveBeenCalled()
    expect(byTestId('editor-findings')).toBeNull()
  })

  it('renders one line per refusal, in the order the path reads', async () => {
    const { validateSetup } = await mount({
      clauses: [
        { threshold: 0, credentials: [] },
        { threshold: 4, credentials: [ALICE, AADHAAR] }
      ]
    })
    await press('editor-continue')
    expect(allByTestId('editor-wallet-refusal')).toEqual([
      refusals.emptyGroup,
      refusals.thresholdBelowOneOwnRule,
      refusals.thresholdAboveMembers
    ])
    expect(validateSetup).not.toHaveBeenCalled()
  })

  it("renders zero beside a required row with the wallet's own-rule sentence", async () => {
    await mount({ clauses: presetPath() })
    await typeThreshold('editor-group-1-threshold', '0')
    await press('editor-continue')
    expect(allByTestId('editor-wallet-refusal')).toEqual([refusals.thresholdBelowOneOwnRule])
  })

  it('refuses a preset whose group still has unfilled slots with the unfilled-slot sentence', async () => {
    const { validateSetup } = await mount({
      clauses: [
        { threshold: 1, credentials: [PASSKEY] },
        { threshold: 2, credentials: [ALICE, emptySlotOf('ecdsa'), emptySlotOf('zkpassport')] }
      ]
    })
    await press('editor-continue')
    expect(allByTestId('editor-wallet-refusal')).toEqual([EMPTY_GROUP_SLOT])
    expect(validateSetup).not.toHaveBeenCalled()
  })

  it('refuses a group of two of three with two enrolled members and one unfilled slot, and never runs the path check', async () => {
    const { validateSetup, navigate } = await mount({
      clauses: [
        { threshold: 1, credentials: [PASSKEY] },
        { threshold: 2, credentials: [ALICE, BOB, emptySlotOf('zkpassport')] }
      ]
    })
    await press('editor-continue')
    expect(refusalItems()).toEqual([[groupLabel(1), EMPTY_GROUP_SLOT]])
    expect(validateSetup).not.toHaveBeenCalled()
    expect(navigate).not.toHaveBeenCalled()
  })

  it('holds continue on a held threshold text in a group with an unfilled slot, and shows no refusal', async () => {
    const { validateSetup, navigate } = await mount({
      clauses: [
        { threshold: 1, credentials: [PASSKEY] },
        { threshold: 2, credentials: [ALICE, BOB, emptySlotOf('zkpassport')] }
      ]
    })
    await typeThreshold('editor-group-1-threshold', '1.5')
    await press('editor-continue')
    expect(byTestId('editor-wallet-refusals')).toBeNull()
    expect(validateSetup).not.toHaveBeenCalled()
    expect(navigate).not.toHaveBeenCalled()
  })

  it('leaves a stored wait past the field width to the waiting period and continues to it', async () => {
    const { validateSetup, navigate } = await mount({ clauses: presetPath(), wait: TWO_TO_THE_48 })
    await press('editor-continue')
    expect(byTestId('editor-wallet-refusals')).toBeNull()
    expect(validateSetup).toHaveBeenCalledWith(draftOf(presetPath(), TWO_TO_THE_48))
    expect(navigate).toHaveBeenCalledWith(WEB_ROUTES.socialRecoverySetupWaitingPeriod)
  })

  it('refuses a required row whose slot is unfilled with the required sentence', async () => {
    const { validateSetup } = await mount({
      clauses: [
        { threshold: 1, credentials: [emptySlotOf('passkey')] },
        { threshold: 2, credentials: [ALICE, AADHAAR] }
      ]
    })
    await press('editor-continue')
    expect(allByTestId('editor-wallet-refusal')).toEqual([refusals.emptyRequired])
    expect(validateSetup).not.toHaveBeenCalled()
  })

  it('refuses a group left with one unfilled slot as an empty group, the role the editor shows', async () => {
    const { validateSetup } = await mount({
      clauses: [
        { threshold: 1, credentials: [PASSKEY] },
        { threshold: 1, credentials: [ALICE, emptySlotOf('ecdsa')] }
      ]
    })
    await press('editor-member-1-0-remove')
    await press('editor-continue')
    expect(allByTestId('editor-wallet-refusal')).toEqual([refusals.emptyGroup])
    expect(validateSetup).not.toHaveBeenCalled()
  })

  it('heads each clause refusal with its clause, so two groups refused alike are told apart', async () => {
    await mount({
      clauses: [
        { threshold: 1, credentials: [emptySlotOf('passkey')] },
        { threshold: 2, credentials: [] },
        { threshold: 2, credentials: [] }
      ]
    })
    await press('editor-continue')
    expect(refusalItems()).toEqual([
      [en.socialRecovery.editor.requiredHeader, refusals.emptyRequired],
      [groupLabel(1), refusals.emptyGroup],
      [groupLabel(2), refusals.emptyGroup]
    ])
  })

  it('heads a refused required row and a refused second group with their own labels, past a sound first group', async () => {
    await mount({
      clauses: [
        { threshold: 1, credentials: [emptySlotOf('passkey')] },
        { threshold: 2, credentials: [ALICE, AADHAAR] },
        { threshold: 2, credentials: [] }
      ]
    })
    await press('editor-continue')
    expect(refusalItems()).toEqual([
      [en.socialRecovery.editor.requiredHeader, refusals.emptyRequired],
      [groupLabel(2), refusals.emptyGroup]
    ])
  })

  it('clears the refusal on the next edit, and then runs the path check', async () => {
    const { validateSetup, navigate } = await mount({
      clauses: [
        { threshold: 1, credentials: [PASSKEY] },
        { threshold: 2, credentials: [] }
      ]
    })
    await press('editor-continue')
    expect(allByTestId('editor-wallet-refusal')).toEqual([refusals.emptyGroup])

    await press('editor-group-1-remove')
    expect(byTestId('editor-wallet-refusals')).toBeNull()

    await press('editor-continue')
    expect(validateSetup).toHaveBeenCalledWith(draftOf([{ threshold: 1, credentials: [PASSKEY] }]))
    expect(navigate).toHaveBeenCalledWith(WEB_ROUTES.socialRecoverySetupWaitingPeriod)
  })
})

describe('continue with a shape this wallet can save', () => {
  it('runs the path check on a group of two of three once all three members are enrolled', async () => {
    const clauses = [
      { threshold: 1, credentials: [PASSKEY] },
      { threshold: 2, credentials: [ALICE, BOB, PASSPORT] }
    ]
    const { validateSetup, navigate } = await mount({ clauses })
    await press('editor-continue')
    expect(byTestId('editor-wallet-refusals')).toBeNull()
    expect(validateSetup).toHaveBeenCalledWith(draftOf(clauses))
    expect(navigate).toHaveBeenCalledWith(WEB_ROUTES.socialRecoverySetupWaitingPeriod)
  })

  it('runs the path check and shows no refusal of its own', async () => {
    const { validateSetup, navigate } = await mount({ clauses: presetPath() })
    await press('editor-continue')
    expect(validateSetup).toHaveBeenCalledWith(draftOf(presetPath()))
    expect(navigate).toHaveBeenCalledWith(WEB_ROUTES.socialRecoverySetupWaitingPeriod)
    expect(byTestId('editor-wallet-refusals')).toBeNull()
  })

  it('renders a rule too wide for a block as the "path too large" sentence and stays', async () => {
    const { navigate } = await mount({
      clauses: presetPath(),
      validate: async () => ({ errors: [finding('rule.too-wide')], warnings: [] })
    })
    await press('editor-continue')
    expect(allByTestId('editor-finding')).toEqual([refusals.tooLarge])
    expect(byTestId('editor-wallet-refusals')).toBeNull()
    expect(navigate).not.toHaveBeenCalled()
  })

  it('leaves a wait finding to the waiting period and continues to it when it is the only error', async () => {
    const { validateSetup, navigate } = await mount({
      clauses: presetPath(),
      validate: async () => ({ errors: [finding('wait.field-width')], warnings: [] })
    })
    await press('editor-continue')
    expect(validateSetup).toHaveBeenCalledTimes(1)
    expect(navigate).toHaveBeenCalledWith(WEB_ROUTES.socialRecoverySetupWaitingPeriod)
    expect(byTestId('editor-findings')).toBeNull()
  })

  it('stays on a clause finding beside a wait finding and renders the clause finding alone', async () => {
    const { navigate } = await mount({
      clauses: presetPath(),
      validate: async () => ({
        errors: [finding('wait.field-width'), finding('clause.empty')],
        warnings: []
      })
    })
    await press('editor-continue')
    expect(allByTestId('editor-finding')).toEqual([refusals.emptyGroup])
    expect(container.textContent).not.toContain(refusals.waitFieldWidth)
    expect(container.textContent).not.toContain(refusals.waitCeiling)
    expect(navigate).not.toHaveBeenCalled()
  })

  it('renders a backup too wide and an unsupported action each with its own sentence', async () => {
    await mount({
      clauses: presetPath(),
      validate: async () => ({
        errors: [finding('backup.too-wide'), finding('action.unsupported')],
        warnings: []
      })
    })
    await press('editor-continue')
    expect(allByTestId('editor-finding')).toEqual([
      refusals.backupTooWide,
      refusals.actionUnsupported
    ])
  })
})

describe('the rules panel', () => {
  it('lists the header and the nine rules in order on an empty editor', async () => {
    await mount()
    expect(byTestId('editor-rules-header')?.textContent).toBe(rules.header)
    expect(allByTestId('editor-rules-line')).toEqual(PANEL)
  })

  it('stays the same beside a refusal and is never one itself', async () => {
    await mount({
      clauses: [
        { threshold: 1, credentials: [PASSKEY] },
        { threshold: 2, credentials: [] }
      ]
    })
    await press('editor-continue')
    expect(allByTestId('editor-rules-line')).toEqual(PANEL)
    const panel = byTestId('editor-rules')
    expect(panel?.querySelector('[data-testid="editor-wallet-refusal"]')).toBeNull()
    expect(
      byTestId('editor-wallet-refusals')?.querySelector('[data-testid="editor-rules-line"]')
    ).toBeNull()
  })
})

describe('the order of the sections on screen', () => {
  it('reads the rule lines, the rules panel, the write failure, the refusals, then continue', async () => {
    const { storage } = await mount({ clauses: presetPath() })
    storage.rejectOnce('set', 'setupDraft')
    const addGroup = byTestId('editor-add-group')
    const next = byTestId('editor-continue')
    act(() => {
      addGroup?.click()
      next?.click()
    })
    await settle()

    const sections = [
      'editor-rule-lines',
      'editor-rules',
      'editor-write-failed',
      'editor-wallet-refusals',
      'editor-continue'
    ].map((id) => {
      const node = byTestId(id)
      if (!node) {
        throw new Error(`nothing on screen with the test id ${id}`)
      }
      return node
    })
    sections.slice(1).forEach((node, index) => {
      // eslint-disable-next-line no-bitwise
      expect(sections[index].compareDocumentPosition(node) & Node.DOCUMENT_POSITION_FOLLOWING).toBe(
        Node.DOCUMENT_POSITION_FOLLOWING
      )
    })
  })
})
