import i18next from 'i18next'
import { isAddressEqual } from 'viem'

import en from '@common/config/localization/translations/en.json'
import type {
  Clause,
  Credential,
  Hex,
  SetupDraft
} from '@web/modules/social-recovery/sdk-interfaces'

import { addressBookOf } from '@web/modules/social-recovery/shared/client/addresses'
import { emptySlot, SLOT_KINDS } from '@web/modules/social-recovery/shared/records'
import type { SlotKind } from '@web/modules/social-recovery/shared/records'

import { getRuleLines, renderRuleLines } from '..'
import type { RuleLinesOptions, Translate } from '..'

// One method address per family: the failure-domain line keys on the method
// address.
const PASSKEY = '0x1000000000000000000000000000000000000001' as Hex
const PASSPORT = '0x2000000000000000000000000000000000000002' as Hex
const AADHAAR = '0x3000000000000000000000000000000000000003' as Hex
const GUARDIAN = '0x4000000000000000000000000000000000000004' as Hex
// One family written in two letter cases: an address's case is a checksum,
// never a second module, so the two read as one family.
const HARDWARE_KEY_LOWER = '0xabcdef000000000000000000000000000000abcd' as Hex
const HARDWARE_KEY_MIXED = '0xAbCdEf000000000000000000000000000000AbCd' as Hex

// Two fixed configs for the duplicate shapes; `cred` below never reaches them.
const DUP_CONFIG = `0x${'d'.repeat(64)}` as Hex
const OTHER_CONFIG = `0x${'e'.repeat(64)}` as Hex
// One config's bytes written in two letter cases: configs compare as hex bytes.
const CASE_CONFIG_LOWER = `0x${'ab'.repeat(32)}` as Hex
const CASE_CONFIG_MIXED = `0x${'aB'.repeat(16)}${'Ab'.repeat(16)}` as Hex

let configCounter = 0
const cred = (method: Hex): Credential => {
  configCounter += 1
  return { method, config: `0x${configCounter.toString(16).padStart(64, '0')}` as Hex }
}

// A required row is a clause of one credential at threshold one.
const row = (method: Hex): Clause => ({ threshold: 1, credentials: [cred(method)] })
const group = (threshold: number, methods: Hex[]): Clause => ({
  threshold,
  credentials: methods.map(cred)
})

const draft = (clauses: Clause[]): SetupDraft => ({
  wait: 604800n,
  clauses,
  ignoresPause: false,
  privacy: { publicMetadata: '0x' as Hex, backup: 'encrypted' }
})

const RULE_LINES = (en as { socialRecovery: { ruleLines: Record<string, string> } }).socialRecovery
  .ruleLines
const PREFIX = 'socialRecovery.ruleLines.'

const shortKey = (key: string): string => (key.startsWith(PREFIX) ? key.slice(PREFIX.length) : key)

type Expected = { key: string; params?: Record<string, number> }

const SINGLE_METHOD: Expected[] = [
  { key: 'singleMethod' },
  { key: 'secondMethodOffer' },
  { key: 'platformFate' }
]

