/**
 * @jest-environment jsdom
 *
 * The editor mounted over the setup records on an in-memory storage, with a
 * fake path check. Every edit writes the draft and the path together, a
 * credential the path already holds is refused before anything is written,
 * the rule lines are the rule-lines lane's for the path as it stands, and
 * continue opens the waiting period only when the path check finds no error.
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
import type { Enrollment } from '@web/modules/social-recovery/shared/records'

import type {
  MountOptions,
  Root,
  Validate
} from '@web/modules/social-recovery/setup/editor/__tests__/harness'

Object.assign(globalThis, { TextEncoder, TextDecoder })

// React only runs effects and state updates inside act() when this flag is set.
;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true

const React = jest.requireActual<typeof import('react')>('react')
const { createRoot } = jest.requireActual<typeof import('react-dom/client')>('react-dom/client')
const { act } = jest.requireActual<typeof import('react-dom/test-utils')>('react-dom/test-utils')
const { t } = jest.requireActual<typeof import('@common/config/localization')>(
  '@common/config/localization'
).default
const en = jest.requireActual<typeof import('@common/config/localization/translations/en.json')>(
  '@common/config/localization/translations/en.json'
)
const { WEB_ROUTES } = jest.requireActual<typeof import('@common/modules/router/constants/common')>(
  '@common/modules/router/constants/common'
)
const { getRuleLines, renderRuleLines } = jest.requireActual<
  typeof import('@web/modules/social-recovery/shared/rule-lines')
>('@web/modules/social-recovery/shared/rule-lines')
const { renderShortAddress } = jest.requireActual<
  typeof import('@web/modules/social-recovery/shared/display')
>('@web/modules/social-recovery/shared/display')
const EditorView = jest.requireActual<
  typeof import('@web/modules/social-recovery/setup/editor/EditorView')
>('@web/modules/social-recovery/setup/editor/EditorView').default
const { emptySlotOf } = jest.requireActual<
  typeof import('@web/modules/social-recovery/setup/editor/operations')
>('@web/modules/social-recovery/setup/editor/operations')
const harness = jest.requireActual<
  typeof import('@web/modules/social-recovery/setup/editor/__tests__/harness')
>('@web/modules/social-recovery/setup/editor/__tests__/harness')
const {
  AADHAAR,
  ALICE,
  BOB,
  BOOK,
  CAROL,
  DAVE,
  enrolled,
  guardianAddress,
  guardianOf,
  makeRecords,
  PASSKEY,
  PASSPORT,
  presetPath,
  twoGroupPath
} = harness

const draftOf = (clauses: Clause[]): SetupDraft => ({
  wait: 259200n,
  clauses,
  ignoresPause: false,
  privacy: { publicMetadata: '0x', backup: 'encrypted' }
})

const NO_FINDING: ValidationResult = { errors: [], warnings: [] }
const finding = (code: Finding['code']): Finding => ({ code, subject: 'clause', values: {} })

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

/**
 * Lets the pending storage reads and writes settle, then renders what they
 * changed. The storage double answers in microtasks, which all run before a
 * timer fires.
 */
const settle = () =>
  act(async () => {
    await new Promise((resolve) => {
      setTimeout(resolve, 0)
    })
  })

const byTestId = (id: string) => container.querySelector<HTMLElement>(`[data-testid="${id}"]`)
const allByTestId = (id: string) =>
  Array.from(
    container.querySelectorAll<HTMLElement>(`[data-testid="${id}"]`),
    (node) => node.textContent
  )

const typeThreshold = async (id: string, value: string) => {
  const input = byTestId(id) as HTMLInputElement
  const setValue = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set
  act(() => {
    setValue?.call(input, value)
    input.dispatchEvent(new Event('input', { bubbles: true }))
  })
  await settle()
}

/** A control the holder cannot use: a button marked disabled, or a field made read-only. */
const isHeld = (id: string) => {
  const node = byTestId(id)
  if (!node) {
    throw new Error(`nothing on screen with the test id ${id}`)
  }
  return node instanceof HTMLInputElement
    ? node.readOnly
    : node.getAttribute('aria-disabled') === 'true'
}

const press = async (id: string) => {
  const node = byTestId(id)
  if (!node) {
    throw new Error(`nothing on screen with the test id ${id}`)
  }
  act(() => node.click())
  await settle()
}

const mount = async ({
  clauses,
  enrollments = [],
  validate = async () => NO_FINDING,
  client,
  retry = () => {},
  beforeRender
}: MountOptions = {}) => {
  const { storage, records } = makeRecords()
  if (clauses) {
    await records.setupDraft.write(draftOf(clauses))
    await records.path.write(clauses)
  }
  if (enrollments.length > 0) {
    await records.enrollments.write(enrollments)
  }
  beforeRender?.(storage)
  const validateSetup = jest.fn(validate)
  const navigate = jest.fn()
  const editorClient =
    client === 'loading'
      ? ({ status: 'loading' } as const)
      : client === 'refused'
      ? ({ status: 'failed', retry } as const)
      : client === 'update-the-wallet'
      ? ({ status: 'update-the-wallet', retry } as const)
      : ({ status: 'ready', setup: { validateSetup } } as const)
  const render = async () => {
    await act(async () => {
      root.render(
        <EditorView
          records={records}
          client={editorClient}
          addressBook={BOOK}
          navigate={navigate}
        />
      )
    })
    await settle()
  }
  await render()
  /** Leaves the editor and opens it again over what the storage holds. */
  const reopen = async () => {
    act(() => root.unmount())
    root = createRoot(container)
    await render()
  }
  const writesBefore = storage.sets.length
  const stored = async () => {
    const [draft, path] = await Promise.all([records.setupDraft.read(), records.path.read()])
    return {
      draft: draft.status === 'present' ? draft.value : null,
      path: path.status === 'present' ? path.value : null
    }
  }
  return { storage, records, validateSetup, navigate, stored, writesBefore, reopen }
}

const expectPathMatchesDraft = async (
  stored: () => Promise<{ draft: SetupDraft | null; path: Clause[] | null }>,
  clauses: Clause[]
) => {
  const { draft, path } = await stored()
  expect(draft?.clauses).toEqual(clauses)
  expect(path).toEqual(clauses)
}

