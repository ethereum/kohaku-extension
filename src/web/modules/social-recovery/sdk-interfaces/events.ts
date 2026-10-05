/**
 * The event reader and its notifications: `IEventManager`, the fourteen typed
 * notifications, the three filters and the range `fetch` takes. Imported from
 * no SDK package; types only.
 */
import type { Address, Hex } from './common'
import type { PaymentOrder } from './formats'

/** Where a notification's log sits, and whether a reorg removed it. */
export type LogPosition = {
  blockNumber: number
  blockHash: Hex
  logIndex: number
  transactionHash: Hex
  removed: boolean
}

/** The manager function that cancelled the attempt, as far as one log can tell. */
export const CANCELLED_BY = [
  'cancelByOwner',
  'cancelByProofs',
  'cancelByVeto',
  'setupWrite'
] as const
export type CancelledBy = typeof CANCELLED_BY[number]

/** The fourteen notification kinds, one per event the reader owns. */
export const NOTIFICATION_KINDS = [
  'setup-committed',
  'setup-cleared',
  'attempt-started',
  'attempt-cancelled',
  'attempt-consumed',
  'method-paused',
  'method-unpaused',
  'method-keys-updated',
  'method-admin-renounced',
  'method-admin-transfer-offered',
  'method-admin-transferred',
  'method-pause-holder-transfer-started',
  'method-pause-holder-transferred',
  'privilege-changed'
] as const
export type NotificationKind = typeof NOTIFICATION_KINDS[number]

/** One typed notification per owned event, each carrying the position of its log. */
export type Notification =
  | {
      kind: 'setup-committed'
      account: Address
      action: Address
      nonce: bigint
      setupCommitment: Hex
      publicMetadata: Hex
      privateMetadata: Hex
      at: LogPosition
    }
  | { kind: 'setup-cleared'; account: Address; action: Address; nonce: bigint; at: LogPosition }
  | {
      kind: 'attempt-started'
      account: Address
      action: Address
      attemptId: bigint
      setupNonce: bigint
      setupBody: Hex
      usedPlaces: bigint[]
      usedMethods: Address[]
      payload: Hex
      order: PaymentOrder
      consumableAfter: number
      at: LogPosition
    }
  | {
      kind: 'attempt-cancelled'
      account: Address
      action: Address
      attemptId: bigint
      canceller: Address
      vetoingMethod: Address
      cancelledBy: CancelledBy
      setupNonce: bigint
      usedPlaces: bigint[]
      at: LogPosition
    }
  | {
      kind: 'attempt-consumed'
      account: Address
      action: Address
      attemptId: bigint
      at: LogPosition
    }
  | { kind: 'method-paused'; method: Address; by: Address; at: LogPosition }
  | { kind: 'method-unpaused'; method: Address; by: Address; at: LogPosition }
  | {
      kind: 'method-keys-updated'
      method: Address
      previous: Hex[]
      current: Hex[]
      at: LogPosition
    }
  | { kind: 'method-admin-renounced'; method: Address; previous: Address; at: LogPosition }
  | {
      kind: 'method-admin-transfer-offered'
      method: Address
      current: Address
      pending: Address
      at: LogPosition
    }
  | {
      kind: 'method-admin-transferred'
      method: Address
      previous: Address
      current: Address
      at: LogPosition
    }
  | {
      kind: 'method-pause-holder-transfer-started'
      method: Address
      previous: Address
      pending: Address
      at: LogPosition
    }
  | {
      kind: 'method-pause-holder-transferred'
      method: Address
      previous: Address
      current: Address
      at: LogPosition
    }
  | { kind: 'privilege-changed'; account: Address; addr: Address; priv: Hex; at: LogPosition } // the fourteenth, the account's own

/**
 * A filter: one or more addresses and a topics array of hex strings, no block
 * range and no client-library object.
 */
export interface FilterSpec {
  addresses: Address[]
  topics: (Hex | Hex[] | null)[]
}

/**
 * The one option of the per-account filter: leave the action topic open so one
 * query returns every action the account committed.
 */
export interface AccountFilterOptions {
  anyAction?: boolean
}

/** The blocks one read covers, a first and a last, both required. */
export interface BlockRange {
  from: number
  to: number
}

/** One raw log as `eth_getLogs` returns it, what `decodeLog` and `IProvider.logs` speak. */
export interface RawLog {
  address: Address
  topics: Hex[]
  data: Hex
  blockNumber: number
  blockHash: Hex
  logIndex: number
  transactionHash: Hex
  removed?: boolean
}

/**
 * The shared part for the logs. `decodeLog` returns undefined for a log the
 * reader does not own.
 */
export interface IEventManager {
  accountFilter(options?: AccountFilterOptions): FilterSpec
  methodFilter(): FilterSpec
  privilegeFilter(): FilterSpec
  fetch(filter: FilterSpec, range: BlockRange): Promise<Notification[]>
  decodeLog(log: RawLog): Notification | undefined
}
