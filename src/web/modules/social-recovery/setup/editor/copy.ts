/**
 * The editor's words: each method kind's name and picker header, the chip a
 * row carries with a failed test's line, the line under a threshold that is
 * not a whole number, the sentence of each refusal this wallet applies, the
 * rules panel, and the line a path check finding renders as. Every setup error
 * renders a sentence; any other finding renders its code.
 */
import type {
  Credential,
  Finding,
  FindingCode,
  SetupErrorCode
} from '@web/modules/social-recovery/sdk-interfaces'
import { renderChip } from '@web/modules/social-recovery/shared/display'
import type { MethodChip, Translate } from '@web/modules/social-recovery/shared/display'
import type {
  Enrollment,
  EnrollmentTestVerdict,
  PasskeyBackupKind,
  SlotKind
} from '@web/modules/social-recovery/shared/records'

import { enrollmentOf, isEmptySlot } from './operations'
import type { ClauseRole, ClientRefusal, Refusal, RefusalKey, RulesPanelLine } from './types'

const KIND_NAME_KEYS: Record<SlotKind, string> = {
  passkey: 'socialRecovery.methodNames.passkey',
  ecdsa: 'socialRecovery.display.nouns.guardian',
  zkpassport: 'socialRecovery.methodNames.passport',
  aadhaar: 'socialRecovery.methodNames.aadhaar'
}

const KIND_HEADER_KEYS: Record<SlotKind, string> = {
  passkey: 'socialRecovery.editor.picker.passkeysHeader',
  ecdsa: 'socialRecovery.methodNames.guardians',
  zkpassport: 'socialRecovery.methodNames.passport',
  aadhaar: 'socialRecovery.methodNames.aadhaar'
}

const VERDICT_CHIPS: Record<EnrollmentTestVerdict, MethodChip> = {
  passed: 'tested',
  'not-tested': 'notTested',
  failed: 'testFailed',
  unavailable: 'testUnavailable',
  'not-supported': 'notSupported'
}

const REFUSAL_KEYS: Record<RefusalKey, string> = {
  emptyGroup: 'socialRecovery.editor.refusals.emptyGroup',
  emptyGroupSlot: 'socialRecovery.editor.refusals.emptyGroupSlot',
  emptyRequired: 'socialRecovery.editor.refusals.emptyRequired',
  thresholdAboveMembers: 'socialRecovery.editor.refusals.thresholdAboveMembers',
  thresholdBelowOne: 'socialRecovery.editor.refusals.thresholdBelowOne',
  thresholdBelowOneOwnRule: 'socialRecovery.editor.refusals.thresholdBelowOneOwnRule',
  thresholdAboveField: 'socialRecovery.editor.refusals.thresholdAboveField',
  memberCeiling: 'socialRecovery.editor.refusals.memberCeiling',
  noMethod: 'socialRecovery.editor.refusals.noMethod',
  waitFieldWidth: 'socialRecovery.editor.refusals.waitFieldWidth',
  waitCeiling: 'socialRecovery.editor.refusals.waitCeiling',
  tooLarge: 'socialRecovery.editor.refusals.tooLarge'
}

// A backup too wide for its padding and an action that cannot serve the
// account are the SDK's findings alone: this wallet never judges either shape
// itself, so each has a sentence of its own outside the editor's refusals.
const SETUP_ERROR_KEYS: Record<SetupErrorCode, string> = {
  'rule.empty': REFUSAL_KEYS.noMethod,
  'clause.empty': REFUSAL_KEYS.emptyGroup,
  'rule.all-thresholds-zero': REFUSAL_KEYS.thresholdBelowOne,
  'clause.threshold-above-count': REFUSAL_KEYS.thresholdAboveMembers,
  'clause.threshold-too-wide': REFUSAL_KEYS.thresholdAboveField,
  'rule.too-wide': REFUSAL_KEYS.tooLarge,
  'credential.duplicate': 'socialRecovery.editor.duplicate',
  'wait.field-width': REFUSAL_KEYS.waitFieldWidth,
  'wait.above-maximum': REFUSAL_KEYS.waitCeiling,
  'action.unsupported': 'socialRecovery.editor.refusals.actionUnsupported',
  'backup.too-wide': 'socialRecovery.editor.refusals.backupTooWide'
}

