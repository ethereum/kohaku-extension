import type { Address, Clause, Credential } from '@web/modules/social-recovery/sdk-interfaces'
import { sameAddress } from '@web/modules/social-recovery/shared/client'
import type { AddressBook } from '@web/modules/social-recovery/shared/client'
import type { Translate } from '@web/modules/social-recovery/shared/display'
import { isEmptySlot, slotKindOf } from '@web/modules/social-recovery/shared/records'

import type { ExposureLines, MethodKind, OfferedLevel } from './types'

const EXPOSURE = 'socialRecovery.privacy.level.exposure'
const ITEMS = 'socialRecovery.disclosures.items'
const ITEMS_LEAD = 'socialRecovery.disclosures.itemsLead'

/** The kind of method a method module address serves in the address book, if any. */
export const kindOfMethodIn =
  (book: AddressBook) =>
  (method: Address): MethodKind | undefined => {
    const kinds = Object.keys(book.methods) as MethodKind[]
    return kinds.find((kind) => sameAddress(method, book.methods[kind]))
  }

/**
 * The kind a row of the path holds: the kind an empty slot waits for, or the
 * kind whose method address an enrolled credential names.
 */
const methodKindOf = (credential: Credential, book: AddressBook): MethodKind | undefined =>
  isEmptySlot(credential) ? slotKindOf(credential) : kindOfMethodIn(book)(credential.method)

/**
 * The items of the unguessable line, each an item slug under the disclosures:
 * the passkeys, the passport and the Aadhaar identity of the path. An address
 * row is guessable and is never among them.
 */
const unguessableItemsOf = (kinds: MethodKind[]): string[] => {
  const passkeys = kinds.filter((kind) => kind === 'passkey').length
  const items: string[] = []
  if (passkeys === 1) {
    items.push('passkey')
  }
  if (passkeys > 1) {
    items.push('passkeys')
  }
  if (kinds.includes('zkpassport')) {
    items.push('passport')
  }
  if (kinds.includes('aadhaar')) {
    items.push('aadhaar')
  }
  return items
}

/**
 * The unguessable line's key agrees with its subject: the singular verb for one
 * item that is itself one thing, the plural verb for several passkeys or for
 * two or more items.
 */
const unguessableKeyOf = (items: string[]) =>
  items.length === 1 && items[0] !== 'passkeys' ? 'unguessableOne' : 'unguessable'

/** The items as one phrase: the first in its leading form, two as a pair, three as a triple. */
const joinItems = ([lead, ...rest]: string[], t: Translate): string => {
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
 * The exposure line of a path at a level. The guessability half renders only
 * where the path holds an address row, since an address is the only row a
 * stranger can guess, and never at Public, where every address is on chain in
 * the clear; the publication half renders for every path at every level.
 */
export const exposureLinesOf = (
  clauses: Clause[],
  level: OfferedLevel,
  book: AddressBook,
  t: Translate
): ExposureLines => {
  const kinds = clauses
    .flatMap(({ credentials }) => credentials)
    .map((credential) => methodKindOf(credential, book))
    .filter((kind): kind is MethodKind => kind !== undefined)
  const publication = t(`${EXPOSURE}.publication`)
  if (level === 'public' || !kinds.includes('ecdsa')) {
    return { publication }
  }
  const items = unguessableItemsOf(kinds)
  return {
    guardians: t(`${EXPOSURE}.guardians`),
    unguessable: items.length
      ? t(`${EXPOSURE}.${unguessableKeyOf(items)}`, { items: joinItems(items, t) })
      : undefined,
    publication
  }
}
