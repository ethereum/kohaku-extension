/**
 * The Ambire account's one privilege event, `LogPrivilegeChanged(addr indexed,
 * priv)`, which the account emits on every privilege write after its
 * creation, its filter, its decoding and the scan an account's privilege
 * writes are read through. The privileges the creation code writes emit no
 * log.
 */
import { decodeEventLog, encodeEventTopics, isAddressEqual } from 'viem'

import type {
  Address,
  FilterSpec,
  IProvider,
  RawLog
} from '@web/modules/social-recovery/sdk-interfaces'

import { AMBIRE_ACCOUNT_ABI } from '../abi'
import { logsInChunks, positionOf } from './log-scan'
import type { LogScan, PrivilegeChangedLog, PrivilegeEvents } from './types'

export const [PRIVILEGE_CHANGED_TOPIC] = encodeEventTopics({
  abi: AMBIRE_ACCOUNT_ABI,
  eventName: 'LogPrivilegeChanged'
})

// The event carries its topic and the address whose privilege changed.
const PRIVILEGE_LOG_TOPICS = 2

/**
 * One raw log as a privilege write of the account that emitted it, or
 * undefined for a log of another event, with another number of topics, or
 * with data that does not decode. Never throws.
 */
export const decodePrivilegeLog = (log: RawLog): PrivilegeChangedLog | undefined => {
  const [topic, ...indexed] = log.topics
  if (topic === undefined || log.topics.length !== PRIVILEGE_LOG_TOPICS) {
    return undefined
  }
  try {
    const decoded = decodeEventLog({
      abi: AMBIRE_ACCOUNT_ABI,
      topics: [topic, ...indexed],
      data: log.data,
      strict: true
    })
    return {
      kind: 'privilege-changed',
      account: log.address,
      addr: decoded.args.addr,
      priv: decoded.args.priv,
      at: positionOf(log)
    }
  } catch {
    return undefined
  }
}

/**
 * The privilege writes of Ambire accounts, read through the provider adapter
 * in chunks of at most `chunkWidth` blocks.
 */
export const createPrivilegeEvents = (
  provider: IProvider,
  chunkWidth?: number
): PrivilegeEvents => {
  const events: PrivilegeEvents = {
    privilegeFilter(account: Address): FilterSpec {
      return { addresses: [account], topics: [PRIVILEGE_CHANGED_TOPIC] }
    },

    async privilegeLogsOf(account: Address, scan: LogScan): Promise<PrivilegeChangedLog[]> {
      const logs = await logsInChunks(provider, events.privilegeFilter(account), scan, chunkWidth)
      return logs
        .filter((log) => !log.removed)
        .map(decodePrivilegeLog)
        .filter(
          (log): log is PrivilegeChangedLog =>
            log !== undefined && isAddressEqual(log.account, account)
        )
    }
  }
  return events
}
