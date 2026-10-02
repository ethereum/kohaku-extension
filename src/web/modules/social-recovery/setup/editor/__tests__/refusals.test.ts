/**
 * The shapes this wallet refuses to save, judged on the draft before the
 * SDK's path check, and the words they render as: each refusal fires on its
 * own shape and never on a sound one, an unfilled slot is refused as a place
 * still to fill and counts as a place against the threshold, and every
 * sentence names this wallet as the party that refuses. The rules panel
 * lists every rule the editor applies, in order.
 */
import i18n from '@common/config/localization'
import en from '@common/config/localization/translations/en.json'
import type {
  Clause,
  Credential,
  Finding,
  SetupDraft
} from '@web/modules/social-recovery/sdk-interfaces'
import { SETUP_ERROR_CODES } from '@web/modules/social-recovery/sdk-interfaces'
import {
  clientConfigurationOf,
  WALLET_RECOVERY_CHAIN
} from '@web/modules/social-recovery/shared/client'
import {
  renderFinding,
  renderRefusal,
  renderRefusalPlace,
  renderRulesPanel
} from '@web/modules/social-recovery/setup/editor/copy'
import { emptySlotOf } from '@web/modules/social-recovery/setup/editor/operations'
import {
  PICKER_CEILING_SECONDS,
  refusalsOf,
  shapeRefusalsOf
} from '@web/modules/social-recovery/setup/editor/refusals'
import type { RefusalKey } from '@web/modules/social-recovery/setup/editor/types'

import {
  AADHAAR,
  ACCOUNT,
  ALICE,
  BOB,
  BOOK,
  CAROL,
  PASSKEY,
  PASSPORT,
  presetPath,
  twoGroupPath
} from '@web/modules/social-recovery/setup/editor/__tests__/harness'

const t = i18n.t

const HOUR = 3600n
const DAY = 24n * HOUR
/** Two to the 48 seconds, the first wait a 48-bit field cannot hold. */
const TWO_TO_THE_48 = 281474976710656n

const draftOf = (clauses: Clause[], wait: bigint = 3n * DAY): SetupDraft => ({
  wait,
  clauses,
  ignoresPause: false,
  privacy: { publicMetadata: '0x', backup: 'encrypted' }
})

/** `count` pairwise different enrolled guardians. */
const guardians = (count: number): Credential[] =>
  Array.from({ length: count }, (_, i) => ({
    method: BOOK.methods.ecdsa,
    config: `0x${(i + 1).toString(16).padStart(64, '0')}`
  }))

const keysOf = (clauses: Clause[], wait?: bigint) =>
  refusalsOf(draftOf(clauses, wait)).map((refusal) => refusal.key)

const ALL_REFUSAL_KEYS: RefusalKey[] = [
  'emptyGroup',
  'emptyGroupSlot',
  'emptyRequired',
  'thresholdAboveMembers',
  'thresholdBelowOne',
  'thresholdBelowOneOwnRule',
  'thresholdAboveField',
  'memberCeiling',
  'noMethod',
  'waitFieldWidth',
  'waitCeiling',
  'tooLarge'
]

/** A sentence that makes the chain, the network, a contract, the kit or the manager the party that refuses. */
const CREDITS_ANOTHER_PARTY =
  /\b(chain|network|blockchain|contract|kit|manager)\b('s)?\s+(cannot|can't|can not|refuses?|rejects?|will not|won't|does not|doesn't|forbids?|allows?|only)\b|\b(refused|rejected|forbidden|enforced) by the (chain|network|blockchain|contract|kit|manager)\b/i

describe('a path this wallet can save', () => {
  it('answers no refusal for a preset, a two-group path and a single required method', () => {
    expect(refusalsOf(draftOf(presetPath()))).toEqual([])
    expect(refusalsOf(draftOf(twoGroupPath()))).toEqual([])
    expect(refusalsOf(draftOf([{ threshold: 1, credentials: [PASSKEY] }]))).toEqual([])
  })

  it('answers no refusal for a group of two of three once all three members are enrolled', () => {
    expect(
      keysOf([
        { threshold: 1, credentials: [PASSKEY] },
        { threshold: 2, credentials: [ALICE, BOB, PASSPORT] }
      ])
    ).toEqual([])
  })
})