// Each shape the editor accepts, with the lines it earns in order.
const SHAPES: { name: string; clauses: Clause[]; expected: Expected[] }[] = [
  {
    name: 'one row: the single-method warning with the second passkey or hardware key offer',
    clauses: [row(PASSKEY)],
    expected: SINGLE_METHOD
  },
  {
    name: 'two rows: both must answer, and the sizing rule line',
    clauses: [row(PASSKEY), row(PASSPORT)],
    expected: [{ key: 'bothMustAnswer' }, { key: 'differentPlaces' }, { key: 'sizingRule' }]
  },
  {
    name: 'three rows: all 3 must answer',
    clauses: [row(PASSKEY), row(PASSPORT), row(GUARDIAN)],
    expected: [{ key: 'allMustAnswer', params: { n: 3 } }, { key: 'differentPlaces' }]
  },
  {
    name: 'a group of one: one member is one method, the single-method warning',
    clauses: [group(1, [PASSKEY])],
    expected: SINGLE_METHOD
  },
  {
    name: 'a group of two at threshold one: either one alone',
    clauses: [group(1, [PASSKEY, PASSPORT])],
    expected: [{ key: 'eitherOneAlone' }, { key: 'differentPlaces' }]
  },
  {
    name: 'a group of three at threshold one: any one of these 3 alone',
    clauses: [group(1, [PASSKEY, PASSPORT, GUARDIAN])],
    expected: [{ key: 'anyOneOfM', params: { m: 3 } }, { key: 'differentPlaces' }]
  },
  {
    name: 'a group of three at threshold two: any 2 of these 3, losing more than 1',
    clauses: [group(2, [PASSKEY, PASSPORT, GUARDIAN])],
    expected: [{ key: 'anyNOfM', params: { n: 2, m: 3, spare: 1 } }, { key: 'differentPlaces' }]
  },
  {
    name: 'a group at threshold equal to its size: every member must answer',
    clauses: [group(3, [PASSKEY, PASSPORT, GUARDIAN])],
    expected: [{ key: 'everyMemberMustAnswer' }, { key: 'differentPlaces' }]
  },
  {
    name: 'a group at threshold equal to its size beside a required row: together with, every member',
    clauses: [row(PASSKEY), group(2, [PASSPORT, GUARDIAN])],
    expected: [{ key: 'togetherWithRequiredEveryMember' }, { key: 'differentPlaces' }]
  },
  {
    name: 'a group at threshold equal to its size beside another group only: together with, every member',
    clauses: [group(1, [PASSKEY, PASSPORT]), group(2, [GUARDIAN, AADHAAR])],
    expected: [
      { key: 'togetherWithGroups', params: { n: 1, m: 2, spare: 1 } },
      { key: 'togetherWithGroupsEveryMember' },
      { key: 'differentPlaces' }
    ]
  },
  {
    name: 'a group at threshold equal to its size beside a row and another group: together with both, every member',
    clauses: [row(PASSKEY), group(1, [PASSPORT, AADHAAR]), group(2, [GUARDIAN, PASSKEY])],
    expected: [
      { key: 'togetherWithRequiredAndGroups', params: { n: 1, m: 2, spare: 1 } },
      { key: 'togetherWithRequiredAndGroupsEveryMember' },
      { key: 'differentPlaces' }
    ]
  },
  {
    name: 'a group of two at threshold one beside a required row: together with, any 1 of these 2',
    clauses: [row(PASSKEY), group(1, [PASSPORT, AADHAAR])],
    expected: [
      { key: 'togetherWithRequired', params: { n: 1, m: 2, spare: 1 } },
      { key: 'differentPlaces' }
    ]
  },
  {
    name: 'a group beside required rows: together with your required methods',
    clauses: [row(PASSKEY), group(2, [PASSPORT, GUARDIAN, AADHAAR])],
    expected: [
      { key: 'togetherWithRequired', params: { n: 2, m: 3, spare: 1 } },
      { key: 'differentPlaces' }
    ]
  },
  {
    name: 'two groups: together with enough members of each other group to meet its threshold',
    clauses: [group(1, [PASSKEY, PASSPORT]), group(2, [GUARDIAN, AADHAAR, PASSKEY])],
    expected: [
      { key: 'togetherWithGroups', params: { n: 1, m: 2, spare: 1 } },
      { key: 'togetherWithGroups', params: { n: 2, m: 3, spare: 1 } },
      { key: 'differentPlaces' }
    ]
  },
  {
    name: 'a group whose members are all guardians: one failure domain',
    clauses: [group(2, [GUARDIAN, GUARDIAN, GUARDIAN])],
    expected: [
      { key: 'anyNOfM', params: { n: 2, m: 3, spare: 1 } },
      { key: 'oneFailureDomain' },
      { key: 'differentPlaces' }
    ]
  },
  {
    name: 'a group of a passport and an Aadhaar identity: two domains, no failure-domain line',
    clauses: [group(1, [PASSPORT, AADHAAR])],
    expected: [{ key: 'eitherOneAlone' }, { key: 'differentPlaces' }]
  },
  {
    name: 'a 3-of-3 all-guardian group: every member, then one failure domain',
    clauses: [group(3, [GUARDIAN, GUARDIAN, GUARDIAN])],
    expected: [
      { key: 'everyMemberMustAnswer' },
      { key: 'oneFailureDomain' },
      { key: 'differentPlaces' }
    ]
  },
  {
    name: 'two groups, each of one family: each failure-domain line follows its own group',
    clauses: [group(1, [GUARDIAN, GUARDIAN]), group(2, [PASSKEY, PASSKEY, PASSKEY])],
    expected: [
      { key: 'togetherWithGroups', params: { n: 1, m: 2, spare: 1 } },
      { key: 'oneFailureDomain' },
      { key: 'togetherWithGroups', params: { n: 2, m: 3, spare: 1 } },
      { key: 'oneFailureDomain' },
      { key: 'differentPlaces' }
    ]
  },
  {
    name: 'two groups, only the second of one family: its failure-domain line follows the second group',
    clauses: [group(1, [PASSPORT, AADHAAR]), group(2, [GUARDIAN, GUARDIAN, GUARDIAN])],
    expected: [
      { key: 'togetherWithGroups', params: { n: 1, m: 2, spare: 1 } },
      { key: 'togetherWithGroups', params: { n: 2, m: 3, spare: 1 } },
      { key: 'oneFailureDomain' },
      { key: 'differentPlaces' }
    ]
  },
  {
    name: 'one family in mixed-case method addresses: one failure domain',
    clauses: [group(1, [HARDWARE_KEY_LOWER, HARDWARE_KEY_MIXED])],
    expected: [{ key: 'eitherOneAlone' }, { key: 'oneFailureDomain' }, { key: 'differentPlaces' }]
  },
  {
    name: 'one row of a passport: the single-method warning',
    clauses: [row(PASSPORT)],
    expected: SINGLE_METHOD
  },
  {
    name: 'two rows of two identities: both must answer, and the sizing rule line',
    clauses: [row(AADHAAR), row(PASSPORT)],
    expected: [{ key: 'bothMustAnswer' }, { key: 'differentPlaces' }, { key: 'sizingRule' }]
  },
  {
    name: 'your device and your guardians: together with, and one failure domain',
    clauses: [row(PASSKEY), group(2, [GUARDIAN, GUARDIAN, GUARDIAN])],
    expected: [
      { key: 'togetherWithRequired', params: { n: 2, m: 3, spare: 1 } },
      { key: 'oneFailureDomain' },
      { key: 'differentPlaces' }
    ]
  },
  {
    name: 'a passport and an Aadhaar identity at two of two: every member, no failure domain',
    clauses: [group(2, [PASSPORT, AADHAAR])],
    expected: [{ key: 'everyMemberMustAnswer' }, { key: 'differentPlaces' }]
  },
  {
    name: 'two rows and two groups: together with both, the domain line after its group',
    clauses: [
      row(PASSKEY),
      row(PASSPORT),
      group(1, [GUARDIAN, AADHAAR]),
      group(2, [GUARDIAN, GUARDIAN, GUARDIAN])
    ],
    expected: [
      { key: 'togetherWithRequiredAndGroups', params: { n: 1, m: 2, spare: 1 } },
      { key: 'togetherWithRequiredAndGroups', params: { n: 2, m: 3, spare: 1 } },
      { key: 'oneFailureDomain' },
      { key: 'differentPlaces' }
    ]
  },
  {
    name: 'two different configs of one method address: not a duplicate, lines as usual',
    clauses: [
      {
        threshold: 1,
        credentials: [
          { method: PASSKEY, config: DUP_CONFIG },
          { method: PASSKEY, config: OTHER_CONFIG }
        ]
      }
    ],
    expected: [{ key: 'eitherOneAlone' }, { key: 'oneFailureDomain' }, { key: 'differentPlaces' }]
  }
]

