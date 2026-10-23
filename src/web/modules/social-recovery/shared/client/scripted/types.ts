import type {
  Address,
  Attempt,
  BlockHeader,
  DeploymentDescriptor,
  Handover,
  Hex,
  Parties,
  PaymentOrder,
  ProviderRevert,
  Verdict,
  ZkPassportStack
} from '@kohaku-eth/social-recovery'
import type { AnonAadhaarStack } from '@kohaku-eth/social-recovery/recovery-methods'

/** What one fake node's world starts from; every member but the two first has a default. */
export interface ScriptedNodeSeed {
  descriptor: DeploymentDescriptor
  account: Address
  /** The chain's clock in seconds; the latest block follows it. The wall clock by default. */
  clock?: () => number
  /** The first block's number, 1000 by default. */
  firstBlock?: number
  /** Whether the account holds the proxy over the served implementation; true by default. */
  hasCode?: boolean
  /** The action's `supportsAccount` answer for an account with code; true by default. */
  supportsAccount?: boolean
  /** The keys that hold the key privilege on the account; none by default. */
  authorities?: readonly Address[]
}

/** The manager's record of the one account and action the node serves. */
export interface ScriptedManagerState {
  setupCommitment: Hex
  setupNonce: bigint
  nextAttemptId: bigint
  setupCommittedAtBlock: number
  attempt: Attempt
  /** The setup body the standing commitment closes over, `0x` where none stands. */
  setupBody: Hex
}

/** A method module's declaration as the node answers it. */
export interface ScriptedMethod {
  name: string
  version: string
  paused: boolean
  parties: Parties
}

/** What a seeded attempt carries; each member has a default. */
export interface ScriptedAttemptOptions {
  handover?: Handover
  order?: PaymentOrder
  /** Seconds after the opening block until the attempt may be consumed; one day by default. */
  wait?: number
  ignoresPause?: boolean
  usedMethods?: readonly Address[]
  usedPlaces?: readonly bigint[]
}

/** What an opening carries that the manager records. */
export interface ScriptedOpening {
  attemptId: bigint
  setupNonce: bigint
  setupBody: Hex
  payload: Hex
  order: PaymentOrder
}

/** The members of the manager's `eip712Domain` answer, the descriptor's unless a seed names others. */
export interface ScriptedDomain {
  fields: Hex
  name: string
  version: string
  chainId: bigint
  verifyingContract: Address
}

/** The action's immutables as the node answers them, the descriptor's and this build's derivations unless a seed names others. */
export interface ScriptedConstants {
  manager: Address
  ambireImplementation: Address
  kitSlot: Address
  binding: Hex
}

/** A verdict the node can be seeded with for a module it cannot judge. */
export type ScriptedVerdict = Extract<Verdict, 'satisfied' | 'rejected'>

/** How a failed read fails: a transport failure, or a revert with these bytes. */
export type ScriptedFailure = { kind: 'unavailable' } | ({ kind: 'revert' } & ProviderRevert)

/** One block the node mined, with the transactions it holds. */
export interface ScriptedBlock {
  header: BlockHeader
  transactions: Hex[]
}

/**
 * How the scripted zkPassport phone answers a request: with the result, by
 * declining, with an error, or never.
 */
export type ScriptedPhoneAnswer = 'result' | 'reject' | 'error' | 'silent'

/** What the scripted zkPassport stack answers until the next script; each member has a default. */
export interface ScriptedZkPassportScript {
  /** The phone's answer; the result by default. */
  answer?: ScriptedPhoneAnswer
  /** The message an error answer carries. */
  error?: string
  /** The unique identifier the phone's proof carries; 123 by default. */
  identifier?: bigint
}

/** What the scripted zkPassport stack is built with. */
export interface ScriptedZkPassportOptions {
  /** The milliseconds between two of the phone's callbacks; 400 by default. */
  stepMs?: number
  /** The unique identifier the phone's proof carries unless scripted; 123 by default. */
  identifier?: bigint
}

/** A double of the zkPassport app library and the phone that answers its requests. */
export type ScriptedZkPassportStack = ZkPassportStack & {
  /** Sets how every request from now on is answered; an empty script restores the defaults. */
  script(next: ScriptedZkPassportScript): void
}

/** How the scripted Aadhaar prover answers: with a proof, by failing, or not until aborted. */
export type ScriptedProverAnswer = 'proof' | 'fail' | 'hang'

/** What the scripted Aadhaar stack answers until the next script; each member has a default. */
export interface ScriptedAadhaarScript {
  /** The prover's answer; a proof by default. */
  prove?: ScriptedProverAnswer
  /** The nullifier the proof carries; 22 by default. */
  nullifier?: bigint
  /** Stamps the proof with a QR code older than a day instead of the device clock; false by default. */
  stale?: boolean
  /** The local verifier's answer, or a throw; true by default. */
  verify?: boolean | 'throw'
}

/** What the scripted Aadhaar stack is built with. */
export interface ScriptedAadhaarOptions {
  /** The milliseconds between two of the prover's progress states; 400 by default. */
  stepMs?: number
}

/** A double of the Aadhaar proving library. */
export type ScriptedAadhaarStack = AnonAadhaarStack & {
  /** Sets how every call from now on is answered; an empty script restores the defaults. */
  script(next: ScriptedAadhaarScript): void
}
