/**
 * The cancel's run over the watcher's real poll on a scripted chain, the real
 * write machine, the real send drive and the real stored claim on a storage
 * in memory. Only the edges are fakes: the prepare, the gas check, the send
 * port, the receipt wait and the wallet's reading and withdrawal of a queued
 * request.
 */
import { getAddress, zeroHash } from 'viem'

import type { Address, CancelledBy, Hex, PreparedCall } from '@kohaku-eth/social-recovery'
import { accountBatchRefusal } from '@web/modules/social-recovery/shared/client'
import type {
  ProviderTransactionReceipt,
  SendPort
} from '@web/modules/social-recovery/shared/client'
import type { GasCheck } from '@web/modules/social-recovery/shared/writes'
import { depositStepOf, driveAccountBatch } from '@web/modules/social-recovery/shared/writes'
import {
  attemptReaderOf,
  cancelClaimsOf,
  landingReaderOf
} from '@web/modules/social-recovery/cancel'
import type { CancelHold, CancelLog, CancelSteps } from '@web/modules/social-recovery/cancel'
import {
  ACCOUNT,
  DEPLOYMENT,
  HEAD,
  NEW_KEY,
  SEPOLIA,
  atBlock,
  cancelledEvent,
  consumedEvent,
  memoryStorage,
  payloadTo,
  scriptedChain,
  startedEvent,
  stateWith
} from '@web/modules/social-recovery/watcher/__fixtures__/harness'

export const ATTEMPT = 4n
export const PAYLOAD = payloadTo(NEW_KEY)
export const KEY: Address = getAddress('0x0000000000000000000000000000000000c0ffee')
export const TX_HASH: Hex = `0x${'ab'.repeat(32)}`
export const OTHER_HASH: Hex = `0x${'cd'.repeat(32)}`
/** The block read before the send, and the block the cancel lands in, both under the chain's head. */
export const START_BLOCK = HEAD - 10
export const LANDED_BLOCK = HEAD - 9
export const MANAGER: Address = getAddress('0x00000000000000000000000000000000000a5a5a')

export const CANCEL_CALL: PreparedCall = {
  kind: 'call',
  target: MANAGER,
  value: 0n,
  data: '0xdeadbeef',
  sender: 'account',
  block: { number: START_BLOCK, hash: zeroHash }
}

const ESTIMATE = { gas: 50_000n, gasPrice: 1n, cost: 50_000n, required: 60_000n }

export const ENOUGH: GasCheck = {
  kind: 'enough',
  write: 'cancel',
  key: KEY,
  estimate: ESTIMATE,
  balance: 1_000_000n
}

export const SHORT: GasCheck = {
  kind: 'deposit',
  step: depositStepOf({
    write: 'cancel',
    key: KEY,
    network: { name: 'Sepolia', nativeAssetSymbol: 'ETH' },
    estimate: ESTIMATE,
    balance: 0n,
    operates: { address: ACCOUNT, name: 'Account 1', deployed: true },
    transferFee: ESTIMATE
  })
}

/** ethers' receipt is a class bound to its provider; the run reads its hash, status and block alone. */
export const landedReceipt = (hash: Hex = TX_HASH): ProviderTransactionReceipt =>
  ({ hash, status: 1, blockNumber: LANDED_BLOCK } as unknown as ProviderTransactionReceipt)

/** ethers' error from `wait()` on a transaction the chain mined and reverted. */
export const minedAndReverted = (hash: Hex = TX_HASH): Error =>
  Object.assign(new Error('transaction execution reverted'), {
    code: 'CALL_EXCEPTION',
    receipt: { hash, status: 0, blockNumber: LANDED_BLOCK, gasUsed: 40_000n },
    transaction: { hash }
  })

/** A chain where the account holds a setup and the attempt waits, its opening readable. */
export const openChain = () => {
  const chain = scriptedChain()
  chain.deploy(ACCOUNT)
  chain.setState(ACCOUNT, stateWith({ attemptId: ATTEMPT, state: 'Waiting', payload: PAYLOAD }))
  chain.setEvents(ACCOUNT, ATTEMPT, { started: startedEvent(ATTEMPT, PAYLOAD) })
  return chain
}

export type Chain = ReturnType<typeof openChain>

/** The owner's cancel of `attemptId`, logged in `block` by the transaction `transactionHash`. */
export const ownerCancelAt = (
  attemptId: bigint,
  block: number,
  transactionHash: Hex = TX_HASH
): CancelLog => {
  const cancelled = atBlock(cancelledEvent(attemptId, 'cancelByOwner'), block)
  return { ...cancelled, at: { ...cancelled.at, transactionHash } }
}

/**
 * An attempt cancelled on the chain by `by`; the owner's cancel lands in the
 * cancel's own block under `transactionHash`, another road's before the send.
 */