// Paths that earn no line: a refused path recovers nothing, so it yields no
// lines, even beside a valid row or group. A path is refused when a threshold
// is below one, above its clause's size, above 255 or not a whole number, or
// when the path holds one enrolled credential twice, in one clause or across
// two.
const REFUSED_SHAPES: { name: string; clauses: Clause[] }[] = [
  { name: 'an empty path', clauses: [] },
  // A duplicate is the same (method, config) pair anywhere on the path.
  {
    name: 'a 1-of-2 group holding the same credential twice: never either one alone',
    clauses: [
      {
        threshold: 1,
        credentials: [
          { method: PASSKEY, config: DUP_CONFIG },
          { method: PASSKEY, config: DUP_CONFIG }
        ]
      }
    ]
  },
  {
    name: 'a passkey row and the same passkey inside a 2-of-3 group',
    clauses: [
      { threshold: 1, credentials: [{ method: PASSKEY, config: DUP_CONFIG }] },
      {
        threshold: 2,
        credentials: [
          { method: PASSPORT, config: OTHER_CONFIG },
          { method: PASSKEY, config: DUP_CONFIG },
          { method: GUARDIAN, config: OTHER_CONFIG }
        ]
      }
    ]
  },
  {
    name: 'two rows whose configs differ only in letter case: the same hex bytes, a duplicate',
    clauses: [
      { threshold: 1, credentials: [{ method: PASSKEY, config: CASE_CONFIG_LOWER }] },
      { threshold: 1, credentials: [{ method: PASSKEY, config: CASE_CONFIG_MIXED }] }
    ]
  },
  {
    name: 'the same credential twice under two labels: still a duplicate',
    clauses: [
      {
        threshold: 1,
        credentials: [
          { method: PASSKEY, config: DUP_CONFIG, label: 'laptop' },
          { method: PASSKEY, config: DUP_CONFIG, label: 'phone' }
        ]
      }
    ]
  },
  {
    name: 'the same credential twice, its method address in two letter cases: still a duplicate',
    clauses: [
      {
        threshold: 1,
        credentials: [
          { method: HARDWARE_KEY_LOWER, config: DUP_CONFIG },
          { method: HARDWARE_KEY_MIXED, config: DUP_CONFIG }
        ]
      }
    ]
  },
  { name: 'a single clause at threshold zero', clauses: [group(0, [PASSKEY, PASSPORT])] },
  {
    name: 'a group at threshold zero beside a required row: no single-method warning',
    clauses: [row(PASSKEY), group(0, [PASSPORT, AADHAAR])]
  },
  {
    name: 'a group at threshold zero beside a valid group',
    clauses: [group(2, [PASSKEY, PASSPORT, GUARDIAN]), group(0, [AADHAAR, GUARDIAN])]
  },
  { name: 'a threshold above the size', clauses: [group(3, [PASSKEY, PASSPORT])] },
  {
    name: 'a negative threshold beside a required row',
    clauses: [row(PASSKEY), group(-1, [PASSPORT, AADHAAR])]
  },
  {
    name: 'a threshold above 255',
    clauses: [
      group(
        256,
        Array.from({ length: 256 }, () => GUARDIAN)
      )
    ]
  },
  { name: 'a non-integer threshold', clauses: [group(1.5, [PASSKEY, PASSPORT, GUARDIAN])] },
  {
    name: 'a required passkey and a group of 2 at threshold 3: never the single-method warning',
    clauses: [row(PASSKEY), group(3, [PASSPORT, GUARDIAN])]
  }
]

// A preset loads its shape with every member slot empty: the zero address as
// the method, no config, and the kind of method the slot waits for as its label.
const GUARDIAN_SLOT = () => emptySlot('ecdsa')
const PASSKEY_SLOT = () => emptySlot('passkey')
const PASSPORT_SLOT = () => emptySlot('zkpassport')
const slotGroup = (threshold: number, credentials: Credential[]): Clause => ({
  threshold,
  credentials
})
const slotRow = (credential: Credential): Clause => ({ threshold: 1, credentials: [credential] })
// A slot whose label names no kind of method the path knows, and one with no label.
const UNKNOWN_SLOT = (): Credential => ({ ...emptySlot('ecdsa'), label: 'carrier-pigeon' })
const UNLABELLED_SLOT = (): Credential => ({ method: emptySlot('passkey').method, config: '0x' })
const noMember = (threshold: number): Clause => ({ threshold, credentials: [] })
// A credential at the zero address that carries a config is an ordinary credential.
const zeroMethodWith = (config: Hex, label?: string): Credential => ({
  ...emptySlot('passkey'),
  config,
  label
})

