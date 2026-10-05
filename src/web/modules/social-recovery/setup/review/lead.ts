/**
 * The review's lead as pure functions over the setup records: each path row
 * with its chip and its lines, the hostile-minority condition, the rule lines,
 * the waiting period, the publication sentence and the privacy line. Strings
 * come from `t`.
 */
import { decodeAbiParameters } from 'viem'

import type {
  Address,
  Clause,
  Credential,
  SetupDraft
} from '@web/modules/social-recovery/sdk-interfaces'
import { privacyLevelOf, sameAddress } from '@web/modules/social-recovery/shared/client'
import type { AddressBook } from '@web/modules/social-recovery/shared/client'
import { renderChip, renderFullAddress } from '@web/modules/social-recovery/shared/display'
import type { MethodChip, Translate } from '@web/modules/social-recovery/shared/display'
import { isEmptySlot, slotKindOf } from '@web/modules/social-recovery/shared/records/slots'
import type {
  Enrollment,
  EnrollmentTestVerdict
} from '@web/modules/social-recovery/shared/records/types'
import {
  getRuleLines,
  renderRuleLines,
  renderShapeSentence
} from '@web/modules/social-recovery/shared/rule-lines'

import { REVIEW_WAIT_CHIPS } from './constants'
import type { MethodKind, PathRow, PublicationItem } from './types'

const KIND_NAME_KEYS: Record<MethodKind, string> = {
  passkey: 'socialRecovery.methodNames.passkey',
  ecdsa: 'socialRecovery.display.nouns.guardian',
  zkpassport: 'socialRecovery.methodNames.passport',
  aadhaar: 'socialRecovery.methodNames.aadhaar'
}

const VERDICT_CHIPS: Record<EnrollmentTestVerdict, MethodChip> = {
  passed: 'tested',
  'not-tested': 'notTested',
  failed: 'testFailed',
  unavailable: 'testUnavailable',
  'not-supported': 'notSupported'
}

const CEREMONY = 'socialRecovery.ceremony'
const PUBLICATION = 'socialRecovery.review.publication'
const ITEMS = 'socialRecovery.disclosures.items'
const ITEMS_LEAD = 'socialRecovery.disclosures.itemsLead'

/** The address book's kind of a method module; a module it does not hold has none. */
const methodKindOf = (method: Address, addressBook: AddressBook): MethodKind | undefined =>
  (Object.keys(addressBook.methods) as MethodKind[]).find((kind) =>
    sameAddress(addressBook.methods[kind], method)
  )

/**
 * The kind of method a credential holds: the kind an empty slot waits for, or
 * the address book's kind of an enrolled credential's method. A method the
 * address book does not hold has no kind.
 */
export const kindOf = (credential: Credential, addressBook: AddressBook): MethodKind | undefined =>
  isEmptySlot(credential) ? slotKindOf(credential) : methodKindOf(credential.method, addressBook)

/** The kind's name, the word a row and a contract row name a method by. */
export const kindNameOf = (kind: MethodKind, t: Translate): string => t(KIND_NAME_KEYS[kind])

/**
 * The enrollment the records hold for a credential: the same method and the
 * same config bytes. An empty slot has none.
 */
export const enrollmentOf = (
  credential: Credential,
  enrollments: readonly Enrollment[]
): Enrollment | undefined =>
  isEmptySlot(credential)
    ? undefined
    : enrollments.find(
        (enrollment) =>
          sameAddress(enrollment.credential.method, credential.method) &&
          enrollment.credential.config.toLowerCase() === credential.config.toLowerCase()
      )

/** The address a guardian's config holds, ABI-encoded in one word. */
export const guardianAddressOf = (credential: Credential): Address | undefined => {
  // The config comes back from storage, so one the codec did not write holds no address.
  try {
    return decodeAbiParameters([{ type: 'address' }], credential.config)[0]
  } catch {
    return undefined
  }
}

/**
 * The lines a test verdict carries under its chip. A failed test reads one
 * line: that the check did not match where its stored cause says so, else that
 * the method may never work.
 */
const verdictLinesOf = (enrollment: Enrollment, t: Translate): string[] => {
  switch (enrollment.test) {
    case 'not-tested':
      return [t(`${CEREMONY}.notTestedLine`)]
    case 'failed':
      return [
        enrollment.cause?.startsWith('check-rejected')
          ? t(`${CEREMONY}.testFailedNoMatch`)
          : t(`${CEREMONY}.testFailedLine`)
      ]
    case 'unavailable':
      return [t(`${CEREMONY}.testUnavailableLine`)]
    case 'not-supported':
      return [t(`${CEREMONY}.notSupportedLine`)]
    case 'passed':
    default:
      return []
  }
}