describe('a group with an unfilled slot', () => {
  it('refuses a group of two of three with one slot unfilled, though its enrolled members meet the threshold', () => {
    expect(
      refusalsOf(
        draftOf([
          { threshold: 1, credentials: [PASSKEY] },
          { threshold: 2, credentials: [ALICE, BOB, emptySlotOf('zkpassport')] }
        ])
      )
    ).toEqual([{ key: 'emptyGroupSlot', clause: 1 }])
  })

  it('refuses it with the group sentence, apart from the required row and the empty group', () => {
    const sentence = renderRefusal({ key: 'emptyGroupSlot' }, t)
    expect(sentence).toBe(t('socialRecovery.editor.refusals.emptyGroupSlot'))
    expect(sentence).not.toBe(renderRefusal({ key: 'emptyRequired' }, t))
    expect(sentence).not.toBe(renderRefusal({ key: 'emptyGroup' }, t))
  })

  it('refuses a group whose every slot is unfilled as empty, never as a slot to fill', () => {
    expect(
      keysOf([{ threshold: 1, credentials: [emptySlotOf('ecdsa'), emptySlotOf('zkpassport')] }])
    ).toEqual(['emptyGroup'])
  })

  it('refuses each group with an unfilled slot and points at it', () => {
    expect(
      refusalsOf(
        draftOf([
          { threshold: 1, credentials: [PASSKEY] },
          { threshold: 1, credentials: [ALICE, emptySlotOf('ecdsa')] },
          { threshold: 2, credentials: [BOB, CAROL] },
          { threshold: 1, credentials: [emptySlotOf('ecdsa'), AADHAAR] }
        ])
      )
    ).toEqual([
      { key: 'emptyGroupSlot', clause: 1 },
      { key: 'emptyGroupSlot', clause: 3 }
    ])
  })
})

describe('a group with no member', () => {
  it('refuses a memberless group and points at it', () => {
    expect(
      refusalsOf(
        draftOf([
          { threshold: 1, credentials: [PASSKEY] },
          { threshold: 2, credentials: [] }
        ])
      )
    ).toEqual([{ key: 'emptyGroup', clause: 1 }])
  })

  it('refuses a group of unfilled slots only as empty, never as above its members', () => {
    expect(
      refusalsOf(
        draftOf([
          { threshold: 1, credentials: [PASSKEY] },
          { threshold: 2, credentials: [emptySlotOf('ecdsa'), emptySlotOf('ecdsa')] }
        ])
      )
    ).toEqual([{ key: 'emptyGroup', clause: 1 }])
  })
})

describe('a required row with an unfilled slot', () => {
  const clauses: Clause[] = [
    { threshold: 1, credentials: [emptySlotOf('passkey')] },
    { threshold: 2, credentials: [ALICE, BOB, PASSPORT] }
  ]

  it('refuses it with its own sentence when the role is read from the stored shape', () => {
    expect(refusalsOf(draftOf(clauses))).toEqual([{ key: 'emptyRequired', clause: 0 }])
    expect(shapeRefusalsOf(draftOf(clauses))).toEqual([{ key: 'emptyRequired', clause: 0 }])
  })

  it('refuses it with its own sentence when the editor shows it as a required row', () => {
    expect(refusalsOf(draftOf(clauses), ['required', 'group'])).toEqual([
      { key: 'emptyRequired', clause: 0 }
    ])
  })

  it('refuses the same one-slot clause as an empty group when the editor shows it as a group', () => {
    expect(shapeRefusalsOf(draftOf(clauses), ['group', 'group'])).toEqual([
      { key: 'emptyGroup', clause: 0 }
    ])
  })

  it('refuses a memberless group as empty even beside a required role elsewhere', () => {
    expect(
      shapeRefusalsOf(
        draftOf([
          { threshold: 1, credentials: [PASSKEY] },
          { threshold: 2, credentials: [] }
        ]),
        ['required', 'group']
      )
    ).toEqual([{ key: 'emptyGroup', clause: 1 }])
  })
})

describe("a threshold above the group's places", () => {
  it('refuses a group that requires more members than it lists', () => {
    expect(
      refusalsOf(
        draftOf([
          { threshold: 1, credentials: [PASSKEY] },
          { threshold: 3, credentials: [ALICE, BOB] }
        ])
      )
    ).toEqual([{ key: 'thresholdAboveMembers', clause: 1 }])
  })

  it('judges the threshold against every place, so a preset with unfilled slots is refused for its slots alone', () => {
    expect(
      refusalsOf(
        draftOf([
          { threshold: 1, credentials: [PASSKEY] },
          {
            threshold: 2,
            credentials: [ALICE, emptySlotOf('ecdsa'), emptySlotOf('zkpassport')]
          }
        ])
      )
    ).toEqual([{ key: 'emptyGroupSlot', clause: 1 }])
  })

  it('refuses a threshold above every place of a group with an unfilled slot for both', () => {
    expect(keysOf([{ threshold: 3, credentials: [ALICE, emptySlotOf('ecdsa')] }])).toEqual([
      'emptyGroupSlot',
      'thresholdAboveMembers'
    ])
  })

  it('passes a threshold equal to the enrolled members', () => {
    expect(keysOf([{ threshold: 3, credentials: [ALICE, BOB, CAROL] }])).toEqual([])
  })
})

