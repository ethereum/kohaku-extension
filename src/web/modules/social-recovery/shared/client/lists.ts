/**
 * The two closed sets the SDK does not name.
 *
 * The privacy levels the setup screen offers are the extension's encoding over
 * the two metadata fields of the setup event; the contract defines no levels
 * and reads neither field. `private`, the default, keeps the shape and the
 * values encrypted in the private field and nothing readable in the public
 * one; `shape-visible` writes the shape in the clear in the public field and
 * the values encrypted in the private one; `public` keeps everything in the
 * clear with no recovery password.
 *
 * The kit errors are the twenty-two of the manager and the six of the action,
 * by name without their contract's prefix, except the action's two refusals
 * of a key, named as deployed.
 */
export const PRIVACY_LEVELS = ['private', 'shape-visible', 'public'] as const

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
  'ActionDoesNotServeAccount',
  'BatchNotApproved',
  'MalformedHandover',
  'RecoveryAction_NotAKey',
  'RecoveryAction_AlreadyPrivileged',
  'AccountNotServed',
  'NotConsumable'
] as const
