/**
 * shared/writes: the submitting and failed states every social recovery write
 * shares, and the gas check with its deposit step.
 *
 * The two React components live in `./components`, imported by path, so this
 * module loads in a Node test without the UI.
 */
export {
  WRITE_KINDS,
  OWNER_WRITES,
  RECOVERY_CALLS,
  PAYERS,
  isOwnerWrite,
  isRecoveryCall,
  payerOf,
  assertWriteDoor
} from './kinds'
export { WRITE_STATUSES, FAILED_STATUSES, isFailedState, canRetry, offersMoveFunds } from './states'
export {
  ATTEMPT_ENDS,
  ATTEMPT_STILL_RUNNING,
  REPLACED_REASONS,
  REVERT_CAUSE_KINDS,
  EXECUTION_STILL_READY_CAUSES,
  NO_RETRY_CAUSES,
  receiptOf,
  writeFailureOf,
  kitErrorNameOf,
  revertCauseOf,
  retryCanFix,
  leavesAttemptReady,
  gasSpentOf,
  classifyFailure,
  settleReceipt
} from './classify'
export { WRITE_EVENT_TYPES, WRITE_ANSWER_TYPES, initialWriteState, writeReducer } from './machine'
export {
  FEE_HEADROOM_PERCENT,
  GAS_DISPLAY_DECIMALS,
  ACCOUNT_FACTORY,
  VALUE_TRANSFER_GAS,
  DEPOSIT_ROUTES,
  roundUpForDisplay,
  roundDownForDisplay,
  gasEstimateOf,
  gasTransactionOf,
  transferTransactionOf,
  transferEstimateCallOf,
  transferFeeOf,
  holdsEnough,
  depositStepOf,
  checkGas
} from './gas'
export {
  WRITES_KEYS,
  GAS_KEYS,
  REVERTED_KEYS,
  revertedKeyOf,
  UNNAMED_CAUSE_KEY,
  causeKey,
  cancelGoneRoadKey,
  OWNER_SHORTFALL_KEYS,
  renderGasAmount,
  renderGasBalance,
  renderRevertCause,
  renderWriteState,
  renderDepositStep
} from './copy'
export type {
  WriteKind,
  OwnerWrite,
  RecoveryCall,
  Payer,
  WriteStatus,
  FailedStatus,
  IdleState,
  CheckingGasState,
  GasReadErrorState,
  NeedsDepositState,
  SubmittingState,
  LandedState,
  FailedNotSentState,
  FailedRevertedState,
  FailedState,
  WriteState,
  ReplacedReason,
  WriteReceipt,
  WriteFailure,
  AttemptEnd,
  AttemptAfterCancel,
  RevertCause,
  FailureContext,
  WriteEvent,
  WriteRun,
  WriteMachineState,
  GasNetwork,
  WalletAccountRef,
  GasEstimate,
  DepositRouteKind,
  DepositRoute,
  DepositStep,
  GasCheck,
  GasCheckInput,
  RenderedWriteState,
  RenderedRoute,
  RenderedDepositStep
} from './types'