describe('the editor on arrival', () => {
  it('reads "Adjust your path" over a stored preset', async () => {
    await mount({ clauses: presetPath() })
    expect(byTestId('editor-title')?.textContent).toBe(en.socialRecovery.editor.adjust.title)
  })

  it('reads "Build your path" over no draft, and over a draft with no clause', async () => {
    await mount()
    expect(byTestId('editor-title')?.textContent).toBe(en.socialRecovery.editor.build.title)
    act(() => root.unmount())
    root = createRoot(container)
    await mount({ clauses: [] })
    expect(byTestId('editor-title')?.textContent).toBe(en.socialRecovery.editor.build.title)
  })

  it('draws an empty slot as a row of its kind with the "Not yet active" chip and no address', async () => {
    await mount({ clauses: [{ threshold: 2, credentials: [emptySlotOf('ecdsa'), ALICE] }] })
    const slot = byTestId('editor-slot-0-0')?.textContent ?? ''
    expect(slot).toContain(en.socialRecovery.display.nouns.guardian)
    expect(slot).toContain(en.socialRecovery.status.method.notYetActive)
    expect(slot).not.toMatch(/0x/)
  })

  it('goes back to the setup start', async () => {
    const { navigate } = await mount({ clauses: presetPath() })
    await press('editor-back')
    expect(navigate).toHaveBeenCalledWith(WEB_ROUTES.socialRecoverySetup)
  })
})

describe('every edit on screen', () => {
  it("writes the draft and the path together, the path equal to the draft's clauses", async () => {
    const { stored } = await mount({
      clauses: twoGroupPath(),
      enrollments: [PASSKEY, ALICE, BOB, CAROL, PASSPORT].map(enrolled)
    })

    await press('editor-member-1-0-required')
    await expectPathMatchesDraft(stored, [
      { threshold: 1, credentials: [PASSKEY] },
      { threshold: 2, credentials: [BOB] },
      { threshold: 1, credentials: [CAROL, PASSPORT] },
      { threshold: 1, credentials: [ALICE] }
    ])

    await press('editor-member-2-1-remove')
    await expectPathMatchesDraft(stored, [
      { threshold: 1, credentials: [PASSKEY] },
      { threshold: 2, credentials: [BOB] },
      { threshold: 1, credentials: [CAROL] },
      { threshold: 1, credentials: [ALICE] }
    ])

    await press('editor-add-group')
    await expectPathMatchesDraft(stored, [
      { threshold: 1, credentials: [PASSKEY] },
      { threshold: 2, credentials: [BOB] },
      { threshold: 1, credentials: [CAROL] },
      { threshold: 1, credentials: [ALICE] },
      { threshold: 2, credentials: [] }
    ])

    await press('editor-group-1-remove')
    await expectPathMatchesDraft(stored, [
      { threshold: 1, credentials: [PASSKEY] },
      { threshold: 1, credentials: [CAROL] },
      { threshold: 1, credentials: [ALICE] },
      { threshold: 2, credentials: [] }
    ])

    await press('editor-row-0-remove')
    await expectPathMatchesDraft(stored, [
      { threshold: 1, credentials: [CAROL] },
      { threshold: 1, credentials: [ALICE] },
      { threshold: 2, credentials: [] }
    ])
  })

  it('moves a required row into the one group with one press, the credential kept', async () => {
    const { stored } = await mount({ clauses: presetPath() })
    await press('editor-row-0-move')
    await expectPathMatchesDraft(stored, [
      { threshold: 2, credentials: [ALICE, BOB, PASSPORT, PASSKEY] }
    ])
  })

  it('asks which group a row moves to when the path has two', async () => {
    const { stored } = await mount({ clauses: twoGroupPath() })
    await press('editor-row-0-move')
    expect(await stored()).toEqual({ draft: draftOf(twoGroupPath()), path: twoGroupPath() })
    await press('editor-row-0-move-2')
    await expectPathMatchesDraft(stored, [
      { threshold: 2, credentials: [ALICE, BOB] },
      { threshold: 1, credentials: [CAROL, PASSPORT, PASSKEY] }
    ])
  })

  it('writes a typed threshold to the group', async () => {
    const { stored } = await mount({ clauses: presetPath() })
    const input = byTestId('editor-group-1-threshold') as HTMLInputElement
    const setValue = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set
    act(() => {
      setValue?.call(input, '3')
      input.dispatchEvent(new Event('input', { bubbles: true }))
    })
    await settle()
    await expectPathMatchesDraft(stored, [
      { threshold: 1, credentials: [PASSKEY] },
      { threshold: 3, credentials: [ALICE, BOB, PASSPORT] }
    ])
  })

  it("adds a picked enrollment as a member, and keeps the draft's other fields", async () => {
    const { stored } = await mount({
      clauses: presetPath(),
      enrollments: [ALICE, CAROL].map(enrolled)
    })
    await press('editor-group-1-add')
    expect(byTestId('editor-picker')).not.toBeNull()
    await press('editor-picker-ecdsa-1')
    const { draft } = await stored()
    expect(draft).toEqual(
      draftOf([
        { threshold: 1, credentials: [PASSKEY] },
        { threshold: 2, credentials: [ALICE, BOB, PASSPORT, CAROL] }
      ])
    )
    expect(byTestId('editor-picker')).toBeNull()
  })
})

describe('the duplicate refusal on screen', () => {
  it("refuses a group member picked as a required row with the wallet's sentence and writes nothing", async () => {
    const { storage, stored, writesBefore } = await mount({
      clauses: presetPath(),
      enrollments: [ALICE, CAROL].map(enrolled)
    })
    await press('editor-add-required')
    const picker = byTestId('editor-picker-ecdsa')?.textContent ?? ''
    expect(picker).toContain(en.socialRecovery.editor.picker.alreadyInPath)
    await press('editor-picker-ecdsa-0')
    expect(byTestId('editor-refusal')?.textContent).toBe(en.socialRecovery.editor.duplicate)
    expect(storage.sets.length).toBe(writesBefore)
    expect(await stored()).toEqual({ draft: draftOf(presetPath()), path: presetPath() })
  })

  it('refuses a member added twice to one group, and the next edit clears the sentence', async () => {
    const { storage, writesBefore, stored } = await mount({
      clauses: presetPath(),
      enrollments: [ALICE].map(enrolled)
    })
    await press('editor-group-1-add')
    await press('editor-picker-ecdsa-0')
    expect(byTestId('editor-refusal')?.textContent).toBe(en.socialRecovery.editor.duplicate)
    expect(storage.sets.length).toBe(writesBefore)
    await press('editor-add-group')
    expect(byTestId('editor-refusal')).toBeNull()
    await expectPathMatchesDraft(stored, [...presetPath(), { threshold: 2, credentials: [] }])
  })
})