// Paths whose members wait in empty slots read as the same shape of enrolled
// methods would: slots never count as one method held twice, and slots of one
// kind share one failure domain.
const SLOT_SHAPES: { name: string; clauses: Clause[]; expected: Expected[] }[] = [
  {
    name: 'a 2-of-3 group of three guardian slots: any 2 of these 3, and one failure domain',
    clauses: [slotGroup(2, [GUARDIAN_SLOT(), GUARDIAN_SLOT(), GUARDIAN_SLOT()])],
    expected: [
      { key: 'anyNOfM', params: { n: 2, m: 3, spare: 1 } },
      { key: 'oneFailureDomain' },
      { key: 'differentPlaces' }
    ]
  },
  {
    name: 'a passkey slot and a passport slot at threshold one: either one alone, two failure domains',
    clauses: [slotGroup(1, [PASSKEY_SLOT(), PASSPORT_SLOT()])],
    expected: [{ key: 'eitherOneAlone' }, { key: 'differentPlaces' }]
  },
  {
    name: 'a required passkey slot beside a 2-of-3 group of guardian slots: together with your required methods',
    clauses: [
      slotRow(PASSKEY_SLOT()),
      slotGroup(2, [GUARDIAN_SLOT(), GUARDIAN_SLOT(), GUARDIAN_SLOT()])
    ],
    expected: [
      { key: 'togetherWithRequired', params: { n: 2, m: 3, spare: 1 } },
      { key: 'oneFailureDomain' },
      { key: 'differentPlaces' }
    ]
  },
  {
    name: 'two required passkey slots: two rows, never one method held twice',
    clauses: [slotRow(PASSKEY_SLOT()), slotRow(PASSKEY_SLOT())],
    expected: [{ key: 'bothMustAnswer' }, { key: 'differentPlaces' }, { key: 'sizingRule' }]
  },
  {
    name: 'an enrolled passkey row beside a 2-of-3 group of guardian slots: the row reads as a row',
    clauses: [row(PASSKEY), slotGroup(2, [GUARDIAN_SLOT(), GUARDIAN_SLOT(), GUARDIAN_SLOT()])],
    expected: [
      { key: 'togetherWithRequired', params: { n: 2, m: 3, spare: 1 } },
      { key: 'oneFailureDomain' },
      { key: 'differentPlaces' }
    ]
  },
  {
    name: 'an enrolled passkey and a passport slot at threshold one: either one alone, two failure domains',
    clauses: [slotGroup(1, [cred(PASSKEY), PASSPORT_SLOT()])],
    expected: [{ key: 'eitherOneAlone' }, { key: 'differentPlaces' }]
  },
  {
    name: 'two enrolled guardians beside a group of passkey slots: each group keeps its own failure domain',
    clauses: [
      group(1, [GUARDIAN, GUARDIAN]),
      slotGroup(2, [PASSKEY_SLOT(), PASSKEY_SLOT(), PASSKEY_SLOT()])
    ],
    expected: [
      { key: 'togetherWithGroups', params: { n: 1, m: 2, spare: 1 } },
      { key: 'oneFailureDomain' },
      { key: 'togetherWithGroups', params: { n: 2, m: 3, spare: 1 } },
      { key: 'oneFailureDomain' },
      { key: 'differentPlaces' }
    ]
  },
  {
    name: 'two zero-address credentials with configs and the labels of two kinds: one module, one failure domain',
    clauses: [
      slotGroup(1, [zeroMethodWith(DUP_CONFIG, 'passkey'), zeroMethodWith(OTHER_CONFIG, 'ecdsa')])
    ],
    expected: [{ key: 'eitherOneAlone' }, { key: 'oneFailureDomain' }, { key: 'differentPlaces' }]
  },
  {
    name: 'a zero-address credential with a config beside a passkey slot: two failure domains',
    clauses: [slotGroup(1, [zeroMethodWith(DUP_CONFIG, 'passkey'), PASSKEY_SLOT()])],
    expected: [{ key: 'eitherOneAlone' }, { key: 'differentPlaces' }]
  },
  {
    name: 'two slots of a kind the path does not know: they share no failure domain',
    clauses: [slotGroup(1, [UNKNOWN_SLOT(), UNKNOWN_SLOT()])],
    expected: [{ key: 'eitherOneAlone' }, { key: 'differentPlaces' }]
  },
  {
    name: 'two slots with no kind at all: they share no failure domain',
    clauses: [slotGroup(1, [UNLABELLED_SLOT(), UNLABELLED_SLOT()])],
    expected: [{ key: 'eitherOneAlone' }, { key: 'differentPlaces' }]
  },
  {
    name: 'a slot of an unknown kind among guardian slots: the group is no single failure domain',
    clauses: [slotGroup(2, [GUARDIAN_SLOT(), GUARDIAN_SLOT(), UNKNOWN_SLOT()])],
    expected: [{ key: 'anyNOfM', params: { n: 2, m: 3, spare: 1 } }, { key: 'differentPlaces' }]
  },
  {
    name: 'a slot of an unknown kind leading guardian slots: the group is no single failure domain',
    clauses: [slotGroup(2, [UNKNOWN_SLOT(), GUARDIAN_SLOT(), GUARDIAN_SLOT()])],
    expected: [{ key: 'anyNOfM', params: { n: 2, m: 3, spare: 1 } }, { key: 'differentPlaces' }]
  }
]