/** The lines an identity kind carries on every enrolled row of it. */
const kindLinesOf = (kind: MethodKind | undefined, t: Translate) => {
  if (kind === 'zkpassport') {
    return [
      t('socialRecovery.disclosures.identity'),
      t('socialRecovery.disclosures.passportPublication')
    ]
  }
  if (kind === 'aadhaar') {
    return [t('socialRecovery.disclosures.identity')]
  }
  return []
}

/**
 * The lines a passkey carries: what losing it means for its backup kind, where
 * the records hold one, then the origin it works from.
 */
export const passkeyLinesOf = (backup: Enrollment['backup'], t: Translate): string[] => {
  const loss =
    backup === 'synced'
      ? t(`${CEREMONY}.syncedLoss`)
      : backup === 'device-bound'
      ? t(`${CEREMONY}.deviceBoundLoss`)
      : null
  return [...(loss ? [loss] : []), t(`${CEREMONY}.passkeyOrigin`)]
}

/**
 * One row of the path as the lead draws it. A guardian reads its full address
 * beside the guardian noun; a passkey its label, or the kind's name, beside its
 * kind word; a method the address book does not hold its module's full
 * address. An empty slot reads its kind and not yet active, and nothing else.
 */
export const pathRowOf = (
  credential: Credential,
  enrollments: readonly Enrollment[],
  addressBook: AddressBook,
  t: Translate
): PathRow => {
  const kind = kindOf(credential, addressBook)
  if (isEmptySlot(credential)) {
    return {
      name: kind ? kindNameOf(kind, t) : renderFullAddress(credential.method),
      aside: null,
      chip: renderChip('method', 'notYetActive', t),
      lines: []
    }
  }
  const enrollment = enrollmentOf(credential, enrollments)
  const guardian = kind === 'ecdsa' ? guardianAddressOf(credential) : undefined
  let name: string
  let aside: string | null = null
  if (kind === 'ecdsa' && guardian) {
    name = renderFullAddress(guardian)
    aside = kindNameOf(kind, t)
  } else if (kind === 'passkey') {
    name = credential.label || kindNameOf(kind, t)
    if (enrollment?.backup === 'synced') {
      aside = t('socialRecovery.review.passkeySynced')
    }
    if (enrollment?.backup === 'device-bound') {
      aside = t('socialRecovery.review.passkeyDeviceBound')
    }
  } else {
    name = kind ? kindNameOf(kind, t) : renderFullAddress(credential.method)
  }
  return {
    name,
    aside,
    chip: enrollment ? renderChip('method', VERDICT_CHIPS[enrollment.test], t) : null,
    lines: [...(enrollment ? verdictLinesOf(enrollment, t) : []), ...kindLinesOf(kind, t)]
  }
}

/**
 * Whether a clause reads as a required row, the way the editor draws it: one
 * credential at a threshold of one. Any other clause is a group.
 */
export const isRequiredRow = (clause: Clause): boolean =>
  clause.threshold === 1 && clause.credentials.length === 1

/**
 * The hostile-minority guidance renders where any group holds three or more
 * members, since a set that satisfies the rule can also cancel a recovery.
 */
export const needsHostileMinorityLine = (clauses: readonly Clause[]): boolean =>
  clauses.some((clause) => clause.credentials.length >= 3)

/** The rule lines of the path, each method's family read through the address book. */
export const ruleLinesOf = (
  draft: Pick<SetupDraft, 'clauses'>,
  addressBook: AddressBook,
  t: Translate
): string[] => {
  const kindOfMethod = (method: Address) => methodKindOf(method, addressBook)
  return renderRuleLines(getRuleLines(draft, { kindOfMethod }), (key, params) =>
    t(key, { ...params })
  )
}

const SECONDS_PER_HOUR = 3600n

/**
 * The waiting period as the picker named it: a chip's word where it is one of
 * the four lengths, otherwise its count of hours.
 */
export const renderWait = (wait: SetupDraft['wait'], t: Translate): string => {
  const chip =
    wait % SECONDS_PER_HOUR === 0n
      ? REVIEW_WAIT_CHIPS.find(({ hours }) => BigInt(hours) * SECONDS_PER_HOUR === wait)
      : undefined
  if (chip) {
    return t(`socialRecovery.privacy.waitingPeriod.chips.${chip.id}`)
  }
  return t('socialRecovery.display.remainingHours', { count: Number(wait / SECONDS_PER_HOUR) })
}

