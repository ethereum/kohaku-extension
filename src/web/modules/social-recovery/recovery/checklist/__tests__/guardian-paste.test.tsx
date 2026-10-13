/**
 * @jest-environment jsdom
 *
 * The paste of a guardian's approval: it counts or fails at once. A line
 * that adds is written to the session once and fills the place it names,
 * whatever row it was pasted into; every failure reads one of the written
 * errors with the paste kept and nothing written. No row ever holds a pasted
 * approval as pending.
 */
import type {
  FakeKit,
  Mounted,
  TestRecords
} from '@web/modules/social-recovery/recovery/checklist/__tests__/harness'
import {
  ACCOUNT,
  CHAIN_ID,
  configurationOf,
  DAY_SECONDS,
  depsOf,
  fakeKit,
  gatheringOf,
  GUARDIANS,
  guardianCredential,
  MIXED_PATH,
  mountChecklist,
  NOW,
  outside,
  replyOf,
  seedCache,
  seedEntry,
  seedSession,
  servedRequestOf,
  storedSession,
  t,
  TIME_ZONE,
  testRecords
} from '@web/modules/social-recovery/recovery/checklist/__tests__/harness'
import type {
  AddRefusalReason,
  ApproverReply,
  Configuration,
  Gathering
} from '@web/modules/social-recovery/sdk-interfaces'
import { deferred } from '@web/modules/social-recovery/shared/chrome/__fixtures__/deferred'

/* eslint-disable @typescript-eslint/no-var-requires, global-require */
const {
  renderDateTimeInZone
}: typeof import('@web/modules/social-recovery/shared/display') = require('@web/modules/social-recovery/shared/display')
const {
  notServedRefusal
}: typeof import('@web/modules/social-recovery/shared/client/kit/setup-client') = require('@web/modules/social-recovery/shared/client/kit/setup-client')
/* eslint-enable @typescript-eslint/no-var-requires, global-require */

const PASTE = 'socialRecovery.checklist.paste'
const GUARDIAN = 'socialRecovery.checklist.guardian'

/** A reply as the one line a guardian sends back: its JSON, base64url with no padding. */
const lineOf = (value: unknown): string => Buffer.from(JSON.stringify(value)).toString('base64url')

const NO_MATCH = [
  t(`${PASTE}.noMatch`),
  t(`${PASTE}.noMatchLead`),
  t(`${PASTE}.causeSigner`),
  t(`${PASTE}.causeOtherRequest`),
  t(`${PASTE}.causeUndeployed`)
]

const ONE_GUARDIAN = configurationOf([
  { threshold: 1, credentials: [guardianCredential(GUARDIANS[0], 'Alice')] }
])

const GROUP_OF_ONE = configurationOf([
  {
    threshold: 1,
    credentials: [guardianCredential(GUARDIANS[0]), guardianCredential(GUARDIANS[1])]
  }
])