describe('the rule lines on screen', () => {
  const shown = () => allByTestId('editor-rule-line')
  const expected = (clauses: Clause[]) => renderRuleLines(getRuleLines(clauses), t)

  it("equal the rule-lines lane's for a preset shape", async () => {
    await mount({ clauses: presetPath() })
    expect(shown()).toEqual(expected(presetPath()))
    expect(shown().length).toBeGreaterThan(0)
  })

  it("equal the lane's for a one-method path, with the offer of a second method", async () => {
    const clauses = [{ threshold: 1, credentials: [PASSKEY] }]
    const { navigate } = await mount({ clauses })
    expect(shown()).toEqual(expected(clauses))
    expect(shown()).toContain(en.socialRecovery.ruleLines.singleMethod)
    await press('editor-add-second-method')
    expect(byTestId('editor-picker')).not.toBeNull()
    expect(navigate).not.toHaveBeenCalled()
  })

  it('equal the lane\'s for two required rows, with the sizing line and "Make it a group"', async () => {
    const clauses = [
      { threshold: 1, credentials: [PASSKEY] },
      { threshold: 1, credentials: [ALICE] }
    ]
    const { stored } = await mount({ clauses })
    expect(shown()).toEqual(expected(clauses))
    expect(byTestId('editor-make-it-a-group')?.textContent).toBe(
      en.socialRecovery.editor.makeItAGroup
    )
    await press('editor-make-it-a-group')
    const grouped = [{ threshold: 1, credentials: [PASSKEY, ALICE] }]
    await expectPathMatchesDraft(stored, grouped)
    expect(shown()).toEqual(expected(grouped))
    expect(byTestId('editor-make-it-a-group')).toBeNull()
  })

  it("equal the lane's for a path of one empty slot, which counts as its one method", async () => {
    const clauses = [{ threshold: 1, credentials: [emptySlotOf('passkey')] }]
    await mount({ clauses })
    expect(shown()).toEqual(expected(clauses))
    expect(shown()).toContain(en.socialRecovery.ruleLines.singleMethod)
  })

  it('follow the path as it changes', async () => {
    await mount({ clauses: presetPath() })
    await press('editor-member-1-2-remove')
    const next = [
      { threshold: 1, credentials: [PASSKEY] },
      { threshold: 2, credentials: [ALICE, BOB] }
    ]
    expect(shown()).toEqual(expected(next))
    expect(shown()).not.toEqual(expected(presetPath()))
  })

  it('show a line the lane repeats on a two-group path every time, with no React key warning', async () => {
    const clauses = [...presetPath(), { threshold: 1, credentials: [CAROL, AADHAAR] }]
    const error = jest.spyOn(console, 'error').mockImplementation(() => undefined)
    try {
      await mount({ clauses })
      const keys = getRuleLines(clauses).map((line) => line.key)
      expect(new Set(keys).size).toBeLessThan(keys.length)
      expect(shown()).toEqual(expected(clauses))
      const keyWarnings = error.mock.calls.filter((call) =>
        call.some((part) => String(part).includes('same key'))
      )
      expect(keyWarnings).toEqual([])
    } finally {
      error.mockRestore()
    }
  })

  it('drop every line of the old shape when one of three groups of the same shape changes its threshold', async () => {
    const pair = (a: string, b: string) => ({
      threshold: 1,
      credentials: [guardianOf(a, a), guardianOf(b, b)]
    })
    const before = [pair('e5', 'e6'), pair('e7', 'e8'), pair('e9', 'ea')]
    const after = [{ ...before[0], threshold: 2 }, before[1], before[2]]
    const duplicateKeys = jest.spyOn(console, 'error').mockImplementation(() => {})
    try {
      await mount({ clauses: before })
      expect(shown()).toEqual(expected(before))
      await typeThreshold('editor-group-0-threshold', '2')
      expect(shown()).toEqual(expected(after))
      expect(shown()).toHaveLength(getRuleLines(after).length)
      expect(
        duplicateKeys.mock.calls.filter((call) => String(call[0]).includes('same key'))
      ).toEqual([])
    } finally {
      duplicateKeys.mockRestore()
    }
  })
})

