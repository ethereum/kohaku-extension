/**
 * @jest-environment jsdom
 *
 * The placement of an enrollment in its slot: the list takes the enrollment,
 * the draft takes the credential, and the list then drops the enrollment of
 * the credential the slot held before, only where the path holds it nowhere.
 * Every other enrollment stays. The records sit on the harness's storage
 * double, and the harness loads the view, which needs a DOM.
 */
import type { Credential } from '@web/modules/social-recovery/sdk-interfaces'
import type { Enrollment, SetupRecords } from '@web/modules/social-recovery/shared/records'

import type { EnrollSearch } from '../types'
import {
  ACCOUNT,
  BOOK,
  BOUND_TO_THIS_MAC,
  CHAIN_ID,
  emptySlot,
  guardianConfigOf,
  pathWith,
  recordsWith,
  SYNCED_ON_GOOGLE
} from './harness'

/* eslint-disable @typescript-eslint/no-var-requires, global-require */
const { placeEnrollment, recordTest }: typeof import('../writes') = require('../writes')
/* eslint-enable @typescript-eslint/no-var-requires, global-require */

const SEARCH: EnrollSearch = { kind: 'passkey', at: { clause: 0, member: 1 } }

const OLD: Credential = { method: BOOK.methods.passkey, config: '0xaa', label: 'Old laptop' }
const NEW: Credential = { method: BOOK.methods.passkey, config: '0xbb', label: 'New laptop' }
const GUARDIAN: Credential = {
  method: BOOK.methods.ecdsa,
  config: guardianConfigOf('0x2222222222222222222222222222222222222222')
}

const enrolled = (credential: Credential): Enrollment => ({ credential, test: 'not-tested' })

/** The setup records, with the writes of the enrollments list counted and the listed ones refused. */
const countingListWrites = (setup: SetupRecords, refused: number[] = []) => {
  const counted = { writes: 0 }
  const records: SetupRecords = {
    ...setup,
    enrollments: {
      ...setup.enrollments,
      write: async (value) => {
        counted.writes += 1
        if (refused.includes(counted.writes)) {
          throw new Error('storage full')
        }
        return setup.enrollments.write(value)
      }
    }
  }
  return { records, counted }
}

const storedOf = async (setup: SetupRecords) => {
  const [draft, list] = await Promise.all([setup.setupDraft.read(), setup.enrollments.read()])
  if (draft.status !== 'present') {
    throw new Error('no draft stored')
  }
  return { clauses: draft.value.clauses, enrollments: list.status === 'present' ? list.value : [] }
}

