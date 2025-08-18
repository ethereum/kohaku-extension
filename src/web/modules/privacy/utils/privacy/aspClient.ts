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

const fetchJWT = async (): Promise<string> => {
  const response = await fetch('https://privacypools.com/api/token')
  if (!response.ok) throw new Error('Failed to get token')
  const { token } = await response.json()
  return token
}

const fetchPublic = async <T>(url: string): Promise<T> => {
  const response = await fetch(url)

  if (!response.ok) throw new Error(`Request failed: ${response.statusText}`)
  return response.json()
}

const fetchPrivate = async <T>(url: string, headers?: Record<string, string>): Promise<T> => {
  const token = await fetchJWT()

  const response = await fetch(url, {
    headers: {
      Authorization: `Bearer ${token}`,
      ...headers
    }
  })

  if (!response.ok) throw new Error(`Request failed: ${response.statusText}`)
  return response.json()
}

const aspClient = {
  fetchMtRoots: (aspUrl: string, chainId: number, scope: string) =>
    fetchPublic<MtRootResponse>(`${aspUrl}/${chainId}/public/mt-roots/${scope}`),

  fetchMtLeaves: (aspUrl: string, chainId: number, scope: string) =>
    fetchPrivate<MtLeavesResponse>(`${aspUrl}/${chainId}/private/mt-leaves/${scope}`),

  fetchDepositsByLabel: (aspUrl: string, chainId: number, scope: string, labels: string[]) =>
    fetchPrivate<DepositsByLabelResponse>(`${aspUrl}/${chainId}/private/deposits/${scope}`, {
      'X-labels': labels.join(',')
    })
}

export { aspClient }
