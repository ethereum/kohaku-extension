import { DepositEvent, WithdrawalEvent } from '@0xbow/privacy-pools-core-sdk'

export enum ReviewStatus {
  PENDING = 'pending',
  APPROVED = 'approved',
  DECLINED = 'declined',
  EXITED = 'exited',
  SPENT = 'spent'
}

export enum EventType {
  DEPOSIT = 'deposit',
  WITHDRAWAL = 'withdrawal',
  EXIT = 'exit'
}

type Pagination = {
  page: number
  perPage: number
  total: number
}

export type DepositsResponse = DepositEvent[]

export type DepositsByLabelResponse = {
  type: 'deposit'
  amount: string
  address: string
  label: string
  txHash: string
  timestamp: number
  precommitmentHash: string
  reviewStatus: ReviewStatus
}[]

export type WithdrawalsResponse = WithdrawalEvent[]

export type AllEventsResponse = {
  events: {
    type: EventType
    createdAt: string
    amount: string
    address: string
    txHash: string
    precommitmentHash: string
    reviewStatus: ReviewStatus
    timestamp: number
  }[]
} & Pagination

export type PoolResponse = {
  overview: {
    chainId: number
    address: string
    token: string
    tokenAddr: string // ("0x000" if default currency for chain, like ETH)
  }
  totalDepositsValue: string // bigint
  totalInPoolValue: string // bigint
  acceptedDepositsValue: string // bigint
  totalDepositsCount: number
  acceptedDepositsCount: number
  recentEvents: (DepositEvent | WithdrawalEvent)[]
}

export type MtRootResponse = {
  mtRoot: string
  createdAt: number
  onchainMtRoot: string
}

export type MtLeavesResponse = {
  aspLeaves: string[]
  stateTreeLeaves: string[]
}

export type LeafIndexResponse = {
  index: number
}

const fetch = window.fetch.bind(window) as any

const fetchWithHeaders = async <T>(url: string, headers: Record<string, string>): Promise<T> => {
  const response = await fetch(url, {
    headers
  })

  if (!response.ok) throw new Error(`Request failed: ${response.statusText}`)
  return response.json()
}

const aspClient = {
  fetchMtRoots: (aspUrl: string, chainId: number, scope: string) =>
    fetchWithHeaders<MtRootResponse>(`${aspUrl}/${chainId}/public/mt-roots`, {
      'X-Pool-Scope': scope
    }),

  fetchMtLeaves: (aspUrl: string, chainId: number, scope: string) =>
    fetchWithHeaders<MtLeavesResponse>(`${aspUrl}/${chainId}/public/mt-leaves`, {
      'X-Pool-Scope': scope
    }),

  fetchDepositsByLabel: (aspUrl: string, chainId: number, scope: string, labels: string[]) =>
    fetchWithHeaders<DepositsByLabelResponse>(`${aspUrl}/${chainId}/public/deposits-by-label`, {
      'X-Pool-Scope': scope,
      'X-labels': labels.join(',')
    })
}

export { aspClient }
