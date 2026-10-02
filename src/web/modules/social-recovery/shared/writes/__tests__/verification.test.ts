/**
 * - An account with no code yet pays for its transfer through the factory's
 *   deploy-and-transfer, which the caller builds, so its route asks for more
 *   and a recheck after the transfer answers enough.
 * - A transfer estimate that reverts drops the transfer route and keeps the
 *   deposit from outside, rather than reading the check as not sent.
 * - Under an attempt read that says the attempt still runs, a decoded "no
 *   recovery is running" is not named, since the read contradicts it.
 * - A replaced transaction reads its own en.json sentence, never that it
 *   failed to reach the chain.
 * - A failed gas read names the gas check, not one read.
 */
import { DEPLOYLESS_SIMULATION_FROM } from '@ambire-common/consts/deploy'
import i18n from '@common/config/localization'
import { revertedCall, providerReadFailure } from '@web/modules/social-recovery/shared/client'

import {
  ACCOUNT,
  ACCOUNT_FACTORY,
  ACCOUNT_REF,
  ATTEMPT_STILL_RUNNING,
  canRetry,
  causeKey,
  copyOfState,
  copyOfStep,
  failThrown,
  failWithReceipt,
  GAS_KEYS,
  gasReadErrorFor,
  GWEI,
  KEY,
  kitError,
  mockReads,
  NETWORK,
  offersMoveFunds,
  ownerTransaction,
  readingOf,
  renderDepositStep,
  renderGasAmount,
  renderWriteState,
  replacedBy,
  rpcReads,
  runGasCheck,
  stepOf,
  text,
  transferTransactionOf,
  UNNAMED_CAUSE_KEY,
  VALUE_TRANSFER_GAS,
  withRun,
  WRITE_KINDS,
  writeReducer,
  WRITES_KEYS,
  initialWriteState
} from '@web/modules/social-recovery/shared/writes/__tests__/harness'

const t = i18n.t
const PRICE = 3n * GWEI
const WRITE_GAS = 180_000n
const DEPLOYED_TRANSFER_GAS = 46_000n
const DEPLOY_AND_TRANSFER_GAS = 310_000n

const UNDEPLOYED = { ...ACCOUNT_REF, deployed: false }
/** The factory's deploy-and-transfer the account library builds for an account with no code. */
const DEPLOY_AND_TRANSFER = {
  from: KEY.addr,
  to: ACCOUNT_FACTORY,
  data: '0x9c4ae2d0000000000000000000000000000000000000000000000000000000000000abcd' as const
}
const DEPLOYED_TRANSFER_DATA = transferTransactionOf(ACCOUNT, KEY.addr).data

const gasFor = (call: { data: string }) => {
  if (call.data === DEPLOY_AND_TRANSFER.data) {
    return DEPLOY_AND_TRANSFER_GAS
  }
  if (call.data === DEPLOYED_TRANSFER_DATA) {
    return DEPLOYED_TRANSFER_GAS
  }
  return WRITE_GAS
}

