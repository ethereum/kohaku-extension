/**
 * The gas check takes a bar a balance must reach to pass: the lower bar by
 * default, or the whole amount asked. A caller asks for the second after the
 * sign screen read the key short at a fee above the estimate, so a key that
 * passes the lower bar still gets the deposit step, for the amount asked less
 * what it holds. A key that holds the amount asked passes either bar.
 */
import {
  ACCOUNT,
  ACCOUNT_REF,
  checkGas,
  depositStepOf,
  gasEstimateOf,
  GWEI,
  KEY,
  mockReads,
  NETWORK,
  ownerTransaction,
  preparedFor,
  reachesBar,
  transferFeeOf,
  transferTransactionOf,
  WRITE_KINDS
} from '@web/modules/social-recovery/shared/writes/__tests__/harness'
import type {
  DepositStep,
  GasCheck,
  GasPassBar,
  WriteKind
} from '@web/modules/social-recovery/shared/writes/__tests__/harness'

const GAS = 200_000n
const PRICE = 3n * GWEI
/** The fee: 0.0006 ETH; the bar to pass 0.00066 ETH; the amount asked 0.0009 ETH. */
const COST = 600_000_000_000_000n
const REQUIRED = 660_000_000_000_000n
const ASKED = 900_000_000_000_000n
/** A balance above the bar to pass and below the amount asked. */
const BETWEEN = 700_000_000_000_000n
const BETWEEN_SHORTFALL = 200_000_000_000_000n

const ESTIMATE = gasEstimateOf(GAS, PRICE)

const TRANSFER_GAS = 40_000n
const TRANSFER_FEE = transferFeeOf(TRANSFER_GAS, PRICE)

const outsideOf = (step: DepositStep) => {
  const outside = step.routes.find((route) => route.kind === 'outside')
  if (!outside) {
    throw new Error('expected the deposit from outside')
  }
  return outside
}

const ROUTES: { write: WriteKind; fastTrack: boolean }[] = [
  ...WRITE_KINDS.map((write) => ({ write, fastTrack: false })),
  { write: 'submission', fastTrack: true },
  { write: 'execution', fastTrack: true }
]

const transferData = transferTransactionOf(ACCOUNT, KEY.addr).data

const checkAt = (write: WriteKind, fastTrack: boolean, balance: bigint, passBar?: GasPassBar) => {
  const prepared = preparedFor(write)
  const ownerWrite = prepared.kind === 'batch' || prepared.sender === 'account'
  const reads = mockReads({
    balance,
    gas: (call) => (call.data === transferData ? TRANSFER_GAS : GAS),
    price: PRICE
  })
  const check: Promise<GasCheck> = checkGas({
    write,
    prepared,
    key: KEY,
    reads,
    network: NETWORK,
    ...(ownerWrite ? { transaction: ownerTransaction(write) } : {}),
    ...(fastTrack ? { fastTrack: true } : { operates: ACCOUNT_REF }),
    ...(passBar ? { passBar } : {})
  })
  return { check, reads }
}

describe('the estimate the bars come from', () => {
  it('carries the fee, the bar to pass and the amount asked', () => {
    expect([ESTIMATE.cost, ESTIMATE.required, ESTIMATE.asked]).toEqual([COST, REQUIRED, ASKED])
  })
})

describe('whether a balance reaches a bar', () => {
  const CASES: { balance: bigint; required: boolean; asked: boolean }[] = [
    { balance: 0n, required: false, asked: false },
    { balance: REQUIRED - 1n, required: false, asked: false },
    { balance: REQUIRED, required: true, asked: false },
    { balance: BETWEEN, required: true, asked: false },
    { balance: ASKED - 1n, required: true, asked: false },
    { balance: ASKED, required: true, asked: true },
    { balance: ASKED + 1n, required: true, asked: true }
  ]

  CASES.forEach(({ balance, required, asked }) =>
    it(`a balance of ${balance} wei ${required ? 'reaches' : 'misses'} the bar to pass and ${
      asked ? 'reaches' : 'misses'
    } the amount asked`, () => {
      expect(reachesBar(ESTIMATE, balance)).toBe(required)
      expect(reachesBar(ESTIMATE, balance, 'required')).toBe(required)
      expect(reachesBar(ESTIMATE, balance, 'asked')).toBe(asked)
    })
  )
})

