/**
 * The editor's operations over a path's clauses, as pure functions: each
 * returns new clauses and leaves its input as it was, a move keeps the
 * credential object it moves, and one enrolled credential is refused at a
 * second place in the path while empty slots never count as one.
 */
import { getAddress, zeroAddress } from 'viem'

import i18n from '@common/config/localization'
import en from '@common/config/localization/translations/en.json'
import type { Clause, Finding, SetupDraft } from '@web/modules/social-recovery/sdk-interfaces'

import { renderFailedTestLine, renderFinding } from '../copy'
import {
  addGroup,
  addMember,
  addRequired,
  blocksContinue,
  emptySlotOf,
  enrollSearchOf,
  fillSlot,
  guardianAddressOf,
  isEmptySlot,
  kindOf,
  makeItAGroup,
  makeRequired,
  moveToGroup,
  pathHolds,
  pickerEntriesOf,
  placeAt,
  readThreshold,
  removeClause,
  removeMember,
  sameCredential,
  setThreshold,
  withClauses
} from '../operations'
import {
  AADHAAR,
  ALICE,
  BOB,
  BOOK,
  CAROL,
  DAVE,
  enrolled,
  guardianAddress,
  PASSKEY,
  PASSPORT,
  presetPath,
  twoGroupPath
} from './harness'

const t = i18n.t

/** Freezes the clauses and their credential lists, so an operation that mutates its input throws. */
const frozen = (clauses: Clause[]): Clause[] =>
  Object.freeze(
    clauses.map((clause) =>
      Object.freeze({ ...clause, credentials: Object.freeze([...clause.credentials]) })
    )
  ) as unknown as Clause[]

const applied = (result: ReturnType<typeof addRequired>) => {
  if (result.status !== 'applied') {
    throw new Error(`expected applied, got ${result.status}`)
  }
  return result
}

describe("a guardian's address", () => {
  it('is decoded from its one-word config, and a config the codec did not write gives none', () => {
    expect(guardianAddressOf(ALICE)).toBe(getAddress(guardianAddress('a1')))
    expect(guardianAddressOf({ ...ALICE, config: '0x1234' })).toBeUndefined()
  })
})

describe('the empty slot', () => {
  it('is the zero method with empty config, labelled with its kind', () => {
    const slot = emptySlotOf('passkey')
    expect(slot).toEqual({ method: zeroAddress, config: '0x', label: 'passkey' })
    expect(isEmptySlot(slot)).toBe(true)
    expect(isEmptySlot(PASSKEY)).toBe(false)
  })

  it('reads its kind from its label, and an enrolled credential reads its kind from the address book', () => {
    expect(kindOf(emptySlotOf('ecdsa'), BOOK)).toBe('ecdsa')
    expect(kindOf(emptySlotOf('aadhaar'), BOOK)).toBe('aadhaar')
    expect(kindOf({ method: zeroAddress, config: '0x', label: 'Alice' }, BOOK)).toBeUndefined()
    expect(kindOf(ALICE, BOOK)).toBe('ecdsa')
    expect(kindOf(PASSKEY, BOOK)).toBe('passkey')
    expect(kindOf(PASSPORT, BOOK)).toBe('zkpassport')
    expect(kindOf(AADHAAR, BOOK)).toBe('aadhaar')
    expect(kindOf({ ...ALICE, method: BOOK.manager }, BOOK)).toBeUndefined()
  })
})

describe('one enrolled credential', () => {
  it('is the same method whatever the case of its method address and config', () => {
    const shouted = {
      method: ALICE.method.toUpperCase().replace('0X', '0x') as typeof ALICE.method,
      config: ALICE.config.toUpperCase().replace('0X', '0x') as typeof ALICE.config
    }
    expect(sameCredential(ALICE, shouted)).toBe(true)
    expect(sameCredential(ALICE, { ...ALICE, label: 'Someone else' })).toBe(true)
  })

  it('differs from another credential of its kind and from an empty slot, and an empty slot matches nothing', () => {
    expect(sameCredential(ALICE, BOB)).toBe(false)
    expect(sameCredential(ALICE, { ...ALICE, method: BOOK.methods.passkey })).toBe(false)
    expect(sameCredential(emptySlotOf('ecdsa'), emptySlotOf('ecdsa'))).toBe(false)
    expect(sameCredential(ALICE, emptySlotOf('ecdsa'))).toBe(false)
  })

  it('is held by the path anywhere but the position left out', () => {
    const clauses = presetPath()
    expect(pathHolds(clauses, BOB)).toBe(true)
    expect(pathHolds(clauses, BOB, { clause: 1, member: 1 })).toBe(false)
    expect(pathHolds(clauses, CAROL)).toBe(false)
  })
})