describe('enrolling something new from the picker', () => {
  it('adds an empty guardian slot for "New address" and opens the enroll screen at that slot', async () => {
    const { navigate, stored } = await mount({ clauses: presetPath() })
    await press('editor-group-1-add')
    expect(byTestId('editor-picker-ecdsa-new')?.textContent).toBe(
      en.socialRecovery.editor.picker.newAddress
    )
    await press('editor-picker-ecdsa-new')
    await expectPathMatchesDraft(stored, [
      { threshold: 1, credentials: [PASSKEY] },
      { threshold: 2, credentials: [ALICE, BOB, PASSPORT, emptySlotOf('ecdsa')] }
    ])
    expect(navigate).toHaveBeenCalledTimes(1)
    const [to] = navigate.mock.calls[0]
    const [route, search] = to.split('?')
    expect(route).toBe(WEB_ROUTES.socialRecoverySetupEnroll)
    expect(Object.fromEntries(new URLSearchParams(search))).toEqual({
      kind: 'ecdsa',
      clause: '1',
      member: '3'
    })
  })

  it('adds an empty required row for "Enroll something new" and opens the enroll screen at it', async () => {
    const { navigate, stored } = await mount({ clauses: presetPath() })
    await press('editor-add-required')
    expect(byTestId('editor-picker-passkey-new')?.textContent).toBe(
      en.socialRecovery.editor.picker.enrollNew
    )
    await press('editor-picker-passkey-new')
    await expectPathMatchesDraft(stored, [
      ...presetPath(),
      { threshold: 1, credentials: [emptySlotOf('passkey')] }
    ])
    const [to] = navigate.mock.calls[0]
    expect(Object.fromEntries(new URLSearchParams(to.split('?')[1]))).toEqual({
      kind: 'passkey',
      clause: '2',
      member: '0'
    })
  })

  it('opens the enroll screen at an empty slot pressed in the path, offering only its kind, and writes nothing', async () => {
    const clauses = [{ threshold: 2, credentials: [ALICE, emptySlotOf('zkpassport')] }]
    const { navigate, storage, writesBefore } = await mount({ clauses })
    await press('editor-slot-0-1')
    expect(byTestId('editor-picker-zkpassport')).not.toBeNull()
    expect(byTestId('editor-picker-ecdsa')).toBeNull()
    await press('editor-picker-zkpassport-new')
    expect(storage.sets.length).toBe(writesBefore)
    const [to] = navigate.mock.calls[0]
    expect(to).toBe(`${WEB_ROUTES.socialRecoverySetupEnroll}?kind=zkpassport&clause=0&member=1`)
  })
})

describe('continue', () => {
  it('is disabled on an empty path and runs no path check', async () => {
    const { validateSetup, navigate } = await mount()
    expect(byTestId('editor-continue')?.getAttribute('aria-disabled')).toBe('true')
    await press('editor-continue')
    expect(validateSetup).not.toHaveBeenCalled()
    expect(navigate).not.toHaveBeenCalled()
  })

  it('checks the stored draft and opens the waiting period when the check finds no error, writing nothing', async () => {
    const { validateSetup, navigate, storage, writesBefore } = await mount({
      clauses: presetPath()
    })
    await press('editor-continue')
    expect(validateSetup).toHaveBeenCalledWith(draftOf(presetPath()))
    expect(navigate).toHaveBeenCalledWith(WEB_ROUTES.socialRecoverySetupWaitingPeriod)
    expect(storage.sets.length).toBe(writesBefore)
  })

  it('checks the draft as edited, once its write has landed', async () => {
    const { validateSetup, stored } = await mount({ clauses: presetPath() })
    await press('editor-member-1-2-remove')
    await press('editor-continue')
    const { draft } = await stored()
    expect(validateSetup).toHaveBeenCalledWith(draft)
    expect(draft?.clauses).toEqual([
      { threshold: 1, credentials: [PASSKEY] },
      { threshold: 2, credentials: [ALICE, BOB] }
    ])
  })

  it('stays and renders each error finding when the check finds one', async () => {
    const { navigate } = await mount({
      clauses: presetPath(),
      validate: async () => ({
        errors: [finding('clause.empty'), finding('action.unsupported')],
        warnings: []
      })
    })
    await press('editor-continue')
    expect(navigate).not.toHaveBeenCalled()
    expect(allByTestId('editor-finding')).toEqual([
      en.socialRecovery.editor.refusals.emptyGroup,
      en.socialRecovery.editor.refusals.actionUnsupported
    ])
    expect(byTestId('editor-continue')).not.toBeNull()
  })

  it('goes on past warnings alone and renders none of them', async () => {
    const { navigate } = await mount({
      clauses: presetPath(),
      validate: async () => ({ errors: [], warnings: [finding('clause.shared-failure')] })
    })
    await press('editor-continue')
    expect(navigate).toHaveBeenCalledWith(WEB_ROUTES.socialRecoverySetupWaitingPeriod)
    expect(allByTestId('editor-finding')).toEqual([])
  })

  it('shows a spinner and no continue while the client loads', async () => {
    await mount({ clauses: presetPath(), client: 'loading' })
    expect(byTestId('editor-continue')).toBeNull()
    expect(byTestId('editor-spinner')).not.toBeNull()
  })

  it('offers a retry and no continue when the client is refused', async () => {
    const retry = jest.fn()
    await mount({ clauses: presetPath(), client: 'refused', retry })
    expect(byTestId('editor-continue')).toBeNull()
    await press('editor-client-retry')
    expect(retry).toHaveBeenCalledTimes(1)
  })
})

describe('the first edit over no stored draft', () => {
  it('stores a 48-hour wait, the pause opted out and the encrypted private default', async () => {
    const { storage, stored } = await mount()
    expect(storage.sets).toEqual([])
    await press('editor-add-group')
    const { draft, path } = await stored()
    expect(draft).toEqual({
      wait: BigInt(48 * 60 * 60),
      clauses: [{ threshold: 2, credentials: [] }],
      ignoresPause: true,
      privacy: { publicMetadata: '0x', backup: 'encrypted' }
    })
    expect(path).toEqual(draft?.clauses)
  })
})

