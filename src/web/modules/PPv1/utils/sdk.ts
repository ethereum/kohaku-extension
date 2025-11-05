/* eslint-disable no-restricted-syntax */
/* eslint-disable no-await-in-loop */

'use client'

import {
  Hash,
  PrivacyPoolAccount,
  PoolAccount as SDKPoolAccount,
  AccountCommitment,
  RagequitEvent
} from '@0xbow/privacy-pools-core-sdk'
import { chainData } from '@ambire-common/controllers/privacyPools/config'
import { MtLeavesResponse, aspClient } from './aspClient'

export type PoolAccount = SDKPoolAccount & {
  name: number
  balance: bigint // has spendable commitments, check with getSpendableCommitments()
  isValid: boolean // included in ASP leaves
  reviewStatus: ReviewStatus // ASP status
  lastCommitment: AccountCommitment
  chainId: number
  scope: Hash
  ragequit?: RagequitEvent & {
    timestamp: bigint
  }
}

export enum ReviewStatus {
  PENDING = 'pending',
  APPROVED = 'approved',
  DECLINED = 'declined',
  EXITED = 'exited',
  SPENT = 'spent'
}

export const getPoolAccountsFromAccount = async (account: PrivacyPoolAccount, chainId: number) => {
  const paMap = account.poolAccounts.entries()
  const poolAccounts = []

  for (const [scope, loadedPoolAccounts] of paMap) {
    let idx = 1

    for (const poolAccount of loadedPoolAccounts) {
      const lastCommitment =
        poolAccount.children.length > 0
          ? poolAccount.children[poolAccount.children.length - 1]
          : poolAccount.deposit

      const paChainId = Object.keys(chainData).find((key) =>
        chainData[Number(key)].poolInfo.some((pool) => pool.scope === scope)
      )

      const updatedPoolAccount = {
        ...(poolAccount as PoolAccount),
        balance: lastCommitment!.value,
        lastCommitment,
        reviewStatus: ReviewStatus.PENDING,
        isValid: false,
        name: idx,
        scope,
        chainId: Number(paChainId)
      }

      updatedPoolAccount.deposit.timestamp = poolAccount.deposit.blockNumber

      if (updatedPoolAccount.children.length > 0) {
        updatedPoolAccount.children.forEach(async (child) => {
          // eslint-disable-next-line no-param-reassign
          child.timestamp = child.blockNumber
        })
      }

      if (updatedPoolAccount.ragequit) {
        updatedPoolAccount.balance = 0n
        updatedPoolAccount.reviewStatus = ReviewStatus.EXITED
      }

      if (updatedPoolAccount.ragequit) {
        updatedPoolAccount.ragequit.timestamp = updatedPoolAccount.ragequit.blockNumber
      }

      poolAccounts.push(updatedPoolAccount)
      idx++
    }
  }

  const poolAccountsByChainScope = poolAccounts.reduce((acc, curr) => {
    acc[`${curr.chainId}-${curr.scope}`] = [...(acc[`${curr.chainId}-${curr.scope}`] || []), curr]
    return acc
  }, {} as Record<string, PoolAccount[]>)
  const poolAccountsByCurrentChain = poolAccounts.filter((pa) => pa.chainId === chainId)

  return { poolAccounts: poolAccountsByCurrentChain, poolAccountsByChainScope }
}

// Updates the review status and timestamp of deposit entries in pool accounts based on deposit data from ASP
export const processDeposits = async (
  loadedPoolAccounts: PoolAccount[],
  mtLeavesData: MtLeavesResponse,
  aspUrl: string,
  chainId: number,
  scope: string
) => {
  if (!loadedPoolAccounts) throw Error('Pool accounts not found')
  if (!mtLeavesData?.aspLeaves) throw Error('ASP leaves not found')

  // Extract labels from pool accounts to fetch only relevant deposits
  const labels = loadedPoolAccounts.map((account) => account.label.toString())

  if (!labels.length) {
    return []
  }

  // Fetch deposit data from ASP for specific labels
  const depositData = await aspClient.fetchDepositsByLabel(aspUrl, chainId, scope, labels)

  const updatedPoolAccounts = loadedPoolAccounts.map((entry) => {
    const deposit = depositData.find((d) => d.label === entry.label.toString())
    if (!deposit) return entry

    if (entry.reviewStatus === ReviewStatus.EXITED) {
      return {
        ...entry,
        reviewStatus: ReviewStatus.EXITED,
        isValid: false,
        depositorAddress: deposit.address
      }
    }

    const aspLeaf = mtLeavesData.aspLeaves.find(
      (leaf) => leaf.toString() === entry.label.toString()
    )
    let reviewStatus = deposit.reviewStatus

    // The deposit is approved but the leaves are not yet updated
    if (deposit.reviewStatus === ReviewStatus.APPROVED && !aspLeaf) {
      reviewStatus = ReviewStatus.PENDING
    }

    const isWithdrawn =
      entry.balance === BigInt(0) && deposit.reviewStatus === ReviewStatus.APPROVED

    return {
      ...entry,
      reviewStatus: isWithdrawn ? ReviewStatus.SPENT : reviewStatus,
      isValid: reviewStatus === ReviewStatus.APPROVED, // Could be removed due reviewStatus is pending till leaves are updated
      timestamp: deposit.timestamp,
      depositorAddress: deposit.address
    }
  })

  return updatedPoolAccounts
}