describe('a required row', () => {
  it('is added at the end over an empty slot of a picked kind, the input untouched', () => {
    const clauses = frozen(presetPath())
    const result = applied(addRequired(clauses, emptySlotOf('aadhaar')))
    expect(result.clauses).toEqual([
      ...presetPath(),
      { threshold: 1, credentials: [emptySlotOf('aadhaar')] }
    ])
    expect(result.at).toEqual({ clause: 2, member: 0 })
    expect(clauses).toEqual(presetPath())
  })

  it('is added over an enrolled credential the path does not hold', () => {
    const result = applied(addRequired(presetPath(), CAROL))
    expect(result.clauses[2]).toEqual({ threshold: 1, credentials: [CAROL] })
    expect(result.clauses[2].credentials[0]).toBe(CAROL)
  })

  it('is removed with its credential, the rest of the path kept in order', () => {
    const clauses = frozen(twoGroupPath())
    expect(removeClause(clauses, 0)).toEqual(twoGroupPath().slice(1))
    expect(clauses).toEqual(twoGroupPath())
  })
})

describe('a group', () => {
  it('is added with no member and a threshold of two', () => {
    const clauses = frozen(presetPath())
    expect(addGroup(clauses)).toEqual([...presetPath(), { threshold: 2, credentials: [] }])
    expect(clauses).toEqual(presetPath())
  })

  it('is removed with every member', () => {
    expect(removeClause(twoGroupPath(), 1)).toEqual([
      { threshold: 1, credentials: [PASSKEY] },
      { threshold: 1, credentials: [CAROL, PASSPORT] }
    ])
  })

  it('takes a member at its end, an empty slot or an enrolled credential, and reports where it went', () => {
    const clauses = frozen(presetPath())
    const slot = applied(addMember(clauses, 1, emptySlotOf('passkey')))
    expect(slot.clauses[1]).toEqual({
      threshold: 2,
      credentials: [ALICE, BOB, PASSPORT, emptySlotOf('passkey')]
    })
    expect(slot.at).toEqual({ clause: 1, member: 3 })
    const member = applied(addMember(clauses, 1, CAROL))
    expect(member.clauses[1].credentials[3]).toBe(CAROL)
    expect(member.clauses[0]).toEqual(presetPath()[0])
    expect(clauses).toEqual(presetPath())
  })

  it('grows past three to four and five members, its threshold kept', () => {
    const four = applied(addMember(presetPath(), 1, CAROL))
    expect(four.clauses[1].credentials).toEqual([ALICE, BOB, PASSPORT, CAROL])
    const five = applied(addMember(four.clauses, 1, DAVE))
    expect(five.clauses[1]).toEqual({
      threshold: 2,
      credentials: [ALICE, BOB, PASSPORT, CAROL, DAVE]
    })
    expect(five.at).toEqual({ clause: 1, member: 4 })
  })

  it('loses one member, the others kept in order', () => {
    const clauses = frozen(presetPath())
    expect(removeMember(clauses, 1, 1)).toEqual([
      presetPath()[0],
      { threshold: 2, credentials: [ALICE, PASSPORT] }
    ])
    expect(clauses).toEqual(presetPath())
  })

  it('stays as an empty group when it loses its last member', () => {
    const clauses = [{ threshold: 2, credentials: [ALICE] }]
    expect(removeMember(clauses, 0, 0)).toEqual([{ threshold: 2, credentials: [] }])
  })

  it('takes any whole threshold, bounds left to the refusals', () => {
    const clauses = frozen(presetPath())
    expect(setThreshold(clauses, 1, 3)[1]).toEqual({
      threshold: 3,
      credentials: [ALICE, BOB, PASSPORT]
    })
    expect(setThreshold(clauses, 1, 0)[1].threshold).toBe(0)
    expect(setThreshold(clauses, 1, 9)[1].threshold).toBe(9)
    expect(setThreshold(clauses, 1, 3)[0]).toEqual(presetPath()[0])
    expect(clauses).toEqual(presetPath())
  })
})

