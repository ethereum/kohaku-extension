/**
 * @jest-environment jsdom
 *
 * The editor's path drawn as one tree, the rows that open their method's
 * enrollment, and the kind menus that add a slot and open its enrollment.
 *
 * jsdom has no `TextEncoder`, which viem needs when its modules load, so the
 * test sets Node's first and loads the modules after it.
 */
import { TextDecoder, TextEncoder } from 'util'

import type {
  Clause,
  Credential,
  SetupDraft,
  ValidationResult
} from '@web/modules/social-recovery/sdk-interfaces'
import type { Enrollment, SlotKind } from '@web/modules/social-recovery/shared/records'

import type { Root } from '@web/modules/social-recovery/setup/editor/__tests__/harness'
import { eachIt } from '@web/modules/social-recovery/shared/chrome/__fixtures__/table'

Object.assign(globalThis, { TextEncoder, TextDecoder })

// React only runs effects and state updates inside act() when this flag is set.
;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true

// The avatar loads its image files, which Jest cannot read.
jest.mock('@common/components/Avatar', () => ({ __esModule: true, default: () => null }))

const React = jest.requireActual<typeof import('react')>('react')
const { createRoot } = jest.requireActual<typeof import('react-dom/client')>('react-dom/client')
const { act } = jest.requireActual<typeof import('react-dom/test-utils')>('react-dom/test-utils')
const en = jest.requireActual<typeof import('@common/config/localization/translations/en.json')>(
  '@common/config/localization/translations/en.json'
)
const { WEB_ROUTES } = jest.requireActual<typeof import('@common/modules/router/constants/common')>(
  '@common/modules/router/constants/common'
)
const { ThemeContext } = jest.requireActual<typeof import('@common/contexts/themeContext')>(
  '@common/contexts/themeContext'
)
const EditorView = jest.requireActual<
  typeof import('@web/modules/social-recovery/setup/editor/EditorView')
>('@web/modules/social-recovery/setup/editor/EditorView').default
const { emptySlotOf } = jest.requireActual<
  typeof import('@web/modules/social-recovery/setup/editor/operations')
>('@web/modules/social-recovery/setup/editor/operations')
const {
  AADHAAR,
  ALICE,
  BOB,
  BOOK,
  CAROL,
  ENROLLED,
  enrolled,
  makeRecords,
  PASSKEY,
  PASSPORT,
  presetPath,
  THEME_CONTEXT,
  twoGroupPath
} = jest.requireActual<
  typeof import('@web/modules/social-recovery/setup/editor/__tests__/harness')
>('@web/modules/social-recovery/setup/editor/__tests__/harness')

/** An empty slot with no label, so the wallet cannot tell which kind it waits for. */
const UNREAD_SLOT: Credential = {
  method: '0x0000000000000000000000000000000000000000',
  config: '0x'
}

// The sentence the editor no longer shows, kept as text so the test outlives its string.
const SIZING_SENTENCE = 'A group of any one of two is the shape this wallet prefers at two methods.'

const NO_FINDING: ValidationResult = { errors: [], warnings: [] }

const ALL_KINDS: SlotKind[] = ['passkey', 'ecdsa', 'zkpassport', 'aadhaar']

const KIND_NAMES: Record<SlotKind, string> = {
  passkey: en.socialRecovery.methodNames.passkey,
  ecdsa: en.socialRecovery.display.nouns.guardian,
  zkpassport: en.socialRecovery.methodNames.passport,
  aadhaar: en.socialRecovery.methodNames.aadhaar
}

const draftOf = (clauses: Clause[]): SetupDraft => ({
  wait: 259200n,
  clauses,
  ignoresPause: false,
  privacy: { publicMetadata: '0x', backup: 'encrypted' }
})

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

/** Lets the in-memory storage's reads and writes settle, then renders what they changed. */
const settle = () =>
  act(async () => {
    await new Promise((resolve) => {
      setTimeout(resolve, 0)
    })
  })