describe('the guardian paste', () => {
  let view: Mounted | undefined
  let world: TestRecords
  let kit: FakeKit
  let gathering: Gathering
  let clock: number

  const id = (place: number, name: string) => `checklist-row-${place}-${name}`

  const open = async (configuration: Configuration = MIXED_PATH) => {
    world = testRecords()
    gathering = gatheringOf(configuration)
    await seedEntry(world.records)
    await seedCache(world.records, configuration)
    await seedSession(world.records, gathering)
    kit = fakeKit(configuration, { served: true })
    view?.unmount()
    view = await mountChecklist({
      records: world.records,
      client: kit.state,
      deps: depsOf({ now: () => clock })
    })
    return view
  }

  const sessionWrites = () =>
    world.storage.sets.filter((key) => key.includes('recoverySession')).length

  const paste = async (place: number, text: string) => {
    const mounted = view as Mounted
    await mounted.type(id(place, 'paste-input'), text)
    await mounted.press(id(place, 'paste-add'))
  }

  const errorLines = (place: number) =>
    Array.from(view?.byTestId(id(place, 'paste-error'))?.children ?? []).map(
      (node) => node.textContent
    )

  /** After a paste a row either took the approval with its field gone, or kept the paste under one error. */
  const expectSettled = (place: number, text: string, outcome: 'added' | 'error') => {
    const mounted = view as Mounted
    if (outcome === 'added') {
      expect(mounted.byTestId(id(place, 'verified'))).not.toBeNull()
      expect(mounted.byTestId(id(place, 'paste'))).toBeNull()
    } else {
      expect(mounted.byTestId(id(place, 'paste-error'))).not.toBeNull()
      expect(mounted.valueOf(id(place, 'paste-input'))).toBe(text)
      expect(mounted.isDisabled(id(place, 'paste-add'))).toBe(false)
    }
  }

  const repliesHeld = async () => {
    const stored = await storedSession(world.records)
    return stored?.value.state === 'live' ? stored.value.gathering.replies : []
  }

  beforeEach(() => {
    clock = NOW
  })

  afterEach(() => {
    jest.restoreAllMocks()
    view?.unmount()
    view = undefined
  })

  it('adds a well-formed reply in one session write, and the row reads added and verified', async () => {
    await open()
    const reply = replyOf(gathering, 1)
    const before = sessionWrites()

    await paste(1, lineOf(reply))

    expect(sessionWrites() - before).toBe(1)
    expect(await repliesHeld()).toEqual([reply])
    expect(view?.byTestId(id(1, 'verified'))?.textContent).toBe(t(`${GUARDIAN}.verified`))
    expect(view?.byTestId(id(1, 'added'))?.textContent).toBe(
      t(`${GUARDIAN}.added`, { date: renderDateTimeInZone(NOW, TIME_ZONE).date })
    )
    expect(view?.byTestId(id(1, 'chip'))?.textContent).toBe(
      t('socialRecovery.status.collection.complete')
    )
    expectSettled(1, '', 'added')
  })

  it('verifies the reply against the request of its own place before it adds it', async () => {
    await open()
    const reply = replyOf(gathering, 1)

    await paste(1, lineOf(reply))

    expect(kit.verifyReply).toHaveBeenCalledTimes(1)
    expect(kit.verifyReply).toHaveBeenCalledWith(servedRequestOf(gathering, 1), reply)
  })

  it('takes a line with whitespace around it', async () => {
    await open()
    const reply = replyOf(gathering, 1)

    await paste(1, `  \n${lineOf(reply)}\n `)

    expect(await repliesHeld()).toEqual([reply])
    expectSettled(1, '', 'added')
  })

  it('reads the same line pasted again as already in the list, and writes nothing', async () => {
    await open()
    const line = lineOf(replyOf(gathering, 2))
    await paste(2, line)
    const before = sessionWrites()
    const progress = view?.byTestId('checklist-progress')?.textContent

    await paste(3, line)

    expect(errorLines(3)).toEqual([t(`${PASTE}.duplicate`), t(`${PASTE}.duplicateDetail`)])
    expect(sessionWrites()).toBe(before)
    expect(view?.byTestId('checklist-progress')?.textContent).toBe(progress)
    expect(view?.byTestId(id(3, 'verified'))).toBeNull()
    expectSettled(3, line, 'error')
  })

  const notReplies: [string, string][] = [
    ['plain words', 'yes I approve'],
    ['a line that is not base64url', 'eyJ*bad'],
    ['a line of JSON that is not a reply', lineOf({ hello: 'world' })],
    ['the link itself', `chrome-extension://kohaku/tab.html#/x?request=${lineOf({ a: 1 })}`],
    ['a request in place of a reply', lineOf(servedRequestOf(gatheringOf(MIXED_PATH), 1))]
  ]

  notReplies.forEach(([name, text]) =>
    it(`reads ${name} as not an approval, and writes nothing`, async () => {
      await open()
      const before = sessionWrites()

      await paste(1, text)

      expect(errorLines(1)).toEqual([
        t(`${PASTE}.notAnApproval`),
        t(`${PASTE}.notAnApprovalRepair`)
      ])
      expect(sessionWrites()).toBe(before)
      expect(kit.verifyReply).not.toHaveBeenCalled()
      expectSettled(1, text, 'error')
    })
  )

  it('reads a reply padded past 16 KiB as not an approval, keeps the paste and writes nothing', async () => {
    await open()
    const reply = replyOf(gathering, 1)
    const line = lineOf({ ...reply, note: 'x'.repeat(16 * 1024) })
    const before = sessionWrites()

    await paste(1, line)

    expect(errorLines(1)).toEqual([t(`${PASTE}.notAnApproval`), t(`${PASTE}.notAnApprovalRepair`)])
    expect(sessionWrites()).toBe(before)
    expect(kit.verifyReply).not.toHaveBeenCalled()
    expectSettled(1, line, 'error')

    await paste(1, lineOf(reply))

    expect(await repliesHeld()).toEqual([reply])
    expectSettled(1, '', 'added')
  })

  it('reads a reply missing its signature as not an approval', async () => {
    await open()
    const reply: Partial<ApproverReply> = { ...replyOf(gathering, 1) }
    delete reply.proof
    const line = lineOf(reply)

    await paste(1, line)

    expect(errorLines(1)[0]).toBe(t(`${PASTE}.notAnApproval`))
    expectSettled(1, line, 'error')
  })

  it('reads a reply of a version the client cannot read as not an approval, and writes nothing', async () => {
    await open()
    kit.addApproverReply.mockImplementation((held: Gathering) => ({
      gathering: held,
      reason: { kind: 'add-refusal', cause: 'version-unread' }
    }))
    const before = sessionWrites()
    const line = lineOf({ ...replyOf(gathering, 1), version: 9 })

    await paste(1, line)

    expect(errorLines(1)).toEqual([t(`${PASTE}.notAnApproval`), t(`${PASTE}.notAnApprovalRepair`)])
    expect(sessionWrites()).toBe(before)
    expectSettled(1, line, 'error')
  })

  it('reads a reply after the deadline as expired, and writes nothing', async () => {
    await open()
    const line = lineOf(replyOf(gathering, 1))
    clock = NOW + (DAY_SECONDS + 60) * 1000
    const before = sessionWrites()

    await paste(1, line)

    expect(errorLines(1)).toEqual([t(`${PASTE}.expired`), t(`${PASTE}.expiredDetail`)])
    expect(sessionWrites()).toBe(before)
    expect(kit.verifyReply).not.toHaveBeenCalled()
    expectSettled(1, line, 'error')
  })

  const oneApproval: [string, Configuration][] = [
    ['a path of one row', ONE_GUARDIAN],
    ['a lone group of threshold one', GROUP_OF_ONE]
  ]

  oneApproval.forEach(([name, configuration]) =>
    it(`reads an expired reply on ${name} without the words every approval dies together`, async () => {
      await open(configuration)
      const line = lineOf(replyOf(gathering, 0))
      clock = NOW + (DAY_SECONDS + 60) * 1000

      await paste(0, line)

      expect(errorLines(0)).toEqual([t(`${PASTE}.expired`), t(`${PASTE}.expiredDetailOne`)])
      expectSettled(0, line, 'error')
    })
  )

  it('reads a reply the verify rejects as matching no method, with its three causes, and writes nothing', async () => {
    await open()
    kit.verifyReply.mockResolvedValue('rejected')
    const before = sessionWrites()
    const line = lineOf(replyOf(gathering, 1))

    await paste(1, line)

    expect(errorLines(1)).toEqual(NO_MATCH)
    expect(sessionWrites()).toBe(before)
    expect(await repliesHeld()).toEqual([])
    expectSettled(1, line, 'error')
  })

  it('reads a verify that throws as a failed check, keeps the paste and adds on the retry', async () => {
    await open()
    kit.verifyReply.mockRejectedValueOnce(new Error('rpc down'))
    const reply = replyOf(gathering, 1)
    const line = lineOf(reply)
    const before = sessionWrites()

    await paste(1, line)

    expect(errorLines(1)).toEqual([t(`${PASTE}.checkFailed`)])
    expect(sessionWrites()).toBe(before)
    expectSettled(1, line, 'error')

    await view?.press(id(1, 'paste-add'))

    expect(await repliesHeld()).toEqual([reply])
    expectSettled(1, '', 'added')
  })

  it('reads a verify that judges nothing as a failed check, keeps the paste and adds on the retry', async () => {
    await open()
    kit.verifyReply.mockResolvedValueOnce('not-judged')
    const reply = replyOf(gathering, 1)
    const line = lineOf(reply)
    const before = sessionWrites()

    await paste(1, line)

    expect(errorLines(1)).toEqual([t(`${PASTE}.checkFailed`)])
    expect(sessionWrites()).toBe(before)
    expect(await repliesHeld()).toEqual([])
    expectSettled(1, line, 'error')

    await view?.press(id(1, 'paste-add'))

    expect(await repliesHeld()).toEqual([reply])
    expectSettled(1, '', 'added')
  })

  it('reads a refusal of the verify by the client as a failed check and writes nothing', async () => {
    await open()
    kit.verifyReply.mockRejectedValue(notServedRefusal('walletReads.verifyReply'))
    const before = sessionWrites()
    const line = lineOf(replyOf(gathering, 1))

    await paste(1, line)

    expect(errorLines(1)).toEqual([t(`${PASTE}.checkFailed`)])
    expect(sessionWrites()).toBe(before)
    expect(await repliesHeld()).toEqual([])
    expectSettled(1, line, 'error')
  })

  it('fills the place the reply names, not the row it was pasted into', async () => {
    await open()
    const reply = replyOf(gathering, 2)

    await paste(1, lineOf(reply))

    expect(await repliesHeld()).toEqual([reply])
    expect(kit.verifyReply).toHaveBeenCalledWith(servedRequestOf(gathering, 2), reply)
    expect(view?.byTestId(id(2, 'verified'))).not.toBeNull()
    expect(view?.byTestId(id(2, 'added'))).not.toBeNull()
    expect(view?.byTestId(id(1, 'verified'))).toBeNull()
    expect(view?.byTestId(id(1, 'paste'))).not.toBeNull()
    expect(view?.byTestId(id(1, 'paste-error'))).toBeNull()
    expect(view?.valueOf(id(1, 'paste-input'))).toBe('')
  })

  const addRefusals: AddRefusalReason[] = [
    'place-unknown',
    'credential-mismatch',
    'binding-mismatch',
    'digest-mismatch'
  ]

  addRefusals.forEach((cause) =>
    it(`reads the add's ${cause} as matching no method, and writes nothing`, async () => {
      await open()
      kit.addApproverReply.mockImplementation((held: Gathering) => ({
        gathering: held,
        reason: { kind: 'add-refusal', cause }
      }))
      const before = sessionWrites()
      const line = lineOf(replyOf(gathering, 1))

      await paste(1, line)

      expect(errorLines(1)).toEqual(NO_MATCH)
      expect(sessionWrites()).toBe(before)
      expectSettled(1, line, 'error')
    })
  )

  it('reads a reply for a place the path does not hold as matching no method', async () => {
    await open()
    kit.addApproverReply.mockImplementation((held: Gathering, reply: ApproverReply) =>
      held.places.some((place) => place.place === reply.place)
        ? { gathering: { ...held, replies: [...held.replies, reply] } }
        : { gathering: held, reason: { kind: 'add-refusal', cause: 'place-unknown' } }
    )
    const line = lineOf({ ...replyOf(gathering, 1), place: 9 })

    await paste(1, line)

    expect(errorLines(1)).toEqual(NO_MATCH)
    expect(await repliesHeld()).toEqual([])
    expectSettled(1, line, 'error')
  })

  it('renders the reload where another tab wrote the session first, and loses no reply', async () => {
    await open()
    const read = await storedSession(world.records)
    await outside(() =>
      world.otherTab
        .recoverySession(CHAIN_ID, ACCOUNT)
        .setNote(3, 'unanswered', read?.revision ?? null)
    )

    await paste(1, lineOf(replyOf(gathering, 1)))

    expect(view?.byTestId('checklist-conflict')).not.toBeNull()
    expect(view?.byTestId('checklist-rows')).toBeNull()
    const stored = await storedSession(world.records)
    expect(stored?.value.state === 'live' && stored.value.notes).toEqual({ 3: 'unanswered' })
    expect(await repliesHeld()).toEqual([])

    await view?.press('checklist-conflict-retry')

    expect(view?.byTestId(id(1, 'paste'))).not.toBeNull()
    await paste(1, lineOf(replyOf(gathering, 1)))
    expect(await repliesHeld()).toEqual([replyOf(gathering, 1)])
  })

  it('reads a write that fails as not saved, with the paste kept', async () => {
    await open()
    world.storage.refuse.push('recoverySession')
    const line = lineOf(replyOf(gathering, 1))

    await paste(1, line)

    expect(errorLines(1)).toEqual([t('socialRecovery.checklist.writeFailed')])
    expectSettled(1, line, 'error')
    world.storage.refuse.splice(0)
  })

  it('shows no pending state: every paste either adds or reads its error', async () => {
    await open()
    const lines: [number, string, 'added' | 'error'][] = [
      [1, 'not a reply', 'error'],
      [1, lineOf(replyOf(gathering, 1)), 'added'],
      [2, lineOf(replyOf(gathering, 1)), 'error'],
      [2, lineOf(replyOf(gathering, 2)), 'added']
    ]

    const step = async ([place, text, outcome]: [number, string, 'added' | 'error']) => {
      await paste(place, text)
      expectSettled(place, text, outcome)
      ;[0, 1, 2, 3, 4].forEach((row) => {
        const chip = view?.byTestId(id(row, 'chip'))?.textContent ?? ''
        expect(chip).not.toMatch(/pending|checking/i)
      })
    }

    await step(lines[0])
    await step(lines[1])
    await step(lines[2])
    await step(lines[3])
    expect((await repliesHeld()).map((reply) => reply.place)).toEqual([1, 2])
  })

  describe('while a check runs', () => {
    const input = (place: number) =>
      view?.byTestId(id(place, 'paste-input'))?.querySelector('input') ??
      (view?.byTestId(id(place, 'paste-input')) as HTMLInputElement | null)

    const startPaste = async (line: string) => {
      const verdict = deferred<'satisfied' | 'rejected'>()
      kit.verifyReply.mockImplementation(() => verdict.promise)
      const mounted = view as Mounted
      await mounted.type(id(1, 'paste-input'), line)
      await mounted.press(id(1, 'paste-add'))
      return verdict
    }

    it('takes no input and offers no second add until the result, then clears on an add', async () => {
      await open()
      const line = lineOf(replyOf(gathering, 1))
      const verdict = await startPaste(line)

      expect(input(1)?.readOnly).toBe(true)
      expect(view?.isDisabled(id(1, 'paste-add'))).toBe(true)
      expect(view?.valueOf(id(1, 'paste-input'))).toBe(line)
      await view?.press(id(1, 'paste-add'))
      expect(kit.verifyReply).toHaveBeenCalledTimes(1)

      verdict.resolve('satisfied')
      await outside(() => verdict.promise)

      expect(await repliesHeld()).toEqual([replyOf(gathering, 1)])
      expectSettled(1, '', 'added')
    })

    it('is editable again after a failure, with the paste kept under its error', async () => {
      await open()
      const line = lineOf(replyOf(gathering, 1))
      const verdict = await startPaste(line)
      expect(input(1)?.readOnly).toBe(true)

      verdict.resolve('rejected')
      await outside(() => verdict.promise)

      expect(input(1)?.readOnly).toBe(false)
      expect(errorLines(1)).toEqual(NO_MATCH)
      expectSettled(1, line, 'error')

      await view?.type(id(1, 'paste-input'), 'edited')
      expect(view?.valueOf(id(1, 'paste-input'))).toBe('edited')
      expect(view?.byTestId(id(1, 'paste-error'))).toBeNull()
    })

    it('is editable again after a check that throws, with the paste kept', async () => {
      await open()
      const line = lineOf(replyOf(gathering, 1))
      const verdict = await startPaste(line)

      verdict.reject(new Error('rpc down'))
      await outside(() => verdict.promise.catch(() => undefined))

      expect(input(1)?.readOnly).toBe(false)
      expect(errorLines(1)).toEqual([t(`${PASTE}.checkFailed`)])
      expectSettled(1, line, 'error')
    })
  })

  describe('the clock', () => {
    const deadlineMs = () => Number(gathering.request.validUntil) * 1000

    it('judges the deadline by the clock the checklist is given, not the machine clock', async () => {
      await open()
      jest.spyOn(Date, 'now').mockReturnValue(deadlineMs() + DAY_SECONDS * 1000)

      await paste(1, lineOf(replyOf(gathering, 1)))

      expect(await repliesHeld()).toEqual([replyOf(gathering, 1)])
      expectSettled(1, '', 'added')
      jest.restoreAllMocks()
    })

    it('reads a paste one second past the deadline as expired, and one a second before it as in time', async () => {
      await open()
      clock = deadlineMs() + 1000
      const late = lineOf(replyOf(gathering, 1))

      await paste(1, late)
      expect(errorLines(1)).toEqual([t(`${PASTE}.expired`), t(`${PASTE}.expiredDetail`)])
      expect(kit.verifyReply).not.toHaveBeenCalled()

      clock = deadlineMs() - 1000
      await paste(1, late)
      expect(await repliesHeld()).toEqual([replyOf(gathering, 1)])
      expectSettled(1, '', 'added')
    })

    it('reads the clock once, before the check: a check that ends past the deadline still adds', async () => {
      await open()
      const verdict = deferred<'satisfied'>()
      kit.verifyReply.mockImplementation(() => verdict.promise)
      const pastedAt = deadlineMs() - 60 * 1000
      clock = pastedAt
      await view?.type(id(1, 'paste-input'), lineOf(replyOf(gathering, 1)))
      await view?.press(id(1, 'paste-add'))

      clock = deadlineMs() + DAY_SECONDS * 1000
      verdict.resolve('satisfied')
      await outside(() => verdict.promise)

      expect(await repliesHeld()).toEqual([replyOf(gathering, 1)])
      expect(view?.byTestId(id(1, 'added'))?.textContent).toBe(
        t(`${GUARDIAN}.added`, { date: renderDateTimeInZone(pastedAt, TIME_ZONE).date })
      )
    })
  })
})
