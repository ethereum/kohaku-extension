/**
 * The extension's own chain reads beside the provider adapter.
 *
 * The SDK's provider answers four reads and no balance, and the SDK estimates
 * nothing. The extension therefore reads the sending key's native balance and
 * estimates each transaction's gas itself, on the same provider the adapter
 * wraps. The gas step reads these; the SDK never sees them.
 */
import { parseGwei } from 'viem'

import type { Address, BlockTag, PreparedCall } from '@kohaku-eth/social-recovery'

import { attemptRead, callFailureOf, quantityOf, retryWhileRateLimited } from './provider-adapter'
import type { ChainReads, ChainReadsProvider, GasEstimateCall } from './types'

/**
 * The least priority fee the fee read prices, so a quiet test network, whose
 * blocks carry almost no tips, still prices like the wallet's send.
 */
const PRIORITY_FEE_FLOOR = parseGwei('1')

/**
 * The base fee of a block as the node answers it, undefined where the block
 * carries none. An answer that is no block, or a base fee that is no
 * quantity, throws.
 */
const baseFeeOf = (block: unknown): bigint | undefined => {
  if (typeof block !== 'object' || block === null) {
    throw new Error(`not a block: ${JSON.stringify(block)}`)
  }
  if (
    !('baseFeePerGas' in block) ||
    block.baseFeePerGas === undefined ||
    block.baseFeePerGas === null
  ) {
    return undefined
  }
  return quantityOf(block.baseFeePerGas)
}

/**
 * The balance and gas reads over the extension's provider: `getBalance`,
 * `estimateGas` and the fee read. A read the provider could not make rejects
 * with a `ProviderReadFailure`; an estimate of a call that would revert
 * rejects with a `RevertedCall`.
 */
export const createChainReads = (provider: ChainReadsProvider): ChainReads => ({
  nativeBalance(address: Address, block: BlockTag = 'latest'): Promise<bigint> {
    return attemptRead('nativeBalance', () => provider.getBalance(address, block))
  },

  async estimateGas(call: GasEstimateCall): Promise<bigint> {
    try {
      return await retryWhileRateLimited(() =>
        provider.estimateGas({
          from: call.from,
          to: call.to,
          data: call.data,
          value: call.value
        })
      )
    } catch (thrown) {
      throw callFailureOf('estimateGas', thrown)
    }
  },

  /**
   * The most a send pays per gas, by ethers' `maxFeePerGas` rule: the latest
   * block's base fee twice, plus the node's `eth_maxPriorityFeePerGas`, at
   * least 1 gwei. The rule takes the latest block's base fee, not a
   * projection for the next block: that projection comes only from
   * `eth_feeHistory`, which the Helios light client does not serve, and the
   * doubled base fee already covers the rise to the next block. `eth_gasPrice`
   * alone is not enough: nodes answer it near the bare base fee, far below
   * the fee the wallet's sign window pays, so a check priced with it passes a
   * key that then cannot pay. A node whose block carries no base fee runs no
   * fee market, and its `eth_gasPrice` is the price.
   */
  gasPrice(): Promise<bigint> {
    return attemptRead('gasPrice', async () => {
      const baseFee = baseFeeOf(await provider.send('eth_getBlockByNumber', ['latest', false]))
      if (baseFee === undefined) {
        return quantityOf(await provider.send('eth_gasPrice', []))
      }
      const priorityFee = quantityOf(await provider.send('eth_maxPriorityFeePerGas', []))
      return baseFee * 2n + (priorityFee > PRIORITY_FEE_FLOOR ? priorityFee : PRIORITY_FEE_FLOOR)
    })
  }
})

/**
 * The transaction a key sends for a prepared call whose sender is anyone (the
 * submission and the execution the recoverer's own key sends), for its gas
 * estimate. A call whose sender is the account rides the account's own
 * `execute`, which the account library estimates, so this refuses it.
 */
export const gasCallOf = (prepared: PreparedCall, from: Address): GasEstimateCall => {
  if (prepared.sender !== 'anyone') {
    throw new Error(
      'A call the account sends is estimated by the account library, not as a key call.'
    )
  }
  return { from, to: prepared.target, data: prepared.data, value: prepared.value }
}
