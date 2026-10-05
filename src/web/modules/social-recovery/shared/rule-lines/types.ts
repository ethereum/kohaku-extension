import type { Clause, SetupDraft } from '@web/modules/social-recovery/sdk-interfaces'

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