const byTestId = (id: string) => container.querySelector<HTMLElement>(`[data-testid="${id}"]`)

/** The test ids on screen that start with `prefix`, in the order they render. */
const idsStartingWith = (prefix: string) =>
  Array.from(
    container.querySelectorAll<HTMLElement>(`[data-testid^="${prefix}"]`),
    (node) => node.getAttribute('data-testid') ?? ''
  )

/** The entries of an open kind menu, by the kind each one adds. */
const menuEntries = (menu: string) =>
  idsStartingWith(`${menu}-`).map((id) => id.slice(menu.length + 1))

const press = async (id: string) => {
  const node = byTestId(id)
  if (!node) {
    throw new Error(`nothing on screen with the test id ${id}`)
  }
  act(() => node.click())
  await settle()
}

const keyDown = async (key: string) => {
  act(() => {
    document.dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true }))
  })
  await settle()
}

const mouseDownOn = async (node: Node) => {
  act(() => {
    node.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }))
  })
  await settle()
}

const mount = async (clauses: Clause[], enrollments: Enrollment[] = []) => {
  const { storage, records } = makeRecords()
  await records.setupDraft.write(draftOf(clauses))
  await records.path.write(clauses)
  if (enrollments.length > 0) {
    await records.enrollments.write(enrollments)
  }
  const navigate = jest.fn()
  const validateSetup = jest.fn(async () => NO_FINDING)
  await act(async () => {
    root.render(
      <ThemeContext.Provider value={THEME_CONTEXT}>
        <EditorView
          records={records}
          client={{ status: 'ready', setup: { validateSetup } }}
          addressBook={BOOK}
          navigate={navigate}
        />
      </ThemeContext.Provider>
    )
  })
  await settle()
  const writesBefore = storage.sets.length
  const storedPath = async () => {
    const path = await records.path.read()
    return path.status === 'present' ? path.value : null
  }
  const storedClauses = async () => {
    const [draft, path] = await Promise.all([records.setupDraft.read(), records.path.read()])
    const draftClauses = draft.status === 'present' ? draft.value.clauses : null
    expect(path.status === 'present' ? path.value : null).toEqual(draftClauses)
    return draftClauses
  }
  return { storage, navigate, writesBefore, storedClauses, storedPath }
}

/** The route and the slot a navigation opened. */
const enrollOpened = (navigate: jest.Mock) => {
  expect(navigate).toHaveBeenCalledTimes(1)
  const [to] = navigate.mock.calls[0] as [string]
  const [route, search] = to.split('?')
  return { route, slot: Object.fromEntries(new URLSearchParams(search)) }
}

/** How many pieces of line the tree draws: the vertical runs and the ticks in every node's gutter. */
const linePieces = () => {
  const path = byTestId('editor-path')
  if (!path) {
    throw new Error('no path tree on screen')
  }
  return Array.from(path.children).reduce(
    (count, node) => count + (node.firstElementChild?.children.length ?? 0),
    0
  )
}

const ENROLLED_ALL = ENROLLED.map(enrolled)

