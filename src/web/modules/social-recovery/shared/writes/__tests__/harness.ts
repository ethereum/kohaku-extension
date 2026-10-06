/**
 * The writes module's exports, the fixtures, the mocks and the helpers the
 * writes tests share. The helpers forward to the module and decide nothing:
 * the reading, the step and every string come from the module and from
 * en.json.
 *
 * - The provider reads (`ChainReads`: the native balance, the gas estimate and
 *   the gas price) are `jest.fn` members. The gas check reads the chain
 *   through them alone, so a test sets the balance and the estimate and
 *   records the transaction the estimate was asked for. No test reaches a
 *   network, and none imports the SDK doubles.
 * - Where a test needs the real wrapping of a failed read (a
 *   `ProviderReadFailure`, or a `RevertedCall` for an estimate that would
 *   revert), `rpcReads` runs the client's own `createChainReads` over a double
 *   of the provider members it calls (`ChainReadsProvider`).
 * - A send drive runs against a fake send port and a fake receipt wait,
 *   `jest.fn` members answering what a test gives them, or the client's own
 *   receipt wait over a node that never learns the hash, into the real
 *   machine (`drivenMachine`), so the machine and the classification decide
 *   each reading.
 * - Nothing else is mocked. The strings come from the real en.json through
 *   the app's own i18next instance (the renderers' default `t`).
 */
import { numberToHex } from 'viem'

import en from '@common/config/localization/translations/en.json'
import type {
  Address,
  Hex,
  KitError,
  KitErrorName,
  PreparedBatch,
  PreparedCall
} from '@web/modules/social-recovery/sdk-interfaces'
import {
  createChainReads,
  createReceiptWait,
  providerReadFailure,
  type ChainReads,
  type ChainReadsProvider,
  type GasEstimateCall,
  type KeyHandle,
  type ProviderTransactionReceipt,
  type ReceiptProvider,
  type ReceiptWait,
  type SendPort
} from '@web/modules/social-recovery/shared/client'
import type { Translate } from '@web/modules/social-recovery/shared/display'
import * as writes from '@web/modules/social-recovery/shared/writes'
import {
  AttemptAfterCancel,
  checkGas,
  classifyFailure,
  DepositStep,
  GasCheck,
  initialWriteState,
  renderDepositStep,
  renderWriteState,
  settleReceipt,
  WRITE_KINDS,
  WalletAccountRef,
  WriteKind,
  writeFailureOf,
  WriteEvent,
  WriteMachineState,
  writeReducer,
  WriteState
} from '@web/modules/social-recovery/shared/writes'

export * from '@web/modules/social-recovery/shared/writes'
export { writes as WRITES_MODULE }

/** The sending key: the ordinary key of the seed entry on the fast track. */
export const KEY: KeyHandle = {
  addr: '0x6c482af19b7d03e5c1a684fb27d05e93a8c410b7',
  type: 'internal'
}
/** Another key, so a test proves the step names the key it was given. */
export const OTHER_KEY: KeyHandle = {
  addr: '0x2b0f5e98ee98adc9865745e98802f333f72f6ef5',
  type: 'internal'
}
/** The account's controller as it now stands after a cancel that reverted. */
export const CONTROLLER: Address = '0x7a19c0dec0dec0dec0dec0dec0dec0dec0dec204'
/** The smart account the key operates, which the transfer route draws from. */
export const ACCOUNT: Address = '0x1111111111111111111111111111111111111111'
export const ACCOUNT_REF = { address: ACCOUNT, name: 'Account 1' }
export const MANAGER: Address = '0x5fbdb2315678afecb367f032d93f642f64180aa3'
export const ACTION: Address = '0xe7f1725e7734ce288f8367e1bb143e90bb3f0512'
export const TX_HASH: Hex = '0x9c1b2e6a0d4f3e8b7a6c5d4e3f2a1b0c9d8e7f6a5b4c3d2e1f0a9b8c7d6e5f4a'
export const BLOCK = { number: 7_000_000, hash: TX_HASH }

/** The network record the extension holds for the one chain the wallet reads. */
export const NETWORK = { name: 'Sepolia', nativeAssetSymbol: 'ETH' }

export const GWEI = 1_000_000_000n