describe('the deposit step at the amount asked', () => {
  const stepAt = (balance: bigint, passBar?: GasPassBar) =>
    depositStepOf({
      write: 'save',
      key: KEY.addr,
      network: NETWORK,
      estimate: ESTIMATE,
      balance,
      operates: ACCOUNT_REF,
      transferFee: TRANSFER_FEE,
      ...(passBar ? { passBar } : {})
    })

  it('a balance between the two bars gets the step, short by the amount asked less the balance', () => {
    const step = stepAt(BETWEEN, 'asked')
    expect(step.balance).toBe(BETWEEN)
    expect(step.shortfall).toBe(BETWEEN_SHORTFALL)
    expect(step.routes.map((route) => route.kind)).toEqual(['transfer', 'outside'])
    expect(outsideOf(step).amount).toBe(BETWEEN_SHORTFALL)
    const [transfer] = step.routes
    expect(transfer.kind === 'transfer' && transfer.amount).toBe(
      BETWEEN_SHORTFALL + TRANSFER_FEE.asked
    )
    expect(transfer.kind === 'transfer' && transfer.fee).toEqual(TRANSFER_FEE)
  })

  it('one wei under the amount asked still gets the step, rounded up to what the step renders', () => {
    const step = stepAt(ASKED - 1n, 'asked')
    expect(step.shortfall).toBe(1n)
    expect(outsideOf(step).amount).toBe(1_000_000_000_000n)
  })
  ;[ASKED, ASKED + 1n].forEach((balance) =>
    it(`a balance of ${balance} wei holds the amount asked and gets no step`, () => {
      expect(() => stepAt(balance, 'asked')).toThrow(TypeError)
    })
  )

  it('the default bar is unchanged: a balance at or above the bar to pass gets no step', () => {
    expect(() => stepAt(BETWEEN)).toThrow(TypeError)
    expect(() => stepAt(REQUIRED)).toThrow(TypeError)
    expect(() => stepAt(BETWEEN, 'required')).toThrow(TypeError)
  })

  it('under the bar to pass, both bars build the same step for the amount asked less the balance', () => {
    const balance = REQUIRED - 1n
    expect(stepAt(balance).shortfall).toBe(ASKED - balance)
    expect(stepAt(balance, 'asked')).toEqual(stepAt(balance))
  })

  it('on the fast track the step at the amount asked offers the deposit from outside alone', () => {
    const step = depositStepOf({
      write: 'submission',
      key: KEY.addr,
      network: NETWORK,
      estimate: ESTIMATE,
      balance: BETWEEN,
      fastTrack: true,
      passBar: 'asked'
    })
    expect(step.fastTrack).toBe(true)
    expect(step.routes).toEqual([{ kind: 'outside', to: KEY.addr, amount: BETWEEN_SHORTFALL }])
  })
})

describe('the gas check at the amount asked', () => {
  ROUTES.forEach(({ write, fastTrack }) =>
    describe(`${write}${fastTrack ? ' on the fast track' : ''}`, () => {
      it('a balance between the two bars gets the deposit step for the amount asked less the balance', async () => {
        const { check, reads } = checkAt(write, fastTrack, BETWEEN, 'asked')
        const answer = await check
        if (answer.kind !== 'deposit') {
          throw new Error(`expected the deposit step, got ${answer.kind}`)
        }
        expect(answer.step.estimate).toEqual(ESTIMATE)
        expect(answer.step.shortfall).toBe(BETWEEN_SHORTFALL)
        expect(outsideOf(answer.step).amount).toBe(BETWEEN_SHORTFALL)
        expect(answer.step.routes.map((route) => route.kind)).toEqual(
          fastTrack ? ['outside'] : ['transfer', 'outside']
        )
        // Off the fast track the transfer's own fee is estimated, as on the normal path.
        expect(reads.estimateGas).toHaveBeenCalledTimes(fastTrack ? 1 : 2)
      })

      it('a balance at the amount asked is enough', async () => {
        expect((await checkAt(write, fastTrack, ASKED, 'asked').check).kind).toBe('enough')
      })

      it('one wei under the amount asked is short by that wei', async () => {
        const answer = await checkAt(write, fastTrack, ASKED - 1n, 'asked').check
        expect(answer.kind === 'deposit' && answer.step.shortfall).toBe(1n)
      })

      it('the default bar is unchanged: the same balance between the bars is enough', async () => {
        expect((await checkAt(write, fastTrack, BETWEEN).check).kind).toBe('enough')
        expect((await checkAt(write, fastTrack, BETWEEN, 'required').check).kind).toBe('enough')
        expect((await checkAt(write, fastTrack, REQUIRED - 1n).check).kind).toBe('deposit')
      })
    })
  )
})