describe('a row of the path opens its method', () => {
  eachIt([
    ['a required passkey row', 'editor-slot-0-0', { kind: 'passkey', clause: '0', member: '0' }],
    [
      'a guardian member of a group',
      'editor-slot-1-1',
      { kind: 'ecdsa', clause: '1', member: '1' }
    ],
    [
      'a passport member of a group',
      'editor-slot-1-2',
      { kind: 'zkpassport', clause: '1', member: '2' }
    ]
  ])('opens the enroll step at %s, writing nothing', async (_name, id, slot) => {
    const { navigate, storage, writesBefore } = await mount(presetPath(), ENROLLED_ALL)
    await press(id)
    expect(enrollOpened(navigate)).toEqual({ route: WEB_ROUTES.socialRecoverySetupEnroll, slot })
    expect(storage.sets.length).toBe(writesBefore)
  })

  it('opens the enroll step at a group member of the second group, its own clause and place', async () => {
    const { navigate } = await mount(twoGroupPath(), ENROLLED_ALL)
    await press('editor-slot-2-0')
    expect(enrollOpened(navigate).slot).toEqual({ kind: 'ecdsa', clause: '2', member: '0' })
  })

  eachIt([
    'editor-row-0-move',
    'editor-row-0-remove',
    'editor-member-1-0-required',
    'editor-member-1-0-remove'
  ])('does not open the enroll step on %s', async (id) => {
    const { navigate } = await mount(presetPath(), ENROLLED_ALL)
    await press(id)
    expect(navigate).not.toHaveBeenCalled()
  })

  it('keeps the move and remove controls outside the pressable row', async () => {
    await mount(presetPath(), ENROLLED_ALL)
    const row = byTestId('editor-slot-0-0')
    expect(row?.contains(byTestId('editor-row-0-move'))).toBe(false)
    expect(row?.contains(byTestId('editor-row-0-remove'))).toBe(false)
    const member = byTestId('editor-slot-1-0')
    expect(member?.contains(byTestId('editor-member-1-0-required'))).toBe(false)
    expect(member?.contains(byTestId('editor-member-1-0-remove'))).toBe(false)
  })
})

describe('"Add a required method"', () => {
  it('lists the four kinds, each by its name', async () => {
    await mount(presetPath())
    expect(byTestId('editor-add-required-menu')).toBeNull()
    await press('editor-add-required')
    expect(menuEntries('editor-add-required-menu')).toEqual(ALL_KINDS)
    ALL_KINDS.forEach((kind) =>
      expect(byTestId(`editor-add-required-menu-${kind}`)?.textContent).toBe(KIND_NAMES[kind])
    )
  })

  eachIt(ALL_KINDS)(
    'places an empty required %s slot after the path and opens its enrollment',
    async (kind) => {
      const { navigate, storedClauses } = await mount(presetPath())
      await press('editor-add-required')
      await press(`editor-add-required-menu-${kind}`)
      expect(await storedClauses()).toEqual([
        ...presetPath(),
        { threshold: 1, credentials: [emptySlotOf(kind)] }
      ])
      expect(enrollOpened(navigate)).toEqual({
        route: WEB_ROUTES.socialRecoverySetupEnroll,
        slot: { kind, clause: '2', member: '0' }
      })
      expect(byTestId('editor-row-2')).not.toBeNull()
      expect(byTestId('editor-add-required-menu')).toBeNull()
    }
  )
})

describe('a group\'s "Add member"', () => {
  it('lists the four kinds, each by its name', async () => {
    await mount(twoGroupPath())
    await press('editor-group-2-add')
    expect(menuEntries('editor-group-2-add-menu')).toEqual(ALL_KINDS)
    ALL_KINDS.forEach((kind) =>
      expect(byTestId(`editor-group-2-add-menu-${kind}`)?.textContent).toBe(KIND_NAMES[kind])
    )
  })

  eachIt(ALL_KINDS)(
    'places an empty %s slot at the end of that group only and opens its enrollment',
    async (kind) => {
      const { navigate, storedClauses } = await mount(twoGroupPath())
      await press('editor-group-1-add')
      await press(`editor-group-1-add-menu-${kind}`)
      const [row, first, second] = twoGroupPath()
      expect(await storedClauses()).toEqual([
        row,
        { ...first, credentials: [...first.credentials, emptySlotOf(kind)] },
        second
      ])
      expect(enrollOpened(navigate).slot).toEqual({ kind, clause: '1', member: '2' })
    }
  )

  it('adds into the group it belongs to when two groups are on the path', async () => {
    const { navigate, storedClauses } = await mount(twoGroupPath())
    await press('editor-group-2-add')
    await press('editor-group-2-add-menu-aadhaar')
    const [row, first, second] = twoGroupPath()
    expect(await storedClauses()).toEqual([
      row,
      first,
      { ...second, credentials: [CAROL, PASSPORT, emptySlotOf('aadhaar')] }
    ])
    expect(enrollOpened(navigate).slot).toEqual({ kind: 'aadhaar', clause: '2', member: '2' })
  })
})

