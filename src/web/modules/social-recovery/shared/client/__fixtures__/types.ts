import type {
  Address,
  ApproverRequest,
  BlockHeader,
  BlockTag,
  Hex,
  IProvider,
  RawLog
} from '@kohaku-eth/social-recovery'

/** An approver request for an approval, the one purpose the module's verify judges a reply for. */
export type ApprovalRequest = Extract<ApproverRequest, { purpose: 'approval' }>

/** One `eth_call` the scripted provider answered: where, what and at which block. */
export interface ProviderCall {
  to: Address
  data: Hex
  block: BlockTag
}

/**
 * A provider a test scripts call by call, for the reads that judge what a
 * node answers at its edges (a pruned history, a log the filter did not ask
 * for, a failed chunk): each call answers the bytes scripted for its address
 * and data, an address with no code answers no bytes, and the logs are
 * filtered by address, topics and range as a node filters them.
 */
export interface ScriptedProvider {
  provider: IProvider & {
    chainId: jest.Mock
    call: jest.Mock
    logs: jest.Mock
    block: jest.Mock
    code: jest.Mock<Promise<Hex>, [Address, BlockTag]>
    transaction: jest.Mock
  }
  head: BlockHeader
  /** Answers one exact call; a function answers it afresh on each call. */
  answer(to: Address, data: Hex, answer: Hex | Error | ((data: Hex) => Hex | Error)): void
  /** Answers every call to `to` whose selector is `selector` and has no exact answer. */
  answerWith(to: Address, selector: Hex, answer: (data: Hex) => Hex | Error): void
  /** Gives `address` its code from block `from` on (block 0 by default); a read at a named tag sees it. */
  setCode(address: Address, code: Hex, from?: number): void
  addLog(log: RawLog): void
  /** Scripts the sender of one transaction, or the error its read rejects with. */
  setSender(hash: Hex, sender: Address | Error): void
  /** Every call answered or refused, in order. */
  calls: ProviderCall[]
}

/** The setup state the scripted manager answers for the account and the action. */
export interface ScriptedState {
  setupCommitment: Hex
  setupNonce: bigint
  setupCommittedAtBlock: number
  /** The attempt's state, as the enum's index. */
  attemptState?: number
  nextAttemptId?: bigint
  attemptId?: bigint
  consumableAfter?: number
}

/** What a setup commit log carries; the action is the world's by default. */
export interface CommittedFields {
  action?: Address
  nonce: bigint
  setupCommitment: Hex
  publicMetadata?: Hex
  privateMetadata?: Hex
}
