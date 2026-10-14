/**
 * The manager's two setup events: `SetupCommitted(account indexed, action
 * indexed, nonce, setupCommitment, publicMetadata, privateMetadata)` and
 * `SetupCleared(account indexed, action indexed, nonce)`, their filters, their
 * decoding and the two scans a setup reads them through.
 */
import {
  decodeEventLog,
  encodeAbiParameters,
  encodeEventTopics,
  isAddress,
  isAddressEqual
} from 'viem'

import type {
  Address,
  FilterSpec,
  Hex,
  IProvider,
  RawLog
} from '@web/modules/social-recovery/sdk-interfaces'

import { POLICY_MANAGER_ABI } from '../abi'
import { logsInChunks, positionOf } from './log-scan'
import type { CommitQuery, LogScan, SetupCommittedLog, SetupEvents, SetupLog } from './types'

export const [SETUP_COMMITTED_TOPIC] = encodeEventTopics({
  abi: POLICY_MANAGER_ABI,
  eventName: 'SetupCommitted'
})

export const [SETUP_CLEARED_TOPIC] = encodeEventTopics({
  abi: POLICY_MANAGER_ABI,
  eventName: 'SetupCleared'
})

// Both events carry the event's topic, the account and the action.
const SETUP_LOG_TOPICS = 3

/** An address as the 32-byte topic an indexed address parameter takes. */
export const addressTopic = (address: Address): Hex =>
  encodeAbiParameters([{ type: 'address' }], [address])

/**
 * One raw log as a setup commit or clear, or undefined for a log of another
 * event, with another number of topics, or with data that does not decode.
 * Never throws.
 */
export const decodeSetupLog = (log: RawLog): SetupLog | undefined => {
  const [topic, ...indexed] = log.topics
  if (topic === undefined || log.topics.length !== SETUP_LOG_TOPICS) {
    return undefined
  }
  try {
    const decoded = decodeEventLog({
      abi: POLICY_MANAGER_ABI,
      topics: [topic, ...indexed],
      data: log.data,
      strict: true
    })
    if (decoded.eventName === 'SetupCommitted') {
      return {
        kind: 'setup-committed',
        account: decoded.args._account,
        action: decoded.args._action,
        nonce: decoded.args._nonce,
        setupCommitment: decoded.args._setupCommitment,
        publicMetadata: decoded.args._publicMetadata,
        privateMetadata: decoded.args._privateMetadata,
        at: positionOf(log)
      }
    }
    if (decoded.eventName === 'SetupCleared') {
      return {
        kind: 'setup-cleared',
        account: decoded.args._account,
        action: decoded.args._action,
        nonce: decoded.args._nonce,
        at: positionOf(log)
      }
    }
    return undefined
  } catch {
    return undefined
  }
}

/**
 * The setup logs of the manager at `manager`, read through the provider
 * adapter in chunks of at most `chunkWidth` blocks.
 */
export const createSetupEvents = (
  provider: IProvider,
  manager: Address,
  chunkWidth?: number
): SetupEvents => {
  const setupLogsIn = async (filter: FilterSpec, scan: LogScan): Promise<SetupLog[]> => {
    const logs = await logsInChunks(provider, filter, scan, chunkWidth)
    return logs
      .filter(
        (log) =>
          !log.removed &&
          isAddress(log.address, { strict: false }) &&
          isAddressEqual(log.address, manager)
      )
      .map(decodeSetupLog)
      .filter((log): log is SetupLog => log !== undefined)
  }

  const events: SetupEvents = {
    setupFilter(account: Address): FilterSpec {
      return {
        addresses: [manager],
        topics: [[SETUP_COMMITTED_TOPIC, SETUP_CLEARED_TOPIC], addressTopic(account)]
      }
    },

    commitFilter(account: Address, action: Address): FilterSpec {
      return {
        addresses: [manager],
        topics: [SETUP_COMMITTED_TOPIC, addressTopic(account), addressTopic(action)]
      }
    },

    async setupLogsOf(account: Address, scan: LogScan): Promise<SetupLog[]> {
      const logs = await setupLogsIn(events.setupFilter(account), scan)
      return logs.filter((log) => isAddressEqual(log.account, account))
    },

    async commitOf(query: CommitQuery, scan: LogScan): Promise<SetupCommittedLog | undefined> {
      const logs = await setupLogsIn(events.commitFilter(query.account, query.action), scan)
      return logs.find(
        (log): log is SetupCommittedLog =>
          log.kind === 'setup-committed' &&
          isAddressEqual(log.account, query.account) &&
          isAddressEqual(log.action, query.action) &&
          log.nonce === query.nonce &&
          log.setupCommitment.toLowerCase() === query.setupCommitment.toLowerCase()
      )
    }
  }
  return events
}