describe('"Add a second method"', () => {
  const ONE_METHOD: Clause[] = [{ threshold: 1, credentials: [PASSKEY] }]

  it('lists the passkey and the guardian only', async () => {
    await mount(ONE_METHOD)
    await press('editor-add-second-method')
    expect(menuEntries('editor-add-second-method-menu')).toEqual(['passkey', 'ecdsa'])
  })

  eachIt(['passkey', 'ecdsa'] as const)(
    'turns the lone method and a %s slot into one group of any one of two',
    async (kind) => {
      const { navigate, storedClauses } = await mount(ONE_METHOD)
      await press('editor-add-second-method')
      await press(`editor-add-second-method-menu-${kind}`)
      expect(await storedClauses()).toEqual([
        { threshold: 1, credentials: [PASSKEY, emptySlotOf(kind)] }
      ])
      expect(enrollOpened(navigate).slot).toEqual({ kind, clause: '0', member: '1' })
    }
  )
})

describe('the kind menus', () => {
  it('keeps one menu open at a time', async () => {
    await mount(twoGroupPath())
    await press('editor-add-required')
    await press('editor-group-1-add')
    expect(byTestId('editor-add-required-menu')).toBeNull()
    expect(byTestId('editor-group-1-add-menu')).not.toBeNull()
    await press('editor-group-2-add')
    expect(byTestId('editor-group-1-add-menu')).toBeNull()
    expect(byTestId('editor-group-2-add-menu')).not.toBeNull()
  })

  it('closes on a second press of the control that opened it, writing nothing', async () => {
    const { navigate, storage, writesBefore } = await mount(presetPath())
    await press('editor-add-required')
    await press('editor-add-required')
    expect(byTestId('editor-add-required-menu')).toBeNull()
    await press('editor-group-1-add')
    await press('editor-group-1-add')
    expect(byTestId('editor-group-1-add-menu')).toBeNull()
    expect(storage.sets.length).toBe(writesBefore)
    expect(navigate).not.toHaveBeenCalled()
  })

  it('closes on an edit', async () => {
    await mount(presetPath())
    await press('editor-add-required')
    await press('editor-add-group')
    expect(byTestId('editor-add-required-menu')).toBeNull()
    await press('editor-group-1-add')
    await press('editor-member-1-0-remove')
    expect(byTestId('editor-group-1-add-menu')).toBeNull()
  })

  it('closes on a mouse press outside it and stays open on one inside it', async () => {
    const { navigate } = await mount(presetPath())
    await press('editor-add-required')
    const entry = byTestId('editor-add-required-menu-passkey')
    if (!entry) {
      throw new Error('the menu did not open')
    }
    await mouseDownOn(entry)
    expect(byTestId('editor-add-required-menu')).not.toBeNull()
    await mouseDownOn(document.body)
    expect(byTestId('editor-add-required-menu')).toBeNull()
    expect(navigate).not.toHaveBeenCalled()
  })
})

