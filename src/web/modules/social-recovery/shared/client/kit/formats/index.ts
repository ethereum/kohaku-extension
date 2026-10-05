/**
 * The pure encodings a setup needs: salts, credential and setup commitments,
 * the setup body and the calldata of the setup's writes.
 */
export {
  defaultSaltOf,
  credentialCommitmentOf,
  placedCredentialsOf,
  ecdsaConfigOf,
  passkeyConfigOf
} from './credentials'
export { setupBodyOf } from './setup-body'
export { setupCommitmentOf, deadCommitmentOf } from './commitments'
export { kitSlotOf, kitBindingOf, commitSetupData, armingData, disarmingData } from './calls'
export type { PlacedCredential, PasskeyConfigFields, CommitSetupCall } from './types'
