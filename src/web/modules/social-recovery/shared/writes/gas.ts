/**
 * The gas check and its deposit step.
 *
 * The check runs before every call a key the wallet holds sends. It estimates
 * that transaction's own gas and reads the gas price and the sending key's
 * balance through the extension's provider, since the SDK estimates nothing
 * and its provider answers no balance. A key that holds enough skips the step.
 * A key that holds too little gets the deposit step rather than a failed
 * transaction: the key's address, the estimated amount, the network the key
 * must be funded on and the routes that fill it.
 *
 * The routes: a transfer from another account this wallet holds, the account
 * the key operates, and a deposit from outside into the address the step
 * shows. The transfer is itself an operation that key sends and pays for, so
 * its amount is the shortfall plus the transfer's own fee, estimated through
 * the same provider: after the transfer lands, the check run again answers
 * enough. The deposit from outside asks for the shortfall alone. On the fast
 * track the key operates no account yet, so the step offers the deposit from
 * outside alone; on the logged-in route it offers both routes. The first
 * release configures no sponsor, and the step links to no service that hands
 * out test-network funds.
 */
import { Interface } from 'ethers'
import { etherUnits } from 'viem'

import { AMBIRE_ACCOUNT_FACTORY } from '@ambire-common/consts/deploy'
import type { Address, Hex } from '@web/modules/social-recovery/sdk-interfaces'
import type { GasEstimateCall } from '@web/modules/social-recovery/shared/client'
import { gasCallOf, isRevertedCall, sameAddress } from '@web/modules/social-recovery/shared/client'

import { assertWriteDoor, isRecoveryCall, payerOf } from './kinds'
import type {
  DepositRoute,
  DepositStep,
  DepositStepInput,
  GasCheck,
  GasCheckInput,
  GasEstimate
} from './types'

/**
 * The headroom the check adds to the fee it estimates, in percent. The step
 * asks for at most that amount and the exact amount follows the network fee
 * at sending, so a fee that rises a little between the check and the send
 * does not bring the step back.
 */
export const FEE_HEADROOM_PERCENT = 20

/**
 * The factory the account library deploys a Kohaku account through
 * (ambire-common `AMBIRE_ACCOUNT_FACTORY`). A save for an account with no code
 * yet goes to it, the deployment prepended to the batch.
 */
export const ACCOUNT_FACTORY = AMBIRE_ACCOUNT_FACTORY as Address

/**
 * The gas a call that carries value to an address with no code, no nonce and
 * no balance costs beyond the same call with no value: the EVM's value-call
 * cost (9000) and its new-account cost (25000). The transfer route's estimate
 * adds it, since that estimate runs with no value (below).
 */
export const VALUE_TRANSFER_GAS = 9000n + 25000n

/** The two routes that fill a key. */
export const DEPOSIT_ROUTES = ['transfer', 'outside'] as const

const ceilDiv = (a: bigint, b: bigint): bigint => (a + b - 1n) / b

/** The digits after the point the step renders an amount with. */
export const GAS_DISPLAY_DECIMALS = 6

const DISPLAY_UNIT = 10n ** BigInt(etherUnits.wei - GAS_DISPLAY_DECIMALS)

/** An amount to send, rounded up to the step's precision, so what the step shows covers it. */
export const roundUpForDisplay = (wei: bigint): bigint => ceilDiv(wei, DISPLAY_UNIT) * DISPLAY_UNIT

/** A balance, rounded down to the step's precision, so the step never shows more than the key holds. */
export const roundDownForDisplay = (wei: bigint): bigint => (wei / DISPLAY_UNIT) * DISPLAY_UNIT

/** The estimate of a transaction from its gas and the gas price, with the fee headroom. */
export const gasEstimateOf = (
  gas: bigint,
  gasPrice: bigint,
  feeHeadroomPercent: number = FEE_HEADROOM_PERCENT
): GasEstimate => {
  if (!Number.isInteger(feeHeadroomPercent) || feeHeadroomPercent < 0) {
    throw new RangeError(`The fee headroom is a whole percent from zero: ${feeHeadroomPercent}`)
  }
  const cost = gas * gasPrice
  return { gas, gasPrice, cost, required: ceilDiv(cost * BigInt(100 + feeHeadroomPercent), 100n) }
}