describe('moving a member', () => {
  it('moves a required row into a group with one action, the credential object kept and the row gone', () => {
    const clauses = frozen(presetPath())
    const result = applied(moveToGroup(clauses, 0, 1))
    expect(result.clauses).toEqual([{ threshold: 2, credentials: [ALICE, BOB, PASSPORT, PASSKEY] }])
    expect(result.clauses[0].credentials[3]).toBe(clauses[0].credentials[0])
    expect(result.at).toEqual({ clause: 0, member: 3 })
    expect(clauses).toEqual(presetPath())
  })

  it('moves a row into a group that stands before it, the group keeping its place', () => {
    const clauses: Clause[] = [
      { threshold: 1, credentials: [ALICE, BOB] },
      { threshold: 1, credentials: [PASSKEY] },
      { threshold: 1, credentials: [PASSPORT] }
    ]
    const result = applied(moveToGroup(clauses, 2, 0))
    expect(result.clauses).toEqual([
      { threshold: 1, credentials: [ALICE, BOB, PASSPORT] },
      { threshold: 1, credentials: [PASSKEY] }
    ])
    expect(result.clauses[0].credentials[2]).toBe(PASSPORT)
    expect(result.at).toEqual({ clause: 0, member: 2 })
  })

  it('moves a row into an empty group', () => {
    const result = applied(moveToGroup(addGroup([{ threshold: 1, credentials: [ALICE] }]), 0, 1))
    expect(result.clauses).toEqual([{ threshold: 2, credentials: [ALICE] }])
    expect(result.clauses[0].credentials[0]).toBe(ALICE)
  })

  it('makes a group member a required row at the end, the credential object kept and the group one short', () => {
    const clauses = frozen(presetPath())
    const result = applied(makeRequired(clauses, 1, 2))
    expect(result.clauses).toEqual([
      { threshold: 1, credentials: [PASSKEY] },
      { threshold: 2, credentials: [ALICE, BOB] },
      { threshold: 1, credentials: [PASSPORT] }
    ])
    expect(result.clauses[2].credentials[0]).toBe(clauses[1].credentials[2])
    expect(result.at).toEqual({ clause: 2, member: 0 })
    expect(clauses).toEqual(presetPath())
  })

  it('moves an empty slot too, and a round trip brings the same object back', () => {
    const slot = emptySlotOf('zkpassport')
    const out = applied(makeRequired([{ threshold: 2, credentials: [ALICE, slot] }], 0, 1))
    expect(out.clauses[1].credentials[0]).toBe(slot)
    const back = applied(moveToGroup(out.clauses, 1, 0))
    expect(back.clauses).toEqual([{ threshold: 2, credentials: [ALICE, slot] }])
    expect(back.clauses[0].credentials[1]).toBe(slot)
  })

  it("turns every required row into one group of any one, in the first row's place, objects kept", () => {
    const clauses: Clause[] = [
      { threshold: 2, credentials: [ALICE, BOB] },
      { threshold: 1, credentials: [PASSKEY] },
      { threshold: 1, credentials: [PASSPORT] }
    ]
    const result = makeItAGroup(clauses)
    expect(result).toEqual([
      { threshold: 2, credentials: [ALICE, BOB] },
      { threshold: 1, credentials: [PASSKEY, PASSPORT] }
    ])
    expect(result[1].credentials[0]).toBe(PASSKEY)
    expect(makeItAGroup([clauses[0]])).toEqual([clauses[0]])
  })
})

describe('filling and placing', () => {
  it('fills an empty slot with the enrolled credential, the slot keeping its place', () => {
    const clauses = frozen([{ threshold: 2, credentials: [ALICE, emptySlotOf('ecdsa'), BOB] }])
    const result = applied(fillSlot(clauses, { clause: 0, member: 1 }, CAROL))
    expect(result.clauses).toEqual([{ threshold: 2, credentials: [ALICE, CAROL, BOB] }])
    expect(result.at).toEqual({ clause: 0, member: 1 })
  })

  it('places a picked credential where the picker was opened for', () => {
    const clauses = presetPath()
    expect(applied(placeAt(clauses, { place: 'required' }, CAROL)).clauses).toEqual(
      applied(addRequired(clauses, CAROL)).clauses
    )
    expect(applied(placeAt(clauses, { place: 'member', clause: 1 }, CAROL)).clauses).toEqual(
      applied(addMember(clauses, 1, CAROL)).clauses
    )
    const withSlot = applied(addMember(clauses, 1, emptySlotOf('ecdsa'))).clauses
    expect(
      applied(placeAt(withSlot, { place: 'slot', clause: 1, member: 3, kind: 'ecdsa' }, CAROL))
        .clauses[1].credentials
    ).toEqual([ALICE, BOB, PASSPORT, CAROL])
  })

  it('keeps every field of the draft but its clauses', () => {
    const draft: SetupDraft = {
      wait: 604800n,
      clauses: presetPath(),
      ignoresPause: true,
      privacy: { publicMetadata: '0x01', backup: 'clear' }
    }
    const next = withClauses(draft, [{ threshold: 1, credentials: [ALICE] }])
    expect(next).toEqual({ ...draft, clauses: [{ threshold: 1, credentials: [ALICE] }] })
    expect(draft.clauses).toEqual(presetPath())
  })
})

