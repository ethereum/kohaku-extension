/**
 * The gas check asks for more than it needs to pass. The amount the deposit
 * step names is the estimated fee plus the larger headroom; the bar a balance
 * must reach to pass is the fee plus the smaller one. A holder who sends the
 * amount asked and presses Continue passes the check run again, even where the
 * fee rose in between, as long as the rise stays inside the gap between the
 * two. A rise past it asks again, for the new amount less what the key holds.
 * Every write that uses the shared step keeps this, the fast track included.
 */
import { submissionCheckOf } from '@web/modules/social-recovery/onboarding/fast-track'
import {
  ACCOUNT,
  checkGas,
  gasEstimateOf,
  GWEI,
  holdsEnough,
  KEY,
  mockReads,
  NETWORK,
  runGasCheck,
  stepOf,
  SUBMISSION,
  transferFeeOf,
  transferTransactionOf,
  WRITE_KINDS
} from '@web/modules/social-recovery/shared/writes/__tests__/harness'
import type {
  DataCall,
  DepositStep,
  FeeHeadroom,
  GasCheck,
  WriteKind
} from '@web/modules/social-recovery/shared/writes/__tests__/harness'

const GAS = 180_000n
const PRICE = 2n * GWEI
/** The fee of the write at `PRICE`: 0.00036 ETH. */
const COST = GAS * PRICE

/** The gas price after a rise of `percent` percent. */
const raisedBy = (percent: bigint): bigint => (PRICE * (100n + percent)) / 100n

const outsideAmountOf = (step: DepositStep): bigint => {
  const outside = step.routes.find((route) => route.kind === 'outside')
  if (!outside) {
    throw new Error('expected the deposit from outside')
  }
  return outside.amount
}

/** Every write on the route it takes; the recovery calls also on the fast track. */
const ROUTES: { write: WriteKind; fastTrack: boolean }[] = [
  ...WRITE_KINDS.map((write) => ({ write, fastTrack: false })),
  { write: 'submission', fastTrack: true },
  { write: 'execution', fastTrack: true }
]

const checkAt = (
  write: WriteKind,
  fastTrack: boolean,
  balance: bigint,
  price: bigint
): Promise<GasCheck> =>
  runGasCheck({ write, fastTrack, reads: mockReads({ balance, gas: GAS, price }) })

describe('a deposit of the amount asked, then the check run again', () => {
  ROUTES.forEach(({ write, fastTrack }) =>
    describe(`${write}${fastTrack ? ' on the fast track' : ''}`, () => {
      ;[0n, 100_000n * GWEI].forEach((held) => {
        const label = held === 0n ? 'an empty key' : 'a key that holds some'

        it(`${label}: the step asks for the fee plus half, less what the key holds`, async () => {
          const step = stepOf(await checkAt(write, fastTrack, held, PRICE))
          expect(step.estimate.asked).toBe((COST * 150n) / 100n)
          expect(step.shortfall).toBe((COST * 150n) / 100n - held)
          expect(outsideAmountOf(step)).toBe(step.shortfall)
        })

        it(`${label}: passes at the same fee once the amount asked lands`, async () => {
          const step = stepOf(await checkAt(write, fastTrack, held, PRICE))
          const funded = held + outsideAmountOf(step)
          expect((await checkAt(write, fastTrack, funded, PRICE)).kind).toBe('enough')
        })

        it(`${label}: passes after a fee rise inside the gap between the amount asked and the bar`, async () => {
          const step = stepOf(await checkAt(write, fastTrack, held, PRICE))
          const funded = held + outsideAmountOf(step)
          // The fee plus a tenth stays under the fee plus half up to a rise of 36%.
          const rises = [10n, 30n, 36n]
          const again = await Promise.all(
            rises.map((rise) => checkAt(write, fastTrack, funded, raisedBy(rise)))
          )
          expect(again.map((check, index) => [rises[index], check.kind])).toEqual(
            rises.map((rise) => [rise, 'enough'])
          )
        })

        it(`${label}: a rise past the bar asks again for the new amount asked less the balance`, async () => {
          const step = stepOf(await checkAt(write, fastTrack, held, PRICE))
          const funded = held + outsideAmountOf(step)
          const risen = raisedBy(40n)

          const again = stepOf(await checkAt(write, fastTrack, funded, risen))
          const newCost = GAS * risen
          expect(again.estimate.cost).toBe(newCost)
          expect(again.estimate.asked).toBe((newCost * 150n) / 100n)
          expect(again.balance).toBe(funded)
          expect(again.shortfall).toBe(again.estimate.asked - funded)
          expect(outsideAmountOf(again)).toBeGreaterThanOrEqual(again.shortfall)

          const refunded = funded + outsideAmountOf(again)
          expect((await checkAt(write, fastTrack, refunded, risen)).kind).toBe('enough')
        })
      })
    })
  )
})