describe('an account with no code pays its transfer through the factory', () => {
  const transferOf = async (undeployed: boolean, balance = 0n) => {
    const reads = mockReads({ balance, gas: gasFor, price: PRICE })
    const step = stepOf(
      await runGasCheck({
        write: 'submission',
        reads,
        ...(undeployed ? { operates: UNDEPLOYED, transferTransaction: DEPLOY_AND_TRANSFER } : {})
      })
    )
    const transfer = step.routes.find((route) => route.kind === 'transfer')
    if (transfer?.kind !== 'transfer') {
      throw new Error('expected the transfer route')
    }
    return { step, transfer, reads }
  }

  it("estimates the caller's deploy-and-transfer, never a call to the empty account", async () => {
    const { reads } = await transferOf(true)
    expect(reads.estimateGas).toHaveBeenCalledTimes(2)
    expect(reads.estimateGas.mock.calls[1][0]).toEqual({
      ...DEPLOY_AND_TRANSFER,
      from: DEPLOYLESS_SIMULATION_FROM
    })
  })

  it("the undeployed account's transfer route asks for more than the deployed one's", async () => {
    const deployed = await transferOf(false)
    const undeployed = await transferOf(true)
    expect(undeployed.step.shortfall).toBe(deployed.step.shortfall)
    expect(undeployed.transfer.amount).toBeGreaterThan(deployed.transfer.amount)
    expect(undeployed.transfer.fee.gas).toBeGreaterThanOrEqual(DEPLOY_AND_TRANSFER_GAS)
  })

  it('after the deploy-and-transfer lands, the check run again answers enough', async () => {
    const before = 100_000n * GWEI
    const { transfer } = await transferOf(true, before)
    const cost = (DEPLOY_AND_TRANSFER_GAS + VALUE_TRANSFER_GAS) * PRICE
    const recheck = await runGasCheck({
      write: 'submission',
      reads: mockReads({ balance: before + transfer.amount - cost, gas: gasFor, price: PRICE })
    })
    expect(recheck.kind).toBe('enough')
  })

  it('with no deploy-and-transfer from the caller, the step offers the deposit from outside alone', async () => {
    const reads = mockReads({ balance: 0n, gas: gasFor, price: PRICE })
    const step = stepOf(await runGasCheck({ write: 'submission', reads, operates: UNDEPLOYED }))
    expect(step.routes.map((route) => route.kind)).toEqual(['outside'])
    expect(reads.estimateGas).toHaveBeenCalledTimes(1)
  })

  it('a save that deploys the account through its own transaction counts the account as having no code', async () => {
    const reads = mockReads({ balance: 0n, gas: gasFor, price: PRICE })
    const deploy = { ...ownerTransaction('save'), to: ACCOUNT_FACTORY }
    const step = stepOf(await runGasCheck({ write: 'save', reads, transaction: deploy }))
    expect(step.routes.map((route) => route.kind)).toEqual(['outside'])
    expect(reads.estimateGas.mock.calls.map(([call]) => call.to)).toEqual([ACCOUNT_FACTORY])
  })

  it('a transfer transaction for the undeployed account that goes to the account itself is refused', async () => {
    const reads = mockReads({ balance: 0n, gas: gasFor, price: PRICE })
    const toAccount = { ...DEPLOY_AND_TRANSFER, to: ACCOUNT }
    await expect(
      runGasCheck({
        write: 'submission',
        reads,
        operates: UNDEPLOYED,
        transferTransaction: toAccount
      })
    ).rejects.toThrow(TypeError)
    expect(reads.estimateGas).not.toHaveBeenCalled()
  })
})

describe('a transfer estimate that reverts drops the transfer route and keeps the deposit from outside', () => {
  const reverting = (call: { data: string }) => {
    if (call.data === DEPLOYED_TRANSFER_DATA) {
      throw revertedCall('estimateGas', '0x')
    }
    return WRITE_GAS
  }

  ;(['save', 'edit', 'ownerWrite', 'cancel'] as const).forEach((write) =>
    it(`${write}: the lone outside route in its own words, no transfer sentence`, async () => {
      const step = stepOf(
        await runGasCheck({
          write,
          reads: mockReads({ balance: 0n, gas: reverting, price: PRICE })
        })
      )
      expect(step.routes.map((route) => route.kind)).toEqual(['outside'])
      const r = renderDepositStep(step)
      expect(r.routes).toEqual([
        {
          kind: 'outside',
          line: t(GAS_KEYS.outsideRouteAlone, {
            amount: renderGasAmount(step.routes[0].amount, NETWORK.nativeAssetSymbol)
          })
        }
      ])
      expect(r.notes).not.toContain(t(GAS_KEYS.transferIsAnOperation))
      expect(r.notes).toContain(t(GAS_KEYS.networkOwner, { network: NETWORK.name }))
    })
  )
  ;(['submission', 'execution'] as const).forEach((write) =>
    it(`${write}: the lone outside route reads the recovery call's amount line`, async () => {
      const step = stepOf(
        await runGasCheck({
          write,
          reads: mockReads({ balance: 0n, gas: reverting, price: PRICE })
        })
      )
      const amount = renderGasAmount(step.routes[0].amount, NETWORK.nativeAssetSymbol)
      expect(copyOfStep(step)).toContain(
        t(write === 'execution' ? GAS_KEYS.executionAmount : GAS_KEYS.submissionAmount, {
          amount
        })
      )
    })
  )

  it('the check still answers the step: nothing reads as not sent', async () => {
    const check = await runGasCheck({
      write: 'submission',
      reads: mockReads({ balance: 0n, gas: reverting, price: PRICE })
    })
    expect(check.kind).toBe('deposit')
  })

  it('a transfer estimate the node could not answer is a failed gas read, not a dropped route', async () => {
    const reads = mockReads({ balance: 0n, gas: WRITE_GAS, price: PRICE })
    reads.estimateGas
      .mockResolvedValueOnce(WRITE_GAS)
      .mockRejectedValueOnce(providerReadFailure('estimateGas', new Error('node down')))
    const thrown = await runGasCheck({ write: 'submission', reads }).catch((error) => error)
    const checking = writeReducer(initialWriteState('submission'), { type: 'start' })
    expect(writeReducer(checking, { type: 'error', run: checking.run, error: thrown }).status).toBe(
      'gasReadError'
    )
  })
})

