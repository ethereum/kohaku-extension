/**
 * The events feed of one account's deployment over the provider's logs: the
 * manager's five setup and attempt events of the account, and the account's
 * own privilege writes. A log is owned by its emitting address: the
 * manager's logs decode as setup or attempt events, the account's as
 * privilege writes, and any other address's not at all. The method modules'
 * events are not read, so the method filter refuses as not served.
 */
import { isAddress, isAddressEqual } from 'viem'

import type {
  AccountFilterOptions,
  BlockRange,
  FilterSpec,
  IEventManager,
  Notification,
  RawLog
} from '@web/modules/social-recovery/sdk-interfaces'

import { notServedRefusal } from '../setup-client/not-served'
import {
  ATTEMPT_CANCELLED_TOPIC,
  ATTEMPT_CONSUMED_TOPIC,
  ATTEMPT_STARTED_TOPIC,
  decodeAttemptLog
} from './attempt-events'
import { logsInChunks } from './log-scan'
import { decodePrivilegeLog, PRIVILEGE_CHANGED_TOPIC } from './privilege-events'
import {
  addressTopic,
  decodeSetupLog,
  SETUP_CLEARED_TOPIC,
  SETUP_COMMITTED_TOPIC
} from './setup-events'
import type { KitEventManagerInput } from './types'

const MANAGER_TOPICS = [
  SETUP_COMMITTED_TOPIC,
  SETUP_CLEARED_TOPIC,
  ATTEMPT_STARTED_TOPIC,
  ATTEMPT_CANCELLED_TOPIC,
  ATTEMPT_CONSUMED_TOPIC
]

export const createKitEventManager = ({
  provider,
  descriptor,
  account,
  chunkWidth
}: KitEventManagerInput): IEventManager => {
  const events: IEventManager = {
    accountFilter(options?: AccountFilterOptions): FilterSpec {
      return {
        addresses: [descriptor.manager],
        topics: [
          MANAGER_TOPICS,
          addressTopic(account),
          options?.anyAction ? null : addressTopic(descriptor.action)
        ]
      }
    },

    methodFilter(): FilterSpec {
      throw notServedRefusal('events.methodFilter')
    },

    privilegeFilter(): FilterSpec {
      return { addresses: [account], topics: [PRIVILEGE_CHANGED_TOPIC] }
    },

    /**
     * The owned notifications of the filter's logs over the range, read in
     * chunks in chain order. A log a reorg removed is dropped, and a log
     * that does not decode is skipped. A failed chunk read rejects the whole
     * read with the adapter's failure.
     */
    async fetch(filter: FilterSpec, range: BlockRange): Promise<Notification[]> {
      if (range.to < range.from) {
        return []
      }
      const logs = await logsInChunks(provider, filter, range, chunkWidth)
      return logs
        .filter((log) => !log.removed)
        .map((log) => events.decodeLog(log))
        .filter((notification): notification is Notification => notification !== undefined)
    },

    decodeLog(log: RawLog): Notification | undefined {
      if (!isAddress(log.address, { strict: false })) {
        return undefined
      }
      if (isAddressEqual(log.address, descriptor.manager)) {
        return decodeSetupLog(log) ?? decodeAttemptLog(log)
      }
      if (isAddressEqual(log.address, account)) {
        return decodePrivilegeLog(log)
      }
      return undefined
    }
  }
  return events
}