/** The submission, a call anyone may send. */
export const SUBMISSION: PreparedCall = {
  kind: 'call',
  target: MANAGER,
  value: 0n,
  data: '0x1a2b3c4d000000000000000000000000000000000000000000000000000000000000002a',
  sender: 'anyone',
  block: BLOCK
}

/** The execution, another call anyone may send, with other calldata and another target. */
export const EXECUTION: PreparedCall = {
  kind: 'call',
  target: ACTION,
  value: 0n,
  data: '0x5e6f7a8b0000000000000000000000000000000000000000000000000000000000000063',
  sender: 'anyone',
  block: BLOCK
}

/** The owner's cancel, a call whose sender is the account. */
export const CANCEL: PreparedCall = {
  kind: 'call',
  target: MANAGER,
  value: 0n,
  data: '0x9e2a4b1c',
  sender: 'account',
  block: BLOCK
}

/** A setup write the account signs to itself: one batch. */
export const SAVE: PreparedBatch = {
  kind: 'batch',
  calls: [
    { ...CANCEL, target: ACCOUNT, data: '0xaaaa0001' },
    { ...CANCEL, target: MANAGER, data: '0xbbbb0002' }
  ],
  atomic: true,
  block: BLOCK
}

/**
 * The transaction the key sends for a write the account runs: the account's
 * own execute, which the account library builds. Its calldata names the write
 * so each write has its own transaction to estimate.
 */
export const ownerTransaction = (write: WriteKind, from: Address = KEY.addr): GasEstimateCall => ({
  from,
  to: ACCOUNT,
  data: `0x51945447${Buffer.from(write).toString('hex')}` as Hex
})

/** The prepared write of each kind. */
export const preparedFor = (write: WriteKind): PreparedCall | PreparedBatch => {
  switch (write) {
    case 'submission':
      return SUBMISSION
    case 'execution':
      return EXECUTION
    case 'cancel':
      return CANCEL
    default:
      return SAVE
  }
}

/** A kit error the wallet decoded for a revert. */
export const kitError = (name: KitErrorName): KitError => ({
  kind: 'known',
  source: 'manager',
  name,
  selector: '0x12345678',
  args: {}
})

export type MockReads = ChainReads & {
  nativeBalance: jest.Mock
  estimateGas: jest.Mock
  gasPrice: jest.Mock
}

/**
 * The provider reads as `jest.fn` members. `gas` answers each estimate, as a
 * constant or per transaction; every call is recorded.
 */
export const mockReads = ({
  balance,
  gas,
  price = 2n * GWEI
}: {
  balance: bigint
  gas: bigint | ((call: GasEstimateCall) => bigint)
  price?: bigint
}): MockReads => ({
  nativeBalance: jest.fn(async () => balance),
  estimateGas: jest.fn(async (call: GasEstimateCall) =>
    typeof gas === 'function' ? gas(call) : gas
  ),
  gasPrice: jest.fn(async () => price)
})

/** Runs the gas check for a write, off the fast track unless asked. */
export const runGasCheck = (args: {
  write: WriteKind
  reads: ChainReads
  key?: KeyHandle
  fastTrack?: boolean
  prepared?: PreparedCall | PreparedBatch
  /** The transaction the key sends for an owner write; the write's own by default. */
  transaction?: GasEstimateCall
  /** The account the key operates; `ACCOUNT_REF`, deployed, by default. */
  operates?: WalletAccountRef
  /** The transaction the key sends for the transfer route, where the caller builds it. */
  transferTransaction?: GasEstimateCall
}): Promise<GasCheck> => {
  const key = args.key ?? KEY
  const prepared = args.prepared ?? preparedFor(args.write)
  const ownerWrite = prepared.kind === 'batch' || prepared.sender === 'account'
  const transaction = args.transaction ?? ownerTransaction(args.write, key.addr)
  return checkGas({
    write: args.write,
    prepared,
    key,
    reads: args.reads,
    network: NETWORK,
    ...(ownerWrite ? { transaction } : {}),
    ...(args.transferTransaction ? { transferTransaction: args.transferTransaction } : {}),
    ...(args.fastTrack ? { fastTrack: true } : { operates: args.operates ?? ACCOUNT_REF })
  })
}

/**
 * The client's own chain reads over a double of the provider: `getBalance` and
 * `estimateGas` answer a bigint or throw the Error given, and `send` answers
 * `eth_gasPrice` as a quantity.
 */
