import type { Address, Clause, SetupDraft } from '@web/modules/social-recovery/sdk-interfaces'
import type { SlotKind } from '@web/modules/social-recovery/shared/records/types'

import type { RULE_LINE_KEYS } from './ruleLines'

export type RuleLineKey = typeof RULE_LINE_KEYS[keyof typeof RULE_LINE_KEYS]

/** The placeholders of the `ruleLines` strings: `spare` is M minus N. */
export interface RuleLineParams {
  n?: number
  m?: number
  spare?: number
}

/** One rule line: an `en.json` key and the values its placeholders take. */
export interface RuleLine {
  key: RuleLineKey
  params: RuleLineParams
}

/** The translate function `renderRuleLines` takes, `i18n.t` or `useTranslation().t`. */
export type Translate = (key: string, params?: RuleLineParams) => string

/** The path the lines read: the setup draft record, or its clauses alone. */
export type RuleLinesInput = Pick<SetupDraft, 'clauses'> | readonly Clause[]

/** How `getRuleLines` reads a path. */
export interface RuleLinesOptions {
  /**
   * Skip every clause with no member, a group the holder is still filling, and
   * read the rest of the path. Without it, a clause with no member at a
   * threshold of one or more is refused and silences the path.
   */
  skipMemberlessClauses?: boolean
  /**
   * The kind of method a method module address serves, or `undefined` for a
   * module it does not know. With it, an enrolled method of a known kind and an
   * empty slot of that kind share one failure domain. Without it, an enrolled
   * method's family is its module address alone.
   */
  kindOfMethod?: (method: Address) => SlotKind | undefined
}
