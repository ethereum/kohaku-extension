/**
 * Copy lint over the social recovery strings of en.json. It guards the banned
 * terms, the case-sensitive ban on the label "Protected" (anywhere in en.json),
 * the closed chip vocabulary of the status block, the i18next key separators
 * and the placeholders inside {{...}}.
 */
import fs from 'fs'
import path from 'path'

type JsonValue = string | number | boolean | null | JsonValue[] | { [key: string]: JsonValue }
type JsonObject = { [key: string]: JsonValue }

const EN_JSON_PATH = path.resolve(
  __dirname,
  '../../../../common/config/localization/translations/en.json'
)

const enRaw = fs.readFileSync(EN_JSON_PATH, 'utf8')
const en = JSON.parse(enRaw) as JsonObject

const isObject = (value: JsonValue | undefined): value is JsonObject =>
  typeof value === 'object' && value !== null && !Array.isArray(value)

type Entry = { keyPath: string; value: string }

// Walks every string value below `node`, depth first, keeping the key path.
const collectStrings = (node: JsonValue, keyPath: string, out: Entry[] = []): Entry[] => {
  if (typeof node === 'string') {
    out.push({ keyPath, value: node })
  } else if (Array.isArray(node)) {
    node.forEach((item, i) => collectStrings(item, `${keyPath}[${i}]`, out))
  } else if (isObject(node)) {
    Object.entries(node).forEach(([k, v]) => collectStrings(v, `${keyPath}/${k}`, out))
  }
  return out
}

// Walks every key below `node`, keeping the key path.
const collectKeys = (node: JsonValue, keyPath: string, out: Entry[] = []): Entry[] => {
  if (Array.isArray(node)) {
    node.forEach((item, i) => collectKeys(item, `${keyPath}[${i}]`, out))
  } else if (isObject(node)) {
    Object.entries(node).forEach(([k, v]) => {
      out.push({ keyPath: `${keyPath}/${k}`, value: k })
      collectKeys(v, `${keyPath}/${k}`, out)
    })
  }
  return out
}

// Whole-word bans. "Word-bounded" means a longer word that merely contains the
// term (proofread, waterproof, relayed) is not a hit, but the plural of
// the banned word is, since the ban names the term and its plural is the term.
const CASE_INSENSITIVE_BANS: { term: string; pattern: RegExp }[] = [
  { term: 'policy', pattern: /\bpolic(?:y|ies)\b/i },
  { term: 'proof', pattern: /\bproofs?\b/i },
  { term: 'relayer', pattern: /\brelayers?\b/i },
  // Hyphen, space or nothing between EIP and 712.
  { term: 'EIP-712', pattern: /\bEIP[-\s]?712\b/i },
  { term: 'atomic', pattern: /\batomic(?:ally)?\b/i },
  { term: 'your people', pattern: /\byour\s+people\b/i },
  { term: 'full wallet password', pattern: /\bfull\s+wallet\s+passwords?\b/i }
]

// The label Protected is banned: case-sensitive, whole word.
const PROTECTED_BAN = /\bProtected\b/

// The closed chip vocabulary: the status block must hold every chip below.
const CHIP_VOCABULARY = [
  // a method in setup
  'not started',
  'in progress',
  'tested',
  'not tested',
  'test failed',
  'test unavailable',
  'not supported',
  'not yet active',
  'saved',
  'live',
  // a row in collection
  'not asked',
  'waiting',
  'declined',
  'unanswered',
  'complete',
  'not needed',
  'did not answer',
  'stopped',
  // an attempt
  'recovery in progress',
  'execution due',
  'cancelled',
  // the recovery status and the three extra chips
  'set up',
  'not set up',
  'path locked',
  'not active',
  'cannot recover'
]

const socialRecovery = en.socialRecovery
const strings = isObject(socialRecovery) ? collectStrings(socialRecovery, 'socialRecovery') : []
const keys = isObject(socialRecovery) ? collectKeys(socialRecovery, 'socialRecovery') : []

describe('socialRecovery strings in en.json', () => {
  it('has a non-empty socialRecovery block', () => {
    expect(isObject(socialRecovery)).toBe(true)
    expect(Object.keys(socialRecovery as JsonObject).length).toBeGreaterThan(0)
    expect(strings.length).toBeGreaterThan(0)
  })

  it('uses no ":" and no "." in any key (i18next separators)', () => {
    const offenders = keys
      .filter(({ value }) => value.includes('.') || value.includes(':'))
      .map(({ keyPath }) => keyPath)
    expect(offenders).toEqual([])
  })

  CASE_INSENSITIVE_BANS.forEach(({ term, pattern }) =>
    it(`carries no banned term "${term}"`, () => {
      const offenders = strings
        .filter(({ value }) => pattern.test(value))
        .map(({ keyPath, value }) => `${keyPath}: ${value}`)
      expect(offenders).toEqual([])
    })
  )

  it('carries no banned label "Protected" (case-sensitive)', () => {
    const offenders = strings
      .filter(({ value }) => PROTECTED_BAN.test(value))
      .map(({ keyPath, value }) => `${keyPath}: ${value}`)
    expect(offenders).toEqual([])
  })

  it('has "Protected" nowhere in en.json, as a key or a value', () => {
    const all = [...collectStrings(en, ''), ...collectKeys(en, '')]
    const offenders = all
      .filter(({ value }) => PROTECTED_BAN.test(value))
      .map(({ keyPath, value }) => `${keyPath}: ${value}`)
    expect(offenders).toEqual([])
  })

  it('holds the whole chip vocabulary among the values of socialRecovery.status', () => {
    const status = isObject(socialRecovery) ? socialRecovery.status : undefined
    expect(isObject(status)).toBe(true)
    const statusValues = new Set(
      collectStrings(status as JsonValue, 'status').map(({ value }) => value.trim().toLowerCase())
    )
    const missing = CHIP_VOCABULARY.filter((chip) => !statusValues.has(chip))
    expect(missing).toEqual([])
  })
})

