/**
 * The gas check of a save the account runs as one batch, over the transaction
 * the client builds for it through the account library
 * (`accountBatchTransactionOf`): the account's own execute where it has code,
 * the factory's deploy-and-execute where it has none. The account is the
 * library's own, controlled by the sending key.
 *
 * The deploy-and-execute carries the library's stand-in signature, which the
 * account accepts only where the transaction's origin is one of the
 * simulation origins. `spoofOriginNode` is a node that answers so: it reverts
 * an estimate of a transaction to the factory from any other sender.
 */
import { AMBIRE_ACCOUNT_FACTORY, DEPLOYLESS_SIMULATION_FROM } from '@ambire-common/consts/deploy'
import type { Account } from '@ambire-common/interfaces/account'
import { dedicatedToOneSAPriv } from '@ambire-common/interfaces/keystore'
import { getSmartAccount } from '@ambire-common/libs/account/account'
import type { Network } from '@ambire-common/interfaces/network'
import type { Address } from '@web/modules/social-recovery/sdk-interfaces'
import {
  accountBatchTransactionOf,
  createChainReads,
  isProviderReadFailure,
  isRevertedCall,
  sameAddress,
  type ChainReadsProvider,
  type GasEstimateCall
} from '@web/modules/social-recovery/shared/client'

import {
  ACCOUNT_FACTORY,
  accountFactoryOf,
  GWEI,
  initialWriteState,
  KEY,
  mockReads,
  nodeRevert,
  OTHER_KEY,
  readingOf,
  runGasCheck,
  SAVE,
  stepOf,
  writeReducer
} from '@web/modules/social-recovery/shared/writes/__tests__/harness'

const SEPOLIA = { chainId: 11155111n, name: 'Sepolia' } as Network

/** The origins the account accepts the stand-in signature from: address(1) and address(6969). */
const SIMULATION_ORIGINS = [
  DEPLOYLESS_SIMULATION_FROM,
  '0x0000000000000000000000000000000000001b39'
]

/** A factory other than the library's, which an account's creation record may name. */
const OTHER_FACTORY: Address = '0xfa00000000000000000000000000000000000fac'

let account: Account
let otherFactoryAccount: Account

beforeAll(async () => {
  account = await getSmartAccount([{ addr: KEY.addr, hash: dedicatedToOneSAPriv }], [])
  otherFactoryAccount = {
    ...account,
    creation: { ...account.creation!, factoryAddr: OTHER_FACTORY }
  }
})

/** The account's state as the wallet reads it, with or without code. */
const stateOf = (isDeployed: boolean) =>
  ({
    accountAddr: account.addr,
    isDeployed,
    isEOA: false,
    isV2: true,
    nonce: 0n
  } as never)

const transactionFor = (deployed: boolean, of: Account = account) =>
  accountBatchTransactionOf(
    { account: of, state: stateOf(deployed), network: SEPOLIA },
    KEY,
    SAVE.calls
  )

/** The transfer route's own transaction, built through the library: one call to the key, no value. */
const transferFor = (deployed: boolean, of: Account = account) =>
  accountBatchTransactionOf({ account: of, state: stateOf(deployed), network: SEPOLIA }, KEY, [
    { ...SAVE.calls[0], target: KEY.addr, value: 0n, data: '0x' }
  ])

const operatesFor = (deployed: boolean, factory?: Address) => ({
  address: account.addr as Address,
  name: 'Account 1',
  deployed,
  ...(factory ? { factory } : {})
})

/**
 * The client's own chain reads over a node that reverts an estimate of a
 * transaction to `factory` unless it comes from a simulation origin, and
 * answers `gas` for every other. `reverts` makes it revert every estimate.
 * Each estimate the node was asked for is kept in `asked`.
 */
