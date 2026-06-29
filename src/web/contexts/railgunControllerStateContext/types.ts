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
  railgunAccountsState: RailgunReactState

  // convenience flags
  isAccountLoaded: boolean
  isLoadingAccount: boolean
  isRefreshing: boolean
  isReadyToLoad: boolean

  // actions
  loadPrivateAccount: () => Promise<void>
  refreshPrivateAccount: () => Promise<void>

  zkAddress: string | null
}

// not exported from railgun package, copied from kohaku/packages/provider => TxLog
export interface RailgunLog {
  blockNumber: number
  topics: string[]
  data: string
  address: string
}