describe('a cancel revert under an attempt read that says the attempt still runs', () => {
  const STILL_RUNNING = { ended: ATTEMPT_STILL_RUNNING }
  const NO_RECOVERY_RUNNING = t(causeKey('NoActiveAttempt'))
  const NO_SETUP = t(causeKey('NoSetup'))

  it('after a decoded NoActiveAttempt, renders no "No recovery is running" sentence', () => {
    const state = failWithReceipt('cancel', kitError('NoActiveAttempt'), STILL_RUNNING)
    const reading = text(copyOfState(state))
    expect(NO_RECOVERY_RUNNING).toMatch(/no recovery is running/i)
    expect(reading).not.toContain(NO_RECOVERY_RUNNING)
    expect(reading).not.toMatch(/no recovery is running/i)
    expect(reading).toContain(t(UNNAMED_CAUSE_KEY))
    expect(canRetry(state)).toBe(true)
    expect(offersMoveFunds(state)).toBe(true)
  })

  it('after a decoded NoSetup, names no missing setup either', () => {
    const reading = text(copyOfState(failWithReceipt('cancel', kitError('NoSetup'), STILL_RUNNING)))
    expect(reading).not.toContain(NO_SETUP)
    expect(reading).toContain(t(UNNAMED_CAUSE_KEY))
  })

  it('the gone reading of a decoded NoActiveAttempt, then the read that says it still runs, drops the sentence', () => {
    const gone = withRun(failWithReceipt('cancel', kitError('NoActiveAttempt')))
    const read = writeReducer(gone, {
      type: 'attemptRead',
      run: gone.run,
      attemptAfter: STILL_RUNNING
    })
    expect(readingOf(read)).toBe('reverted')
    expect(text(copyOfState(read))).not.toContain(NO_RECOVERY_RUNNING)
    expect(text(copyOfState(read))).not.toMatch(/already gone/i)
  })

  it('another decoded cause under the same read is still named', () => {
    const reading = text(
      copyOfState(failWithReceipt('cancel', kitError('WrongAttemptId'), STILL_RUNNING))
    )
    expect(reading).toContain(t(causeKey('WrongAttemptId')))
  })
})

describe('the replaced reading reads its own en.json sentence', () => {
  WRITE_KINDS.forEach((write) =>
    it(`${write}: cancelled or replaced, the replaced line, never that it did not reach the chain`, () => {
      ;(['cancelled', 'replaced'] as const).forEach((reason) => {
        const r = renderWriteState(failThrown(write, replacedBy(reason)))
        expect(r.lines).toEqual([t(WRITES_KEYS.replaced)])
        expect(r.lines[0]).not.toMatch(/before it reached the chain|rejected/i)
        expect(r.lines[0]).not.toMatch(/gas it spent is gone/i)
        expect(r.retry).toBe(t(WRITES_KEYS.tryAgain))
      })
    })
  )

  it('says another transaction from the key took its place and nothing changed', () => {
    const line = t(WRITES_KEYS.replaced)
    expect(line).toMatch(/\banother transaction\b/i)
    expect(line).toMatch(/\bnothing changed\b/i)
  })

  it('a call the wallet never sent keeps the not-sent line', () => {
    const r = renderWriteState(failThrown('save', new Error('user rejected')))
    expect(r.lines).toEqual([t(WRITES_KEYS.notSent)])
  })
})

describe('a failed gas read names the gas check, not one read', () => {
  it('reads gasCheckFailed, which names the check and the node, and no balance', async () => {
    const reads = rpcReads({ balance: 0n, gas: new Error('socket hang up') })
    const thrown = await runGasCheck({ write: 'save', reads }).catch((error) => error)
    const checking = writeReducer(initialWriteState('save'), { type: 'start' })
    const r = renderWriteState(
      writeReducer(checking, { type: 'error', run: checking.run, error: thrown })
    )
    expect(r.lines).toEqual([t(WRITES_KEYS.gasCheckFailed)])
    expect(r.lines[0]).toMatch(/\bgas check\b/i)
    expect(r.lines[0]).not.toMatch(/\bbalance\b/i)
    expect(renderWriteState(gasReadErrorFor('save')).lines).toEqual(r.lines)
  })
})