// A clause with no member yet is a group the holder is still filling: a caller
// that asks to skip such clauses reads the rest of the path as if it were not
// there. Without that ask, each of these paths is silent.
const MEMBERLESS_SHAPES: { name: string; clauses: Clause[]; expected: Expected[] }[] = [
  {
    name: 'a group with no member beside a required row: the row alone earns the single-method warning',
    clauses: [row(PASSKEY), noMember(1)],
    expected: SINGLE_METHOD
  },
  {
    name: 'a group with no member at threshold 2 beside a 2-of-3 group: the group reads alone',
    clauses: [group(2, [PASSKEY, PASSPORT, GUARDIAN]), noMember(2)],
    expected: [{ key: 'anyNOfM', params: { n: 2, m: 3, spare: 1 } }, { key: 'differentPlaces' }]
  },
  {
    name: 'a group with no member between two rows: both must answer, and the sizing rule line',
    clauses: [row(PASSKEY), noMember(1), row(PASSPORT)],
    expected: [{ key: 'bothMustAnswer' }, { key: 'differentPlaces' }, { key: 'sizingRule' }]
  },
  {
    name: 'a group with no member beside a passkey slot row and a group of guardian slots: together with, as without it',
    clauses: [
      slotRow(PASSKEY_SLOT()),
      noMember(2),
      slotGroup(2, [GUARDIAN_SLOT(), GUARDIAN_SLOT(), GUARDIAN_SLOT()])
    ],
    expected: [
      { key: 'togetherWithRequired', params: { n: 2, m: 3, spare: 1 } },
      { key: 'oneFailureDomain' },
      { key: 'differentPlaces' }
    ]
  }
]

// Paths that earn no line although slots or groups with no member stand in them.
const SILENT_SLOT_SHAPES: { name: string; clauses: Clause[] }[] = [
  {
    name: 'an enrolled credential listed twice among guardian slots: still one method held twice',
    clauses: [
      slotGroup(1, [
        { method: PASSKEY, config: DUP_CONFIG },
        GUARDIAN_SLOT(),
        { method: PASSKEY, config: DUP_CONFIG }
      ])
    ]
  },
  {
    name: 'an enrolled credential as a row and again inside a group of slots: still one method held twice',
    clauses: [
      { threshold: 1, credentials: [{ method: PASSKEY, config: DUP_CONFIG }] },
      slotGroup(2, [PASSPORT_SLOT(), { method: PASSKEY, config: DUP_CONFIG }, GUARDIAN_SLOT()])
    ]
  },
  {
    name: 'a zero-address credential with a config listed twice: one method held twice',
    clauses: [
      slotGroup(1, [zeroMethodWith(DUP_CONFIG, 'passkey'), zeroMethodWith(DUP_CONFIG, 'ecdsa')])
    ]
  },
  { name: 'a path of one group with no member', clauses: [noMember(1)] },
  {
    name: 'a path of groups with no member only',
    clauses: [noMember(1), noMember(2), noMember(0)]
  },
  {
    name: 'a group with no member beside a group at a threshold above its size: the refusal still silences the path',
    clauses: [noMember(1), group(3, [PASSKEY, PASSPORT])]
  },
  {
    name: 'a group with no member at threshold 0 beside a group at a threshold above its size: still refused',
    clauses: [noMember(0), group(3, [PASSKEY, PASSPORT])]
  },
  {
    name: 'a group of slots at threshold 0 beside a row: still refused',
    clauses: [row(PASSKEY), slotGroup(0, [GUARDIAN_SLOT(), GUARDIAN_SLOT()])]
  }
]

const EVERY_SHAPE: Clause[][] = [
  ...SHAPES.map((s) => s.clauses),
  ...REFUSED_SHAPES.map((s) => s.clauses),
  ...SLOT_SHAPES.map((s) => s.clauses),
  ...MEMBERLESS_SHAPES.map((s) => s.clauses),
  ...SILENT_SLOT_SHAPES.map((s) => s.clauses)
]

const i18n = i18next.createInstance()
beforeAll(async () => {
  await i18n.init({
    lng: 'en',
    fallbackLng: 'en',
    defaultNS: 'app',
    resources: { en: { app: en } },
    interpolation: { escapeValue: false },
    initImmediate: false
  })
})
const t: Translate = (key, params) => String(i18n.t(key, params ? { ...params } : undefined))

// The English a line renders to, filled by hand from en.json, independent of
// the implementation's rendering path.
const englishOf = (e: Expected): string =>
  RULE_LINES[e.key].replace(/\{\{(\w+)\}\}/g, (_, name: string) => {
    const value = e.params?.[name]
    if (value === undefined) throw new Error(`missing param ${name} for ${e.key}`)
    return String(value)
  })

const linesOf = (clauses: Clause[], options?: RuleLinesOptions) =>
  getRuleLines(draft(clauses), options)