export const rpcReads = (answers: {
  balance: bigint | Error
  gas: bigint | Error
  price?: bigint
}): ChainReads => {
  const answer = async (value: bigint | Error): Promise<bigint> => {
    if (value instanceof Error) {
      throw value
    }
    return value
  }
  const provider: ChainReadsProvider = {
    getBalance: () => answer(answers.balance),
    estimateGas: () => answer(answers.gas),
    send: async (method: string) => {
      if (method === 'eth_gasPrice') {
        return numberToHex(answers.price ?? 2n * GWEI)
      }
      throw new Error(`unexpected request ${method}`)
    }
  }
  return createChainReads(provider)
}

/** A node's answer to an estimate of a call that would revert: code 3 with the revert data. */
export const nodeRevert = (): Error =>
  Object.assign(new Error('execution reverted'), { code: 3, data: '0x' })

/** The deposit step of a check that came up short; throws where the key held enough. */
export const stepOf = (check: GasCheck): DepositStep => {
  if (check.kind !== 'deposit') {
    throw new Error(`Expected the deposit step, got ${check.kind}`)
  }
  return check.step
}

/** The state the write machine moves to when the check answers. */
export const stateAfterGasCheck = (check: GasCheck): WriteMachineState => {
  const write = check.kind === 'enough' ? check.write : check.step.write
  const checking = writeReducer(initialWriteState(write), { type: 'start' })
  return writeReducer(checking, { type: 'gasChecked', run: checking.run, check })
}

/** Every variant of the deposit step: each owner write, and each recovery call on both routes. */
export const STEP_CASES: { name: string; write: WriteKind; fastTrack: boolean }[] = [
  ...WRITE_KINDS.map((write) => ({ name: `${write}`, write, fastTrack: false })),
  { name: 'submission on the fast track', write: 'submission', fastTrack: true },
  { name: 'execution on the fast track', write: 'execution', fastTrack: true }
]

/** A deposit step over a key at zero. */
export const depositStepFor = async (
  write: WriteKind,
  fastTrack: boolean,
  gas = 240_000n,
  price = 2n * GWEI
): Promise<DepositStep> =>
  stepOf(await runGasCheck({ write, fastTrack, reads: mockReads({ balance: 0n, gas, price }) }))

/** A write that failed with an error before any hash, as the module classifies it. */
export const failBeforeHash = (write: WriteKind, error: unknown) =>
  classifyFailure(writeFailureOf(error), { write })

/** A thrown value as the module classifies it, with the attempt read of a cancel where given. */
export const failThrown = (write: WriteKind, error: unknown, attemptAfter?: AttemptAfterCancel) =>
  classifyFailure(writeFailureOf(error), { write, ...(attemptAfter ? { attemptAfter } : {}) })

/** A receipt with status zero, settled with the cause the wallet decoded. */
export const failWithReceipt = (
  write: WriteKind,
  cause?: KitError,
  attemptAfter?: AttemptAfterCancel
) =>
  settleReceipt(
    {
      transactionHash: TX_HASH,
      status: 0,
      blockNumber: 7_000_001,
      gasUsed: 51_234n,
      effectiveGasPrice: 2n * GWEI
    },
    { write, ...(attemptAfter ? { attemptAfter } : {}) },
    cause
  )

/** A receipt with status one, settled. */
export const landWithReceipt = (write: WriteKind) =>
  settleReceipt({ transactionHash: TX_HASH, status: 1 }, { write })

/** A state the module classified, as the machine holds it in the run it settled in. */
export const withRun = (state: WriteState, run = 1): WriteMachineState => ({ ...state, run })

/** The gas check's answer for a key that holds enough. */
export const enoughCheck = (write: WriteKind): GasCheck => ({
  kind: 'enough',
  write,
  key: KEY.addr,
  estimate: { gas: 1n, gasPrice: 1n, cost: 1n, required: 1n },
  balance: 1n
})

/** The submitting state a new run enters from `from` once the check answers enough, through the machine. */
export const submittingFrom = (from: WriteMachineState): WriteMachineState => {
  const checking = writeReducer(from, { type: 'start' })
  return writeReducer(checking, {
    type: 'gasChecked',
    run: checking.run,
    check: enoughCheck(from.write)
  })
}

