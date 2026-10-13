/**
 * The pure encodings a setup needs: salts, credential and setup commitments,
 * the setup body and its reader, and the calldata of the setup's and the
 * recovery's writes.
 */
export {
  defaultSaltOf,
  credentialCommitmentOf,
  placedCredentialsOf,
  ecdsaConfigOf,
  passkeyConfigOf
} from './credentials'
export { readSetupBody, setupBodyOf } from './setup-body'
export { setupCommitmentOf, deadCommitmentOf } from './commitments'
export {
  kitSlotOf,
  kitBindingOf,
  commitSetupData,
  armingData,
  disarmingData,
  privilegeData,
  startAttemptData,
  cancelByProofsData,
  cancelByOwnerData,
  cancelByVetoData,
  executeHandoverData,
  consumeData,
  transferData
} from './calls'
export type {
  PlacedCredential,
  PasskeyConfigFields,
  CommitSetupCall,
  SetupBodyFields
} from './types'