describe('"Add a second method" on a one-method path', () => {
  const oneMethod = () => [{ threshold: 1, credentials: [PASSKEY] }]

  it('offers the passkey and guardian kinds only', async () => {
    await mount({ clauses: oneMethod(), enrollments: [ALICE, PASSPORT, AADHAAR].map(enrolled) })
    await press('editor-add-second-method')
    expect(byTestId('editor-picker-passkey')).not.toBeNull()
    expect(byTestId('editor-picker-ecdsa')).not.toBeNull()
    expect(byTestId('editor-picker-zkpassport')).toBeNull()
    expect(byTestId('editor-picker-aadhaar')).toBeNull()
  })

  it('turns the lone row and the picked credential into one group of any one of two, in one write', async () => {
    const { storage, stored, writesBefore } = await mount({
      clauses: oneMethod(),
      enrollments: [ALICE].map(enrolled)
    })
    await press('editor-add-second-method')
    await press('editor-picker-ecdsa-0')
    await expectPathMatchesDraft(stored, [{ threshold: 1, credentials: [PASSKEY, ALICE] }])
    const written = storage.sets.slice(writesBefore)
    expect(written).toHaveLength(2)
    expect(written[0]).toContain(':setupDraft:')
    expect(written[1]).toContain(':path:')
    expect(byTestId('editor-picker')).toBeNull()
    expect(byTestId('editor-group-0')).not.toBeNull()
    expect(byTestId('editor-row-0')).toBeNull()
  })

  it('adds an empty slot into that group for "Enroll something new" and opens the enroll screen at member 1', async () => {
    const { navigate, stored } = await mount({ clauses: oneMethod() })
    await press('editor-add-second-method')
    await press('editor-picker-passkey-new')
    await expectPathMatchesDraft(stored, [
      { threshold: 1, credentials: [PASSKEY, emptySlotOf('passkey')] }
    ])
    expect(navigate).toHaveBeenCalledTimes(1)
    const [to] = navigate.mock.calls[0]
    const [route, search] = to.split('?')
    expect(route).toBe(WEB_ROUTES.socialRecoverySetupEnroll)
    expect(Object.fromEntries(new URLSearchParams(search))).toEqual({
      kind: 'passkey',
      clause: '0',
      member: '1'
    })
  })

  it('refuses the credential the path already holds and writes nothing', async () => {
    const { storage, stored, writesBefore } = await mount({
      clauses: oneMethod(),
      enrollments: [PASSKEY].map(enrolled)
    })
    await press('editor-add-second-method')
    await press('editor-picker-passkey-0')
    expect(byTestId('editor-refusal')?.textContent).toBe(en.socialRecovery.editor.duplicate)
    expect(storage.sets.length).toBe(writesBefore)
    expect(await stored()).toEqual({ draft: draftOf(oneMethod()), path: oneMethod() })
    expect(byTestId('editor-picker')).not.toBeNull()
  })
})

describe('a group while the holder edits it', () => {
  const expectGroupCard = (index: number) => {
    expect(byTestId(`editor-group-${index}`)).not.toBeNull()
    expect(byTestId(`editor-group-${index}-threshold`)).not.toBeNull()
    expect(byTestId(`editor-group-${index}-add`)?.textContent).toBe(
      en.socialRecovery.editor.addMember
    )
    expect(byTestId(`editor-group-${index}-remove`)?.textContent).toBe(
      en.socialRecovery.editor.removeGroup
    )
    expect(byTestId(`editor-row-${index}`)).toBeNull()
  }

  it('stays a group when "Either one works" loses one of its two members', async () => {
    const { stored } = await mount({
      clauses: [{ threshold: 1, credentials: [PASSKEY, PASSPORT] }]
    })
    await press('editor-member-0-1-remove')
    await expectPathMatchesDraft(stored, [{ threshold: 1, credentials: [PASSKEY] }])
    expectGroupCard(0)
  })

  it('stays a group when a new group takes one member and a threshold of one', async () => {
    const { stored } = await mount({ enrollments: [ALICE].map(enrolled) })
    await press('editor-add-group')
    await press('editor-group-0-add')
    await press('editor-picker-ecdsa-0')
    await typeThreshold('editor-group-0-threshold', '1')
    await expectPathMatchesDraft(stored, [{ threshold: 1, credentials: [ALICE] }])
    expectGroupCard(0)
  })

  it('makes one group of any one of two from a group of one beside a required row, as the sizing line counts them', async () => {
    const { stored } = await mount({
      clauses: [{ threshold: 1, credentials: [PASSKEY, PASSPORT] }],
      enrollments: [ALICE].map(enrolled)
    })
    await press('editor-member-0-1-remove')
    await press('editor-add-required')
    await press('editor-picker-ecdsa-0')
    expect(allByTestId('editor-rule-line')).toContain(en.socialRecovery.ruleLines.sizingRule)
    await press('editor-make-it-a-group')
    await expectPathMatchesDraft(stored, [{ threshold: 1, credentials: [PASSKEY, ALICE] }])
    expect(byTestId('editor-make-it-a-group')).toBeNull()
    expect(allByTestId('editor-rule-line')).not.toContain(en.socialRecovery.ruleLines.sizingRule)
    expectGroupCard(0)
    expect(byTestId('editor-group-1')).toBeNull()
  })

  it('reads a stored group of one member at a threshold of one as a required row once the editor opens again', async () => {
    const { reopen } = await mount({
      clauses: [{ threshold: 1, credentials: [PASSKEY, PASSPORT] }]
    })
    await press('editor-member-0-1-remove')
    expectGroupCard(0)
    await reopen()
    expect(byTestId('editor-row-0')).not.toBeNull()
    expect(byTestId('editor-group-0')).toBeNull()
  })
})

describe('edits while the path check runs', () => {
  const pendingCheck = () => {
    let answer: (result: ValidationResult) => void = () => {}
    const validate: Validate = () =>
      new Promise((resolve) => {
        answer = resolve
      })
    return { validate, answer: (result: ValidationResult) => answer(result) }
  }

  const clauses = () => [...presetPath(), { threshold: 1, credentials: [DAVE, AADHAAR] }]

  const controls = [
    'editor-row-0-move',
    'editor-row-0-remove',
    'editor-add-required',
    'editor-group-1-threshold',
    'editor-member-1-0-required',
    'editor-member-1-0-remove',
    'editor-group-1-add',
    'editor-group-1-remove',
    'editor-add-group',
    'editor-picker-ecdsa-0',
    'editor-picker-ecdsa-new'
  ]
  const buttons = controls.filter((id) => id !== 'editor-group-1-threshold')

  it('are held, and a press changes nothing, until the check answers on the draft the holder continued with', async () => {
    const check = pendingCheck()
    const { storage, stored, writesBefore, validateSetup, navigate } = await mount({
      clauses: clauses(),
      enrollments: [CAROL].map(enrolled),
      validate: check.validate
    })
    await press('editor-group-1-add')
    await press('editor-continue')
    expect(validateSetup).toHaveBeenCalledTimes(1)
    expect(byTestId('editor-spinner')).not.toBeNull()

    expect(controls.filter((id) => !isHeld(id))).toEqual([])
    await buttons.reduce((previous, id) => previous.then(() => press(id)), Promise.resolve())
    await typeThreshold('editor-group-1-threshold', '3')
    expect(storage.sets.length).toBe(writesBefore)
    expect(await stored()).toEqual({ draft: draftOf(clauses()), path: clauses() })
    expect(navigate).not.toHaveBeenCalled()
    expect(byTestId('editor-picker-ecdsa')).not.toBeNull()

    await act(async () => check.answer({ errors: [finding('clause.empty')], warnings: [] }))
    await settle()
    expect(validateSetup).toHaveBeenCalledTimes(1)
    expect(validateSetup).toHaveBeenCalledWith(draftOf(clauses()))
    expect(controls.filter((id) => isHeld(id))).toEqual([])
    await press('editor-picker-ecdsa-0')
    await expectPathMatchesDraft(stored, [
      { threshold: 1, credentials: [PASSKEY] },
      { threshold: 2, credentials: [ALICE, BOB, PASSPORT, CAROL] },
      { threshold: 1, credentials: [DAVE, AADHAAR] }
    ])
  })
})