const FINDING_KEYS: Partial<Record<FindingCode, string>> = SETUP_ERROR_KEYS

/** The rules panel's lines, the zero threshold's own-rule line last. */
const RULES_PANEL_LINES: readonly RulesPanelLine[] = [
  'requiredAnswers',
  'enoughMembers',
  'thresholdAtLeastOne',
  'thresholdCeiling',
  'memberCeiling',
  'oneRowPerMethod',
  'atLeastOneMethod',
  'smallEnough',
  'zeroThresholdOwnRule'
]

const CLIENT_REFUSAL_KEYS: Record<ClientRefusal, { title: string; body: string }> = {
  'update-the-wallet': {
    title: 'socialRecovery.client.updateTheWalletTitle',
    body: 'socialRecovery.client.updateTheWalletBody'
  },
  unavailable: {
    title: 'socialRecovery.client.unavailableTitle',
    body: 'socialRecovery.client.unavailableBody'
  }
}

/**
 * A kind's name; a passkey its enrollment reports as device-bound reads as a
 * passkey on this device.
 */
export const renderKindName = (
  kind: SlotKind | undefined,
  t: Translate,
  backup?: PasskeyBackupKind
): string | null => {
  if (!kind) {
    return null
  }
  if (kind === 'passkey' && backup === 'device-bound') {
    return t('socialRecovery.methodNames.passkeyOnThisDevice')
  }
  return t(KIND_NAME_KEYS[kind])
}

export const renderKindHeader = (kind: SlotKind, t: Translate): string => t(KIND_HEADER_KEYS[kind])

/**
 * The chip of a row: "Not yet active" for an empty slot, the access test's
 * verdict for an enrolled credential whose enrollment the records hold.
 */
export const renderRowChip = (
  credential: Credential,
  enrollments: readonly Enrollment[],
  t: Translate
): string | null => {
  if (isEmptySlot(credential)) {
    return renderChip('method', 'notYetActive', t)
  }
  const enrollment = enrollmentOf(credential, enrollments)
  return enrollment ? renderChip('method', VERDICT_CHIPS[enrollment.test], t) : null
}

/**
 * The line a failed access test carries beside its chip: that the check did
 * not match where the stored cause says so, else that the method may never
 * work.
 */
export const renderFailedTestLine = (enrollment: Enrollment, t: Translate): string | null => {
  if (enrollment.test !== 'failed') {
    return null
  }
  return enrollment.cause?.startsWith('check-rejected')
    ? t('socialRecovery.ceremony.testFailedNoMatch')
    : t('socialRecovery.ceremony.testFailedLine')
}

/** The line under a threshold field whose text is not a whole number. */
export const renderHeldThreshold = (t: Translate): string =>
  t('socialRecovery.editor.refusals.thresholdWholeNumber')

export const renderClientRefusal = (
  refusal: ClientRefusal,
  t: Translate
): { title: string; body: string } => ({
  title: t(CLIENT_REFUSAL_KEYS[refusal].title),
  body: t(CLIENT_REFUSAL_KEYS[refusal].body)
})

export const renderFinding = (finding: Finding, t: Translate): string => {
  const key = FINDING_KEYS[finding.code]
  return key ? t(key) : finding.code
}

export const renderRefusal = (refusal: Refusal, t: Translate): string =>
  t(REFUSAL_KEYS[refusal.key])

/**
 * The label of the clause a refusal points at, as the editor heads it: the
 * required section's for a required row, "Group n" for a group, counting the
 * groups alone. A refusal of the whole path or of its wait has none.
 */
export const renderRefusalPlace = (
  refusal: Refusal,
  roles: readonly ClauseRole[],
  t: Translate
): string | null => {
  const { clause } = refusal
  if (clause === undefined || !roles[clause]) {
    return null
  }
  if (roles[clause] === 'required') {
    return t('socialRecovery.editor.requiredHeader')
  }
  const n = roles.slice(0, clause).filter((role) => role === 'group').length + 1
  return t('socialRecovery.shape.group', { n })
}

export const renderRulesPanel = (t: Translate): { header: string; lines: string[] } => ({
  header: t('socialRecovery.editor.rules.header'),
  lines: RULES_PANEL_LINES.map((line) => t(`socialRecovery.editor.rules.${line}`))
})
