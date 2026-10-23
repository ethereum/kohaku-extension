/**
 * The fake node, the scripted signer and the scripted identity stacks the
 * build with no deployment and the unit tests run the SDK over.
 */
export { ScriptedNode } from './node'
export { createScriptedSigner } from './signer'
export { createScriptedZkPassportStack } from './zkpassport-stack'
export { createScriptedAadhaarStack } from './aadhaar-stack'
export type {
  ScriptedAadhaarOptions,
  ScriptedAadhaarScript,
  ScriptedAadhaarStack,
  ScriptedAttemptOptions,
  ScriptedConstants,
  ScriptedDomain,
  ScriptedFailure,
  ScriptedManagerState,
  ScriptedMethod,
  ScriptedNodeSeed,
  ScriptedPhoneAnswer,
  ScriptedProverAnswer,
  ScriptedVerdict,
  ScriptedZkPassportOptions,
  ScriptedZkPassportScript,
  ScriptedZkPassportStack
} from './types'