/** The submitting state a write enters once the check answers enough, through the machine. */
export const submittingFor = (write: WriteKind): WriteMachineState =>
  submittingFrom(initialWriteState(write))

/** The submitting state of a new run from `from` once the wallet broadcast the call with `hash`. */
export const sentFrom = (from: WriteMachineState, hash: Hex = TX_HASH): WriteMachineState => {
  const submitting = submittingFrom(from)
  return writeReducer(submitting, { type: 'sent', run: submitting.run, transactionHash: hash })
}

/** The submitting state once the wallet broadcast the call, through the machine. */
export const sentFor = (write: WriteKind, hash: Hex = TX_HASH): WriteMachineState =>
  sentFrom(initialWriteState(write), hash)

/** Which reading a state is. */
export const readingOf = (state: WriteState): 'notSent' | 'reverted' | 'landed' | string =>
  state.status === 'failedNotSent'
    ? 'notSent'
    : state.status === 'failedReverted'
    ? 'reverted'
    : state.status

/** Every string `WriteStateView` shows for a state: the chip, the title, the lines, the controller and the retry. */
export const copyOfState = (state: WriteState, t?: Translate): string[] => {
  const r = t ? renderWriteState(state, t) : renderWriteState(state)
  return [r.chip, r.title, ...r.lines, r.controller?.label, r.controller?.address, r.retry].filter(
    (s): s is string => typeof s === 'string'
  )
}

/** Every string `DepositStepView` shows for the whole step. */
export const copyOfStep = (step: DepositStep, t?: Translate): string[] => {
  const r = t ? renderDepositStep(step, {}, t) : renderDepositStep(step)
  return [
    r.eyebrow,
    r.title,
    ...r.lead,
    r.keyLabel,
    r.keyAddress,
    r.copyLabel,
    r.copyFailed,
    ...r.routes.flatMap((route) => [route.line, route.note]),
    ...r.notes,
    ...r.waiting,
    r.actionHint
  ].filter((s): s is string => typeof s === 'string')
}

/** Every string `DepositStepView` shows for the blocker that leads to the step. */
export const copyOfBlocker = (step: DepositStep): string[] => {
  const r = renderDepositStep(step)
  return [
    r.blocker.title,
    r.blocker.line,
    r.keyLabel,
    r.keyAddress,
    r.copyLabel,
    r.copyFailed
  ].filter((s): s is string => typeof s === 'string')
}

export const text = (strings: string[]): string => strings.join('\n')

/** The holder rejected the request in the signing prompt: ethers' ACTION_REJECTED, no hash. */
export const userRejected = (): Error =>
  Object.assign(new Error('user rejected action'), { code: 'ACTION_REJECTED' })

/** The node refused the transaction before it took it: no hash. */
export const nodeRefused = (): Error =>
  Object.assign(new Error('insufficient funds for intrinsic transaction cost'), {
    code: 'INSUFFICIENT_FUNDS'
  })

/** A plain failure of the wallet before anything was broadcast. */
export const walletFailed = (): Error => new Error('The signer is not reachable')

/**
 * ethers' error from `wait()` on a transaction the chain mined and reverted:
 * a CALL_EXCEPTION carrying the hash and the receipt with status zero.
 */
export const minedAndReverted = (hash: Hex = TX_HASH): Error =>
  Object.assign(new Error('transaction execution reverted'), {
    code: 'CALL_EXCEPTION',
    action: 'sendTransaction',
    receipt: { hash, status: 0, blockNumber: 7_000_001, gasUsed: 51_234n },
    transaction: { hash }
  })

/** A wait that timed out after the broadcast: the hash is known, no receipt came back. */
export const waitTimedOut = (hash: Hex = TX_HASH): Error =>
  Object.assign(new Error('timeout'), { code: 'TIMEOUT', transaction: { hash } })

/** The hash of the transaction that took the write's place. */
export const REPLACEMENT_HASH: Hex =
  '0x1111111111111111111111111111111111111111111111111111111111111111'

/**
 * ethers' `TRANSACTION_REPLACED` from `wait()`: another transaction with the
 * same nonce was mined in the write's place. `repriced` is the same call at
 * another fee; `cancelled` and `replaced` mean the write's call never ran. The
 * receipt is the replacement's.
 */