/**
 * The transaction the check estimates: a call anyone may send as it stands,
 * from the key (`gasCallOf`); a write the account sends as the transaction the
 * account library built for it. That one must come from the key and go to the
 * account the key operates, or to `ACCOUNT_FACTORY` where it deploys the
 * account, so the check never estimates a transaction of another
 * account. Throws a TypeError where it is missing or fails either tie.
 */
export const gasTransactionOf = (
  input: Pick<GasCheckInput, 'prepared' | 'key' | 'transaction' | 'operates'>
): GasEstimateCall => {
  const { prepared, key, transaction, operates } = input
  if (prepared.kind === 'call' && prepared.sender === 'anyone') {
    return gasCallOf(prepared, key.addr)
  }
  if (!transaction) {
    throw new TypeError(
      "A write the account sends rides the account's own execute: pass the transaction its key sends, built through the account library."
    )
  }
  if (!sameAddress(transaction.from, key.addr)) {
    throw new TypeError(
      `The transaction to estimate comes from ${transaction.from}, not from the sending key ${key.addr}.`
    )
  }
  if (!operates) {
    throw new TypeError(
      'A write the account sends is estimated against the account the key operates: pass that account.'
    )
  }
  if (
    !sameAddress(transaction.to, operates.address) &&
    !sameAddress(transaction.to, ACCOUNT_FACTORY)
  ) {
    throw new TypeError(
      `The transaction to estimate goes to ${transaction.to}, not to the account ${operates.address} the key operates or the account factory.`
    )
  }
  return { ...transaction }
}

// The account's own batch, which a key with privileges on the account sends
// with no signature (`executeBySender`). The transfer route is that operation
// with one call to the key.
const ACCOUNT_OPERATIONS = new Interface([
  'function executeBySender((address to, uint256 value, bytes data)[] calls) payable'
])

/**
 * The transaction the transfer route's own fee is estimated on: the key sends
 * the account's `executeBySender` with one call to the key. It carries no
 * value, so the estimate does not revert where the account holds less than the
 * amount at the time of the check; `VALUE_TRANSFER_GAS` adds what the value
 * costs.
 */
export const transferTransactionOf = (account: Address, key: Address): GasEstimateCall => ({
  from: key,
  to: account,
  data: ACCOUNT_OPERATIONS.encodeFunctionData('executeBySender', [[[key, 0n, '0x']]]) as Hex
})

/**
 * The transaction the transfer route's own fee is estimated on, tied to the
 * key and to the account it drains. An account with code runs the transfer as
 * its own `executeBySender` (`transferTransactionOf`, or the caller's, to the
 * account). An account with no code yet has nothing to call: its transfer
 * deploys it through the factory and runs the call in one transaction, which
 * the account library builds, so the caller passes it (to `ACCOUNT_FACTORY`)
 * and the check never estimates a call to the empty address. Where the caller
 * passed none for such an account, this answers undefined: the check cannot
 * price the transfer, so the step offers the deposit from outside alone.
 * Throws a TypeError where the transaction comes from another address or goes
 * elsewhere.
 */
export const transferEstimateCallOf = (
  input: Pick<GasCheckInput, 'key' | 'operates' | 'transaction' | 'transferTransaction'>
): GasEstimateCall | undefined => {
  const { key, operates, transaction, transferTransaction } = input
  if (!operates) {
    throw new TypeError(
      'The transfer route drains the account the key operates: pass that account.'
    )
  }
  const noCode =
    operates.deployed === false || (!!transaction && sameAddress(transaction.to, ACCOUNT_FACTORY))
  if (!transferTransaction) {
    return noCode ? undefined : transferTransactionOf(operates.address, key.addr)
  }
  if (!sameAddress(transferTransaction.from, key.addr)) {
    throw new TypeError(
      `The transfer to estimate comes from ${transferTransaction.from}, not from the sending key ${key.addr}.`
    )
  }
  const to = noCode ? ACCOUNT_FACTORY : operates.address
  if (!sameAddress(transferTransaction.to, to)) {
    throw new TypeError(
      `The transfer to estimate goes to ${transferTransaction.to}, not to ${to}${
        noCode ? ', the account factory that deploys the account' : ', the account'
      }.`
    )
  }
  return { ...transferTransaction }
}

/** The fee of the transfer route from its estimated gas, with the value's own cost and the headroom. */
export const transferFeeOf = (
  gas: bigint,
  gasPrice: bigint,
  feeHeadroomPercent: number = FEE_HEADROOM_PERCENT
): GasEstimate => gasEstimateOf(gas + VALUE_TRANSFER_GAS, gasPrice, feeHeadroomPercent)