describe('the path as one tree', () => {
  it('draws one node per required row and per group, each holding its row or its group', async () => {
    const clauses: Clause[] = [
      { threshold: 1, credentials: [PASSKEY] },
      { threshold: 2, credentials: [ALICE, BOB] },
      { threshold: 1, credentials: [AADHAAR] },
      { threshold: 1, credentials: [CAROL, PASSPORT] }
    ]
    await mount(clauses)
    expect(idsStartingWith('editor-path-node-').sort()).toEqual([
      'editor-path-node-0',
      'editor-path-node-1',
      'editor-path-node-2',
      'editor-path-node-3'
    ])
    expect(byTestId('editor-path-node-0')?.contains(byTestId('editor-row-0'))).toBe(true)
    expect(byTestId('editor-path-node-2')?.contains(byTestId('editor-row-2'))).toBe(true)
    expect(byTestId('editor-path-node-1')?.contains(byTestId('editor-group-1'))).toBe(true)
    expect(byTestId('editor-path-node-3')?.contains(byTestId('editor-group-3'))).toBe(true)
  })

  it('follows the path as rows and groups come and go', async () => {
    await mount(presetPath())
    expect(idsStartingWith('editor-path-node-')).toHaveLength(2)
    await press('editor-add-group')
    expect(idsStartingWith('editor-path-node-')).toHaveLength(3)
    await press('editor-row-0-remove')
    expect(idsStartingWith('editor-path-node-')).toHaveLength(2)
  })

  it('keeps every row and control inside the tree under its earlier test id', async () => {
    await mount(presetPath())
    const path = byTestId('editor-path')
    ;[
      'editor-required',
      'editor-groups',
      'editor-groups-header',
      'editor-row-0',
      'editor-row-0-move',
      'editor-row-0-remove',
      'editor-slot-0-0',
      'editor-group-1',
      'editor-group-1-threshold',
      'editor-group-1-add',
      'editor-group-1-remove',
      'editor-slot-1-0',
      'editor-member-1-0-required',
      'editor-member-1-0-remove',
      'editor-add-required',
      'editor-add-group'
    ].forEach((id) => {
      expect(byTestId(id)).not.toBeNull()
      expect(path?.contains(byTestId(id))).toBe(true)
    })
  })

  it('joins a required row and a group with the "and" label and a drawn line', async () => {
    await mount(presetPath())
    expect(byTestId('editor-path')?.textContent).toContain(en.socialRecovery.shape.and)
    expect(linePieces()).toBeGreaterThan(0)
  })

  eachIt([
    ['one required row', [{ threshold: 1, credentials: [PASSKEY] }]],
    ['one group', [{ threshold: 1, credentials: [PASSKEY, ALICE] }]]
  ])('draws no line and no "and" on a path of %s', async (_name, clauses) => {
    await mount(clauses)
    expect(idsStartingWith('editor-path-node-')).toHaveLength(1)
    expect(linePieces()).toBe(0)
    expect(byTestId('editor-path')?.textContent).not.toContain(en.socialRecovery.shape.and)
  })

  it('shows no rules panel', async () => {
    await mount(presetPath(), ENROLLED_ALL)
    expect(byTestId('editor-rules')).toBeNull()
    await press('editor-add-group')
    expect(byTestId('editor-rules')).toBeNull()
  })
})

describe('"Make it a group" without the sizing sentence', () => {
  const TWO_ROWS: Clause[] = [
    { threshold: 1, credentials: [PASSKEY] },
    { threshold: 1, credentials: [ALICE] }
  ]

  it('offers "Make it a group" on two required rows with no sizing sentence among the lines', async () => {
    await mount(TWO_ROWS)
    expect(byTestId('editor-make-it-a-group')?.textContent).toBe(
      en.socialRecovery.editor.makeItAGroup
    )
    expect(byTestId('editor-rule-lines')?.textContent).not.toContain(SIZING_SENTENCE)
  })

  it('makes the two rows one group of any one of two', async () => {
    const { storedClauses } = await mount(TWO_ROWS)
    await press('editor-make-it-a-group')
    expect(await storedClauses()).toEqual([{ threshold: 1, credentials: [PASSKEY, ALICE] }])
    expect(byTestId('editor-make-it-a-group')).toBeNull()
  })

  eachIt([
    ['a row beside a group', presetPath()],
    ['one group of two', [{ threshold: 1, credentials: [PASSKEY, ALICE] }]]
  ])('does not offer it on %s', async (_name, clauses) => {
    await mount(clauses)
    expect(byTestId('editor-make-it-a-group')).toBeNull()
  })
})

