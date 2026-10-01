/**
 * The one sentence that names a recovery path's shape without its members. The
 * expected sentences are composed from the string table's own values, so the
 * tests follow the table and a hard-coded word in the rendering shows up.
 */
import i18next from 'i18next'
import { isAddressEqual } from 'viem'

import type { Clause, Credential, Hex } from '@web/modules/social-recovery/sdk-interfaces'

import { addressBookOf } from '@web/modules/social-recovery/shared/client/addresses'
import { emptySlot, SLOT_KINDS } from '@web/modules/social-recovery/shared/records'
import type { SlotKind } from '@web/modules/social-recovery/shared/records'

import { renderShapeSentence } from '@web/modules/social-recovery/shared/rule-lines'
import type { RuleLinesOptions, Translate } from '@web/modules/social-recovery/shared/rule-lines'

import { EN } from './harness'
import type { Table } from './harness'

const translatorOf = (table: Table): Translate => {
  const i18n = i18next.createInstance()
  // eslint-disable-next-line @typescript-eslint/no-floating-promises
  i18n.init({
    lng: 'en',
    fallbackLng: 'en',
    defaultNS: 'app',
    resources: { en: { app: table } },
    interpolation: { escapeValue: false },
    initImmediate: false
  })
  return (key, params) => String(i18n.t(key, params ? { ...params } : undefined))
}

const fill = (template: string, params: Record<string, string | number>): string =>
  template.replace(/\{\{(\w+)\}\}/g, (_, name: string) => String(params[name]))

// The kind each shipped method module serves, read from the address book.
const book = addressBookOf('sepolia')
const kindOfMethod: RuleLinesOptions['kindOfMethod'] = (method) =>
  SLOT_KINDS.find((kind) => isAddressEqual(book.methods[kind], method))
const WITH_KINDS: RuleLinesOptions = { kindOfMethod }

let configCounter = 0
const enrolled = (kind: SlotKind): Credential => {
  configCounter += 1
  return {
    method: book.methods[kind],
    config: `0x${configCounter.toString(16).padStart(64, '0')}` as Hex
  }
}
const row = (credential: Credential): Clause => ({ threshold: 1, credentials: [credential] })
const group = (threshold: number, credentials: Credential[]): Clause => ({
  threshold,
  credentials
})
const noMember = (threshold: number): Clause => ({ threshold, credentials: [] })
const UNKNOWN_MODULE = '0x9000000000000000000000000000000000000009' as Hex

// The sentence parts, each read from one table.
const partsOf = (table: Table) => {
  const s = table.socialRecovery.shape.sentence
  return {
    kinds: s.kinds,
    method: s.kinds.method,
    pair: (first: string, second: string) => fill(s.pair, { first, second }),
    list: (first: string, rest: string) => fill(s.list, { first, rest }),
    anyOf: (threshold: number, count: number) => fill(s.anyOf, { threshold, count }),
    and: ` ${table.socialRecovery.shape.and.toLowerCase()} `
  }
}

const t = translatorOf(EN)
const p = partsOf(EN)

describe('renderShapeSentence: the shapes a holder picks', () => {
  it('a passkey, a passport and a guardian at 2 of 3', () => {
    const clauses = [group(2, [enrolled('passkey'), enrolled('zkpassport'), enrolled('ecdsa')])]
    expect(renderShapeSentence(clauses, WITH_KINDS, t)).toBe(
      p.list(p.list(p.kinds.passkey, p.pair(p.kinds.passport, p.kinds.guardian)), p.anyOf(2, 3))
    )
  })

  it('a passkey alone at 1 of 1 reads its kind alone', () => {
    expect(renderShapeSentence([row(enrolled('passkey'))], WITH_KINDS, t)).toBe(p.kinds.passkey)
  })

  it('a passkey row beside three guardians at 2 names the guardian kind once', () => {
    const clauses = [
      row(enrolled('passkey')),
      group(2, [enrolled('ecdsa'), enrolled('ecdsa'), enrolled('ecdsa')])
    ]
    expect(renderShapeSentence(clauses, WITH_KINDS, t)).toBe(
      `${p.kinds.passkey}${p.and}${p.list(p.kinds.guardian, p.anyOf(2, 3))}`
    )
  })

  it('four kinds at 2 of 4', () => {
    const clauses = [
      group(2, [
        enrolled('passkey'),
        enrolled('zkpassport'),
        enrolled('ecdsa'),
        enrolled('aadhaar')
      ])
    ]
    expect(renderShapeSentence(clauses, WITH_KINDS, t)).toBe(
      p.list(
        p.list(
          p.kinds.passkey,
          p.list(p.kinds.passport, p.pair(p.kinds.guardian, p.kinds.aadhaar))
        ),
        p.anyOf(2, 4)
      )
    )
  })

  it('a group of one reads its kind alone, with no count', () => {
    expect(renderShapeSentence([group(1, [enrolled('aadhaar')])], WITH_KINDS, t)).toBe(
      p.kinds.aadhaar
    )
  })
})

