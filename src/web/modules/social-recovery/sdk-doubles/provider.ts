/**
 * The `IProvider` double: the integrator's four reads, answered from the
 * scripted chain. `call` answers what `chain.calls` scripts for `${to}:${data}`,
 * rejects a scripted revert with its raw data, and answers `0x` otherwise. A
 * read scripted to fail rejects; it never answers empty.
 */
import type {
  Address,
  BlockHeader,
  BlockRange,
  BlockTag,
  FilterSpec,
  Hex,
  IProvider,
  RawLog
} from '@web/modules/social-recovery/sdk-interfaces'

import type { ScriptedChain } from './chain'
import { matchesFilter, rawLogOf } from './logs'
import type { RevertedCall } from './types'

export const revertedCall = (data: Hex): RevertedCall => {
  const error = new Error('execution reverted') as RevertedCall
  error.name = 'RevertedCall'
  error.data = data
  return error
}

export class ProviderDouble implements IProvider {
  constructor(private readonly chain: ScriptedChain) {}

  async chainId(): Promise<number> {
    this.chain.guard('provider.chainId')
    return this.chain.descriptor.chainId
  }

  async call(to: Address, data: Hex): Promise<Hex> {
    this.chain.guard('provider.call')
    const answer = this.chain.calls.get(`${to.toLowerCase()}:${data.toLowerCase()}`)
    if (!answer) {
      return '0x'
    }
    if ('revert' in answer) {
      throw revertedCall(answer.revert)
    }
    return answer.result
  }

  async logs(filterSpec: FilterSpec, range: BlockRange): Promise<RawLog[]> {
    this.chain.guard('provider.logs')
    return this.chain.notifications
      .filter((n) => n.at.blockNumber >= range.from && n.at.blockNumber <= range.to)
      .map((n) => rawLogOf(n, this.chain.descriptor.manager))
      .filter((log) => matchesFilter(log, filterSpec))
  }

  async block(tag: BlockTag): Promise<BlockHeader> {
    this.chain.guard('provider.block')
    return this.chain.blockAt(tag)
  }
}