describe('a threshold below one', () => {
  it('refuses zero on a path of one group with the sentence the chain shares', () => {
    expect(refusalsOf(draftOf([{ threshold: 0, credentials: [ALICE, BOB] }]))).toEqual([
      { key: 'thresholdBelowOne', clause: 0 }
    ])
  })

  it("refuses zero beside a required row with the wallet's own-rule sentence", () => {
    expect(
      refusalsOf(
        draftOf([
          { threshold: 1, credentials: [PASSKEY] },
          { threshold: 0, credentials: [ALICE, BOB] }
        ])
      )
    ).toEqual([{ key: 'thresholdBelowOneOwnRule', clause: 1 }])
  })

  it("refuses zero beside a second group with the wallet's own-rule sentence", () => {
    expect(
      refusalsOf(
        draftOf([
          { threshold: 0, credentials: [ALICE, BOB] },
          { threshold: 1, credentials: [CAROL, PASSPORT] }
        ])
      )
    ).toEqual([{ key: 'thresholdBelowOneOwnRule', clause: 0 }])
  })

  it('refuses zero in each of two groups both at zero with the sentence the chain shares', () => {
    expect(
      refusalsOf(
        draftOf([
          { threshold: 0, credentials: [ALICE, BOB] },
          { threshold: 0, credentials: [CAROL, PASSPORT] }
        ])
      )
    ).toEqual([
      { key: 'thresholdBelowOne', clause: 0 },
      { key: 'thresholdBelowOne', clause: 1 }
    ])
  })

  it("refuses zero beside a group at zero and a required row with the wallet's own-rule sentence", () => {
    expect(
      keysOf([
        { threshold: 0, credentials: [ALICE, BOB] },
        { threshold: 0, credentials: [CAROL, PASSPORT] },
        { threshold: 1, credentials: [PASSKEY] }
      ])
    ).toEqual(['thresholdBelowOneOwnRule', 'thresholdBelowOneOwnRule'])
  })

  it('refuses a negative threshold the same way', () => {
    expect(keysOf([{ threshold: -1, credentials: [ALICE, BOB] }])).toEqual(['thresholdBelowOne'])
  })

  it('passes a threshold of one', () => {
    expect(keysOf([{ threshold: 1, credentials: [ALICE, BOB] }])).toEqual([])
  })
})

describe('the ceilings of a group', () => {
  it("refuses a threshold of 256, past the most the threshold's field counts", () => {
    expect(keysOf([{ threshold: 256, credentials: guardians(2) }])).toEqual([
      'thresholdAboveMembers',
      'thresholdAboveField'
    ])
  })

  it('passes a group of 255 members that requires all 255', () => {
    expect(keysOf([{ threshold: 255, credentials: guardians(255) }])).toEqual([])
  })

  it('refuses a group of 256 members, and a group of 256 places one of them unfilled', () => {
    expect(refusalsOf(draftOf([{ threshold: 2, credentials: guardians(256) }]))).toEqual([
      { key: 'memberCeiling', clause: 0 }
    ])
    expect(
      keysOf([{ threshold: 2, credentials: [...guardians(255), emptySlotOf('ecdsa')] }])
    ).toEqual(['emptyGroupSlot', 'memberCeiling'])
  })
})

describe('a path with no method', () => {
  it('refuses a path with no clause', () => {
    expect(refusalsOf(draftOf([]))).toEqual([{ key: 'noMethod' }])
  })

  it('refuses a path whose only group is empty for both its lack of method and its empty group', () => {
    expect(refusalsOf(draftOf([{ threshold: 2, credentials: [] }]))).toEqual([
      { key: 'noMethod' },
      { key: 'emptyGroup', clause: 0 }
    ])
  })

  it('counts an unfilled slot as a method, so a path of slots is refused for its unfilled places alone', () => {
    expect(keysOf([{ threshold: 1, credentials: [emptySlotOf('aadhaar')] }])).toEqual([
      'emptyRequired'
    ])
    expect(
      keysOf([{ threshold: 1, credentials: [emptySlotOf('ecdsa'), emptySlotOf('ecdsa')] }])
    ).toEqual(['emptyGroup'])
  })
})