const spoofOriginNode = ({
  balance,
  gas,
  factory = ACCOUNT_FACTORY,
  reverts = false
}: {
  balance: bigint
  gas: bigint
  factory?: Address
  reverts?: boolean
}) => {
  const asked: { from: string; to: string; data: string }[] = []
  const balanceOf: string[] = []
  const provider = {
    getBalance: async (address: string) => {
      balanceOf.push(address)
      return balance
    },
    estimateGas: async (call: { from?: unknown; to?: unknown; data?: unknown }) => {
      const from = String(call.from)
      const to = String(call.to)
      asked.push({ from, to, data: String(call.data) })
      const spoofRefused =
        sameAddress(to, factory) && !SIMULATION_ORIGINS.some((origin) => sameAddress(origin, from))
      if (reverts || spoofRefused) {
        throw nodeRevert()
      }
      return gas
    },
    send: async () => `0x${(2n * GWEI).toString(16)}`
  } as unknown as ChainReadsProvider
  return { reads: createChainReads(provider), asked, balanceOf }
}

describe("the gas check of an account's batch, over the library's transaction", () => {
  const STATES: [string, boolean][] = [
    ['with code', true],
    ['with no code yet', false]
  ]
  STATES.forEach(([title, deployed]) =>
    describe(`for an account ${title}`, () => {
      it('estimates that transaction itself, and answers enough for a key that holds enough', async () => {
        const transaction = transactionFor(deployed)
        const reads = mockReads({ balance: 10n ** 18n, gas: 250_000n })
        const check = await runGasCheck({
          write: 'save',
          prepared: SAVE,
          transaction,
          operates: operatesFor(deployed),
          reads
        })
        expect(check.kind).toBe('enough')
        expect(reads.estimateGas).toHaveBeenCalledTimes(1)
        expect(reads.estimateGas).toHaveBeenCalledWith(
          deployed ? transaction : { ...transaction, from: DEPLOYLESS_SIMULATION_FROM }
        )
        expect(reads.nativeBalance).toHaveBeenCalledWith(KEY.addr)
      })

      it('answers the deposit step for a key that holds too little', async () => {
        const reads = mockReads({ balance: 0n, gas: 250_000n, price: 2n * GWEI })
        const step = stepOf(
          await runGasCheck({
            write: 'save',
            prepared: SAVE,
            transaction: transactionFor(deployed),
            operates: operatesFor(deployed),
            reads
          })
        )
        expect(step.estimate.gas).toBe(250_000n)
        expect(step.key).toBe(KEY.addr)
      })
    })
  )

  it('sends the undeployed transaction to the factory the check accepts', () => {
    expect(transactionFor(false).to).toBe(ACCOUNT_FACTORY)
  })

  it('prices the transfer route for an account with code, and drops it for one with none', async () => {
    const short = () => mockReads({ balance: 0n, gas: 250_000n })
    const withCode = stepOf(
      await runGasCheck({
        write: 'save',
        prepared: SAVE,
        transaction: transactionFor(true),
        operates: operatesFor(true),
        reads: short()
      })
    )
    expect(withCode.routes.map((route) => route.kind)).toEqual(['transfer', 'outside'])
    const noCode = stepOf(
      await runGasCheck({
        write: 'save',
        prepared: SAVE,
        transaction: transactionFor(false),
        operates: operatesFor(false),
        reads: short()
      })
    )
    expect(noCode.routes.map((route) => route.kind)).toEqual(['outside'])
  })

  it("refuses the library's transaction when another key is said to send it", async () => {
    const reads = mockReads({ balance: 10n ** 18n, gas: 250_000n })
    await expect(
      runGasCheck({
        write: 'save',
        prepared: SAVE,
        key: OTHER_KEY,
        transaction: transactionFor(true),
        operates: operatesFor(true),
        reads
      })
    ).rejects.toThrow(TypeError)
    expect(reads.estimateGas).not.toHaveBeenCalled()
  })

  it('refuses a deploy-and-execute another key sends before any read, though the estimate would run from the simulation sender', async () => {
    const reads = mockReads({ balance: 10n ** 18n, gas: 250_000n })
    await expect(
      runGasCheck({
        write: 'save',
        prepared: SAVE,
        transaction: { ...transactionFor(false), from: OTHER_KEY.addr },
        operates: operatesFor(false),
        reads
      })
    ).rejects.toThrow(TypeError)
    expect(reads.estimateGas).not.toHaveBeenCalled()
    expect(reads.nativeBalance).not.toHaveBeenCalled()
    expect(reads.gasPrice).not.toHaveBeenCalled()
  })
})

