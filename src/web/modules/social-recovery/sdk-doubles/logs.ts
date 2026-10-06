/**
 * The doubles' raw logs: how the provider double hands the scripted chain's
 * notifications out as `RawLog`s and how the event manager double reads them
 * back. The first topic is keccak256 of the event's name (not its ABI signature),
 * the manager's two indexed topics are the account and the action as the real
 * events index them, and the data is the notification's fields as JSON bytes.
 * Only the doubles read these bytes.
 */
import type {
  Address,
  FilterSpec,
  Hex,
  Notification,
  NotificationKind,
  RawLog
} from '@web/modules/social-recovery/sdk-interfaces'
import { keccak256, stringToHex } from 'viem'

import { hexJson, jsonHex, sameAddress, topicOf } from './encoding'

/** The Solidity event behind each notification kind. */
export const EVENT_NAMES: Record<NotificationKind, string> = {
  'setup-committed': 'SetupCommitted',
  'setup-cleared': 'SetupCleared',
  'attempt-started': 'AttemptStarted',
  'attempt-cancelled': 'AttemptCancelled',
  'attempt-consumed': 'AttemptConsumed',
  'method-paused': 'Paused',
  'method-unpaused': 'Unpaused',
  'method-keys-updated': 'TrustedKeysUpdated',
  'method-admin-renounced': 'AdminRenounced',
  'method-admin-transfer-offered': 'AdminTransferOffered',
  'method-admin-transferred': 'AdminTransferred',
  'method-pause-holder-transfer-started': 'OwnershipTransferStarted',
  'method-pause-holder-transferred': 'OwnershipTransferred',
  'privilege-changed': 'LogPrivilegeChanged'
}

export const MANAGER_KINDS: NotificationKind[] = [
  'setup-committed',
  'setup-cleared',
  'attempt-started',
  'attempt-cancelled',
  'attempt-consumed'
]

export const METHOD_KINDS: NotificationKind[] = [
  'method-paused',
  'method-unpaused',
  'method-keys-updated',
  'method-admin-renounced',
  'method-admin-transfer-offered',
  'method-admin-transferred',
  'method-pause-holder-transfer-started',
  'method-pause-holder-transferred'
]

export const topicOfKind = (kind: NotificationKind): Hex =>
  keccak256(stringToHex(EVENT_NAMES[kind]))

const KIND_BY_TOPIC = new Map<string, NotificationKind>(
  (Object.keys(EVENT_NAMES) as NotificationKind[]).map((kind) => [topicOfKind(kind), kind])
)

export const kindOfTopic = (topic: Hex | undefined): NotificationKind | undefined =>
  topic ? KIND_BY_TOPIC.get(topic.toLowerCase()) : undefined

/** The address that emits a notification's log. */
export const emitterOf = (n: Notification, manager: Address): Address => {
  if ('method' in n) {
    return n.method
  }
  if (n.kind === 'privilege-changed') {
    return n.account
  }
  return manager
}

/** One notification as the raw log a node would return for it. */
export const rawLogOf = (n: Notification, manager: Address): RawLog => {
  const { at, ...fields } = n
  const topics: Hex[] = [topicOfKind(n.kind)]
  if (MANAGER_KINDS.includes(n.kind) && 'action' in n) {
    topics.push(topicOf(n.account), topicOf(n.action))
  }
  if (n.kind === 'privilege-changed') {
    topics.push(topicOf(n.addr))
  }
  return {
    address: emitterOf(n, manager),
    topics,
    data: jsonHex(fields),
    blockNumber: at.blockNumber,
    blockHash: at.blockHash,
    logIndex: at.logIndex,
    transactionHash: at.transactionHash,
    removed: at.removed
  }
}

/** Reads a raw log back into its notification, or undefined for bytes the doubles did not write. */
export const notificationOf = (log: RawLog): Notification | undefined => {
  const kind = kindOfTopic(log.topics[0])
  if (!kind) {
    return undefined
  }
  let fields: Record<string, unknown>
  try {
    fields = hexJson<Record<string, unknown>>(log.data)
  } catch {
    return undefined
  }
  if (fields.kind !== kind) {
    return undefined
  }
  return {
    ...fields,
    at: {
      blockNumber: log.blockNumber,
      blockHash: log.blockHash,
      logIndex: log.logIndex,
      transactionHash: log.transactionHash,
      removed: log.removed ?? false
    }
  } as Notification
}

/** Whether a log matches a filter's addresses and topics (a null topic matches anything). */
export const matchesFilter = (log: RawLog, filter: FilterSpec): boolean => {
  if (!filter.addresses.some((a) => sameAddress(a, log.address))) {
    return false
  }
  return filter.topics.every((wanted, i) => {
    if (wanted === null || wanted === undefined) {
      return true
    }
    const actual = log.topics[i]?.toLowerCase()
    if (!actual) {
      return false
    }
    return Array.isArray(wanted)
      ? wanted.some((w) => w.toLowerCase() === actual)
      : wanted.toLowerCase() === actual
  })
}
