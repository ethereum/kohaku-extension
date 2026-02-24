import { AddressState } from '@ambire-common/interfaces/domains'
import type {
  RailgunController,
  RailgunAccountKeys,
  RailgunAccountCache
} from '@ambire-common/controllers/railgun/railgun'
import { type RailgunAccount, type Indexer } from '@kohaku-eth/railgun'

export type RailgunSyncStatus = 'idle' | 'running' | 'ready' | 'error'

export type RailgunBalance = {
  tokenAddress: string
  amount: string
}

export type TrackedRailgunAccount = {
  id: string // e.g. "derived:0"
  kind: 'derived' | 'imported'
  index?: number
  zkAddress?: string
  balances: RailgunBalance[]
  lastSyncedBlock: number
}

export type RailgunReactState = {
  status: RailgunSyncStatus
  error?: string
  balances: RailgunBalance[]
  accounts: TrackedRailgunAccount[]
  chainId: number
  lastSyncedBlock: number
}

export type Checkpoint = {
  merkleTrees: { tree: string[][]; nullifiers: string[] }[]
  logs: any[] // Using any to match original
  endBlock: number
}

// ─────────────────────────────────────────────────────────────────────────────
// TYPES (simplified state machine)
// ─────────────────────────────────────────────────────────────────────────────

export type EnhancedRailgunControllerState = {
  // existing bg fields
  depositAmount: string
  privacyProvider: string
  chainId: number
  validationFormMsgs: {
    amount: { success: boolean; message: string }
    recipientAddress: { success: boolean; message: string }
  }
  addressState: AddressState
  isRecipientAddressUnknown: boolean
  signAccountOpController: any
  latestBroadcastedAccountOp: any
  latestBroadcastedToken: any
  hasProceeded: boolean
  selectedToken: any
  amountFieldMode: 'token' | 'fiat'
  withdrawalAmount: string
  amountInFiat: string
  programmaticUpdateCounter: number
  isRecipientAddressUnknownAgreed: boolean
  maxAmount: string

  // NEW: extremely simple client-side sync view
  railgunAccountsState: RailgunReactState

  // convenience flags
  isAccountLoaded: boolean
  isLoadingAccount: boolean
  isRefreshing: boolean
  isReadyToLoad: boolean

  // actions
  loadPrivateAccount: () => Promise<void>
  refreshPrivateAccount: () => Promise<void>
  getAccountCache: (zkAddress: string, chainId: number) => Promise<RailgunAccountCache | null>

  defaultRailgunKeys: RailgunAccountKeys | null

  // synced account instance (created during loadPrivateAccount, available for direct use)
  syncedDefaultRailgunAccount: RailgunAccount | null
  syncedDefaultRailgunIndexer: Indexer | null
} & Omit<
  Partial<RailgunController>,
  | 'validationFormMsgs'
  | 'addressState'
  | 'isRecipientAddressUnknown'
  | 'signAccountOpController'
  | 'latestBroadcastedAccountOp'
  | 'latestBroadcastedToken'
  | 'hasProceeded'
  | 'selectedToken'
  | 'amountFieldMode'
  | 'withdrawalAmount'
  | 'amountInFiat'
  | 'programmaticUpdateCounter'
  | 'isRecipientAddressUnknownAgreed'
  | 'maxAmount'
  | 'depositAmount'
  | 'privacyProvider'
  | 'chainId'
  | 'defaultRailgunKeys'
>

// not exported from railgun package, copied from kohaku/packages/provider => TxLog
export interface RailgunLog {
  blockNumber: number
  topics: string[]
  data: string
  address: string
}