describe('placing an enrollment', () => {
  const setupWith = async (clauses: Credential[], enrollments: Enrollment[]) => {
    const { records } = await recordsWith(pathWith(...clauses), enrollments)
    return records.setup(CHAIN_ID, ACCOUNT)
  }

  it('keeps the new enrollment and drops the replaced one on a retry after the last write failed', async () => {
    const setup = await setupWith([GUARDIAN, OLD], [enrolled(GUARDIAN), enrolled(OLD)])

    const { records: refusing } = countingListWrites(setup, [2])
    await expect(placeEnrollment(refusing, SEARCH, BOOK, enrolled(NEW), OLD)).rejects.toThrow(
      'storage full'
    )
    const between = await storedOf(setup)
    expect(between.clauses).toEqual(pathWith(GUARDIAN, NEW))
    expect(between.enrollments).toEqual([enrolled(GUARDIAN), enrolled(OLD), enrolled(NEW)])

    expect(await placeEnrollment(setup, SEARCH, BOOK, enrolled(NEW), OLD)).toEqual({
      status: 'placed',
      enrollment: enrolled(NEW)
    })
    const after = await storedOf(setup)
    expect(after.clauses).toEqual(pathWith(GUARDIAN, NEW))
    expect(after.enrollments).toEqual([enrolled(GUARDIAN), enrolled(NEW)])
  })

  it('replaces the old enrollment with the new one in two list writes', async () => {
    const setup = await setupWith([GUARDIAN, OLD], [enrolled(GUARDIAN), enrolled(OLD)])
    const { records, counted } = countingListWrites(setup)
    await placeEnrollment(records, SEARCH, BOOK, enrolled(NEW), OLD)
    const after = await storedOf(setup)
    expect(after.clauses).toEqual(pathWith(GUARDIAN, NEW))
    expect(after.enrollments).toEqual([enrolled(GUARDIAN), enrolled(NEW)])
    expect(counted.writes).toBe(2)
  })

  it('writes the list once where the placement replaces nothing', async () => {
    const setup = await setupWith([GUARDIAN, emptySlot('passkey')], [enrolled(GUARDIAN)])
    const { records, counted } = countingListWrites(setup)
    await placeEnrollment(records, SEARCH, BOOK, enrolled(NEW))
    expect((await storedOf(setup)).enrollments).toEqual([enrolled(GUARDIAN), enrolled(NEW)])
    expect(counted.writes).toBe(1)
  })

  it('keeps an enrollment the path does not hold when another slot is placed', async () => {
    const ORPHAN: Credential = { method: BOOK.methods.passkey, config: '0xcc', label: 'Old phone' }
    const setup = await setupWith(
      [GUARDIAN, OLD],
      [enrolled(GUARDIAN), enrolled(ORPHAN), enrolled(OLD)]
    )
    await placeEnrollment(setup, SEARCH, BOOK, enrolled(NEW), OLD)
    const after = await storedOf(setup)
    expect(after.clauses).toEqual(pathWith(GUARDIAN, NEW))
    expect(after.enrollments).toEqual([enrolled(GUARDIAN), enrolled(ORPHAN), enrolled(NEW)])
  })

  it('keeps the enrollment of a replaced credential the path still holds at another slot', async () => {
    const setup = await setupWith([OLD, OLD], [enrolled(OLD)])
    await placeEnrollment(setup, SEARCH, BOOK, enrolled(NEW), OLD)
    const after = await storedOf(setup)
    expect(after.clauses).toEqual(pathWith(OLD, NEW))
    expect(after.enrollments).toEqual([enrolled(OLD), enrolled(NEW)])
  })

  it('holds one enrollment for a credential placed twice in an empty slot', async () => {
    const setup = await setupWith([GUARDIAN, emptySlot('passkey')], [enrolled(GUARDIAN)])
    await placeEnrollment(setup, SEARCH, BOOK, enrolled(NEW))
    await placeEnrollment(setup, SEARCH, BOOK, enrolled(NEW))
    const after = await storedOf(setup)
    expect(after.clauses).toEqual(pathWith(GUARDIAN, NEW))
    expect(after.enrollments).toEqual([enrolled(GUARDIAN), enrolled(NEW)])
  })

  it('leaves the draft and the list as they were where the first write of the list fails', async () => {
    const setup = await setupWith([GUARDIAN, OLD], [enrolled(GUARDIAN), enrolled(OLD)])
    const { records: refusing } = countingListWrites(setup, [1])
    await expect(placeEnrollment(refusing, SEARCH, BOOK, enrolled(NEW), OLD)).rejects.toThrow(
      'storage full'
    )
    expect(await storedOf(setup)).toEqual({
      clauses: pathWith(GUARDIAN, OLD),
      enrollments: [enrolled(GUARDIAN), enrolled(OLD)]
    })
  })
})

describe('recording a passed test', () => {
  const LAST_TEST = { salt: `0x${'ab'.repeat(32)}` as const, at: 1_800_000_000_000 }
  /** What an assertion reads: the backup flags and the attachment, no AAGUID and no transports. */
  const ASSERTED = {
    kind: 'synced' as const,
    backedUp: true,
    place: 'security-key' as const,
    attachment: 'cross-platform' as const,
    transports: []
  }

  const setupWith = async (enrollment: Enrollment) => {
    const { records } = await recordsWith(pathWith(enrollment.credential), [enrollment])
    return records.setup(CHAIN_ID, ACCOUNT)
  }

  it('takes the backup flags from the test and keeps the rest of the creation facts', async () => {
    const created = {
      ...BOUND_TO_THIS_MAC,
      place: 'phone' as const,
      attachment: 'cross-platform' as const,
      transports: ['hybrid'],
      aaguid: SYNCED_ON_GOOGLE.aaguid
    }
    const setup = await setupWith({
      credential: OLD,
      test: 'not-tested',
      backup: 'device-bound',
      credentialId: 'credential-a',
      facts: created
    })

    const updated = await recordTest(setup, OLD, 'passed', undefined, {
      lastTest: LAST_TEST,
      facts: ASSERTED
    })

    const expected: Enrollment = {
      credential: OLD,
      test: 'passed',
      backup: 'synced',
      credentialId: 'credential-a',
      facts: { ...created, kind: 'synced', backedUp: true },
      lastTest: LAST_TEST
    }
    expect(updated).toEqual(expected)
    expect((await storedOf(setup)).enrollments).toEqual([expected])
  })

  it('stores the facts the test read where the creation stored none', async () => {
    const setup = await setupWith({ credential: OLD, test: 'not-tested' })

    await recordTest(setup, OLD, 'passed', undefined, { lastTest: LAST_TEST, facts: ASSERTED })

    expect((await storedOf(setup)).enrollments).toEqual([
      { credential: OLD, test: 'passed', backup: 'synced', facts: ASSERTED, lastTest: LAST_TEST }
    ])
  })
})