/** The kinds of every row of the path, empty slots by the kind they wait for. */
const kindsOf = (clauses: readonly Clause[], addressBook: AddressBook): MethodKind[] =>
  clauses
    .flatMap(({ credentials }) => credentials)
    .map((credential) => kindOf(credential, addressBook))
    .filter((kind): kind is MethodKind => kind !== undefined)

/** What a recovery publishes besides addresses, in the order the sentence names them. */
export const publicationItemsOf = (kinds: readonly MethodKind[]): PublicationItem[] => {
  const passkeys = kinds.filter((kind) => kind === 'passkey').length
  const items: PublicationItem[] = []
  if (passkeys === 1) {
    items.push('passkey')
  }
  if (passkeys > 1) {
    items.push('passkeys')
  }
  if (kinds.includes('zkpassport')) {
    items.push('passportIdentifier')
  }
  if (kinds.includes('aadhaar')) {
    items.push('aadhaar')
  }
  return items
}

/** The items as one phrase: the first in its leading form, two as a pair, three as a triple. */
const joinItems = ([lead, ...rest]: PublicationItem[], t: Translate): string => {
  const first = t(`${ITEMS_LEAD}.${lead}`)
  const [second, third] = rest.map((item) => t(`${ITEMS}.${item}`))
  if (third !== undefined) {
    return t(`${ITEMS}.triple`, { first, second, third })
  }
  if (second !== undefined) {
    return t(`${ITEMS}.pair`, { first, second })
  }
  return first
}

/**
 * The publication line's second sentence, chosen by the path's kinds and its
 * guardian rows. The items take the plural verb when they are more than one
 * or when the one item is several passkeys. A path with neither items nor
 * guardians has no second sentence.
 */
export const publicationSentenceOf = (
  clauses: readonly Clause[],
  addressBook: AddressBook,
  t: Translate
): string | null => {
  const kinds = kindsOf(clauses, addressBook)
  const guardians = kinds.filter((kind) => kind === 'ecdsa').length
  const items = publicationItemsOf(kinds)
  if (items.length === 0) {
    if (guardians === 0) {
      return null
    }
    return t(`${PUBLICATION}.${guardians === 1 ? 'guardian' : 'guardians'}`)
  }
  const plural = items.length > 1 || items[0] === 'passkeys'
  let key = 'methods'
  if (guardians === 1) {
    key = 'methodsAndGuardian'
  }
  if (guardians > 1) {
    key = 'methodsAndGuardians'
  }
  return t(`${PUBLICATION}.${key}`, { items: joinItems(items, t), count: plural ? 2 : 1 })
}

/**
 * The privacy block's lines, by the level the draft's privacy fields encode:
 * Private or Shape visible with the recovery password set, the level's label
 * alone where the password step has not stored its record, Shape visible
 * followed by the path's shape as anyone reads it, or the Public level's own
 * label and line.
 */
export const privacyLinesOf = (
  draft: Pick<SetupDraft, 'privacy' | 'clauses'>,
  addressBook: AddressBook,
  passwordSet: boolean,
  t: Translate
): string[] => {
  const level = privacyLevelOf(draft.privacy)
  if (level === 'public') {
    return [
      t('socialRecovery.privacy.level.public.label'),
      t('socialRecovery.privacy.level.public.line')
    ]
  }
  if (level === 'shape-visible') {
    const kindOfMethod = (method: Address) => methodKindOf(method, addressBook)
    const shape = renderShapeSentence(
      draft.clauses,
      { skipMemberlessClauses: true, kindOfMethod },
      (key, params) => t(key, { ...params })
    )
    // A path with no member has no shape to name, so the line reads its own text.
    let shapeLine = t('socialRecovery.privacy.level.shapeVisible.line', { shape })
    if (shape === '') {
      shapeLine = t('socialRecovery.privacy.level.shapeVisible.lineEmpty')
    }
    return [
      passwordSet
        ? t('socialRecovery.review.shapeVisibleSet')
        : t('socialRecovery.privacy.level.shapeVisible.label'),
      shapeLine
    ]
  }
  if (passwordSet) {
    return [t('socialRecovery.review.privateSet')]
  }
  return [t('socialRecovery.privacy.level.private.label')]
}
