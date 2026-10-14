/**
 * The recovery path as one line by its shape, where the shape has one: any n
 * of m guardians (one group of guardians alone), two methods both required
 * (two required rows, or one group of two that needs both), or two methods
 * either one (one group of two that needs one). Null for any other shape,
 * which the path's rule lines describe instead. A passkey is named by its
 * label where it carries one.
 */
import type { Configuration, Credential } from '@web/modules/social-recovery/sdk-interfaces'
import type { AddressBook } from '@web/modules/social-recovery/shared/client'
import type { Translate } from '@web/modules/social-recovery/shared/display'
import { kindNameOf, kindOf } from '@web/modules/social-recovery/setup/review'

const PATH = 'socialRecovery.wait.path'

const nameOf = (credential: Credential, book: AddressBook, t: Translate): string => {
  const kind = kindOf(credential, book)
  if (!kind) {
    return t('socialRecovery.display.nouns.method')
  }
  if (kind === 'passkey' && credential.label) {
    return credential.label
  }
  return kindNameOf(kind, t)
}

export const pathLineOf = (
  configuration: Configuration,
  book: AddressBook,
  t: Translate
): string | null => {
  const clauses = configuration.clauses.filter((clause) => clause.credentials.length > 0)
  const [only] = clauses
  if (
    clauses.length === 1 &&
    only.credentials.length >= 2 &&
    only.credentials.every((member) => kindOf(member, book) === 'ecdsa')
  ) {
    return t(`${PATH}.anyOf`, { threshold: only.threshold, count: only.credentials.length })
  }
  const members = clauses.flatMap((clause) => clause.credentials)
  if (members.length !== 2) {
    return null
  }
  const names = { first: nameOf(members[0], book, t), second: nameOf(members[1], book, t) }
  if (clauses.every((clause) => clause.threshold >= clause.credentials.length)) {
    return t(`${PATH}.bothRequired`, names)
  }
  if (clauses.length === 1 && only.threshold === 1) {
    return t(`${PATH}.eitherOne`, names)
  }
  return null
}