const SKIP_MEMBERLESS: RuleLinesOptions = { skipMemberlessClauses: true }
const keysOf = (clauses: Clause[]) => linesOf(clauses).map((l) => shortKey(l.key))
const keysOfWith = (clauses: Clause[], options: RuleLinesOptions) =>
  linesOf(clauses, options).map((l) => shortKey(l.key))
const renderedAll = () => EVERY_SHAPE.flatMap((clauses) => renderRuleLines(linesOf(clauses), t))

describe('getRuleLines: the lines each path shape earns', () => {
  SHAPES.forEach(({ name, clauses, expected }) =>
    it(name, () => {
      const lines = linesOf(clauses)
      expect(lines.map((l) => shortKey(l.key))).toEqual(expected.map((e) => e.key))
      lines.forEach((line, i) => {
        const params = expected[i].params
        if (params) expect(line.params).toMatchObject(params)
      })
    })
  )

  REFUSED_SHAPES.forEach(({ name, clauses }) =>
    it(`${name}: no lines`, () => {
      expect(linesOf(clauses)).toEqual([])
      expect(getRuleLines(clauses)).toEqual([])
      expect(renderRuleLines(linesOf(clauses), t)).toEqual([])
    })
  )

  it('reads the plain Clause[] form the same as the draft record', () => {
    EVERY_SHAPE.forEach((clauses) => {
      expect(getRuleLines(clauses)).toEqual(linesOf(clauses))
    })
  })

  it('every key it returns names a real string under socialRecovery.ruleLines', () => {
    EVERY_SHAPE.forEach((clauses) => {
      keysOf(clauses).forEach((key) => expect(Object.keys(RULE_LINES)).toContain(key))
    })
  })

  it('a two item path as one group of any one of two carries no sizing rule line', () => {
    expect(keysOf([group(1, [PASSKEY, PASSPORT])])).not.toContain('sizingRule')
  })

  it('a row beside a group carries neither the single-method warning nor a threshold-one form', () => {
    const keys = keysOf([row(PASSKEY), group(1, [PASSPORT, GUARDIAN])])
    expect(keys).not.toContain('singleMethod')
    expect(keys).not.toContain('eitherOneAlone')
    expect(keys).not.toContain('bothMustAnswer')
  })

  it('a group of passkeys alone is one failure domain; a passport beside a passkey is not', () => {
    expect(keysOf([group(1, [PASSKEY, PASSKEY])])).toContain('oneFailureDomain')
    expect(keysOf([group(1, [PASSKEY, PASSPORT])])).not.toContain('oneFailureDomain')
  })
})

describe('getRuleLines: a path whose members wait in empty slots', () => {
  SLOT_SHAPES.forEach(({ name, clauses, expected }) =>
    it(name, () => {
      const lines = linesOf(clauses)
      expect(lines.map((l) => shortKey(l.key))).toEqual(expected.map((e) => e.key))
      lines.forEach((line, i) => {
        const params = expected[i].params
        if (params) expect(line.params).toMatchObject(params)
      })
      expect(renderRuleLines(lines, t)).toEqual(expected.map(englishOf))
    })
  )

  SILENT_SLOT_SHAPES.forEach(({ name, clauses }) =>
    it(`${name}: no lines`, () => {
      expect(linesOf(clauses)).toEqual([])
      expect(getRuleLines(clauses)).toEqual([])
      expect(linesOf(clauses, SKIP_MEMBERLESS)).toEqual([])
    })
  )

  it('a path of slots reads as the same path of enrolled methods, one method family per kind', () => {
    const enrolled = [row(PASSKEY), group(2, [GUARDIAN, GUARDIAN, GUARDIAN])]
    const slots = [
      slotRow(PASSKEY_SLOT()),
      slotGroup(2, [GUARDIAN_SLOT(), GUARDIAN_SLOT(), GUARDIAN_SLOT()])
    ]
    expect(linesOf(slots)).toEqual(linesOf(enrolled))
  })
})

