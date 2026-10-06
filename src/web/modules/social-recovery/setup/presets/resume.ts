import { decodeAbiParameters } from 'viem'

import type { Clause } from '@web/modules/social-recovery/sdk-interfaces'
import { sameAddress } from '@web/modules/social-recovery/shared/client'
import type { AddressBook } from '@web/modules/social-recovery/shared/client'
import {
  DEADLINE_LOCALE,
  renderChip,
  renderShortAddress
} from '@web/modules/social-recovery/shared/display'
import type { Chip, Translate } from '@web/modules/social-recovery/shared/display'
import { SLOT_KINDS, slotKindOf } from '@web/modules/social-recovery/shared/records'
import type { Enrollment, EnrollmentTestVerdict } from '@web/modules/social-recovery/shared/records'

import type { ResumeNote, ResumeRow, SlotKind } from './types'

const VERDICT_CHIPS: Record<EnrollmentTestVerdict, Chip<'method'>> = {
  passed: 'tested',
  'not-tested': 'notTested',
  failed: 'testFailed',
  unavailable: 'testUnavailable',
  'not-supported': 'notSupported'
}

const METHOD_NAME_KEYS: Partial<Record<SlotKind, string>> = {
  passkey: 'socialRecovery.methodNames.passkey',
  zkpassport: 'socialRecovery.methodNames.passport',
  aadhaar: 'socialRecovery.methodNames.aadhaar'
}

const CEREMONY = 'socialRecovery.ceremony'

const kindOf = (enrollment: Enrollment, book: AddressBook): SlotKind | undefined =>
  SLOT_KINDS.find((kind) => sameAddress(book.methods[kind], enrollment.credential.method))

const nameOf = (enrollment: Enrollment, kind: SlotKind | undefined, t: Translate): string => {
  if (kind === 'passkey' && enrollment.backup === 'device-bound') {
    return t('socialRecovery.methodNames.passkeyOnThisDevice')
  }
  if (kind === 'ecdsa') {
    return t('socialRecovery.display.nouns.guardian')
  }
  const key = kind && METHOD_NAME_KEYS[kind]
  return t(key || 'socialRecovery.display.nouns.method')
}

/** The guardian's address in its short form, read from the one word its config holds. */
const guardianAddressOf = (enrollment: Enrollment): string | undefined => {
  // The config comes back from storage, so one the codec did not write holds no address.
  try {
    const [address] = decodeAbiParameters([{ type: 'address' }], enrollment.credential.config)
    return renderShortAddress(address)
  } catch {
    return undefined
  }
}

/**
 * The one line under a failed test: the no-match line when the check rejected
 * the answer, else the line that the method may never work.
 */
const failedLineOf = (cause: string | undefined, t: Translate): string =>
  t(
    cause?.startsWith('check-rejected')
      ? `${CEREMONY}.testFailedNoMatch`
      : `${CEREMONY}.testFailedLine`
  )

const rowOf = (
  enrollment: Enrollment,
  kind: SlotKind | undefined,
  id: string,
  t: Translate
): ResumeRow => ({
  id,
  name: nameOf(enrollment, kind, t),
  chip: renderChip('method', VERDICT_CHIPS[enrollment.test], t),
  ...(kind === 'ecdsa' ? { detail: guardianAddressOf(enrollment) } : {}),
  ...(enrollment.test === 'failed' ? { note: failedLineOf(enrollment.cause, t) } : {})
})

/**
 * The resume block's rows: each enrolled method, then each guardian, every
 * row with the chip of its own access test and a failed test with its one
 * line.
 */
export const resumeRowsOf = (
  enrollments: readonly Enrollment[],
  book: AddressBook,
  t: Translate
): ResumeRow[] => {
  const methods: ResumeRow[] = []
  const guardians: ResumeRow[] = []
  enrollments.forEach((enrollment, index) => {
    const kind = kindOf(enrollment, book)
    const row = rowOf(enrollment, kind, `${index}`, t)
    if (kind === 'ecdsa') {
      guardians.push(row)
    } else {
      methods.push(row)
    }
  })
  return [...methods, ...guardians]
}

/**
 * The note beneath the guardian rows: the guardians added are not yet active
 * until the path is saved on chain. None without a guardian.
 */
export const notYetActiveOf = (
  enrollments: readonly Enrollment[],
  book: AddressBook,
  t: Translate
): ResumeNote | null => {
  const count = enrollments.filter((enrollment) => kindOf(enrollment, book) === 'ecdsa').length
  if (count === 0) {
    return null
  }
  return {
    chip: renderChip('method', 'notYetActive', t),
    note: t('socialRecovery.presets.resume.addedNotSaved', { count })
  }
}

const NOT_STARTED_NAME_KEYS: Record<SlotKind, string> = {
  passkey: 'socialRecovery.methodNames.passkey',
  zkpassport: 'socialRecovery.methodNames.passport',
  ecdsa: 'socialRecovery.methodNames.guardians',
  aadhaar: 'socialRecovery.methodNames.aadhaar'
}

/**
 * The draft's unfilled slots as rows, one per kind, the guardians as one row.
 * A kind the holder already enrolled a method of has no row here.
 */
export const notStartedRowsOf = (
  clauses: readonly Clause[],
  enrollments: readonly Enrollment[],
  book: AddressBook,
  t: Translate
): ResumeRow[] => {
  const enrolled = new Set(enrollments.map((enrollment) => kindOf(enrollment, book)))
  const kinds = new Set<SlotKind>()
  clauses.forEach(({ credentials }) =>
    credentials.forEach((credential) => {
      const kind = slotKindOf(credential)
      if (kind && !enrolled.has(kind)) {
        kinds.add(kind)
      }
    })
  )
  return [...kinds].map((kind) => ({
    id: `not-started-${kind}`,
    name: t(NOT_STARTED_NAME_KEYS[kind]),
    chip: renderChip('method', 'notStarted', t)
  }))
}

/**
 * The line that dates the unfinished draft by its day and month alone, in the
 * holder's own time zone.
 */
export const draftAgeLine = (savedAt: number, t: Translate): string => {
  const { timeZone } = Intl.DateTimeFormat().resolvedOptions()
  const date = new Intl.DateTimeFormat(DEADLINE_LOCALE, {
    day: 'numeric',
    month: 'short',
    timeZone
  }).format(new Date(savedAt))
  return t('socialRecovery.records.draftAge', { date })
}