describe('the waiting period', () => {
  const clauses = presetPath()

  it('passes 24 hours and the longest the picker offers, 30 days', () => {
    expect(keysOf(clauses, DAY)).toEqual([])
    expect(keysOf(clauses, 30n * DAY)).toEqual([])
  })

  it("offers exactly the longest wait the client's configuration lets the SDK save", () => {
    const { maximumWait } = clientConfigurationOf({
      chain: WALLET_RECOVERY_CHAIN,
      account: ACCOUNT,
      addressBook: BOOK,
      provider: {} as never
    })
    expect(PICKER_CEILING_SECONDS).toBe(BigInt(maximumWait ?? -1))
  })

  it('refuses the picker ceiling plus one hour with the picker sentence', () => {
    expect(refusalsOf(draftOf(clauses, 30n * DAY + HOUR))).toEqual([{ key: 'waitCeiling' }])
  })

  it('refuses the largest wait the field holds with the picker sentence alone', () => {
    expect(keysOf(clauses, TWO_TO_THE_48 - 1n)).toEqual(['waitCeiling'])
  })

  it('refuses 2 to the 48 seconds with the field-width sentence alone', () => {
    expect(refusalsOf(draftOf(clauses, TWO_TO_THE_48))).toEqual([{ key: 'waitFieldWidth' }])
  })

  it('refuses a negative wait with the field-width sentence', () => {
    expect(keysOf(clauses, -1n)).toEqual(['waitFieldWidth'])
  })
})

describe("the shape's refusals alone", () => {
  it('leave the waiting period out and keep every refusal of the shape, in order', () => {
    const clauses: Clause[] = [
      { threshold: 0, credentials: [] },
      { threshold: 4, credentials: [ALICE, AADHAAR] }
    ]
    expect(shapeRefusalsOf(draftOf(clauses, TWO_TO_THE_48))).toEqual([
      { key: 'emptyGroup', clause: 0 },
      { key: 'thresholdBelowOneOwnRule', clause: 0 },
      { key: 'thresholdAboveMembers', clause: 1 }
    ])
    expect(shapeRefusalsOf(draftOf(presetPath(), 30n * DAY + HOUR))).toEqual([])
    expect(shapeRefusalsOf(draftOf([], -1n))).toEqual([{ key: 'noMethod' }])
  })
})

describe('several refusals at once', () => {
  it("lists the path's own refusal, then each clause in order, then the wait", () => {
    expect(
      refusalsOf(
        draftOf(
          [
            { threshold: 0, credentials: [] },
            { threshold: 4, credentials: [ALICE, AADHAAR] }
          ],
          TWO_TO_THE_48
        )
      )
    ).toEqual([
      { key: 'emptyGroup', clause: 0 },
      { key: 'thresholdBelowOneOwnRule', clause: 0 },
      { key: 'thresholdAboveMembers', clause: 1 },
      { key: 'waitFieldWidth' }
    ])
    expect(keysOf([], -1n)).toEqual(['noMethod', 'waitFieldWidth'])
  })
})