/** Whether a balance covers the step's estimate, so the step skips itself. */
export const holdsEnough = (estimate: GasEstimate, balance: bigint): boolean =>
  balance >= estimate.required

/**
 * The deposit step from an estimate and a balance that falls short of it.
 * Off the fast track it offers the transfer from the account the key operates,
 * whose amount is the shortfall plus `transferFee`, the transfer's own fee
 * (`transferFeeOf`), and the deposit from outside, the shortfall alone. With
 * no `transferFee` (the transfer's estimate reverted, so the account cannot
 * run it now) the step offers the deposit from outside alone. Throws a
 * TypeError where the balance covers the estimate, since such a key skips the
 * step, and where a step off the fast track has no account the key operates.
 */
export const depositStepOf = (args: DepositStepInput): DepositStep => {
  const { write, key, network, estimate, balance, operates, transferFee } = args
  if (holdsEnough(estimate, balance)) {
    throw new TypeError('The key holds enough: the deposit step is skipped.')
  }
  const fastTrack = isRecoveryCall(write) && args.fastTrack === true
  if (!fastTrack && !operates) {
    throw new TypeError(
      'Off the fast track the step offers the transfer from the account the key operates: pass that account.'
    )
  }
  const shortfall = estimate.required - balance
  const outside: DepositRoute = { kind: 'outside', to: key, amount: roundUpForDisplay(shortfall) }
  const routes: DepositRoute[] =
    !fastTrack && operates && transferFee
      ? [
          {
            kind: 'transfer',
            from: { ...operates },
            to: key,
            amount: roundUpForDisplay(shortfall + transferFee.required),
            fee: transferFee
          },
          outside
        ]
      : [outside]
  return {
    write,
    payer: payerOf(write),
    fastTrack,
    key,
    network: { name: network.name, symbol: network.nativeAssetSymbol },
    estimate,
    balance,
    shortfall,
    routes,
    ...(!fastTrack && operates ? { operates: { ...operates } } : {})
  }
}

/**
 * The gas check. Checks that the write comes through its door (`assertWriteDoor`)
 * and that the transaction it estimates is this write's (`gasTransactionOf`),
 * then makes three reads through the extension's provider: the estimate of
 * this transaction, the gas price and the key's balance. Answers `enough`
 * where the balance covers the estimate with its headroom. Otherwise, off the
 * fast track, it estimates the transfer route's own transaction through the
 * same provider (`transferEstimateCallOf`) and answers the deposit step.
 *
 * A read that could not run rejects with its `ProviderReadFailure`, which the
 * machine reads as `gasReadError`. An estimate of the write that would revert
 * rejects with its `RevertedCall`, which it reads as a call never sent. An
 * estimate of the transfer that would revert does not fail the check: the
 * account cannot run that transfer now, so the step drops that route and
 * keeps the deposit from outside.
 */
export const checkGas = async (input: GasCheckInput): Promise<GasCheck> => {
  assertWriteDoor(input.write, input.prepared)
  const fastTrack = isRecoveryCall(input.write) && input.fastTrack === true
  if (!fastTrack && !input.operates) {
    throw new TypeError(
      'Off the fast track the step offers the transfer from the account the key operates: pass that account.'
    )
  }
  const transaction = gasTransactionOf(input)
  const transferCall = fastTrack ? undefined : transferEstimateCallOf(input)
  const [gas, gasPrice, balance] = await Promise.all([
    input.reads.estimateGas(transaction),
    input.reads.gasPrice(),
    input.reads.nativeBalance(input.key.addr)
  ])
  const estimate = gasEstimateOf(gas, gasPrice, input.feeHeadroomPercent)
  if (holdsEnough(estimate, balance)) {
    return { kind: 'enough', write: input.write, key: input.key.addr, estimate, balance }
  }
  let transferFee: GasEstimate | undefined
  if (transferCall) {
    try {
      transferFee = transferFeeOf(
        await input.reads.estimateGas(transferCall),
        gasPrice,
        input.feeHeadroomPercent
      )
    } catch (thrown) {
      if (!isRevertedCall(thrown)) throw thrown
    }
  }
  return {
    kind: 'deposit',
    step: depositStepOf({
      write: input.write,
      key: input.key.addr,
      network: input.network,
      estimate,
      balance,
      operates: input.operates,
      transferFee,
      fastTrack
    })
  }
}
