/**
 * The failure and refusal vocabulary of the scripted chain: which reads can be
 * scripted to fail, which members can be scripted to refuse, and the thrown
 * values they produce. The thrown shapes are the ones the interfaces'
 * `utilities.ts` declares: an ordinary error, a `ValidationRefusal` carrying the
 * findings, a `RestoreRefusal` carrying the restore cause.
 */
import { keccak256, stringToHex } from 'viem'

import type {
  Address,
  Finding,
  FindingCode,
  FindingSubject,
  Hex,
  KitError,
  KitErrorSource,
  RestoreCause,
  RestoreRefusal,
  ValidationRefusal,
  ValidationResult
} from '@web/modules/social-recovery/sdk-interfaces'

import type {
  CodedError,
  LandingRevert,
  ModuleRead,
  ReadFailureValues,
  ReadFailureWhere,
  ScriptedRead,
  ThrownRefusal
} from './types'

/**
 * Every read a double makes that a script can fail. The name is the part and
 * the member, so a member two parts share (`prepareStartAttempt`) stays two
 * names. A failed read throws a `ScriptedReadFailure`.
 */
export const SCRIPTED_READS = [
  'provider.chainId',
  'provider.call',
  'provider.logs',
  'provider.block',
  'manager.stateOf',
  'manager.hashApproval',
  'manager.hashCancel',
  'manager.eip712Domain',
  'manager.name',
  'manager.version',
  'manager.supportsInterface',
  'manager.moduleInfo',
  'manager.paused',
  'manager.trustedParties',
  'action.supportsAccount',
  'action.isAuthority',
  'action.isAuthorized',
  'action.holdsAnyPrivilege',
  'action.actionInfo',
  'events.fetch',
  'setup.validateSetup',
  'setup.describeSetup',
  'setup.setupState',
  'recovery.recoveryState',
  'walletReads.verifyReply',
  'walletReads.removedKey',
  'walletReads.fitCheck'
] as const

/**
 * The three module reads answer `{ answered: false }` rather than throwing when
 * the provider failed; a script chooses either.
 */
export const MODULE_READS = [
  'manager.moduleInfo',
  'manager.paused',
  'manager.trustedParties'
] as const

/**
 * Every member whose refusal is a thrown value, beside the manager part's and
 * the action part's own prepares.
 */
export const SCRIPTED_REFUSALS = [
  'setup.prepareCommitSetup',
  'setup.prepareClearSetup',
  'setup.confirmSetup',
  'setup.getSetup',
  'recovery.initRecoveryGathering',
  'recovery.initCancelGathering',
  'recovery.complete',
  'recovery.prepareStartAttempt',
  'recovery.prepareCancelByProofs',
  'recovery.prepareCancelByOwner',
  'recovery.prepareCancelByVeto',
  'recovery.prepareExecuteHandover',
  'manager.prepareCommitSetup',
  'manager.prepareClearSetup',
  'manager.prepareStartAttempt',
  'manager.prepareCancelByProofs',
  'manager.prepareCancelByOwner',
  'manager.prepareCancelByVeto',
  'action.disarmingCall',
  'action.armingCall',
  'orchestrator.signingInput',
  'orchestrator.enrollInput'
] as const

/**
 * The prepares whose simulation a script can fail. A failed simulation is not a
 * refusal: the prepare returns its record with `simulation.ok === false` and the
 * typed error.
 */
export const SCRIPTED_SIMULATIONS = [
  'setup.prepareCommitSetup',
  'setup.prepareClearSetup',
  'recovery.prepareStartAttempt',
  'recovery.prepareCancelByProofs',
  'recovery.prepareCancelByOwner',
  'recovery.prepareCancelByVeto',
  'recovery.prepareExecuteHandover'
] as const

/**
 * The two validations a script can append findings to: setup validation, which
 * `validateSetup` and `prepareCommitSetup` run, and request validation, which
 * `prepareStartAttempt` and `prepareCancelByProofs` run. Appended errors refuse
 * the prepares.
 */
export const SCRIPTED_FINDINGS = ['setup.validateSetup', 'recovery.validateRequest'] as const

export const codedError = (
  code: string,
  values?: Record<string, unknown>,
  message?: string
): CodedError => {
  const error = new Error(message ?? code) as CodedError
  error.name = 'CodedError'
  error.code = code
  error.values = values ?? {}
  return error
}

/**
 * The value a read that did not answer throws: a transport failure, never an
 * empty answer. A module read that answers `{ answered: false }` where a client
 * needs its value is thrown the same way, with the module and the place.
 */
export class ScriptedReadFailure extends Error {
  readonly kind = 'scripted-read-failure'

  readonly code = 'read.unanswered'

  /** The read, and the module and place it was made for where it was made per place. */
  readonly values: ReadFailureValues

  constructor(readonly read: ScriptedRead, where: ReadFailureWhere = {}) {
    super(`The read ${read} did not answer (scripted).`)
    this.name = 'ScriptedReadFailure'
    this.values = { read, ...where }
  }
}

/**
 * The refusal for a module read a client needs that did not answer, naming the
 * module, and the place where the read was made for one place.
 */
export const unansweredRead = (
  read: ModuleRead,
  module: Address,
  place?: number
): ScriptedReadFailure =>
  new ScriptedReadFailure(read, place === undefined ? { module } : { module, place })

export const finding = <C extends string = FindingCode>(
  code: C,
  subject: FindingSubject,
  values: Record<string, unknown> = {}
): Finding<C> => ({ code, subject, values })

export const validationRefusal = (
  findings: ValidationResult,
  message?: string
): ValidationRefusal => {
  const error = new Error(
    message ?? `Refused by validation: ${findings.errors.map((f) => f.code).join(', ')}`
  ) as ValidationRefusal
  error.name = 'ValidationRefusal'
  error.findings = findings
  return error
}

export const restoreRefusal = (
  cause: RestoreCause,
  values: Record<string, unknown> = {}
): RestoreRefusal => {
  const error = new Error(`The restore refused: ${cause}`) as RestoreRefusal
  error.name = 'RestoreRefusal'
  error.cause = finding(cause, 'restore', values)
  return error
}

export const thrownValueOf = (member: string, refusal: ThrownRefusal): Error => {
  switch (refusal.kind) {
    case 'validation':
      return validationRefusal(refusal.findings)
    case 'restore':
      return restoreRefusal(refusal.cause)
    default:
      return codedError(
        refusal.code ?? 'scripted.refused',
        { member },
        refusal.message ?? `${member} refused (scripted).`
      )
  }
}

export const landingRevert = (error: KitError): LandingRevert => {
  const name = error.kind === 'known' ? error.name : 'unknown'
  const thrown = codedError(name, { error }, `The chain reverts the call: ${name}`) as LandingRevert
  thrown.name = 'LandingRevert'
  thrown.error = error
  return thrown
}

/** A known kit error by name, the shape `decodeRevert` answers. */
export const kitError = (
  name: string,
  args: Record<string, unknown> = {},
  source: KitErrorSource = 'manager'
): KitError => ({
  kind: 'known',
  source,
  name,
  selector: keccak256(stringToHex(`${name}()`)).slice(0, 10) as Hex,
  args
})