describe('the refusal sentences', () => {
  it('render each refusal as its own sentence, the three waiting-period and width sentences as written', () => {
    const rendered = ALL_REFUSAL_KEYS.map((key) => renderRefusal({ key }, t))
    expect(new Set(rendered).size).toBe(ALL_REFUSAL_KEYS.length)
    expect(renderRefusal({ key: 'waitFieldWidth' }, t)).toBe(
      "This wallet cannot save a waiting period past the width the kit's field holds."
    )
    expect(renderRefusal({ key: 'waitCeiling' }, t)).toBe(
      'This wallet cannot save a waiting period past the longest this picker offers.'
    )
    expect(renderRefusal({ key: 'tooLarge' }, t)).toMatch(
      /^This wallet cannot check a path this large in one block\./
    )
  })

  it('name this wallet as the party that refuses and credit no chain, network, contract or kit', () => {
    ALL_REFUSAL_KEYS.filter((key) => key !== 'emptyGroupSlot').forEach((key) => {
      const sentence = renderRefusal({ key }, t)
      expect(sentence).toMatch(/^This wallet cannot /)
      expect(sentence).not.toMatch(CREDITS_ANOTHER_PARTY)
    })
  })

  it('tell the own-rule sentence apart as the wallet alone', () => {
    expect(renderRefusal({ key: 'thresholdBelowOneOwnRule' }, t)).toMatch(/this wallet's alone/)
    expect(renderRefusal({ key: 'thresholdBelowOne' }, t)).not.toMatch(/alone/)
  })

  it('catch a sentence that credits another party, so the check above can fail', () => {
    expect('The chain refuses a threshold of zero.').toMatch(CREDITS_ANOTHER_PARTY)
    expect('This is refused by the contract.').toMatch(CREDITS_ANOTHER_PARTY)
    expect("That is the most the kit's field can count.").not.toMatch(CREDITS_ANOTHER_PARTY)
  })
})

describe('the place a refusal points at', () => {
  const roles = ['group', 'required', 'group'] as const

  it("reads a group's ordinal among the groups alone and a required row as the required section", () => {
    expect(renderRefusalPlace({ key: 'emptyGroup', clause: 0 }, roles, t)).toBe('Group 1')
    expect(renderRefusalPlace({ key: 'emptyRequired', clause: 1 }, roles, t)).toBe(
      en.socialRecovery.editor.requiredHeader
    )
    expect(renderRefusalPlace({ key: 'emptyGroup', clause: 2 }, roles, t)).toBe('Group 2')
  })

  it('reads no place for a refusal of the whole path or of its wait', () => {
    expect(renderRefusalPlace({ key: 'noMethod' }, roles, t)).toBeNull()
    expect(renderRefusalPlace({ key: 'waitCeiling' }, roles, t)).toBeNull()
  })
})

describe("the SDK's setup errors", () => {
  const finding = (code: Finding['code']): Finding => ({ code, subject: 'setup', values: {} })

  it('each render a sentence, never a bare code, and none credits the chain', () => {
    SETUP_ERROR_CODES.forEach((code) => {
      const sentence = renderFinding(finding(code), t)
      expect(sentence).not.toBe(code)
      expect(sentence).not.toMatch(CREDITS_ANOTHER_PARTY)
    })
  })

  it('name this wallet in every sentence', () => {
    SETUP_ERROR_CODES.forEach((code) =>
      expect(renderFinding(finding(code), t)).toMatch(/\bthis wallet\b/i)
    )
  })

  it('render a rule too wide for a block as the "path too large" sentence', () => {
    expect(renderFinding(finding('rule.too-wide'), t)).toBe(
      en.socialRecovery.editor.refusals.tooLarge
    )
  })

  it('render a backup too wide and an unsupported action each with its own sentence', () => {
    expect(renderFinding(finding('backup.too-wide'), t)).toBe(
      en.socialRecovery.editor.refusals.backupTooWide
    )
    expect(renderFinding(finding('action.unsupported'), t)).toBe(
      en.socialRecovery.editor.refusals.actionUnsupported
    )
  })

  it('render every setup error with a sentence of the editor itself', () => {
    const editorSentences = new Set([
      ...Object.values(en.socialRecovery.editor.refusals),
      en.socialRecovery.editor.duplicate
    ])
    SETUP_ERROR_CODES.forEach((code) =>
      expect(editorSentences.has(renderFinding(finding(code), t))).toBe(true)
    )
  })

  it("render the wallet's own shapes through the same sentences the editor's refusals use", () => {
    expect(renderFinding(finding('rule.all-thresholds-zero'), t)).toBe(
      renderRefusal({ key: 'thresholdBelowOne' }, t)
    )
    expect(renderFinding(finding('clause.threshold-too-wide'), t)).toBe(
      renderRefusal({ key: 'thresholdAboveField' }, t)
    )
    expect(renderFinding(finding('wait.field-width'), t)).toBe(
      renderRefusal({ key: 'waitFieldWidth' }, t)
    )
    expect(renderFinding(finding('wait.above-maximum'), t)).toBe(
      renderRefusal({ key: 'waitCeiling' }, t)
    )
    expect(renderFinding(finding('credential.duplicate'), t)).toBe(
      en.socialRecovery.editor.duplicate
    )
  })
})

describe('the rules panel', () => {
  it('reads the header and nine lines in order, the ceiling after the floor and the own-rule line last', () => {
    const { rules } = en.socialRecovery.editor
    expect(renderRulesPanel(t)).toEqual({
      header: rules.header,
      lines: [
        rules.requiredAnswers,
        rules.enoughMembers,
        rules.thresholdAtLeastOne,
        rules.thresholdCeiling,
        rules.memberCeiling,
        rules.oneRowPerMethod,
        rules.atLeastOneMethod,
        rules.smallEnough,
        rules.zeroThresholdOwnRule
      ]
    })
  })

  it("states the threshold ceiling of 255 and the zero-threshold rule as the wallet's own", () => {
    const { lines } = renderRulesPanel(t)
    expect(lines.filter((line) => line.includes('255'))).toHaveLength(2)
    expect(lines[lines.length - 1]).toMatch(/only this wallet refuses a threshold of zero/)
    lines.forEach((line) => expect(line).not.toMatch(CREDITS_ANOTHER_PARTY))
  })
})
