/**
 * The `IEventManager` double: three filters with no block range, a chunked
 * `fetch` through the provider, and a decoder that owns a log by its emitting
 * address alone (the manager, the account, a descriptor method or a
 * module a registered implementation serves). It serves every notification the
 * scripted chain emitted, `SetupCommitted`, `AttemptStarted`, `AttemptCancelled`,
 * `AttemptConsumed` and `TrustedKeysUpdated` among them.
 */
import type {
  AccountFilterOptions,
  Address,
  BlockRange,
  FilterSpec,
  IEventManager,
  IProvider,
  Notification,
  RawLog
} from '@web/modules/social-recovery/sdk-interfaces'

import type { ScriptedChain } from './chain'
import { distinctAddresses, sameAddress, topicOf } from './encoding'
import { MANAGER_KINDS, METHOD_KINDS, notificationOf, topicOfKind } from './logs'

/** The chunk width `fetch` reads in where the configuration names none. */
export const DEFAULT_LOG_CHUNK_WIDTH = 10_000

export class EventManagerDouble implements IEventManager {
  constructor(
    private readonly chain: ScriptedChain,
    private readonly provider: IProvider,
    private readonly registeredModules: Address[] = [],
    private readonly chunkWidth: number = DEFAULT_LOG_CHUNK_WIDTH
  ) {}

  private methodAddresses(): Address[] {
    const d = this.chain.descriptor
    return distinctAddresses([
      d.methodEcdsa,
      d.methodPasskey,
      d.methodAadhaar,
      d.methodZkpassport,
      ...this.registeredModules
    ])
  }

  accountFilter(options: AccountFilterOptions = {}): FilterSpec {
    return {
      addresses: [this.chain.descriptor.manager],
      topics: [
        MANAGER_KINDS.map(topicOfKind),
        topicOf(this.chain.account),
        options.anyAction ? null : topicOf(this.chain.action)
      ]
    }
  }

  methodFilter(): FilterSpec {
    return { addresses: this.methodAddresses(), topics: [METHOD_KINDS.map(topicOfKind)] }
  }

  privilegeFilter(): FilterSpec {
    return { addresses: [this.chain.account], topics: [topicOfKind('privilege-changed')] }
  }

  async fetch(filter: FilterSpec, range: BlockRange): Promise<Notification[]> {
    this.chain.guard('events.fetch')
    if (range.to < range.from) {
      return []
    }
    const notifications: Notification[] = []
    for (let from = range.from; from <= range.to; from += this.chunkWidth) {
      const to = Math.min(range.to, from + this.chunkWidth - 1)
      // A chunk the provider does not answer fails the whole read.
      // eslint-disable-next-line no-await-in-loop
      const logs = await this.provider.logs(filter, { from, to })
      logs.forEach((log) => {
        const n = this.decodeLog(log)
        if (n) {
          notifications.push(n)
        }
      })
    }
    return notifications.sort(
      (a, b) => a.at.blockNumber - b.at.blockNumber || a.at.logIndex - b.at.logIndex
    )
  }

  decodeLog(log: RawLog): Notification | undefined {
    const n = notificationOf(log)
    if (!n) {
      return undefined
    }
    const owner = MANAGER_KINDS.includes(n.kind)
      ? sameAddress(log.address, this.chain.descriptor.manager)
      : METHOD_KINDS.includes(n.kind)
      ? this.methodAddresses().some((m) => sameAddress(m, log.address))
      : sameAddress(log.address, this.chain.account)
    return owner ? n : undefined
  }
}