describe('a failed read or write of the draft', () => {
  it('renders the write failure when the draft write fails, holds continue, and a later write clears both', async () => {
    const { storage, stored } = await mount({ clauses: presetPath() })
    storage.rejectOnce('set', 'setupDraft')
    await press('editor-add-group')
    expect(byTestId('editor-write-failed')?.textContent).toBe(en.socialRecovery.records.writeFailed)
    expect(isHeld('editor-continue')).toBe(true)
    expect(await stored()).toEqual({ draft: draftOf(presetPath()), path: presetPath() })

    await press('editor-add-group')
    expect(byTestId('editor-write-failed')).toBeNull()
    expect(isHeld('editor-continue')).toBe(false)
    await expectPathMatchesDraft(stored, [
      ...presetPath(),
      { threshold: 2, credentials: [] },
      { threshold: 2, credentials: [] }
    ])
  })

  it('renders the write failure when the path write fails, holds continue, and a later write clears both', async () => {
    const { storage, stored, validateSetup } = await mount({ clauses: presetPath() })
    storage.rejectOnce('set', 'path')
    await press('editor-add-group')
    expect(byTestId('editor-write-failed')?.textContent).toBe(en.socialRecovery.records.writeFailed)
    expect(isHeld('editor-continue')).toBe(true)
    await press('editor-continue')
    expect(validateSetup).not.toHaveBeenCalled()

    await press('editor-member-1-2-remove')
    expect(byTestId('editor-write-failed')).toBeNull()
    expect(isHeld('editor-continue')).toBe(false)
    await expectPathMatchesDraft(stored, [
      { threshold: 1, credentials: [PASSKEY] },
      { threshold: 2, credentials: [ALICE, BOB] },
      { threshold: 2, credentials: [] }
    ])
  })

  it('writes the draft and its path again on "Try again", clearing the failure and freeing continue', async () => {
    const { storage, stored, navigate } = await mount({ clauses: presetPath() })
    storage.rejectOnce('set', 'path')
    await press('editor-member-1-2-remove')
    expect(byTestId('editor-write-failed')).not.toBeNull()
    expect(byTestId('editor-write-retry')?.textContent).toBe(en.socialRecovery.writes.tryAgain)
    expect(isHeld('editor-continue')).toBe(true)
    const edited = [
      { threshold: 1, credentials: [PASSKEY] },
      { threshold: 2, credentials: [ALICE, BOB] }
    ]
    expect(await stored()).toEqual({ draft: draftOf(presetPath()), path: presetPath() })

    await press('editor-write-retry')
    expect(byTestId('editor-write-failed')).toBeNull()
    expect(byTestId('editor-write-retry')).toBeNull()
    expect(isHeld('editor-continue')).toBe(false)
    await expectPathMatchesDraft(stored, edited)
    await press('editor-continue')
    expect(navigate).toHaveBeenCalledWith(WEB_ROUTES.socialRecoverySetupWaitingPeriod)
  })

  it('does not open the enroll screen when the new slot could not be written', async () => {
    const { storage, navigate } = await mount({ clauses: presetPath() })
    storage.rejectOnce('set', 'setupDraft')
    await press('editor-add-required')
    await press('editor-picker-passkey-new')
    expect(byTestId('editor-write-failed')).not.toBeNull()
    expect(navigate).not.toHaveBeenCalled()
  })

  it('renders the read failure with a retry that reads the draft again', async () => {
    await mount({
      clauses: presetPath(),
      beforeRender: (storage) => storage.rejectOnce('get', 'setupDraft')
    })
    expect(byTestId('editor-load-failed')?.textContent).toBe(en.socialRecovery.records.loadFailed)
    expect(byTestId('editor-title')).toBeNull()
    await press('editor-load-retry')
    expect(byTestId('editor-load-failed')).toBeNull()
    expect(byTestId('editor-title')?.textContent).toBe(en.socialRecovery.editor.adjust.title)
    expect(byTestId('editor-row-0')).not.toBeNull()
  })
})

describe('a client that cannot check the path', () => {
  const refusalText = () => byTestId('editor-client-refusal')?.textContent
  const unavailable = () =>
    en.socialRecovery.client.unavailableTitle + en.socialRecovery.client.unavailableBody

  it('asks for a wallet update when this version cannot read the setup, with a retry', async () => {
    const retry = jest.fn()
    await mount({ clauses: presetPath(), client: 'update-the-wallet', retry })
    expect(refusalText()).toBe(
      en.socialRecovery.client.updateTheWalletTitle + en.socialRecovery.client.updateTheWalletBody
    )
    expect(byTestId('editor-continue')).toBeNull()
    expect(byTestId('editor-client-retry')?.textContent).toBe(en.socialRecovery.writes.tryAgain)
    await press('editor-client-retry')
    expect(retry).toHaveBeenCalledTimes(1)
  })

  it('says the kit is unreachable when the client failed', async () => {
    await mount({ clauses: presetPath(), client: 'refused' })
    expect(refusalText()).toBe(unavailable())
  })

  it('says the kit is unreachable when the check throws, retries the check, and an edit clears it', async () => {
    const { validateSetup, navigate } = await mount({
      clauses: presetPath(),
      validate: async () => {
        throw new Error('unreachable')
      }
    })
    await press('editor-continue')
    expect(refusalText()).toBe(unavailable())
    expect(byTestId('editor-continue')).toBeNull()
    await press('editor-check-retry')
    expect(validateSetup).toHaveBeenCalledTimes(2)
    expect(refusalText()).toBe(unavailable())
    expect(navigate).not.toHaveBeenCalled()

    await press('editor-add-group')
    expect(byTestId('editor-client-refusal')).toBeNull()
    expect(byTestId('editor-check-retry')).toBeNull()
    expect(byTestId('editor-continue')).not.toBeNull()
  })
})

