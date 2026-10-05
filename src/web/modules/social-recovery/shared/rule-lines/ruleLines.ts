/**
 * Turns a recovery path's shape into the lines that state its consequences.
 * The SDK returns no verdict on a rule, so these lines are the wallet's own.
 * Pure: the same input yields equal output and the input is never mutated.
 */
import type { Clause, Credential, SetupDraft } from '@web/modules/social-recovery/sdk-interfaces'

import type { RuleLine, RuleLineKey, RuleLineParams, RuleLinesInput, Translate } from './types'

const PREFIX = 'socialRecovery.ruleLines'

/**
 * Every key this function emits, each one under `socialRecovery.ruleLines` in
 * `en.json`. A surface picks or drops a line by its key. The function emits the
 * sizing rule line for every path of two rows and no group, but only the editor
 * shows it, so the other screens drop it by key.
 */
export const RULE_LINE_KEYS = {
  allMustAnswer: `${PREFIX}.allMustAnswer`,
  bothMustAnswer: `${PREFIX}.bothMustAnswer`,
  singleMethod: `${PREFIX}.singleMethod`,
  secondMethodOffer: `${PREFIX}.secondMethodOffer`,
  platformFate: `${PREFIX}.platformFate`,
  anyNOfM: `${PREFIX}.anyNOfM`,
  eitherOneAlone: `${PREFIX}.eitherOneAlone`,
  anyOneOfM: `${PREFIX}.anyOneOfM`,
  togetherWithRequired: `${PREFIX}.togetherWithRequired`,
  togetherWithRequiredAndGroups: `${PREFIX}.togetherWithRequiredAndGroups`,
  togetherWithGroups: `${PREFIX}.togetherWithGroups`,
  everyMemberMustAnswer: `${PREFIX}.everyMemberMustAnswer`,
  togetherWithRequiredEveryMember: `${PREFIX}.togetherWithRequiredEveryMember`,
  togetherWithGroupsEveryMember: `${PREFIX}.togetherWithGroupsEveryMember`,
  togetherWithRequiredAndGroupsEveryMember: `${PREFIX}.togetherWithRequiredAndGroupsEveryMember`,
  oneFailureDomain: `${PREFIX}.oneFailureDomain`,
  differentPlaces: `${PREFIX}.differentPlaces`,
  sizingRule: `${PREFIX}.sizingRule`
} as const

const line = (key: RuleLineKey, params: RuleLineParams = {}): RuleLine => ({ key, params })

/**
 * A credential's method family is its method module address. The members of
 * one family share one failure domain.
 */
const familyOf = (credential: Credential): string => credential.method.toLowerCase()

/** The clause threshold is a one-byte field, so it counts up to 255. */
const MAX_THRESHOLD = 255

/**
 * A refused clause: no credential, a threshold that is not a whole number, a
 * threshold below one, which asks nothing of its members, a threshold above
 * its members, or a threshold above the 255 its field counts.
 */
const isRefused = (clause: Clause): boolean =>
  clause.credentials.length === 0 ||
  !Number.isInteger(clause.threshold) ||
  clause.threshold < 1 ||
  clause.threshold > clause.credentials.length ||
  clause.threshold > MAX_THRESHOLD

/**
 * One enrolled method may appear only once across the path. Two credentials are
 * the same enrolled method when their method addresses and config bytes match;
 * both are hex, so they compare lowercased. The address holds no `|`, so the
 * joined key is unambiguous.
 */
const holdsDuplicate = (clauses: readonly Clause[]): boolean => {
  const seen = new Set<string>()
  return clauses.some((clause) =>
    clause.credentials.some((credential) => {
      const id = `${credential.method.toLowerCase()}|${credential.config.toLowerCase()}`
      if (seen.has(id)) return true
      seen.add(id)
      return false
    })
  )
}

const sharesOneFamily = (credentials: readonly Credential[]): boolean => {
  const first = familyOf(credentials[0])
  return credentials.every((credential) => familyOf(credential) === first)
}