describe('the duplicate refusal', () => {
  const unchanged = (clauses: Clause[], expected: Clause[]) => expect(clauses).toEqual(expected)

  it('refuses a group member added as a member of a second group, the path unchanged', () => {
    const clauses = frozen(twoGroupPath())
    expect(addMember(clauses, 2, ALICE)).toEqual({ status: 'refused', reason: 'duplicate' })
    expect(addMember(clauses, 2, { ...ALICE, label: 'Alice again' })).toEqual({
      status: 'refused',
      reason: 'duplicate'
    })
    unchanged(clauses, twoGroupPath())
  })

  it('refuses a group member added as a required row', () => {
    const clauses = frozen(presetPath())
    expect(addRequired(clauses, BOB)).toEqual({ status: 'refused', reason: 'duplicate' })
    expect(placeAt(clauses, { place: 'required' }, BOB)).toEqual({
      status: 'refused',
      reason: 'duplicate'
    })
    unchanged(clauses, presetPath())
  })

  it('refuses a member added twice to one group', () => {
    const clauses = frozen(presetPath())
    expect(addMember(clauses, 1, ALICE)).toEqual({ status: 'refused', reason: 'duplicate' })
    unchanged(clauses, presetPath())
  })

  it("refuses a required row's credential added to a group", () => {
    const clauses = frozen(presetPath())
    expect(addMember(clauses, 1, PASSKEY)).toEqual({ status: 'refused', reason: 'duplicate' })
    unchanged(clauses, presetPath())
  })

  it("refuses to fill an empty slot with a credential another place holds, but not the slot's own", () => {
    const clauses = frozen([
      { threshold: 1, credentials: [PASSKEY] },
      { threshold: 2, credentials: [ALICE, emptySlotOf('ecdsa')] }
    ])
    expect(fillSlot(clauses, { clause: 1, member: 1 }, ALICE)).toEqual({
      status: 'refused',
      reason: 'duplicate'
    })
    const own = [{ threshold: 2, credentials: [ALICE, BOB] }]
    expect(applied(fillSlot(own, { clause: 0, member: 1 }, BOB)).clauses).toEqual(own)
  })

  it('refuses a move or a make required whose credential another place already holds', () => {
    const doubled: Clause[] = [
      { threshold: 1, credentials: [ALICE] },
      { threshold: 2, credentials: [ALICE, BOB] }
    ]
    expect(moveToGroup(doubled, 0, 1)).toEqual({ status: 'refused', reason: 'duplicate' })
    expect(makeRequired(doubled, 1, 0)).toEqual({ status: 'refused', reason: 'duplicate' })
  })

  it('takes two empty slots of one kind, in one group and across the path', () => {
    const first = applied(addMember([{ threshold: 2, credentials: [] }], 0, emptySlotOf('ecdsa')))
    const second = applied(addMember(first.clauses, 0, emptySlotOf('ecdsa')))
    expect(second.clauses[0].credentials).toEqual([emptySlotOf('ecdsa'), emptySlotOf('ecdsa')])
    const row = applied(addRequired(second.clauses, emptySlotOf('ecdsa')))
    expect(row.clauses).toHaveLength(2)
  })

  it('takes two different credentials of one kind', () => {
    const one = applied(addMember([{ threshold: 2, credentials: [] }], 0, ALICE))
    const two = applied(addMember(one.clauses, 0, BOB))
    expect(two.clauses[0].credentials).toEqual([ALICE, BOB])
    expect(applied(addRequired(two.clauses, CAROL)).clauses).toHaveLength(2)
  })

  it('names the wallet as the party that refuses, never the chain, and offers no way around it', () => {
    const line = renderFinding(
      { code: 'credential.duplicate', subject: 'credential', values: {} },
      t
    )
    expect(line).toBe(en.socialRecovery.editor.duplicate)
    expect(line).toMatch(/\bThis wallet\b/)
    expect(line).not.toMatch(/chain|network|contract|kit/i)
  })
})

