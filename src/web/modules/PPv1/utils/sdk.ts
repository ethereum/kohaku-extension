/* eslint-disable no-restricted-syntax */
/* eslint-disable no-await-in-loop */

'use client'

import {
  Circuits,
  PrivacyPoolSDK,
  WithdrawalProofInput,
  Secret,
  generateMerkleProof,
  Hash,
  WithdrawalProof,
  AccountService,
  PrivacyPoolAccount,
  PoolAccount as SDKPoolAccount,
  AccountCommitment,
  RagequitEvent
} from '@0xbow/privacy-pools-core-sdk'
import { Hex, http, HttpTransport } from 'viem'
import { sepolia } from 'viem/chains'
import { chainData } from '@ambire-common/controllers/privacyPools/config'
import { MtLeavesResponse, aspClient } from './aspClient'

export const transports = {
  11155111: http(sepolia.rpcUrls.default.http[0])
} as Record<number, HttpTransport>

type RagequitEventWithTimestamp = RagequitEvent & {
  timestamp: bigint
}

export type PoolAccount = SDKPoolAccount & {
  name: number
  balance: bigint // has spendable commitments, check with getSpendableCommitments()
  isValid: boolean // included in ASP leaves
  reviewStatus: ReviewStatus // ASP status
  lastCommitment: AccountCommitment
  chainId: number
  scope: Hash
  ragequit?: RagequitEventWithTimestamp
}

export enum ReviewStatus {
  PENDING = 'pending',
  APPROVED = 'approved',
  DECLINED = 'declined',
  EXITED = 'exited',
  SPENT = 'spent'
}

// Lazy load circuits only when needed
let circuits: Circuits | null = null
let sdk: PrivacyPoolSDK | null = null

const initializeSDK = () => {
  if (!circuits) {
    // Ensure we have a valid baseUrl (client-side only)
    const currentBaseUrl = typeof window !== 'undefined' ? window.location.origin : ''
    if (!currentBaseUrl) {
      throw new Error('SDK can only be initialized on client-side')
    }
    circuits = new Circuits({ baseUrl: currentBaseUrl })
    sdk = new PrivacyPoolSDK(circuits)
  }
  return sdk!
}

/**
 * Generates a withdrawal proof.
 *
 * @param commitment - Commitment to withdraw
 * @param input - Input parameters for the withdrawal
 * @param withdrawal - Withdrawal details
 * @returns Promise resolving to withdrawal payload
 * @throws {ProofError} If proof generation fails
 */
export const generateWithdrawalProof = async (
  commitment: AccountCommitment,
  input: WithdrawalProofInput
) => {
  const sdkInstance = initializeSDK()
  return sdkInstance.proveWithdrawal(
    {
      preimage: {
        label: commitment.label,
        value: commitment.value,
        precommitment: {
          hash: BigInt('0x1234') as Hash,
          nullifier: commitment.nullifier,
          secret: commitment.secret
        }
      },
      hash: commitment.hash,
      nullifierHash: BigInt('0x1234') as Hash
    },
    input
  )
}

export const getMerkleProof = async (leaves: bigint[], leaf: bigint) => {
  return generateMerkleProof(leaves, leaf)
}

export const verifyWithdrawalProof = async (proof: WithdrawalProof) => {
  const sdkInstance = initializeSDK()
  return sdkInstance.verifyWithdrawal(proof)
}

export const createWithdrawalSecrets = (
  accountService: AccountService,
  commitment: AccountCommitment
) => {
  return accountService.createWithdrawalSecrets(commitment)
}

export const addPoolAccount = (
  accountService: AccountService,
  newPoolAccount: {
    scope: bigint
    value: bigint
    nullifier: Secret
    secret: Secret
    label: Hash
    blockNumber: bigint
    txHash: Hex
  }
) => {
  const accountInfo = accountService.addPoolAccount(
    newPoolAccount.scope as Hash,
    newPoolAccount.value,
    newPoolAccount.nullifier,
    newPoolAccount.secret,
    newPoolAccount.label,
    newPoolAccount.blockNumber,
    newPoolAccount.txHash
  )

  return accountInfo
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

  try {
    // Extract labels from pool accounts to fetch only relevant deposits
    const labels = loadedPoolAccounts.map((account) => account.label.toString())

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
  } catch (error) {
    console.error('Error processing deposits:', error)
    return loadedPoolAccounts
  }
}