// i18next interpolation: every {{...}} in a value. The rule-line counts use
// n, m and spare (spare = M minus N); any other placeholder must be a plain
// identifier that starts with a lowercase letter (no formatter, no nesting,
// no spaces).
const PLACEHOLDER = /\{\{([^}]*)\}\}/g
const COUNT_PLACEHOLDERS = ['n', 'm', 'spare']
const LOWERCASE_IDENTIFIER = /^[a-z][a-zA-Z0-9]*$/

const placeholdersOf = (value: string): string[] =>
  Array.from(value.matchAll(PLACEHOLDER), (match) => match[1])

const isAllowedPlaceholder = (name: string) =>
  COUNT_PLACEHOLDERS.includes(name) || LOWERCASE_IDENTIFIER.test(name)

describe('socialRecovery placeholders', () => {
  it('uses only n, m, spare or a lowercase identifier inside {{...}}', () => {
    const offenders = strings.flatMap(({ keyPath, value }) =>
      placeholdersOf(value)
        .filter((name) => !isAllowedPlaceholder(name))
        .map((name) => `${keyPath}: {{${name}}}`)
    )
    expect(offenders).toEqual([])
  })

  it('leaves no unbalanced braces in a value', () => {
    const offenders = strings
      .filter(({ value }) => {
        const stripped = value.replace(PLACEHOLDER, '')
        return stripped.includes('{{') || stripped.includes('}}')
      })
      .map(({ keyPath, value }) => `${keyPath}: ${value}`)
    expect(offenders).toEqual([])
  })

  it('carries {{n}}, {{m}} and {{spare}} in the rule lines', () => {
    const ruleLines = isObject(socialRecovery) ? socialRecovery.ruleLines : undefined
    expect(isObject(ruleLines)).toBe(true)
    const used = new Set(
      collectStrings(ruleLines as JsonValue, 'ruleLines').flatMap(({ value }) =>
        placeholdersOf(value)
      )
    )
    expect(COUNT_PLACEHOLDERS.filter((name) => !used.has(name))).toEqual([])
  })
})

// Keys that must exist: the gas shortfall lines of save, submit and cancel,
// and the ceremony's passed note. The walk above already lints them; this
// block proves they exist, so the lint covers them.
const REQUIRED_KEYS = [
  'socialRecovery/writes/gas/shortfallSave',
  'socialRecovery/writes/gas/shortfallSubmit',
  'socialRecovery/writes/gas/shortfallCancel',
  'socialRecovery/ceremony/passedNote'
]

describe('socialRecovery required keys', () => {
  REQUIRED_KEYS.forEach((keyPath) =>
    it(`${keyPath} exists, passes every ban and uses allowed placeholders`, () => {
      const entry = strings.find((candidate) => candidate.keyPath === keyPath)
      expect(entry).toBeDefined()
      const { value } = entry as Entry
      expect(value.trim().length).toBeGreaterThan(0)
      expect(CASE_INSENSITIVE_BANS.filter(({ pattern }) => pattern.test(value))).toEqual([])
      expect(PROTECTED_BAN.test(value)).toBe(false)
      expect(placeholdersOf(value).filter((name) => !isAllowedPlaceholder(name))).toEqual([])
    })
  )
})

describe('copy-lint patterns (self-check)', () => {
  const hits = (text: string) => CASE_INSENSITIVE_BANS.filter(({ pattern }) => pattern.test(text))

  it('flags each banned term, its plural and its casing variants', () => {
    ;[
      'Policy',
      'policies',
      'PROOF',
      'proofs',
      'Relayer',
      'relayers',
      'EIP-712',
      'eip712',
      'Atomic',
      'atomically',
      'Your people',
      'Full wallet password'
    ].forEach((text) => expect(hits(text).length).toBe(1))
  })

  it('does not flag longer words that only contain a banned term', () => {
    ;['proofread', 'waterproof', 'relayed', 'atomicity-free', 'people', 'wallet password'].forEach(
      (text) => {
        const found = hits(text).map(({ term }) => term)
        expect(found).toEqual([])
      }
    )
  })

  it('accepts the count placeholders and lowercase identifiers only', () => {
    expect(
      ['n', 'm', 'spare', 'count', 'deadline', 'setupNumber'].every(isAllowedPlaceholder)
    ).toBe(true)
    expect(['N', 'M', 'Spare', 'value, number', ' n ', '', '1n'].some(isAllowedPlaceholder)).toBe(
      false
    )
    expect(placeholdersOf('{{n}} of {{m}}, {{spare}} left')).toEqual(['n', 'm', 'spare'])
  })

  it('reads Protected case-sensitively', () => {
    expect(PROTECTED_BAN.test('Protected')).toBe(true)
    expect(PROTECTED_BAN.test('protected')).toBe(false)
    expect(PROTECTED_BAN.test('Unprotected')).toBe(false)
  })
})