describe('the words on screen', () => {
  const groupHeaders = () =>
    Array.from(container.querySelectorAll<HTMLElement>('[data-testid="editor-groups"] *'))
      .filter((node) => node.childElementCount === 0)
      .map((node) => node.textContent)
      .filter(
        (text) =>
          text === en.socialRecovery.editor.groupHeader ||
          text === en.socialRecovery.editor.groupsHeader
      )

  it('heads the groups section "Groups" when the path has no group', async () => {
    await mount({ clauses: [{ threshold: 1, credentials: [PASSKEY] }] })
    expect(byTestId('editor-groups-header')?.textContent).toBe(
      en.socialRecovery.editor.groupsHeader
    )
    expect(byTestId('editor-groups')?.textContent).toMatch(
      new RegExp(`^${en.socialRecovery.editor.groupsHeader}${en.socialRecovery.editor.noGroup}`)
    )
    expect(groupHeaders()).toEqual([en.socialRecovery.editor.groupsHeader])
  })

  it('heads the groups section "Group" once over one group, with no header over its card', async () => {
    await mount({ clauses: presetPath() })
    expect(byTestId('editor-groups-header')?.textContent).toBe(en.socialRecovery.editor.groupHeader)
    expect(groupHeaders()).toEqual([en.socialRecovery.editor.groupHeader])
  })

  it('heads the groups section "Groups" once over two groups, with no header over either card', async () => {
    await mount({ clauses: twoGroupPath() })
    expect(byTestId('editor-groups-header')?.textContent).toBe(
      en.socialRecovery.editor.groupsHeader
    )
    expect(groupHeaders()).toEqual([en.socialRecovery.editor.groupsHeader])
  })

  it('closes the picker with "Cancel"', async () => {
    await mount({ clauses: presetPath() })
    await press('editor-add-required')
    expect(byTestId('editor-picker-close')?.textContent).toBe(
      en.socialRecovery.ceremony.cancelAction
    )
    await press('editor-picker-close')
    expect(byTestId('editor-picker')).toBeNull()
  })

  it('shows an enrolled guardian by its short address beside "Guardian"', async () => {
    await mount({ clauses: [{ threshold: 1, credentials: [ALICE] }] })
    expect(byTestId('editor-slot-0-0')?.textContent).toMatch(
      new RegExp(
        `^${renderShortAddress(guardianAddress('a1'))}${en.socialRecovery.display.nouns.guardian}`
      )
    )
  })

  it('shows a guardian whose stored config the codec did not write by "Guardian" alone', async () => {
    await mount({ clauses: [{ threshold: 1, credentials: [{ ...ALICE, config: '0x1234' }] }] })
    expect(byTestId('editor-slot-0-0')?.textContent).toMatch(
      new RegExp(`^${en.socialRecovery.display.nouns.guardian}`)
    )
    expect(byTestId('editor-title')).not.toBeNull()
  })

  it('names a device-bound passkey "Passkey on this device" and a synced one "Passkey"', async () => {
    const clauses = [{ threshold: 1, credentials: [PASSKEY] }]
    await mount({ clauses, enrollments: [{ ...enrolled(PASSKEY), backup: 'device-bound' }] })
    expect(byTestId('editor-slot-0-0')?.textContent).toMatch(
      new RegExp(`^${en.socialRecovery.methodNames.passkeyOnThisDevice}${PASSKEY.label}`)
    )
    act(() => root.unmount())
    root = createRoot(container)
    await mount({ clauses, enrollments: [{ ...enrolled(PASSKEY), backup: 'synced' }] })
    expect(byTestId('editor-slot-0-0')?.textContent).toMatch(
      new RegExp(`^${en.socialRecovery.methodNames.passkey}${PASSKEY.label}`)
    )
  })
})

describe('the duplicate sentence and the picker', () => {
  it('clears when the picker closes', async () => {
    const { storage, writesBefore } = await mount({
      clauses: presetPath(),
      enrollments: [ALICE].map(enrolled)
    })
    await press('editor-group-1-add')
    await press('editor-picker-ecdsa-0')
    expect(byTestId('editor-refusal')).not.toBeNull()
    await press('editor-picker-close')
    expect(byTestId('editor-refusal')).toBeNull()
    expect(byTestId('editor-picker')).toBeNull()
    expect(storage.sets.length).toBe(writesBefore)
  })
})

describe('the member picker after an edit that removes its target', () => {
  it('closes when its empty slot is removed, and every other member stays where it was', async () => {
    const clauses = [{ threshold: 2, credentials: [ALICE, emptySlotOf('ecdsa'), BOB] }]
    const { stored } = await mount({ clauses, enrollments: [CAROL].map(enrolled) })
    await press('editor-slot-0-1')
    expect(byTestId('editor-picker-ecdsa')).not.toBeNull()

    await press('editor-member-0-1-remove')
    expect(byTestId('editor-picker')).toBeNull()
    await expectPathMatchesDraft(stored, [{ threshold: 2, credentials: [ALICE, BOB] }])
  })

  it('closes when a member before its empty slot is removed, the slot and the member after it kept', async () => {
    const clauses = [{ threshold: 2, credentials: [ALICE, emptySlotOf('ecdsa'), BOB] }]
    const { stored } = await mount({ clauses, enrollments: [CAROL].map(enrolled) })
    await press('editor-slot-0-1')
    await press('editor-member-0-0-remove')
    expect(byTestId('editor-picker')).toBeNull()
    await expectPathMatchesDraft(stored, [
      { threshold: 2, credentials: [emptySlotOf('ecdsa'), BOB] }
    ])
  })

  it('closes without an error when the group it adds a member to is removed', async () => {
    const { stored } = await mount({ clauses: twoGroupPath(), enrollments: [DAVE].map(enrolled) })
    await press('editor-group-2-add')
    expect(byTestId('editor-picker')).not.toBeNull()

    await expect(press('editor-group-2-remove')).resolves.toBeUndefined()
    expect(byTestId('editor-picker')).toBeNull()
    await expectPathMatchesDraft(stored, twoGroupPath().slice(0, 2))
  })
})