describe('the deploy-and-execute of an account with no code, on a node that takes the stand-in signature from the simulation origins only', () => {
  it("passes: the estimate runs from the simulation sender with the same target and calldata, the balance read is the key's, and a funded key holds enough", async () => {
    const transaction = transactionFor(false)
    const node = spoofOriginNode({ balance: 10n ** 18n, gas: 310_000n })
    const check = await runGasCheck({
      write: 'save',
      prepared: SAVE,
      transaction,
      operates: operatesFor(false),
      reads: node.reads
    })
    expect(check).toMatchObject({ kind: 'enough', key: KEY.addr, estimate: { gas: 310_000n } })
    expect(node.asked).toEqual([
      { from: DEPLOYLESS_SIMULATION_FROM, to: transaction.to, data: transaction.data }
    ])
    expect(node.balanceOf).toEqual([KEY.addr])
  })

  it('answers the deposit step for an empty key, rather than a call never sent', async () => {
    const node = spoofOriginNode({ balance: 0n, gas: 310_000n })
    const step = stepOf(
      await runGasCheck({
        write: 'save',
        prepared: SAVE,
        transaction: transactionFor(false),
        operates: operatesFor(false),
        reads: node.reads
      })
    )
    expect(step.key).toBe(KEY.addr)
    expect(step.estimate.gas).toBe(310_000n)
    expect(step.routes.map((route) => route.kind)).toEqual(['outside'])
  })

  it('still estimates the batch of an account with code from the key, to the account', async () => {
    const transaction = transactionFor(true)
    const node = spoofOriginNode({ balance: 10n ** 18n, gas: 120_000n })
    const check = await runGasCheck({
      write: 'save',
      prepared: SAVE,
      transaction,
      operates: operatesFor(true),
      reads: node.reads
    })
    expect(check.kind).toBe('enough')
    expect(node.asked).toEqual([{ from: KEY.addr, to: account.addr, data: transaction.data }])
  })

  // A batch whose own calls revert reverts from any sender: the check reads
  // that revert as a call never sent, not as a read that could not run.
  it('reads an estimate that reverts from the simulation sender too as never sent', async () => {
    const node = spoofOriginNode({ balance: 10n ** 18n, gas: 310_000n, reverts: true })
    const thrown = await runGasCheck({
      write: 'save',
      prepared: SAVE,
      transaction: transactionFor(false),
      operates: operatesFor(false),
      reads: node.reads
    }).catch((error: unknown) => error)
    expect(node.asked.map(({ from }) => from)).toEqual([DEPLOYLESS_SIMULATION_FROM])
    expect(isRevertedCall(thrown)).toBe(true)
    expect(isProviderReadFailure(thrown)).toBe(false)
    const checking = writeReducer(initialWriteState('save'), { type: 'start' })
    const state = writeReducer(checking, { type: 'error', run: checking.run, error: thrown })
    expect(readingOf(state)).toBe('notSent')
  })
})

