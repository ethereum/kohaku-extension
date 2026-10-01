/**
 * One sentence that names a recovery path's shape without its members: the
 * kinds of method each clause holds and how many of them must answer. A
 * shape-visible setup shows this much to anyone, so the privacy step and the
 * review read it back to the holder.
 * Pure: the same input yields equal output and the input is never mutated.
 */
import type { Clause, Credential } from '@web/modules/social-recovery/sdk-interfaces'
import type { Translate } from '@web/modules/social-recovery/shared/display/types'
import { isEmptySlot, slotKindOf } from '@web/modules/social-recovery/shared/records/slots'
import type { SlotKind } from '@web/modules/social-recovery/shared/records/types'

import type { RuleLinesOptions } from './types'

const SENTENCE = 'socialRecovery.shape.sentence'

/** How the sentence names each kind of method, with its article. */
const KIND_NAME_OF: { readonly [K in SlotKind]: string } = {
  ecdsa: `${SENTENCE}.kinds.guardian`,
  passkey: `${SENTENCE}.kinds.passkey`,
  zkpassport: `${SENTENCE}.kinds.passport`,
  aadhaar: `${SENTENCE}.kinds.aadhaar`
}

/** The name of a method whose kind the wallet does not know. */
const UNKNOWN_KIND_NAME = `${SENTENCE}.kinds.method`

const nameKeyOf = (
  credential: Credential,
  kindOfMethod: RuleLinesOptions['kindOfMethod']
): string => {
  const kind = isEmptySlot(credential) ? slotKindOf(credential) : kindOfMethod?.(credential.method)
  return kind ? KIND_NAME_OF[kind] : UNKNOWN_KIND_NAME
}

/**
 * The names in the order the list reads: `a`, `a and b`, `a, b and c`,
 * `a, b, c and d`. Past two names, each name but the last two leads the list
 * and the last two close it as a pair.
 */
const joinNames = (names: readonly string[], t: Translate): string => {
  if (names.length <= 1) {
    return names[0] ?? ''
  }
  if (names.length === 2) {
    return t(`${SENTENCE}.pair`, { first: names[0], second: names[1] })
  }
  return t(`${SENTENCE}.list`, { first: names[0], rest: joinNames(names.slice(1), t) })
}

/**
 * One clause: a required row reads its kind alone; a group reads its kinds,
 * each named once, then how many of its members must answer.
 */
const clausePart = (clause: Clause, options: RuleLinesOptions, t: Translate): string => {
  const nameKeys = [...new Set(clause.credentials.map((c) => nameKeyOf(c, options.kindOfMethod)))]
  const names = joinNames(
    nameKeys.map((key) => t(key)),
    t
  )
  if (clause.credentials.length === 1) {
    return names
  }
  const count = t(`${SENTENCE}.anyOf`, {
    threshold: clause.threshold,
    count: clause.credentials.length
  })
  return t(`${SENTENCE}.list`, { first: names, rest: count })
}

/**
 * The path's shape in one sentence, `a passkey, a passport and a guardian, any
 * 2 of 3`, clauses joined by `and`. A clause with no member has no shape to
 * name, so the sentence always leaves it out, whatever its threshold and with
 * or without `skipMemberlessClauses`. The sentence starts in lower case, since
 * the line that carries it leads into it.
 */
export const renderShapeSentence = (
  clauses: readonly Clause[],
  options: RuleLinesOptions,
  t: Translate
): string => {
  const read = clauses.filter((clause) => clause.credentials.length > 0)
  const and = ` ${t('socialRecovery.shape.and').toLowerCase()} `
  return read.map((clause) => clausePart(clause, options, t)).join(and)
}