describe('an empty slot of a kind the wallet cannot read', () => {
  const NO_LABEL: Clause[] = [
    { threshold: 1, credentials: [PASSKEY] },
    { threshold: 1, credentials: [ALICE, UNREAD_SLOT] }
  ]
  const UNKNOWN_LABEL: Clause[] = [
    { threshold: 1, credentials: [PASSKEY] },
    { threshold: 1, credentials: [ALICE, { ...UNREAD_SLOT, label: 'fingerprint' }] }
  ]

  eachIt([
    ['no label', NO_LABEL],
    ['a label that names no kind', UNKNOWN_LABEL]
  ])('with %s opens the four kinds under it, writing nothing', async (_name, clauses) => {
    const { navigate, storage, writesBefore } = await mount(clauses, ENROLLED_ALL)
    expect(byTestId('editor-slot-1-1-menu')).toBeNull()
    await press('editor-slot-1-1')
    expect(menuEntries('editor-slot-1-1-menu')).toEqual(ALL_KINDS)
    ALL_KINDS.forEach((kind) =>
      expect(byTestId(`editor-slot-1-1-menu-${kind}`)?.textContent).toBe(KIND_NAMES[kind])
    )
    expect(navigate).not.toHaveBeenCalled()
    expect(storage.sets.length).toBe(writesBefore)
  })

  it('closes its kinds on a second press of the slot', async () => {
    await mount(NO_LABEL, ENROLLED_ALL)
    await press('editor-slot-1-1')
    await press('editor-slot-1-1')
    expect(byTestId('editor-slot-1-1-menu')).toBeNull()
  })

  eachIt(ALL_KINDS)(
    'becomes an empty %s slot in its place on a pick and opens that enrollment',
    async (kind) => {
      const { navigate, storedClauses } = await mount(NO_LABEL, ENROLLED_ALL)
      await press('editor-slot-1-1')
      await press(`editor-slot-1-1-menu-${kind}`)
      expect(await storedClauses()).toEqual([
        { threshold: 1, credentials: [PASSKEY] },
        { threshold: 1, credentials: [ALICE, emptySlotOf(kind)] }
      ])
      expect(enrollOpened(navigate)).toEqual({
        route: WEB_ROUTES.socialRecoverySetupEnroll,
        slot: { kind, clause: '1', member: '1' }
      })
      expect(byTestId('editor-slot-1-1-menu')).toBeNull()
    }
  )

  it('as a required row becomes the picked kind in its own row', async () => {
    const { navigate, storedClauses } = await mount(
      [
        { threshold: 1, credentials: [UNREAD_SLOT] },
        { threshold: 2, credentials: [ALICE, BOB] }
      ],
      ENROLLED_ALL
    )
    await press('editor-slot-0-0')
    await press('editor-slot-0-0-menu-passkey')
    expect(await storedClauses()).toEqual([
      { threshold: 1, credentials: [emptySlotOf('passkey')] },
      { threshold: 2, credentials: [ALICE, BOB] }
    ])
    expect(enrollOpened(navigate).slot).toEqual({ kind: 'passkey', clause: '0', member: '0' })
  })

  it('on a pick whose write fails closes the menu, keeps the stored slot and opens nothing', async () => {
    const { navigate, storage, storedPath } = await mount(NO_LABEL, ENROLLED_ALL)
    await press('editor-slot-1-1')
    storage.rejectOnce('set', 'path')
    await press('editor-slot-1-1-menu-passkey')
    await settle()
    expect(byTestId('editor-slot-1-1-menu')).toBeNull()
    expect(byTestId('editor-slot-1-1')).not.toBeNull()
    expect(byTestId('editor-write-failed')?.textContent).toBe(en.socialRecovery.records.writeFailed)
    expect(await storedPath()).toEqual(NO_LABEL)
    expect(navigate).not.toHaveBeenCalled()
  })
})

describe('a row that cannot open its method', () => {
  it('does not open the enroll step on an enrolled credential with no enrollment record', async () => {
    const { navigate } = await mount(presetPath())
    await press('editor-slot-0-0')
    await press('editor-slot-1-0')
    await press('editor-slot-1-2')
    expect(navigate).not.toHaveBeenCalled()
    expect(byTestId('editor-slot-0-0')?.getAttribute('role')).not.toBe('button')
  })

  it('does not open a credential of a method the wallet does not know, even when enrolled', async () => {
    const foreign: Credential = { ...ALICE, method: '0x9999999999999999999999999999999999999999' }
    const { navigate } = await mount(
      [{ threshold: 1, credentials: [foreign] }],
      [enrolled(foreign)]
    )
    await press('editor-slot-0-0')
    expect(navigate).not.toHaveBeenCalled()
    expect(byTestId('editor-slot-0-0-menu')).toBeNull()
  })
})