describe('the amount shown uses the headroom asked, the pass uses the bar', () => {
  // A fee of 333,333 wei: plus half is 499,999.5, plus a tenth 366,666.3; both round up.
  const reads = (balance: bigint) => mockReads({ balance, gas: 333_333n, price: 1n })

  it('the estimate carries both amounts, each rounded up to the wei', () => {
    const estimate = gasEstimateOf(333_333n, 1n)
    expect(estimate.cost).toBe(333_333n)
    expect(estimate.asked).toBe(500_000n)
    expect(estimate.required).toBe(366_667n)
  })

  it('a balance at the bar passes, though it holds less than the amount asked', async () => {
    const check = await runGasCheck({ write: 'save', reads: reads(366_667n) })
    expect(check.kind).toBe('enough')
    expect(holdsEnough(gasEstimateOf(333_333n, 1n), 366_667n)).toBe(true)
  })

  it('a balance one wei under the bar gets the step, which asks up to the amount asked, not the bar', async () => {
    const step = stepOf(await runGasCheck({ write: 'save', reads: reads(366_666n) }))
    expect(step.shortfall).toBe(500_000n - 366_666n)
    expect(holdsEnough(step.estimate, 366_666n)).toBe(false)
  })

  it('the amount the route shows rounds up to the millionth of an ether the step renders', async () => {
    const step = stepOf(await runGasCheck({ write: 'save', reads: reads(366_666n) }))
    expect(outsideAmountOf(step)).toBe(1_000_000_000_000n)
  })
})

describe("the transfer route's amount", () => {
  const TRANSFER_GAS = 40_000n
  const transferData = transferTransactionOf(ACCOUNT, KEY.addr).data
  const gas = (call: DataCall) => (call.data === transferData ? TRANSFER_GAS : GAS)

  const transferOf = (step: DepositStep) => {
    const transfer = step.routes.find((route) => route.kind === 'transfer')
    if (transfer?.kind !== 'transfer') {
      throw new Error('expected the transfer route')
    }
    return transfer
  }

  it("is the shortfall plus the transfer's own fee asked, both with the larger headroom", async () => {
    const step = stepOf(
      await runGasCheck({ write: 'save', reads: mockReads({ balance: 0n, gas, price: PRICE }) })
    )
    const transfer = transferOf(step)
    expect(transfer.fee).toEqual(transferFeeOf(TRANSFER_GAS, PRICE))
    expect(transfer.fee.asked).toBe(((TRANSFER_GAS + 34_000n) * PRICE * 150n) / 100n)
    expect(transfer.amount).toBe(step.shortfall + transfer.fee.asked)
  })

  it('a key that takes the transfer and pays its fee passes the check run again after a rise inside the gap', async () => {
    const step = stepOf(
      await runGasCheck({ write: 'save', reads: mockReads({ balance: 0n, gas, price: PRICE }) })
    )
    const transfer = transferOf(step)
    const risen = raisedBy(30n)
    // The key sends the transfer and pays its fee at the risen price.
    const afterTransfer = transfer.amount - transfer.fee.gas * risen

    const again = await runGasCheck({
      write: 'save',
      reads: mockReads({ balance: afterTransfer, gas, price: risen })
    })
    expect(again.kind).toBe('enough')
  })
})