describe('getRuleLines: a clause with no member', () => {
  const REST_OF_PATH = [
    [row(PASSKEY)],
    [row(PASSKEY), row(PASSPORT)],
    [group(1, [PASSKEY, PASSPORT]), group(2, [GUARDIAN, AADHAAR, PASSKEY])],
    [slotGroup(2, [GUARDIAN_SLOT(), GUARDIAN_SLOT(), GUARDIAN_SLOT()])]
  ]

  describe('asked to skip it, the lines read the rest of the path', () => {
    MEMBERLESS_SHAPES.forEach(({ name, clauses, expected }) =>
      it(name, () => {
        const lines = linesOf(clauses, SKIP_MEMBERLESS)
        expect(lines.map((l) => shortKey(l.key))).toEqual(expected.map((e) => e.key))
        lines.forEach((line, i) => {
          const params = expected[i].params
          if (params) expect(line.params).toMatchObject(params)
        })
        expect(renderRuleLines(lines, t)).toEqual(expected.map(englishOf))
        expect(getRuleLines(clauses, SKIP_MEMBERLESS)).toEqual(lines)
      })
    )

    it('a group with no member at any threshold changes no line of the rest of the path', () => {
      REST_OF_PATH.forEach((clauses) => {
        ;[0, 1, 2, 3].forEach((threshold) => {
          expect(linesOf([noMember(threshold), ...clauses], SKIP_MEMBERLESS)).toEqual(
            linesOf(clauses)
          )
          expect(linesOf([...clauses, noMember(threshold)], SKIP_MEMBERLESS)).toEqual(
            linesOf(clauses)
          )
        })
      })
    })
  })

  describe('by default, a clause with no member at threshold one or more silences the path', () => {
    MEMBERLESS_SHAPES.forEach(({ name, clauses }) =>
      it(`${name}: no lines unless asked to skip`, () => {
        expect(linesOf(clauses)).toEqual([])
        expect(getRuleLines(clauses)).toEqual([])
        expect(linesOf(clauses, { skipMemberlessClauses: false })).toEqual([])
      })
    )

    it('a group with no member at threshold 1, 2 or 3 silences every path around it', () => {
      REST_OF_PATH.forEach((clauses) => {
        expect(linesOf(clauses).length).toBeGreaterThan(0)
        ;[1, 2, 3].forEach((threshold) => {
          expect(linesOf([noMember(threshold), ...clauses])).toEqual([])
          expect(linesOf([...clauses, noMember(threshold)])).toEqual([])
        })
      })
    })
  })

  describe('by default, a clause with no member at threshold 0 is skipped', () => {
    it('a group with no member at threshold 0 beside a required row: the row alone earns the single-method warning', () => {
      const lines = linesOf([row(PASSKEY), noMember(0)])
      expect(lines.map((l) => shortKey(l.key))).toEqual(SINGLE_METHOD.map((e) => e.key))
      expect(renderRuleLines(lines, t)).toEqual(SINGLE_METHOD.map(englishOf))
    })

    it('a group with no member at threshold 0 changes no line of the rest of the path', () => {
      REST_OF_PATH.forEach((clauses) => {
        expect(linesOf([noMember(0), ...clauses])).toEqual(linesOf(clauses))
        expect(linesOf([...clauses, noMember(0)])).toEqual(linesOf(clauses))
      })
    })
  })
})

describe('getRuleLines: an enrolled method and a slot of one kind', () => {
  // The kind each shipped method module serves, read from the address book.
  const book = addressBookOf('sepolia')
  const kindOfMethod: RuleLinesOptions['kindOfMethod'] = (method) =>
    SLOT_KINDS.find((kind) => isAddressEqual(book.methods[kind], method))
  const WITH_KINDS: RuleLinesOptions = { kindOfMethod }
  const enrolled = (kind: SlotKind): Credential => cred(book.methods[kind])

  it('an enrolled passkey and a passkey slot at 1 of 2: either one alone, and one failure domain', () => {
    const clauses = [slotGroup(1, [enrolled('passkey'), PASSKEY_SLOT()])]
    expect(linesOf(clauses, WITH_KINDS).map((l) => shortKey(l.key))).toEqual([
      'eitherOneAlone',
      'oneFailureDomain',
      'differentPlaces'
    ])
  })

  it('an enrolled passport and a passkey slot at 1 of 2: two failure domains', () => {
    const clauses = [slotGroup(1, [enrolled('zkpassport'), PASSKEY_SLOT()])]
    expect(linesOf(clauses, WITH_KINDS).map((l) => shortKey(l.key))).toEqual([
      'eitherOneAlone',
      'differentPlaces'
    ])
  })

  it('an enrolled guardian among guardian slots of a 2-of-3 group: one failure domain', () => {
    const clauses = [slotGroup(2, [GUARDIAN_SLOT(), enrolled('ecdsa'), GUARDIAN_SLOT()])]
    expect(linesOf(clauses, WITH_KINDS).map((l) => shortKey(l.key))).toContain('oneFailureDomain')
  })

  it('an enrolled method of a module the resolver does not know keys on its module address', () => {
    expect(keysOfWith([group(1, [HARDWARE_KEY_LOWER, HARDWARE_KEY_MIXED])], WITH_KINDS)).toContain(
      'oneFailureDomain'
    )
    expect(keysOfWith([slotGroup(1, [cred(PASSKEY), PASSKEY_SLOT()])], WITH_KINDS)).not.toContain(
      'oneFailureDomain'
    )
  })

  it('without a resolver, an enrolled passkey and a passkey slot are two failure domains', () => {
    const clauses = [slotGroup(1, [enrolled('passkey'), PASSKEY_SLOT()])]
    expect(keysOf(clauses)).toEqual(['eitherOneAlone', 'differentPlaces'])
  })

  it('a resolver changes no line of a path with no slot whose modules it does not know', () => {
    SHAPES.forEach(({ clauses }) => expect(linesOf(clauses, WITH_KINDS)).toEqual(linesOf(clauses)))
  })
})