describe('the arrow on a row that opens', () => {
  /** The arrows on screen, by the row each one ends. */
  const arrows = () =>
    idsStartingWith('editor-slot-')
      .filter((id) => id.endsWith('-opens'))
      .sort()

  it('ends an enrolled row whose enrollment the records hold and every empty slot', async () => {
    await mount(
      [
        { threshold: 1, credentials: [PASSKEY] },
        { threshold: 1, credentials: [ALICE, emptySlotOf('aadhaar'), UNREAD_SLOT] }
      ],
      ENROLLED_ALL
    )
    ;['editor-slot-0-0', 'editor-slot-1-0', 'editor-slot-1-1', 'editor-slot-1-2'].forEach((id) => {
      const arrow = byTestId(`${id}-opens`)
      expect(arrow).not.toBeNull()
      expect(byTestId(id)?.contains(arrow)).toBe(true)
    })
  })

  it('is absent from every row when the records hold no enrollment', async () => {
    await mount(presetPath())
    expect(byTestId('editor-slot-0-0')).not.toBeNull()
    expect(arrows()).toEqual([])
  })

  it('shows only on the rows whose enrollment the records hold', async () => {
    await mount(presetPath(), [enrolled(PASSKEY), enrolled(BOB)])
    expect(arrows()).toEqual(['editor-slot-0-0-opens', 'editor-slot-1-1-opens'])
  })
})

describe('a kind menu and the keyboard', () => {
  it('closes the open menu on Escape, writing nothing and opening nothing', async () => {
    const { navigate, storage, writesBefore } = await mount(presetPath())
    await press('editor-add-required')
    await keyDown('Escape')
    expect(byTestId('editor-add-required-menu')).toBeNull()
    await press('editor-group-1-add')
    await keyDown('Escape')
    expect(byTestId('editor-group-1-add-menu')).toBeNull()
    expect(storage.sets.length).toBe(writesBefore)
    expect(navigate).not.toHaveBeenCalled()
  })

  it("closes an empty slot's kinds on Escape", async () => {
    await mount([{ threshold: 1, credentials: [UNREAD_SLOT] }])
    await press('editor-slot-0-0')
    expect(byTestId('editor-slot-0-0-menu')).not.toBeNull()
    await keyDown('Escape')
    expect(byTestId('editor-slot-0-0-menu')).toBeNull()
  })

  it('stays open on any other key', async () => {
    await mount(presetPath())
    await press('editor-add-required')
    await keyDown('Enter')
    await keyDown('a')
    expect(byTestId('editor-add-required-menu')).not.toBeNull()
  })

  it('opens again after Escape closed it', async () => {
    await mount(presetPath())
    await press('editor-add-required')
    await keyDown('Escape')
    await press('editor-add-required')
    expect(byTestId('editor-add-required-menu')).not.toBeNull()
  })

  eachIt(['editor-add-required', 'editor-group-1-add'])(
    'announces %s as a control that opens a menu',
    async (id) => {
      await mount(presetPath())
      expect(byTestId(id)?.getAttribute('aria-haspopup')).toBe('menu')
      await press(id)
      expect(byTestId(id)?.getAttribute('aria-haspopup')).toBe('menu')
    }
  )

  eachIt(['editor-add-required', 'editor-group-1-add'])(
    'announces whether the menu of %s is open',
    async (id) => {
      await mount(presetPath())
      expect(byTestId(id)?.getAttribute('aria-expanded')).toBe('false')
      await press(id)
      expect(byTestId(id)?.getAttribute('aria-expanded')).toBe('true')
    }
  )
})