describe('a threshold that is not a whole number', () => {
  const refusal = 'editor-group-1-threshold-refusal'
  const thresholdText = () => (byTestId('editor-group-1-threshold') as HTMLInputElement).value

  ;[
    ['a cleared', ''],
    ['a fractional', '1.5']
  ].forEach(([name, text]) =>
    it(`keeps ${name} field as typed with its error line, holds continue and leaves the path`, async () => {
      const { stored, validateSetup, navigate } = await mount({ clauses: presetPath() })
      await typeThreshold('editor-group-1-threshold', text)

      expect(thresholdText()).toBe(text)
      expect(byTestId(refusal)?.textContent).toBe(
        t('socialRecovery.editor.refusals.thresholdWholeNumber')
      )
      expect(isHeld('editor-continue')).toBe(true)
      await press('editor-continue')
      expect(validateSetup).not.toHaveBeenCalled()
      expect(navigate).not.toHaveBeenCalled()
      await expectPathMatchesDraft(stored, presetPath())
    })
  )

  it('frees continue and clears the line once a whole number in range is typed, and the check reads it', async () => {
    const { stored, validateSetup, navigate } = await mount({ clauses: presetPath() })
    await typeThreshold('editor-group-1-threshold', '1.5')
    expect(isHeld('editor-continue')).toBe(true)

    await typeThreshold('editor-group-1-threshold', '3')
    expect(byTestId(refusal)).toBeNull()
    expect(isHeld('editor-continue')).toBe(false)
    const edited = [
      { threshold: 1, credentials: [PASSKEY] },
      { threshold: 3, credentials: [ALICE, BOB, PASSPORT] }
    ]
    await expectPathMatchesDraft(stored, edited)

    await press('editor-continue')
    expect(validateSetup).toHaveBeenCalledWith(draftOf(edited))
    expect(navigate).toHaveBeenCalledWith(WEB_ROUTES.socialRecoverySetupWaitingPeriod)
  })

  it('holds the check retry after a failed check while a group reads a fraction', async () => {
    const { validateSetup } = await mount({
      clauses: presetPath(),
      validate: async () => {
        throw new Error('unreachable')
      }
    })
    await press('editor-continue')
    expect(isHeld('editor-check-retry')).toBe(false)

    await typeThreshold('editor-group-1-threshold', '1.5')
    expect(isHeld('editor-check-retry')).toBe(true)
    await press('editor-check-retry')
    expect(validateSetup).toHaveBeenCalledTimes(1)
  })

  it("goes back to the path's threshold after another edit", async () => {
    await mount({ clauses: presetPath(), enrollments: [CAROL].map(enrolled) })
    await typeThreshold('editor-group-1-threshold', '')
    await press('editor-member-1-2-remove')
    expect(thresholdText()).toBe('2')
    expect(byTestId(refusal)).toBeNull()
    expect(isHeld('editor-continue')).toBe(false)
  })
})

describe('a method whose access test failed', () => {
  const failed = (cause?: string): Enrollment => ({ credential: PASSKEY, test: 'failed', cause })
  const shownFor = async (enrollment: Enrollment) => {
    await mount({ clauses: [{ threshold: 1, credentials: [PASSKEY] }], enrollments: [enrollment] })
    return allByTestId('editor-slot-0-0-test-line')
  }

  it('shows the failed chip on the row', async () => {
    await shownFor(failed('browser-error: NotAllowedError'))
    expect(byTestId('editor-slot-0-0')?.textContent).toContain(
      en.socialRecovery.status.method.testFailed
    )
  })
  ;['check-rejected', 'check-rejected: wrong signer'].forEach((cause) =>
    it(`shows only the no-match sentence for the cause "${cause}"`, async () => {
      expect(await shownFor(failed(cause))).toEqual([en.socialRecovery.ceremony.testFailedNoMatch])
    })
  )

  const fallbacks: [string, string | undefined][] = [
    ['a browser error', 'browser-error: NotAllowedError'],
    ['a passkey the browser refused under this origin', 'relying-party-mismatch: SecurityError'],
    ['a cause the wallet has no words for', 'timeout'],
    ['no cause', undefined]
  ]
  fallbacks.forEach(([name, cause]) =>
    it(`shows only the may-never-work line for ${name}`, async () => {
      expect(await shownFor(failed(cause))).toEqual([en.socialRecovery.ceremony.testFailedLine])
    })
  )

  const unfailed: [string, Enrollment][] = [
    ['passed', enrolled(PASSKEY)],
    ['was not run', { credential: PASSKEY, test: 'not-tested' }]
  ]
  unfailed.forEach(([name, enrollment]) =>
    it(`shows no test line for a method whose test ${name}`, async () => {
      expect(await shownFor(enrollment)).toEqual([])
    })
  )
})

describe('the group chooser of a required row', () => {
  const choices = () =>
    Array.from(
      container.querySelectorAll<HTMLElement>('[data-testid^="editor-row-0-move-"]'),
      (node) => node.getAttribute('data-testid')
    )

  it('offers one action per group and a cancel that closes it, writing nothing', async () => {
    const { storage, writesBefore } = await mount({ clauses: twoGroupPath() })
    expect(choices()).toEqual([])

    await press('editor-row-0-move')
    expect(choices()).toEqual([
      'editor-row-0-move-1',
      'editor-row-0-move-2',
      'editor-row-0-move-cancel'
    ])
    expect(byTestId('editor-row-0-move-cancel')?.textContent).toBe(
      en.socialRecovery.ceremony.cancelAction
    )

    await press('editor-row-0-move-cancel')
    expect(choices()).toEqual([])
    expect(storage.sets.length).toBe(writesBefore)
  })
})
