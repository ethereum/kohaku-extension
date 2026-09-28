import i18n from '@common/config/localization/localization'
import en from '@common/config/localization/translations/en.json'

import {
  APPROVAL_VALUES,
  ATTEMPT_CHIPS,
  Chip,
  chipKey,
  CHIP_SETS,
  ChipSetName,
  COLLECTION_CHIPS,
  CONCEPT_NOUNS,
  EDITOR_CHIPS,
  KIT_NOUNS,
  METHOD_CHIPS,
  nounKey,
  PARTY_NOUNS,
  PASSWORD_NAMES,
  passwordKey,
  RECOVERY_STATUS_CHIPS,
  renderApprovalValueName,
  renderChip,
  REQUEST_CHIPS,
  SESSION_CHIPS
} from '..'

const STATUS_PREFIX = 'socialRecovery.status.'

const words = <S extends ChipSetName>(set: S, chips: readonly Chip<S>[]) =>
  chips.map((chip) => {
    const key = chipKey(set, chip)
    expect(i18n.exists(key)).toBe(true)
    return renderChip(set, chip).toLowerCase()
  })

const sorted = (list: readonly string[]) => [...list].sort()

const moduleKeys = (Object.keys(CHIP_SETS) as ChipSetName[]).flatMap((set) =>
  (CHIP_SETS[set] as readonly string[]).map((chip) => chipKey(set, chip as never))
)

const enStatusKeys = Object.entries(en.socialRecovery.status).flatMap(([block, entries]) =>
  Object.keys(entries).map((chip) => `${STATUS_PREFIX}${block}.${chip}`)
)

describe('the en.json chip blocks hold the module vocabulary and nothing else', () => {
  it('every key under socialRecovery.status is a chip of exactly one module set', () => {
    expect(sorted(enStatusKeys)).toEqual(sorted(moduleKeys))
  })

  it('no two module chips share one key', () => {
    expect(new Set(moduleKeys).size).toBe(moduleKeys.length)
  })
})

describe('closed chip sets', () => {
  it('a method in setup renders exactly its ten words', () => {
    expect(sorted(words('method', METHOD_CHIPS))).toEqual(
      sorted([
        'not started',
        'in progress',
        'tested',
        'not tested',
        'test failed',
        'test unavailable',
        'not supported',
        'not yet active',
        'saved',
        'live'
      ])
    )
  })

  it('a row in collection renders exactly its eight words', () => {
    expect(sorted(words('collection', COLLECTION_CHIPS))).toEqual(
      sorted([
        'not asked',
        'waiting',
        'declined',
        'unanswered',
        'complete',
        'not needed',
        'did not answer',
        'stopped'
      ])
    )
  })

  it('an attempt renders exactly its five words, not submitted excluded', () => {
    expect(sorted(words('attempt', ATTEMPT_CHIPS))).toEqual(
      sorted(['recovery in progress', 'waiting', 'execution due', 'stopped', 'cancelled'])
    )
  })

  it('the recovery status is exactly set up, not set up and the three chips beside it', () => {
    expect(sorted(words('recovery', RECOVERY_STATUS_CHIPS))).toEqual(
      sorted(['set up', 'not set up', 'path locked', 'not active', 'cannot recover'])
    )
  })

  it('a session before submission reads exactly not submitted', () => {
    expect(words('session', SESSION_CHIPS)).toEqual(['not submitted'])
  })

  it('the chips that end a whole request are exactly expired, void and setup changed', () => {
    expect(sorted(words('request', REQUEST_CHIPS))).toEqual(
      sorted(['expired', 'void', 'setup changed'])
    )
  })

  it('the editor chip is exactly still needed', () => {
    expect(words('editor', EDITOR_CHIPS)).toEqual(['still needed'])
  })
})

describe('kit nouns and password names', () => {
  const render = (key: string) => {
    expect(i18n.exists(key)).toBe(true)
    return i18n.t(key)
  }

  it('renders exactly the six kit nouns under their screen words', () => {
    expect(KIT_NOUNS.map((noun) => render(nounKey(noun)))).toEqual([
      'Recovery registry',
      'Recovery module',
      'Publisher',
      'Security stop',
      'Setup number',
      'Attempt number'
    ])
  })

  it('renders the concept nouns and the guardian role word', () => {
    expect(CONCEPT_NOUNS.map((noun) => render(nounKey(noun)))).toEqual([
      'Recovery path',
      'Method',
      'Waiting period',
      'Guardian'
    ])
  })

  it("renders the method's admin and pause holder under their screen words", () => {
    expect(PARTY_NOUNS.map((noun) => render(nounKey(noun)))).toEqual([
      "The method's admin",
      'The party that can stop that method'
    ])
  })

  it('renders exactly the two password names', () => {
    expect(PASSWORD_NAMES.map((name) => render(passwordKey(name)))).toEqual([
      'Extension password',
      'Recovery password'
    ])
  })
})

describe('the four approval values and the done screen exception', () => {
  it('names each value once everywhere but the done screen', () => {
    expect(APPROVAL_VALUES.map((value) => renderApprovalValueName(value))).toEqual([
      'New key',
      'Key being removed',
      'Payment',
      'Deadline'
    ])
    expect(
      APPROVAL_VALUES.map((value) => renderApprovalValueName(value, { doneScreen: false }))
    ).toEqual(['New key', 'Key being removed', 'Payment', 'Deadline'])
  })

  it('names the two keys controlled by and removed on the done screen, and only them', () => {
    expect(
      APPROVAL_VALUES.map((value) => renderApprovalValueName(value, { doneScreen: true }))
    ).toEqual(['Controlled by', 'Removed', 'Payment', 'Deadline'])
  })
})
