import {
  getRuleLines,
  renderRuleLines,
  RULE_LINE_KEYS
} from '@web/modules/social-recovery/shared/rule-lines'
import type { RuleLineKey, Translate } from '@web/modules/social-recovery/shared/rule-lines'

import { clausesOfShape } from './presets'
import type { Preset, ShapeRow, SlotKind } from './types'

/** A card states the shape's threshold line alone; the editor shows the rest. */
const OFF_CARD: readonly RuleLineKey[] = [
  RULE_LINE_KEYS.oneFailureDomain,
  RULE_LINE_KEYS.differentPlaces,
  RULE_LINE_KEYS.sizingRule
]

/** The rule line a preset's card shows, read from its shape. */
export const cardRuleLines = (preset: Preset, t: Translate): string[] =>
  renderRuleLines(
    getRuleLines(clausesOfShape(preset.shape), { skipMemberlessClauses: true }).filter(
      ({ key }) => !OFF_CARD.includes(key)
    ),
    t
  )

const REQUIRED_ROW_KEYS: Partial<Record<SlotKind, string>> = {
  passkey: 'socialRecovery.presets.passkeyRequired',
  zkpassport: 'socialRecovery.presets.passportRequired'
}

const MEMBER_NAME_KEYS: Partial<Record<SlotKind, string>> = {
  passkey: 'socialRecovery.methodNames.passkey',
  zkpassport: 'socialRecovery.methodNames.passport',
  aadhaar: 'socialRecovery.methodNames.aadhaar'
}

const nameOf = (keys: Partial<Record<SlotKind, string>>, kind: SlotKind, t: Translate): string =>
  t(keys[kind] ?? 'socialRecovery.display.nouns.method')

/**
 * A card's rows: a required method on its own row, a group as its count with
 * its members named, or with the guardians word when every member is a guardian.
 */
export const shapeRowsOf = (preset: Preset, t: Translate): ShapeRow[] =>
  preset.shape.map(({ threshold, slots }) => {
    if (slots.length === 1) {
      return { kind: 'required', text: nameOf(REQUIRED_ROW_KEYS, slots[0], t) }
    }
    const count = [
      t('socialRecovery.shape.any'),
      String(threshold),
      t('socialRecovery.shape.of'),
      String(slots.length)
    ]
    if (slots.every((kind) => kind === 'ecdsa')) {
      return {
        kind: 'group',
        count: [...count, t('socialRecovery.shape.guardians')].join(' '),
        members: []
      }
    }
    return {
      kind: 'group',
      count: count.join(' '),
      members: slots.map((kind) => nameOf(MEMBER_NAME_KEYS, kind, t))
    }
  })