describe('renderShapeSentence: slots and unknown modules', () => {
  it('names each unfilled slot by the kind it waits for, with no method lookup', () => {
    const clauses = [group(2, [emptySlot('passkey'), emptySlot('zkpassport'), emptySlot('ecdsa')])]
    expect(renderShapeSentence(clauses, {}, t)).toBe(
      p.list(p.list(p.kinds.passkey, p.pair(p.kinds.passport, p.kinds.guardian)), p.anyOf(2, 3))
    )
  })

  it('an unfilled slot and an enrolled method of one kind share one name', () => {
    const clauses = [group(1, [enrolled('passkey'), emptySlot('passkey')])]
    expect(renderShapeSentence(clauses, WITH_KINDS, t)).toBe(p.list(p.kinds.passkey, p.anyOf(1, 2)))
  })

  it('names a method of a module the wallet does not know as a method', () => {
    const unknown: Credential = { method: UNKNOWN_MODULE, config: `0x${'ab'.repeat(32)}` as Hex }
    expect(renderShapeSentence([row(unknown)], WITH_KINDS, t)).toBe(p.method)
  })

  it('names an enrolled method as a method when no kind lookup is given', () => {
    const clauses = [group(1, [enrolled('passkey'), enrolled('ecdsa')])]
    expect(renderShapeSentence(clauses, {}, t)).toBe(p.list(p.method, p.anyOf(1, 2)))
  })

  it('names a slot whose label is no known kind as a method', () => {
    const slot: Credential = { ...emptySlot('ecdsa'), label: 'carrier-pigeon' }
    expect(renderShapeSentence([row(slot)], {}, t)).toBe(p.method)
  })
})

describe('renderShapeSentence: clauses with no member', () => {
  const clauses = [row(enrolled('passkey')), noMember(1)]

  it('leaves out a memberless clause when asked to skip it', () => {
    expect(renderShapeSentence(clauses, { ...WITH_KINDS, skipMemberlessClauses: true }, t)).toBe(
      p.kinds.passkey
    )
  })

  it('leaves out a memberless clause with a threshold when not asked to skip it', () => {
    expect(renderShapeSentence(clauses, WITH_KINDS, t)).toBe(p.kinds.passkey)
  })

  it('leaves out a memberless clause at threshold zero either way', () => {
    const zero = [row(enrolled('passkey')), noMember(0)]
    expect(renderShapeSentence(zero, WITH_KINDS, t)).toBe(p.kinds.passkey)
    expect(renderShapeSentence(zero, { ...WITH_KINDS, skipMemberlessClauses: true }, t)).toBe(
      p.kinds.passkey
    )
  })

  it('reads nothing for a path of no clause', () => {
    expect(renderShapeSentence([], WITH_KINDS, t)).toBe('')
  })
})

describe('renderShapeSentence: every word comes from the string table', () => {
  const SHAPES: Clause[][] = [
    [group(2, [enrolled('passkey'), enrolled('zkpassport'), enrolled('ecdsa')])],
    [row(enrolled('passkey'))],
    [row(enrolled('passkey')), group(2, [enrolled('ecdsa'), enrolled('ecdsa'), enrolled('ecdsa')])],
    [
      group(2, [
        enrolled('passkey'),
        enrolled('zkpassport'),
        enrolled('ecdsa'),
        enrolled('aadhaar')
      ])
    ],
    [
      row({ method: UNKNOWN_MODULE, config: '0x01' }),
      group(1, [emptySlot('zkpassport'), emptySlot('aadhaar')])
    ]
  ]

  // Every word the English table can put in the sentence, placeholders removed.
  const wordsOf = (text: string): string[] =>
    text
      .replace(/\{\{\w+\}\}/g, ' ')
      .split(/[\s,]+/)
      .filter((word) => word !== '')
  const s = EN.socialRecovery.shape.sentence
  const TABLE_WORDS = new Set([
    ...Object.values(s.kinds).flatMap(wordsOf),
    ...[s.anyOf, s.pair, s.list].flatMap(wordsOf),
    EN.socialRecovery.shape.and.toLowerCase()
  ])

  SHAPES.forEach((clauses, index) => {
    it(`shape ${index} reads only table words and numbers in English`, () => {
      const words = wordsOf(renderShapeSentence(clauses, WITH_KINDS, t))
      expect(words.length).toBeGreaterThan(0)
      expect(words.filter((word) => !TABLE_WORDS.has(word) && !/^\d+$/.test(word))).toEqual([])
    })
  })

  // A second table with every value changed: the sentence follows it word for word.
  const OTHER: Table = {
    socialRecovery: {
      shape: {
        and: 'UND',
        sentence: {
          kinds: {
            passkey: 'ein Passkey',
            passport: 'ein Reisepass',
            guardian: 'ein Vormund',
            aadhaar: 'eine Aadhaar-Identität',
            method: 'eine Methode'
          },
          anyOf: 'beliebige {{threshold}} von {{count}}',
          pair: '{{first}} sowie {{second}}',
          list: '{{first}}; {{rest}}'
        }
      }
    }
  }
  const other = partsOf(OTHER)
  const tOther = translatorOf(OTHER)

  it('follows another table for kinds, joins, the count and the clause join', () => {
    const clauses = [
      row({ method: UNKNOWN_MODULE, config: '0x01' }),
      group(2, [
        enrolled('passkey'),
        enrolled('zkpassport'),
        enrolled('ecdsa'),
        enrolled('aadhaar')
      ])
    ]
    expect(renderShapeSentence(clauses, WITH_KINDS, tOther)).toBe(
      `${other.method}${other.and}${other.list(
        other.list(
          other.kinds.passkey,
          other.list(other.kinds.passport, other.pair(other.kinds.guardian, other.kinds.aadhaar))
        ),
        other.anyOf(2, 4)
      )}`
    )
  })
})