const groupLine = (clause: Clause, rowCount: number, groupCount: number): RuleLine => {
  const m = clause.credentials.length
  const n = clause.threshold
  const spare = m - n

  const hasRows = rowCount > 0
  const hasOtherGroups = groupCount > 1

  // A group whose threshold equals its member count reads every member must
  // answer in place of the count line, with the together-with wording where
  // rows or another group stand beside it.
  if (n === m) {
    if (hasRows && hasOtherGroups)
      return line(RULE_LINE_KEYS.togetherWithRequiredAndGroupsEveryMember)
    if (hasRows) return line(RULE_LINE_KEYS.togetherWithRequiredEveryMember)
    if (hasOtherGroups) return line(RULE_LINE_KEYS.togetherWithGroupsEveryMember)
    return line(RULE_LINE_KEYS.everyMemberMustAnswer)
  }

  // Beside rows or another group, the line keeps the any N of M form at every
  // threshold, one included, since no member alone can then recover or take
  // the account.
  if (hasRows && hasOtherGroups) {
    return line(RULE_LINE_KEYS.togetherWithRequiredAndGroups, { n, m, spare })
  }
  if (hasRows) return line(RULE_LINE_KEYS.togetherWithRequired, { n, m, spare })
  if (hasOtherGroups) return line(RULE_LINE_KEYS.togetherWithGroups, { n, m, spare })

  if (n === 1 && m === 2) return line(RULE_LINE_KEYS.eitherOneAlone)
  if (n === 1) return line(RULE_LINE_KEYS.anyOneOfM, { m })
  return line(RULE_LINE_KEYS.anyNOfM, { n, m, spare })
}

const clausesOf = (path: RuleLinesInput): readonly Clause[] =>
  Array.isArray(path) ? path : (path as Pick<SetupDraft, 'clauses'>).clauses

/**
 * The rule lines of a path. A single method earns its warning, the offer of a
 * second method and the platform line, and nothing else. Otherwise, in this
 * order: the rows' line when the path has no group, each group's threshold line
 * followed by its failure domain line, the different places line, and the
 * sizing rule line for a path of two rows and no group.
 */
export const getRuleLines = (path: RuleLinesInput): RuleLine[] => {
  const clauses = clausesOf(path)
  // One refused clause or one method held twice silences the whole path, since
  // a line about the rest of the path would read a lockout as a rescue.
  if (clauses.some(isRefused) || holdsDuplicate(clauses)) return []

  // A clause with one credential is a required row, so a group of one member
  // reads as a row.
  const rows = clauses.filter((clause) => clause.credentials.length === 1)
  const groups = clauses.filter((clause) => clause.credentials.length > 1)
  const methodCount = clauses.reduce((sum, clause) => sum + clause.credentials.length, 0)

  if (methodCount === 0) return []

  if (methodCount === 1) {
    return [
      line(RULE_LINE_KEYS.singleMethod),
      line(RULE_LINE_KEYS.secondMethodOffer),
      line(RULE_LINE_KEYS.platformFate)
    ]
  }

  const lines: RuleLine[] = []

  if (groups.length === 0) {
    lines.push(
      rows.length === 2
        ? line(RULE_LINE_KEYS.bothMustAnswer)
        : line(RULE_LINE_KEYS.allMustAnswer, { n: rows.length })
    )
  }

  groups.forEach((group) => {
    lines.push(groupLine(group, rows.length, groups.length))
    if (sharesOneFamily(group.credentials)) lines.push(line(RULE_LINE_KEYS.oneFailureDomain))
  })

  lines.push(line(RULE_LINE_KEYS.differentPlaces))

  if (groups.length === 0 && rows.length === 2) lines.push(line(RULE_LINE_KEYS.sizingRule))

  return lines
}

/** Resolves each line through the translate function, in order. */
export const renderRuleLines = (lines: readonly RuleLine[], t: Translate): string[] =>
  lines.map(({ key, params }) => t(key, { ...params }))
