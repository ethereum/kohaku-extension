/**
 * The gas step estimates the transaction's own gas through the extension's
 * provider (the SDK estimates nothing), names the sending key's address, the
 * amount and the network, and offers a transfer from another account this
 * wallet holds and a deposit from outside. The step is skipped when the key
 * already holds enough, and, for a write the key sends on the account's
 * behalf, when the account holds enough to pay the fee itself.
 */
import i18n from '@common/config/localization'
import type { Address } from '@kohaku-eth/social-recovery'
import { providerReadFailure } from '@web/modules/social-recovery/shared/client'
import {
  ACCOUNT,
  EXECUTION,
  GAS_KEYS,
  GWEI,
  initialWriteState,
  KEY,
  mockReads,
  NETWORK,
  OTHER_KEY,
  ownerTransaction,
  renderDepositStep,
  renderGasAmount,
  runGasCheck,
  stateAfterGasCheck,
  stepOf,
  SUBMISSION,
  transferTransactionOf,
  WRITE_KINDS,
  writeReducer
} from '@web/modules/social-recovery/shared/writes/__tests__/harness'
import type {
  DataCall,
  RecoveryCallCase
} from '@web/modules/social-recovery/shared/writes/__tests__/harness'

const same = (a: string, b: string) => a.toLowerCase() === b.toLowerCase()