export const replacedBy = (
  reason: 'repriced' | 'cancelled' | 'replaced',
  replacementStatus: 0 | 1 = 1
): Error =>
  Object.assign(new Error('transaction was replaced'), {
    code: 'TRANSACTION_REPLACED',
    reason,
    cancelled: reason !== 'repriced',
    hash: TX_HASH,
    replacement: { hash: REPLACEMENT_HASH },
    receipt: { hash: REPLACEMENT_HASH, status: replacementStatus, blockNumber: 7_000_002 }
  })

/** The state a write moves to when a read of its gas check could not run. */
export const gasReadErrorFor = (write: WriteKind): WriteMachineState => {
  const checking = writeReducer(initialWriteState(write), { type: 'start' })
  return writeReducer(checking, {
    type: 'error',
    run: checking.run,
    error: providerReadFailure('nativeBalance', new Error('node down'))
  })
}

/** A promise a test settles by hand. */
export interface Deferred<T> {
  promise: Promise<T>
  resolve: (value: T) => void
  reject: (error: unknown) => void
}

export const deferred = <T>(): Deferred<T> => {
  const settle = {} as Deferred<T>
  settle.promise = new Promise<T>((resolve, reject) => {
    settle.resolve = resolve
    settle.reject = reject
  })
  return settle
}

/** The real machine behind a dispatch: every event it took, and the state it holds now. */
export interface DrivenMachine {
  dispatch: (event: WriteEvent) => void
  events: WriteEvent[]
  state: () => WriteMachineState
}

export const drivenMachine = (from: WriteMachineState): DrivenMachine => {
  let state = from
  const events: WriteEvent[] = []
  return {
    dispatch: (event) => {
      events.push(event)
      state = writeReducer(state, event)
    },
    events,
    state: () => state
  }
}

/** A receipt as ethers' provider answers it, with the members the writes read. */
export const providerReceipt = (
  hash: Hex,
  status: 0 | 1 | null,
  gas: { gasUsed?: bigint; gasPrice?: bigint } = {}
): ProviderTransactionReceipt =>
  ({ hash, status, blockNumber: 7_000_001, ...gas } as unknown as ProviderTransactionReceipt)

/** What a fake answers: a value, a thrown error, or a promise a test settles. */
export type FakeAnswer<T> = { value: T } | { error: unknown } | { pending: Promise<T> }

const answered = async <T>(answer: FakeAnswer<T>): Promise<T> => {
  if ('pending' in answer) {
    return answer.pending
  }
  if ('error' in answer) {
    throw answer.error
  }
  return answer.value
}

/** A send port whose `send` and `sendAccountBatch` answer as given, recording each call. */
export const fakeSendPort = (
  answer: FakeAnswer<Hex>
): SendPort & { send: jest.Mock; sendAccountBatch: jest.Mock } => ({
  send: jest.fn(() => answered(answer)),
  sendAccountBatch: jest.fn(() => answered(answer))
})

/** The block the fake receipt wait reads as the chain's latest, unless a test gives another. */
export const START_BLOCK = 7_000_000

/** How often the provider behind `receiptWaitNeverKnowing` sees a new block. */
export const BLOCK_EVERY_MS = 12_000

/**
 * The client's own receipt wait over a provider whose node never learns any
 * transaction, while a new block comes every `BLOCK_EVERY_MS`: the wait asks
 * again at each block until it gives up. Run it on fake timers.
 */
export const receiptWaitNeverKnowing = (): ReceiptWait => {
  const provider = {
    getBlockNumber: async () => START_BLOCK,
    getTransaction: async () => null,
    once(event: string, listener: (blockNumber: number) => void) {
      setTimeout(() => listener(START_BLOCK), BLOCK_EVERY_MS)
      return Promise.resolve(provider)
    }
  }
  return createReceiptWait(provider as unknown as ReceiptProvider)
}

/**
 * Jest's own `advanceTimersByTimeAsync`: it moves the fake clock and lets the
 * promises each timer released run before the next timer fires. The
 * repository's Jest typings predate it, so it is reached through its shape.
 */
export const advanceTimersAsync = (ms: number): Promise<void> =>
  (
    jest as unknown as { advanceTimersByTimeAsync(ms: number): Promise<void> }
  ).advanceTimersByTimeAsync(ms)