export const cancelOn = (
  chain: Chain,
  by: CancelledBy,
  attemptId: bigint = ATTEMPT,
  payload: Hex = PAYLOAD,
  transactionHash: Hex = TX_HASH
) => {
  chain.setState(ACCOUNT, stateWith({ attemptId, state: 'Cancelled', payload }))
  chain.setEvents(ACCOUNT, attemptId, {
    started: startedEvent(attemptId, payload),
    cancelled:
      by === 'cancelByOwner'
        ? ownerCancelAt(attemptId, LANDED_BLOCK, transactionHash)
        : cancelledEvent(attemptId, by)
  })
}

/** A newer attempt open on the chain, its opening readable. */
export const openOn = (chain: Chain, attemptId: bigint, payload: Hex) => {
  chain.setState(ACCOUNT, stateWith({ attemptId, state: 'Waiting', payload }))
  chain.setEvents(ACCOUNT, attemptId, { started: startedEvent(attemptId, payload) })
}

/** The attempt executed on the chain, handing the account to `NEW_KEY`. */
export const executeOn = (chain: Chain) => {
  chain.setState(ACCOUNT, stateWith({ attemptId: ATTEMPT, state: 'Consumed', payload: PAYLOAD }))
  chain.setEvents(ACCOUNT, ATTEMPT, {
    started: startedEvent(ATTEMPT, PAYLOAD),
    consumed: consumedEvent(ATTEMPT)
  })
}

export interface RunWorld {
  chain: Chain
  storage: ReturnType<typeof memoryStorage>
  steps: CancelSteps
  sendAccountBatch: jest.Mock
  wait: jest.Mock
  checkGas: jest.Mock
  requestHold: jest.Mock
  receiptCancel: jest.Mock
  withdrawRequest: jest.Mock
}

/**
 * The run's steps over one world. By default the gas check reads enough, the
 * send answers `TX_HASH`, and the receipt lands with the owner's cancel on
 * the chain.
 */
export const runWorld = (chain: Chain = openChain(), now: () => number = Date.now): RunWorld => {
  const storage = memoryStorage()
  let requests = 0
  // The wallet asks the run's gate right before it adds the request, and adds nothing on a no.
  const sendAccountBatch = jest.fn(
    async (
      account: Address,
      _calls: PreparedCall[],
      _onEstimation?: unknown,
      _kit?: unknown,
      _requestId?: string,
      options?: { canAdd?: () => Promise<boolean> }
    ): Promise<Hex> => {
      if (options?.canAdd && !(await options.canAdd())) {
        throw accountBatchRefusal('timeout', account)
      }
      return TX_HASH
    }
  )
  const port: SendPort = {
    send: jest.fn(),
    sendAccountBatch
  } as Partial<SendPort> as SendPort
  const wait = jest.fn<Promise<ProviderTransactionReceipt>, [Hex, number]>(async (hash) => {
    cancelOn(chain, 'cancelByOwner', ATTEMPT, PAYLOAD, hash)
    return landedReceipt(hash)
  })
  const checkGas = jest.fn(async () => ENOUGH)
  const requestHold = jest.fn(async (): Promise<CancelHold> => ({ status: 'held' }))
  // By default the wallet keeps the request, as it does while its sign screen holds it.
  const withdrawRequest = jest.fn<void, [string]>()
  // By default the receipt's logs cannot be read, so the read after a landing scans by id.
  const receiptCancel = jest.fn(async (): Promise<CancelLog | undefined> => undefined)
  const readAttempt = attemptReaderOf({
    reads: chain.reads,
    deployment: DEPLOYMENT,
    account: ACCOUNT,
    chainId: SEPOLIA,
    storage,
    limitMs: 5_000
  })
  const steps: CancelSteps = {
    readAttempt,
    readLanding: landingReaderOf({ reads: chain.reads, account: ACCOUNT, readAttempt }),
    prepare: async () => CANCEL_CALL,
    checkGas,
    newRequestId: () => {
      requests += 1
      return `request-${requests}`
    },
    blockNumber: async () => START_BLOCK,
    claims: cancelClaimsOf(storage, SEPOLIA, ACCOUNT, now),
    send: (input) =>
      driveAccountBatch({
        dispatch: input.dispatch,
        run: input.run,
        receipts: {
          blockNumber: () => Promise.resolve(input.startBlock),
          wait: (hash, from) => wait(hash, from)
        },
        port,
        account: ACCOUNT,
        calls: [input.prepared],
        requestId: input.requestId,
        canAdd: input.canAdd
      }),
    wait: (hash, from) => wait(hash, from),
    receiptCancel,
    requestHold,
    withdrawRequest
  }
  return {
    chain,
    storage,
    steps,
    sendAccountBatch,
    wait,
    checkGas,
    requestHold,
    receiptCancel,
    withdrawRequest
  }
}

export { ACCOUNT, NEW_KEY, SEPOLIA }