describe('the gas check', () => {
  WRITE_KINDS.forEach((write) =>
    describe(write, () => {
      describe('a key that holds less than the estimate', () => {
        const short = () => mockReads({ balance: 0n, gas: 180_000n, price: 3n * GWEI })

        it('yields the deposit step, not enough', async () => {
          const check = await runGasCheck({ write, reads: short() })
          expect(check.kind).toBe('deposit')
        })

        it("names the sending key's address", async () => {
          expect(same(stepOf(await runGasCheck({ write, reads: short() })).key, KEY.addr)).toBe(
            true
          )
          const other = stepOf(await runGasCheck({ write, key: OTHER_KEY, reads: short() }))
          expect(same(other.key, OTHER_KEY.addr)).toBe(true)
        })

        it('carries the estimated amount: at least the estimate times the gas price', async () => {
          const step = stepOf(await runGasCheck({ write, reads: short() }))
          expect(step.estimate.gas).toBe(180_000n)
          expect(step.estimate.cost).toBe(180_000n * 3n * GWEI)
          expect(step.shortfall).toBeGreaterThanOrEqual(step.estimate.cost)
          step.routes.forEach((route) =>
            expect(route.amount).toBeGreaterThanOrEqual(step.shortfall)
          )
        })

        it('names the network the key must be funded on', async () => {
          const step = stepOf(await runGasCheck({ write, reads: short() }))
          expect(step.network.name).toBe(NETWORK.name)
        })

        it('offers both routes: a transfer from the account this wallet holds and a deposit from outside', async () => {
          const step = stepOf(await runGasCheck({ write, reads: short() }))
          expect(step.routes.map((route) => route.kind).sort()).toEqual(['outside', 'transfer'])
          step.routes.forEach((route) => expect(same(route.to, KEY.addr)).toBe(true))
          const transfer = step.routes.find((route) => route.kind === 'transfer')
          expect(transfer?.kind === 'transfer' && same(transfer.from.address, ACCOUNT)).toBe(true)
        })

        it('a key with some balance, still short, yields the step for what it lacks', async () => {
          const step = stepOf(
            await runGasCheck({
              write,
              reads: mockReads({ balance: 100_000n * GWEI, gas: 180_000n, price: 3n * GWEI })
            })
          )
          expect(step.balance).toBe(100_000n * GWEI)
          expect(step.shortfall).toBe(step.estimate.asked - step.balance)
        })

        it('goes to the deposit step rather than to submitting', async () => {
          const state = stateAfterGasCheck(await runGasCheck({ write, reads: short() }))
          expect(state.status).toBe('needsDeposit')
        })
      })

      describe('a key that holds enough', () => {
        const rich = () =>
          mockReads({ balance: 1_000_000_000_000_000_000n, gas: 180_000n, price: 3n * GWEI })

        it('yields enough', async () => {
          expect((await runGasCheck({ write, reads: rich() })).kind).toBe('enough')
        })

        it('skips the step: the write goes on to submitting', async () => {
          const state = stateAfterGasCheck(await runGasCheck({ write, reads: rich() }))
          expect(state.status).toBe('submitting')
        })
      })
    })
  )

  describe('the fast track', () => {
    ;(['submission', 'execution'] as const).forEach((write) =>
      it(`${write}: the step names the sending key and offers the deposit from outside into its address`, async () => {
        const step = stepOf(
          await runGasCheck({
            write,
            fastTrack: true,
            reads: mockReads({ balance: 0n, gas: 90_000n })
          })
        )
        expect(step.fastTrack).toBe(true)
        expect(same(step.key, KEY.addr)).toBe(true)
        expect(step.network.name).toBe(NETWORK.name)
        const outside = step.routes.find((route) => route.kind === 'outside')
        expect(outside && same(outside.to, KEY.addr)).toBe(true)
      })
    )
  })

  describe('the estimate is for that transaction, through the provider', () => {
    // A short key off the fast track makes two estimates: the write's own
    // transaction first, then the transfer route's own, for its fee. A key
    // that holds enough, or a step on the fast track, makes the first alone.
    it("asks the provider's estimate for the submission as prepared, sent from the sending key", async () => {
      const reads = mockReads({ balance: 0n, gas: 180_000n })
      await runGasCheck({ write: 'submission', reads })

      expect(reads.estimateGas).toHaveBeenCalledTimes(2)
      const [call] = reads.estimateGas.mock.calls[0]
      expect(same(call.from, KEY.addr)).toBe(true)
      expect(same(call.to, SUBMISSION.target)).toBe(true)
      expect(call.data).toBe(SUBMISSION.data)
    })

    it('another transaction gets its own estimate', async () => {
      const reads = mockReads({ balance: 0n, gas: 180_000n })
      await runGasCheck({ write: 'execution', reads })

      const [call] = reads.estimateGas.mock.calls[0]
      expect(same(call.to, EXECUTION.target)).toBe(true)
      expect(call.data).toBe(EXECUTION.data)
    })
    ;(['save', 'edit', 'ownerWrite', 'cancel'] as const).forEach((write) =>
      it(`${write}: asks the estimate for the transaction the key sends for that write, then the transfer's`, async () => {
        const reads = mockReads({ balance: 0n, gas: 180_000n })
        await runGasCheck({ write, reads })

        expect(reads.estimateGas).toHaveBeenCalledTimes(2)
        expect(reads.estimateGas.mock.calls[0][0]).toEqual(ownerTransaction(write))
        expect(reads.estimateGas.mock.calls[1][0]).toEqual(transferTransactionOf(ACCOUNT, KEY.addr))
      })
    )

    it("a key that holds enough, or a step on the fast track, asks one estimate: the write's own", async () => {
      const rich = mockReads({ balance: 1_000_000_000_000_000_000n, gas: 180_000n })
      await runGasCheck({ write: 'submission', reads: rich })
      expect(rich.estimateGas).toHaveBeenCalledTimes(1)

      const fast = mockReads({ balance: 0n, gas: 180_000n })
      await runGasCheck({ write: 'submission', fastTrack: true, reads: fast })
      expect(fast.estimateGas).toHaveBeenCalledTimes(1)
      expect(fast.estimateGas.mock.calls[0][0].data).toBe(SUBMISSION.data)
    })

    it("the transfer route's amount carries the transfer's own fee; the deposit from outside the shortfall", async () => {
      const gas = (call: DataCall) =>
        call.data === transferTransactionOf(ACCOUNT, KEY.addr).data ? 40_000n : 180_000n
      const step = stepOf(
        await runGasCheck({ write: 'submission', reads: mockReads({ balance: 0n, gas }) })
      )
      const transfer = step.routes.find((route) => route.kind === 'transfer')
      const outside = step.routes.find((route) => route.kind === 'outside')
      if (transfer?.kind !== 'transfer' || !outside) {
        throw new Error('expected both routes')
      }
      expect(transfer.fee.gas).toBeGreaterThanOrEqual(40_000n)
      expect(transfer.amount).toBeGreaterThanOrEqual(step.shortfall + transfer.fee.asked)
      expect(outside.amount).toBeGreaterThanOrEqual(step.shortfall)
      expect(outside.amount).toBeLessThan(transfer.amount)
    })

    it("reads the sending key's balance through the provider", async () => {
      const reads = mockReads({ balance: 0n, gas: 180_000n })
      await runGasCheck({ write: 'submission', key: OTHER_KEY, reads })

      expect(reads.nativeBalance).toHaveBeenCalled()
      const addresses = reads.nativeBalance.mock.calls.map(([address]) => String(address))
      expect(addresses.every((address) => same(address, OTHER_KEY.addr))).toBe(true)
    })

    it('the amount follows the estimate of each transaction, not a constant', async () => {
      const perCall = (call: DataCall) => (call.data === SUBMISSION.data ? 150_000n : 450_000n)
      const submission = stepOf(
        await runGasCheck({ write: 'submission', reads: mockReads({ balance: 0n, gas: perCall }) })
      )
      const execution = stepOf(
        await runGasCheck({ write: 'execution', reads: mockReads({ balance: 0n, gas: perCall }) })
      )
      expect(submission.estimate.gas).toBe(150_000n)
      expect(execution.estimate.gas).toBe(450_000n)
      expect(execution.shortfall).toBeGreaterThan(submission.shortfall)
    })

    it('a larger estimate or a higher fee on the same transaction asks for more', async () => {
      const at = async (gas: bigint, price: bigint) =>
        stepOf(
          await runGasCheck({ write: 'submission', reads: mockReads({ balance: 0n, gas, price }) })
        )
      const base = await at(60_000n, GWEI)
      expect((await at(600_000n, GWEI)).shortfall).toBeGreaterThan(base.shortfall)
      expect((await at(60_000n, 30n * GWEI)).shortfall).toBeGreaterThan(base.shortfall)
    })

    it('the same balance is enough for a small estimate and short for a large one', async () => {
      const balance = 800_000n * GWEI
      const small = await runGasCheck({
        write: 'submission',
        reads: mockReads({ balance, gas: 21_000n, price: 2n * GWEI })
      })
      const large = await runGasCheck({
        write: 'submission',
        reads: mockReads({ balance, gas: 5_000_000n, price: 2n * GWEI })
      })
      expect(small.kind).toBe('enough')
      expect(large.kind).toBe('deposit')
    })
  })
})