describe('renderRuleLines: the rendered English through the real en.json', () => {
  SHAPES.forEach(({ name, clauses, expected }) =>
    it(name, () => {
      const rendered = renderRuleLines(linesOf(clauses), t)
      expect(rendered).toEqual(expected.map(englishOf))
      rendered.forEach((s) => {
        expect(s).not.toMatch(/\{\{|\}\}/)
        expect(s).not.toMatch(/socialRecovery|ruleLines/)
      })
    })
  )

  it('renders at least one line for every shape the editor accepts', () => {
    SHAPES.forEach(({ clauses }) =>
      expect(renderRuleLines(linesOf(clauses), t).length).toBeGreaterThan(0)
    )
  })

  it('renders the exact English of sample paths', () => {
    expect(renderRuleLines(linesOf([row(PASSKEY), row(PASSPORT), row(GUARDIAN)]), t)[0]).toBe(
      'All 3 must answer. Losing any one locks you out.'
    )
    expect(renderRuleLines(linesOf([group(2, [PASSKEY, PASSPORT, GUARDIAN])]), t)[0]).toBe(
      'Any 2 of these 3 recover this account. Losing more than 1 locks you out.'
    )
    expect(renderRuleLines(linesOf([group(1, [PASSKEY, PASSPORT, GUARDIAN, AADHAAR])]), t)[0]).toBe(
      'Any one of these 4 alone can recover this account. Any one alone can also take it.'
    )
    expect(
      renderRuleLines(linesOf([row(PASSKEY), group(2, [PASSPORT, GUARDIAN, AADHAAR])]), t)[0]
    ).toBe(
      'Together with your required methods, any 2 of these 3 recover this account. Losing more than 1 locks you out.'
    )
    expect(
      renderRuleLines(
        linesOf([group(1, [PASSKEY, PASSPORT]), group(2, [GUARDIAN, AADHAAR, PASSKEY])]),
        t
      )
    ).toEqual([
      'Together with enough members of each other group to meet its threshold, any 1 of these 2 recover this account. Losing more than 1 locks you out.',
      'Together with enough members of each other group to meet its threshold, any 2 of these 3 recover this account. Losing more than 1 locks you out.',
      'Keep the methods of your path in different places.'
    ])
    expect(renderRuleLines(linesOf([group(3, [PASSKEY, PASSPORT, GUARDIAN])]), t)).toEqual([
      'Every member must answer.',
      'Keep the methods of your path in different places.'
    ])
    expect(renderRuleLines(linesOf([row(PASSKEY), group(2, [PASSPORT, GUARDIAN])]), t)).toEqual([
      'Together with your required methods, every member of this group must answer.',
      'Keep the methods of your path in different places.'
    ])
  })

  it("a group beside a 2-of-3 group: its line names the other group's threshold, never one member of it", () => {
    const twoOfThree = () => group(2, [GUARDIAN, AADHAAR, PASSKEY])
    // A path with a group has no rows line, so its first line is the first group's.
    const firstGroupLine = (clauses: Clause[]) => renderRuleLines(linesOf(clauses), t)[0]

    const oneOfTwo = firstGroupLine([group(1, [PASSKEY, PASSPORT]), twoOfThree()])
    expect(oneOfTwo).toMatch(/\bany 1 of these 2\b/)

    const lines = [
      oneOfTwo,
      firstGroupLine([row(AADHAAR), group(1, [PASSKEY, PASSPORT]), twoOfThree()]),
      firstGroupLine([group(2, [PASSKEY, PASSPORT]), twoOfThree()]),
      firstGroupLine([row(AADHAAR), group(2, [PASSKEY, PASSPORT]), twoOfThree()])
    ]
    lines.forEach((s) => {
      expect(s).not.toMatch(/\b(?:one|1|a single) member\b/i)
      expect(s).toMatch(/\benough members of each other group to meet its threshold\b/)
    })
  })
})

describe('words and lines the output never carries', () => {
  it('no output contains "primary" or "offered"', () => {
    renderedAll().forEach((s) => {
      expect(s).not.toMatch(/\bprimary\b/i)
      expect(s).not.toMatch(/\boffered\b/i)
    })
  })

  it("no output states the identity method's weight or raising a threshold", () => {
    renderedAll().forEach((s) => {
      expect(s).not.toMatch(/\bweigh(?:t|ts|s|ed)?\b/i)
      expect(s).not.toMatch(/\b(?:raise|raising|increase|increasing)\b/i)
      expect(s).not.toMatch(/\bsecondary\b/i)
    })
  })

  it('no output contains a banned product word', () => {
    const bans = [
      /\bpolic(?:y|ies)\b/i,
      /\bproofs?\b/i,
      /\brelayers?\b/i,
      /\bEIP[-\s]?712\b/i,
      /\batomic(?:ally)?\b/i,
      /\bProtected\b/,
      /\bprotect(?:s|ed|ion)?\b/i,
      /\bunprotected\b/i,
      /\byour\s+people\b/i,
      /\bfull\s+wallet\s+passwords?\b/i
    ]
    renderedAll().forEach((s) => bans.forEach((ban) => expect(s).not.toMatch(ban)))
  })

  it('no descriptor key names a weight, primary, offered or threshold-raise line', () => {
    EVERY_SHAPE.forEach((clauses) =>
      keysOf(clauses).forEach((key) => expect(key).not.toMatch(/weight|primary|offered|raise/i))
    )
  })
})

describe('purity', () => {
  const deepFreeze = <T>(value: T): T => {
    if (value && typeof value === 'object') {
      Object.values(value as object).forEach(deepFreeze)
      Object.freeze(value)
    }
    return value
  }

  EVERY_SHAPE.forEach((clauses, i) =>
    it(`same input twice yields equal output and the input is not mutated (shape ${i})`, () => {
      const input = draft(clauses)
      const snapshot = structuredClone(input)
      const first = getRuleLines(input)
      const second = getRuleLines(input)
      expect(second).toEqual(first)
      expect(input).toEqual(snapshot)
      const frozen = deepFreeze(structuredClone(input))
      expect(getRuleLines(frozen)).toEqual(first)
      const plain = deepFreeze(structuredClone(clauses))
      expect(getRuleLines(plain)).toEqual(first)
      expect(plain).toEqual(clauses)
    })
  )
})