describe('the picker', () => {
  it('lists the enrollments by kind, each marked where the path holds it', () => {
    const entries = pickerEntriesOf(
      [PASSKEY, ALICE, CAROL, PASSPORT, AADHAAR].map(enrolled),
      presetPath(),
      BOOK
    )
    const view = Object.fromEntries(
      Object.entries(entries).map(([kind, list]) => [
        kind,
        list.map(({ enrollment, inPath }) => [enrollment.credential.label ?? kind, inPath])
      ])
    )
    expect(view).toEqual({
      passkey: [['Laptop', true]],
      ecdsa: [
        ['Alice', true],
        ['Carol', false]
      ],
      zkpassport: [['zkpassport', true]],
      aadhaar: [['aadhaar', false]]
    })
  })

  it('leaves out an enrollment whose method the address book does not hold', () => {
    const entries = pickerEntriesOf([enrolled({ ...ALICE, method: BOOK.manager })], [], BOOK)
    expect(Object.values(entries).flat()).toEqual([])
  })

  it('opens the enroll screen with the kind and the slot to fill in the search', () => {
    const params = new URLSearchParams(enrollSearchOf('ecdsa', { clause: 1, member: 3 }))
    expect(Object.fromEntries(params)).toEqual({ kind: 'ecdsa', clause: '1', member: '3' })
  })
})

describe('the path check at continue', () => {
  const finding = (code: Finding['code']): Finding => ({ code, subject: 'setup', values: {} })

  it('blocks on an error finding and never on warnings alone', () => {
    expect(blocksContinue({ errors: [finding('clause.empty')], warnings: [] })).toBe(true)
    expect(blocksContinue({ errors: [], warnings: [finding('clause.empty')] })).toBe(false)
    expect(blocksContinue({ errors: [], warnings: [] })).toBe(false)
  })

  it('renders a finding through its refusal sentence, or its code where none maps', () => {
    expect(renderFinding(finding('clause.empty'), t)).toBe(
      en.socialRecovery.editor.refusals.emptyGroup
    )
    expect(renderFinding(finding('rule.empty'), t)).toBe(en.socialRecovery.editor.refusals.noMethod)
    expect(renderFinding(finding('clause.threshold-above-count'), t)).toBe(
      en.socialRecovery.editor.refusals.thresholdAboveMembers
    )
    expect(renderFinding(finding('action.unsupported'), t)).toBe('action.unsupported')
  })
})

describe("a threshold field's text", () => {
  it('reads as the whole number its digits write', () => {
    expect(readThreshold('0')).toBe(0)
    expect(readThreshold('3')).toBe(3)
    expect(readThreshold('007')).toBe(7)
  })

  it('reads empty text, a fraction, a sign, an exponent, a space, a word or a number past the safe range as none', () => {
    ;['', ' ', '1.5', '2.', '-1', '+2', '1e2', ' 2', 'two', '99999999999999999999'].forEach(
      (text) => expect(readThreshold(text)).toBeUndefined()
    )
  })
})

describe('the line of a failed access test', () => {
  const failed = (cause?: string) => ({ credential: PASSKEY, test: 'failed' as const, cause })

  it('gives the no-match sentence for a check that did not match, with or without a detail', () => {
    ;['check-rejected', 'check-rejected: wrong signer'].forEach((cause) =>
      expect(renderFailedTestLine(failed(cause), t)).toBe(
        en.socialRecovery.ceremony.testFailedNoMatch
      )
    )
  })

  it('gives only the may-never-work line for any other cause or none', () => {
    ;[
      undefined,
      'browser-error: NotAllowedError',
      'relying-party-mismatch: SecurityError',
      'timeout',
      'timeout: check-rejected'
    ].forEach((cause) =>
      expect(renderFailedTestLine(failed(cause), t)).toBe(en.socialRecovery.ceremony.testFailedLine)
    )
  })

  it('gives nothing for a test that passed or was not run', () => {
    expect(renderFailedTestLine(enrolled(PASSKEY), t)).toBeNull()
    expect(renderFailedTestLine({ credential: PASSKEY, test: 'not-tested' }, t)).toBeNull()
  })
})