describe("the gas check of a write the key sends on the account's behalf", () => {
  const OWNER_WRITES = ['save', 'edit', 'ownerWrite', 'cancel'] as const
  const GAS = 200_000n
  const PRICE = 3n * GWEI
  /** The bar to pass for this estimate: 0.00066 ETH; the amount asked: 0.0009 ETH. */
  const REQUIRED = 660_000_000_000_000n
  const ASKED = 900_000_000_000_000n
  /** A balance above the bar to pass and below the amount asked. */
  const BETWEEN = 700_000_000_000_000n
  /** A balance far above any fee. */
  const RICH = 1_000_000_000_000_000_000n

  const readsOf = (key: bigint, account: bigint) =>
    mockReads({ balance: key, accountBalance: account, gas: GAS, price: PRICE })
  const balanceReadsOf = (reads: ReturnType<typeof readsOf>) =>
    reads.nativeBalance.mock.calls.map(([address]) => String(address).toLowerCase())

  OWNER_WRITES.forEach((write) =>
    describe(write, () => {
      it("passes with the key at zero where the account holds the bar to pass, and the write goes on to the sign request with the key's balance", async () => {
        const reads = readsOf(0n, REQUIRED)
        const check = await runGasCheck({ write, reads })

        expect(check).toMatchObject({ kind: 'enough', write, balance: 0n })
        expect(check.kind === 'enough' && same(check.key, KEY.addr)).toBe(true)
        expect(stateAfterGasCheck(check).status).toBe('submitting')
        expect(reads.estimateGas).toHaveBeenCalledTimes(1)
      })

      it('passes with the account at zero where the key holds the bar to pass', async () => {
        const check = await runGasCheck({ write, reads: readsOf(REQUIRED, 0n) })

        expect(check).toMatchObject({ kind: 'enough', balance: REQUIRED })
        expect(stateAfterGasCheck(check).status).toBe('submitting')
      })

      it("shows the key's deposit step where both hold less than the bar, with the note that the account can pay once it holds the amount asked", async () => {
        const held = REQUIRED - 1n
        const check = await runGasCheck({ write, reads: readsOf(held, held) })
        const step = stepOf(check)

        expect(stateAfterGasCheck(check).status).toBe('needsDeposit')
        expect(same(step.key, KEY.addr)).toBe(true)
        expect(step.balance).toBe(held)
        expect(step.shortfall).toBe(ASKED - held)
        expect(step.routes.map((route) => route.kind)).toEqual(['transfer', 'outside'])
        expect(step.accountPays).toBe(true)
        expect(renderDepositStep(step).notes).toContain(
          i18n.t(GAS_KEYS.accountCanPay, {
            amount: renderGasAmount(ASKED, NETWORK.nativeAssetSymbol)
          })
        )
      })

      it("reads the key's balance alone where the account is left out of paying, and shows the key's deposit step with no note that the account can pay, however much the account holds", async () => {
        const reads = readsOf(0n, RICH)
        const check = await runGasCheck({ write, reads, accountPays: false })
        const step = stepOf(check)

        expect(balanceReadsOf(reads)).toEqual([KEY.addr.toLowerCase()])
        expect(stateAfterGasCheck(check).status).toBe('needsDeposit')
        expect(same(step.key, KEY.addr)).toBe(true)
        expect(step.balance).toBe(0n)
        expect(step.shortfall).toBe(ASKED)
        expect(step.accountPays).toBe(false)
        expect(renderDepositStep(step).notes).not.toContain(
          i18n.t(GAS_KEYS.accountCanPay, {
            amount: renderGasAmount(ASKED, NETWORK.nativeAssetSymbol)
          })
        )
      })

      it('passes on the key alone where the account is left out of paying and the key holds the bar to pass', async () => {
        const reads = readsOf(REQUIRED, 0n)
        const check = await runGasCheck({ write, reads, accountPays: false })

        expect(check).toMatchObject({ kind: 'enough', balance: REQUIRED })
        expect(balanceReadsOf(reads)).toEqual([KEY.addr.toLowerCase()])
      })

      it("reads the key's balance and the balance of the account the key operates", async () => {
        const reads = readsOf(0n, 0n)
        await runGasCheck({ write, reads })

        expect(balanceReadsOf(reads).sort()).toEqual(
          [KEY.addr.toLowerCase(), ACCOUNT.toLowerCase()].sort()
        )
      })

      it('rejects with the failed read where the account balance read fails, and the write reads that as a gas read error', async () => {
        const failure = providerReadFailure('nativeBalance', new Error('node down'))
        const reads = readsOf(1_000_000_000_000_000_000n, 0n)
        reads.nativeBalance.mockImplementation(async (address: Address) => {
          if (same(address, ACCOUNT)) {
            throw failure
          }
          return 1_000_000_000_000_000_000n
        })
        const thrown = await runGasCheck({ write, reads }).catch((error: unknown) => error)

        expect(thrown).toBe(failure)
        const checking = writeReducer(initialWriteState(write), { type: 'start' })
        const state = writeReducer(checking, { type: 'error', run: checking.run, error: thrown })
        expect(state.status).toBe('gasReadError')
      })
    })
  )

  describe('the check at the amount asked', () => {
    it('reads both balances again and passes an account that holds the amount asked', async () => {
      const reads = readsOf(0n, ASKED)
      const check = await runGasCheck({ write: 'save', reads, passBar: 'asked' })

      expect(check.kind).toBe('enough')
      expect(balanceReadsOf(reads).sort()).toEqual(
        [KEY.addr.toLowerCase(), ACCOUNT.toLowerCase()].sort()
      )
    })

    it("shows the key's deposit step where the account holds the bar to pass but less than the amount asked", async () => {
      const step = stepOf(
        await runGasCheck({ write: 'save', reads: readsOf(0n, BETWEEN), passBar: 'asked' })
      )
      expect(step.balance).toBe(0n)
      expect(step.shortfall).toBe(ASKED)
    })

    it('passes the same account where the check runs at its default bar', async () => {
      expect((await runGasCheck({ write: 'save', reads: readsOf(0n, BETWEEN) })).kind).toBe(
        'enough'
      )
    })
  })

  describe('the check again after the sign screen read the payer short', () => {
    it("reads the key alone where the account is left out of paying, and shows the key's deposit step though the account holds the amount asked", async () => {
      const reads = readsOf(0n, ASKED)
      const check = await runGasCheck({
        write: 'save',
        reads,
        passBar: 'asked',
        accountPays: false
      })
      const step = stepOf(check)

      expect(balanceReadsOf(reads)).toEqual([KEY.addr.toLowerCase()])
      expect(step.balance).toBe(0n)
      expect(step.shortfall).toBe(ASKED)
      expect(step.accountPays).toBe(false)
    })
  })

  describe("a recovery call is paid by the recoverer's own key", () => {
    const RECOVERY_CALLS: RecoveryCallCase[] = [
      { name: 'a submission', write: 'submission', fastTrack: false },
      { name: 'an execution', write: 'execution', fastTrack: false },
      { name: 'a submission on the fast track', write: 'submission', fastTrack: true },
      { name: 'an execution on the fast track', write: 'execution', fastTrack: true }
    ]

    RECOVERY_CALLS.forEach(({ name, write, fastTrack }) =>
      it(`${name} reads the key's balance alone, and a funded account does not spare the key its deposit step`, async () => {
        const reads = readsOf(0n, 1_000_000_000_000_000_000n)
        const check = await runGasCheck({ write, fastTrack, reads })

        expect(balanceReadsOf(reads)).toEqual([KEY.addr.toLowerCase()])
        expect(stepOf(check).balance).toBe(0n)
        expect(stepOf(check).accountPays).toBe(false)
      })
    )
  })
})