export type FakeReceiptWait = ReceiptWait & { blockNumber: jest.Mock; wait: jest.Mock }

/**
 * A receipt wait whose `wait` answers as given and whose `blockNumber` reads
 * `START_BLOCK`, or answers as given; each records what it was asked.
 */
export const fakeReceiptWait = (
  answer: FakeAnswer<ProviderTransactionReceipt>,
  block: FakeAnswer<number> = { value: START_BLOCK }
): FakeReceiptWait => ({
  blockNumber: jest.fn(() => answered(block)),
  wait: jest.fn(() => answered(answer))
})

/** Every string reachable from a value, depth first. */
export const collectStrings = (
  value: unknown,
  out: string[] = [],
  seen = new Set<unknown>()
): string[] => {
  if (typeof value === 'string') {
    out.push(value)
  } else if (value && typeof value === 'object' && !seen.has(value)) {
    seen.add(value)
    Object.values(value as Record<string, unknown>).forEach((v) => collectStrings(v, out, seen))
  }
  return out
}

/** The words the product's copy never uses, as the copy lint reads them. */
export const BANS: { rule: string; pattern: RegExp }[] = [
  { rule: 'policy', pattern: /\bpolic(?:y|ies)\b/i },
  { rule: 'proof', pattern: /\bproofs?\b/i },
  { rule: 'relayer', pattern: /\brelayers?\b/i },
  { rule: 'EIP-712', pattern: /\bEIP[-\s]?712\b/i },
  { rule: 'atomic', pattern: /\batomic(?:ally)?\b/i },
  { rule: 'Protected', pattern: /\bProtected\b/ },
  { rule: 'protect', pattern: /\b(?:un)?protect/i },
  { rule: 'your people', pattern: /\byour\s+people\b/i },
  { rule: 'full wallet password', pattern: /\bfull\s+wallet\s+passwords?\b/i }
]

export const banHits = (strings: string[]): string[] =>
  strings.flatMap((s) =>
    BANS.filter(({ pattern }) => pattern.test(s)).map(({ rule }) => `${rule}: ${s}`)
  )

/** A string that promises one funding covers the submission and the execution. */
export const ONE_FUNDING_COVERS_BOTH =
  /\b(?:covers?|pays? for|enough for|funds?|lasts? for)\s+(?:them\s+)?both\b|\bone funding\b|\bsingle funding\b|\bboth (?:the )?(?:transactions|steps|fundings|the submission and the execution)\b|\bonly (?:fund|once)\b|\bfund (?:it|this key) once\b/i

/** A rendered string that is a raw key or an unfilled placeholder: a string en.json does not hold. */
export const UNRESOLVED = /\bsocialRecovery\.[\w.]+|\{\{\w+\}\}/

// Jest runs every file under __tests__, this one included; its own check runs
// only when Jest runs this file, never from a file that imports the harness.
if (expect.getState().testPath === __filename) {
  describe('harness', () => {
    it('mocks the provider reads and records each estimate', async () => {
      const reads = mockReads({ balance: 5n, gas: (call) => BigInt(call.data.length) })
      expect(await reads.nativeBalance(KEY.addr)).toBe(5n)
      expect(await reads.estimateGas({ from: KEY.addr, to: MANAGER, data: '0x00' })).toBe(4n)
      expect(reads.estimateGas).toHaveBeenCalledWith({ from: KEY.addr, to: MANAGER, data: '0x00' })
    })

    it('reads the copy regexes against the real en.json writes block', () => {
      const strings = collectStrings(en.socialRecovery.writes)
      expect(strings.length).toBeGreaterThan(10)
      expect(banHits(strings)).toEqual([])
      expect(strings.filter((s) => ONE_FUNDING_COVERS_BOTH.test(s))).toEqual([])
      expect(UNRESOLVED.test('socialRecovery.writes.causes.unnamed')).toBe(true)
      expect(UNRESOLVED.test('Send on Sepolia, the network.')).toBe(false)
    })

    it('gives each write its own transaction', () => {
      const data = WRITE_KINDS.map((write) => ownerTransaction(write).data)
      expect(new Set(data).size).toBe(WRITE_KINDS.length)
    })
  })
}