describe('the factory an account was created by', () => {
  it("is the library's factory where the account the key operates names none", () => {
    expect(accountFactoryOf(undefined)).toBe(AMBIRE_ACCOUNT_FACTORY)
    expect(accountFactoryOf(operatesFor(false))).toBe(AMBIRE_ACCOUNT_FACTORY)
    expect(accountFactoryOf(operatesFor(false, OTHER_FACTORY))).toBe(OTHER_FACTORY)
  })

  it('takes the batch of an account created by another factory where the account names it, and estimates it there from the simulation sender', async () => {
    const transaction = transactionFor(false, otherFactoryAccount)
    expect(transaction.to).toBe(OTHER_FACTORY)
    const node = spoofOriginNode({ balance: 10n ** 18n, gas: 310_000n, factory: OTHER_FACTORY })
    const check = await runGasCheck({
      write: 'save',
      prepared: SAVE,
      transaction,
      operates: operatesFor(false, OTHER_FACTORY),
      reads: node.reads
    })
    expect(check.kind).toBe('enough')
    expect(node.asked).toEqual([
      { from: DEPLOYLESS_SIMULATION_FROM, to: OTHER_FACTORY, data: transaction.data }
    ])
  })

  it('refuses the same batch before any read where the account names no factory', async () => {
    const reads = mockReads({ balance: 10n ** 18n, gas: 250_000n })
    await expect(
      runGasCheck({
        write: 'save',
        prepared: SAVE,
        transaction: transactionFor(false, otherFactoryAccount),
        operates: operatesFor(false),
        reads
      })
    ).rejects.toThrow(TypeError)
    expect(reads.estimateGas).not.toHaveBeenCalled()
  })

  it("refuses a batch to the library's factory where the account names another", async () => {
    const reads = mockReads({ balance: 10n ** 18n, gas: 250_000n })
    await expect(
      runGasCheck({
        write: 'save',
        prepared: SAVE,
        transaction: transactionFor(false),
        operates: operatesFor(false, OTHER_FACTORY),
        reads
      })
    ).rejects.toThrow(TypeError)
    expect(reads.estimateGas).not.toHaveBeenCalled()
  })

  it("prices the transfer route of an account with no code through the account's own factory, from the simulation sender", async () => {
    const transferTransaction = transferFor(false, otherFactoryAccount)
    expect(transferTransaction.to).toBe(OTHER_FACTORY)
    const reads = mockReads({ balance: 0n, gas: 250_000n })
    const step = stepOf(
      await runGasCheck({
        write: 'save',
        prepared: SAVE,
        transaction: transactionFor(false, otherFactoryAccount),
        transferTransaction,
        operates: operatesFor(false, OTHER_FACTORY),
        reads
      })
    )
    expect(step.routes.map((route) => route.kind)).toEqual(['transfer', 'outside'])
    expect(reads.estimateGas).toHaveBeenCalledTimes(2)
    expect(reads.estimateGas.mock.calls[1][0]).toEqual({
      ...transferTransaction,
      from: DEPLOYLESS_SIMULATION_FROM
    })
  })

  it("refuses a transfer route to the library's factory where the account names another, before any read", async () => {
    const reads = mockReads({ balance: 0n, gas: 250_000n })
    await expect(
      runGasCheck({
        write: 'save',
        prepared: SAVE,
        transaction: transactionFor(false, otherFactoryAccount),
        transferTransaction: transferFor(false),
        operates: operatesFor(false, OTHER_FACTORY),
        reads
      })
    ).rejects.toThrow(/^The transfer to estimate goes to/)
    expect(reads.estimateGas).not.toHaveBeenCalled()
  })

  it('estimates the batch and the transfer route of an account with code from the key, whatever factory the account names', async () => {
    const reads = mockReads({ balance: 0n, gas: 250_000n })
    await runGasCheck({
      write: 'save',
      prepared: SAVE,
      transaction: transactionFor(true, otherFactoryAccount),
      operates: operatesFor(true, OTHER_FACTORY),
      reads
    })
    const asked = (reads.estimateGas.mock.calls as [GasEstimateCall][]).map(([call]) => call)
    expect(asked.map(({ from, to }) => ({ from, to }))).toEqual([
      { from: KEY.addr, to: account.addr },
      { from: KEY.addr, to: account.addr }
    ])
  })
})