describe('the headrooms a caller passes', () => {
  const REFUSED: { named: string; headroom: FeeHeadroom }[] = [
    { named: 'a fraction asked', headroom: { askPercent: 50.5, passPercent: 10 } },
    { named: 'a fraction to pass', headroom: { askPercent: 50, passPercent: 10.5 } },
    { named: 'a negative amount asked', headroom: { askPercent: -1, passPercent: -1 } },
    { named: 'a negative bar', headroom: { askPercent: 50, passPercent: -10 } },
    { named: 'not a number', headroom: { askPercent: Number.NaN, passPercent: 10 } },
    { named: 'an endless headroom', headroom: { askPercent: Infinity, passPercent: 10 } },
    { named: 'a bar above the amount asked', headroom: { askPercent: 10, passPercent: 50 } }
  ]

  REFUSED.forEach(({ named, headroom }) =>
    it(`refuses ${named} with a RangeError, in the estimate, the transfer's fee and the check`, async () => {
      expect(() => gasEstimateOf(GAS, PRICE, headroom)).toThrow(RangeError)
      expect(() => transferFeeOf(GAS, PRICE, headroom)).toThrow(RangeError)
      await expect(
        checkGas({
          write: 'submission',
          prepared: SUBMISSION,
          key: KEY,
          reads: mockReads({ balance: 0n, gas: GAS, price: PRICE }),
          network: NETWORK,
          fastTrack: true,
          feeHeadroom: headroom
        })
      ).rejects.toThrow(RangeError)
    })
  )

  it('takes equal headrooms, where the amount asked is the bar', () => {
    const estimate = gasEstimateOf(GAS, PRICE, { askPercent: 20, passPercent: 20 })
    expect(estimate.asked).toBe((COST * 120n) / 100n)
    expect(estimate.required).toBe(estimate.asked)
    const none = gasEstimateOf(GAS, PRICE, { askPercent: 0, passPercent: 0 })
    expect([none.asked, none.required]).toEqual([COST, COST])
  })

  it('the check asks and passes with the headrooms it was given', async () => {
    const check = (balance: bigint) =>
      checkGas({
        write: 'submission',
        prepared: SUBMISSION,
        key: KEY,
        reads: mockReads({ balance, gas: GAS, price: PRICE }),
        network: NETWORK,
        fastTrack: true,
        feeHeadroom: { askPercent: 30, passPercent: 20 }
      })
    expect(stepOf(await check(0n)).shortfall).toBe((COST * 130n) / 100n)
    expect((await check((COST * 120n) / 100n)).kind).toBe('enough')
    expect((await check((COST * 120n) / 100n - 1n)).kind).toBe('deposit')
  })
})

describe("the fast track's own check for the submission", () => {
  const FAST_GAS = 100_000n
  const check = (balance: bigint, price: bigint) =>
    submissionCheckOf({
      reads: { gasPrice: async () => price, nativeBalance: async () => balance },
      key: KEY.addr,
      network: NETWORK,
      gas: FAST_GAS
    })

  it('asks for the fee plus half and passes at the fee plus a tenth', async () => {
    const cost = FAST_GAS * PRICE
    const step = stepOf(await check(0n, PRICE))
    expect(step.shortfall).toBe((cost * 150n) / 100n)
    expect((await check((cost * 110n) / 100n, PRICE)).kind).toBe('enough')
    expect((await check((cost * 110n) / 100n - 1n, PRICE)).kind).toBe('deposit')
  })

  it('a deposit of the amount asked passes after a rise inside the gap, and a rise past the bar asks again', async () => {
    const step = stepOf(await check(0n, PRICE))
    const funded = outsideAmountOf(step)
    expect((await check(funded, raisedBy(30n))).kind).toBe('enough')

    const again = stepOf(await check(funded, raisedBy(40n)))
    expect(again.shortfall).toBe(again.estimate.asked - funded)
    expect(again.estimate.asked).toBe((FAST_GAS * raisedBy(40n) * 150n) / 100n)
  })
})
