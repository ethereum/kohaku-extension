/**
 * The utilities: the finding codes of validation, the three restore causes, the
 * three descriptions, the decoded error and the refusal shapes the throwing
 * members carry. Imported from no SDK package; types only. A utility returns
 * codes, names and values and never sentences; the words are the extension's
 * (en.json).
 */
import type { Address, Hex } from './common'
import type { Notification } from './events'
import type { Handover, PaymentOrder } from './formats'
import type { AttemptState } from './interactor'

/** Setup errors: the reverts the chain would produce later and the delegated guards. */
export const SETUP_ERROR_CODES = [
  'rule.empty',
  'clause.empty',
  'rule.all-thresholds-zero',
  'clause.threshold-above-count',
  'clause.threshold-too-wide',
  'rule.too-wide',
  'credential.duplicate',
  'wait.field-width',
  'wait.above-maximum',
  'action.unsupported',
  'backup.too-wide'
] as const
export type SetupErrorCode = typeof SETUP_ERROR_CODES[number]

/** Setup warnings: the risks the design discloses rather than forbids. */
export const SETUP_WARNING_CODES = [
  'clause.single-point',
  'clause.threshold-zero',
  'clause.shared-failure',
  'clause.secondary-only',
  'method.unshipped',
  'method.no-declaration',
  'method.stopped',
  'action.unaudited',
  'action.fit-unchecked',
  'manager.already-armed',
  'setup.wait-short',
  'setup.wait-zero',
  'backup.clear',
  'backup.empty',
  'rule.repeated-person'
] as const
export type SetupWarningCode = typeof SETUP_WARNING_CODES[number]

/** Request errors. `handover.removed-unknown` is raised by a gathering init. */
export const REQUEST_ERROR_CODES = [
  'request.attempt-id',
  'request.expired',
  'request.attempt-active',
  'request.no-active-attempt',
  'request.stale-attempt',
  'request.body-mismatch',
  'request.rule-unsatisfied',
  'request.method-stopped',
  'proof.places-unordered',
  'handover.removed-not-authority',
  'handover.new-holds-privilege',
  'handover.same-authority',
  'handover.malformed',
  'handover.removed-unknown'
] as const
export type RequestErrorCode = typeof REQUEST_ERROR_CODES[number]

/** Request warnings. `method.unshipped` repeats the setup code at the second moment. */
export const REQUEST_WARNING_CODES = [
  'payment.insufficient',
  'method.unshipped',
  'payment.open-payee',
  'payment.token-unknown',
  'request.window-wide',
  'request.window-short',
  'request.moment-skew',
  'cancel.window-late',
  'payment.sponsor-sees'
] as const
export type RequestWarningCode = typeof REQUEST_WARNING_CODES[number]

/** The three restore causes the value `getSetup` throws carries. */
export const RESTORE_CAUSES = [
  'restore.no-backup',
  'restore.backup-unopened',
  'restore.commitment-mismatch'
] as const
export type RestoreCause = typeof RESTORE_CAUSES[number]

export type FindingCode = SetupErrorCode | SetupWarningCode | RequestErrorCode | RequestWarningCode

/** The subject a finding is about. */
export const FINDING_SUBJECTS = [
  'setup',
  'clause',
  'credential',
  'action',
  'account',
  'request',
  'payment',
  'restore'
] as const
export type FindingSubject = typeof FINDING_SUBJECTS[number]

/**
 * One finding: a stable code, the subject it is about and the concrete values
 * behind it.
 */
export interface Finding<C extends string = FindingCode> {
  code: C
  subject: FindingSubject
  values: Record<string, unknown>
}

/** The two finding sets one validation returns; neither operation throws on a finding. */
export interface ValidationResult {
  errors: Finding[]
  warnings: Finding[]
}

/**
 * The thrown refusal of a prepare whose validation found errors: an ordinary
 * error carrying the findings.
 */
export interface ValidationRefusal extends Error {
  findings: ValidationResult
}

/**
 * The thrown refusal of `getSetup` and of the two gathering inits that run the
 * restore: an ordinary error carrying the restore cause.
 */
export interface RestoreRefusal extends Error {
  cause: Finding<RestoreCause>
}

/** Where a decoded revert came from. */
export const KIT_ERROR_SOURCES = ['manager', 'action', 'account', 'language'] as const
export type KitErrorSource = typeof KIT_ERROR_SOURCES[number]

/** The closed set of twenty-five kit errors, twenty-one on the manager and four on the action. */
export const KIT_ERROR_NAMES = [
  'InvalidCommitment',
  'WrongSetupNonce',
  'MethodStopped',
  'MethodVetoedSpend',
  'MethodNotUsed',
  'AttemptIgnoresPause',
  'MethodNotStopped',
  'PlaceOutOfRange',
  'NoSetup',
  'NoActiveAttempt',
  'AttemptAlreadyActive',
  'WrongAttemptId',
  'SetupCommitmentMismatch',
  'StaleAttempt',
  'CredentialMismatch',
  'PlacesNotStrictlyIncreasing',
  'RequestExpired',
  'ProofRejected',
  'RuleUnsatisfied',
  'WaitNotOver',
  'WrongPayload',
  'BatchNotApproved',
  'MalformedHandover',
  'ReservedAuthority',
  'NotConsumable'
] as const
export type KitErrorName = typeof KIT_ERROR_NAMES[number]

/**
 * What `decodeRevert` answers: the source, the error's name, its selector and
 * its argument values by name, or the unknown result with the selector where
 * one exists and the raw bytes. Never thrown.
 */
export type KitError =
  | {
      kind: 'known'
      source: KitErrorSource
      name: string
      selector: Hex
      args: Record<string, unknown>
    }
  | { kind: 'unknown'; selector?: Hex; data: Hex }

/**
 * The setup description, shown in full before a commit so the holder sees who
 * could act on their account. Every field is computed completely; the values
 * are codes and data. The field list is fixed; the value shapes stay open until
 * the SDK fixes them.
 */
export interface SetupDescription {
  rule: unknown
  wait: { seconds: bigint; defaultSeconds: bigint }
  failureDomains: unknown
  parties: unknown
  methodStanding: unknown
  passkeyDomains: unknown
  candidateKeys: { address: Address; isAuthority: boolean }[]
  // The SDK names this value but no literal; `'no-creation-triple'` is the extension's own.
  removedKey: Address | 'no-creation-triple'
  privacy: unknown
  backup: unknown
  reveals: unknown
  cancel: unknown
  upgrade: unknown
  pause: unknown
}

/**
 * The request description an approver reads before producing a proof.
 * `handover` and `order` are absent on a cancellation.
 */
export interface RequestDescription {
  account: Address
  chainId: bigint
  manager: Address
  action: Address
  attemptId: bigint
  setupNonce: bigint
  purpose: 'approval' | 'cancellation'
  handover?: { decoded: true; value: Handover } | { decoded: false }
  order?: PaymentOrder
  validUntil: number
  place: number
  identityPublic: unknown
  device: unknown
}

/**
 * The status description `describeStatus(setupState, recoveryState, latest)`
 * returns, the one description no class exposes.
 */
export interface StatusDescription {
  block: { hash: Hex } | { mismatched: true }
  attempt: null | {
    state: AttemptState
    attemptId: bigint
    consumableAfter: number
    blockTimestamp: number
    usedMethods: Address[]
    usedPlaces: bigint[]
    ignoresPause: boolean
    payload: Hex
    order: PaymentOrder
  }
  armed: boolean
  setup: { setupCommitment: Hex; setupNonce: bigint; setupCommittedAtBlock: number }
  stops: { method: Address; latest: Notification }[]
}
