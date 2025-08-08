/* eslint-disable no-restricted-syntax */
/* eslint-disable no-await-in-loop */

'use client'

import {
  Circuits,
  CommitmentProof,
  PrivacyPoolSDK,
  WithdrawalProofInput,
  calculateContext,
  Withdrawal,
  Secret,
  generateMerkleProof,
  Hash,
  WithdrawalProof,
  AccountService,
  DataService,
  PrivacyPoolAccount,
  PoolAccount as SDKPoolAccount,
  AccountCommitment,
  ChainConfig,
  PoolInfo,
  RagequitEvent
} from '@0xbow/privacy-pools-core-sdk'
import { Chain, createPublicClient, Hex, http, HttpTransport, PublicClient } from 'viem'
import { sepolia } from 'viem/chains'
import { ChainData, chainData, whitelistedChains } from '../chainData'
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

export const getTimestampFromBlockNumber = async (
  blockNumber: bigint,
  publicClient: PublicClient
) => {
  if (!publicClient) throw new Error('Public client not found')

  const block = await publicClient.getBlock({
    blockNumber
  })

  if (!block) throw new Error('Block required to get timestamp')

  return block.timestamp
}

const chainDataByWhitelistedChains = Object.values(chainData).filter(
  (chain) =>
    chain.poolInfo.length > 0 && whitelistedChains.some((c) => c.id === chain.poolInfo[0].chainId)
)

const poolsByChain = chainDataByWhitelistedChains.flatMap(
  (chain) => chain.poolInfo
) as ChainData[keyof ChainData]['poolInfo']

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

const pools: PoolInfo[] = poolsByChain.map((pool) => {
  return {
    chainId: pool.chainId,
    address: pool.address,
    scope: pool.scope as Hash,
    deploymentBlock: pool.deploymentBlock
  }
})

const dataServiceConfig: ChainConfig[] = poolsByChain.map((pool) => {
  return {
    chainId: pool.chainId,
    privacyPoolAddress: pool.address,
    startBlock: pool.deploymentBlock,
    rpcUrl: chainData[pool.chainId].sdkRpcUrl,
    apiKey: 'sdk' // It's not an api key https://viem.sh/docs/clients/public#key-optional
  }
})
const dataService = new DataService(dataServiceConfig)

/**
 * Generates a zero-knowledge proof for a commitment using Poseidon hash.
 *
 * @param value - The value being committed to
 * @param label - Label associated with the commitment
 * @param nullifier - Unique nullifier for the commitment
 * @param secret - Secret key for the commitment
 * @returns Promise resolving to proof and public signals
 * @throws {ProofError} If proof generation fails
 */
export const generateRagequitProof = async (
  commitment: AccountCommitment
): Promise<CommitmentProof> => {
  const sdkInstance = initializeSDK()
  return await sdkInstance.proveCommitment(
    commitment.value,
    commitment.label,
    commitment.nullifier,
    commitment.secret
  )
}

/**
 * Verifies a commitment proof.
 *
 * @param proof - The commitment proof to verify
 * @param publicSignals - Public signals associated with the proof
 * @returns Promise resolving to boolean indicating proof validity
 * @throws {ProofError} If verification fails
 */
export const verifyRagequitProof = async ({ proof, publicSignals }: CommitmentProof) => {
  const sdkInstance = initializeSDK()
  return await sdkInstance.verifyCommitment({ proof, publicSignals })
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
  return await sdkInstance.proveWithdrawal(
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

export const getContext = async (withdrawal: Withdrawal, scope: Hash) => {
  return await calculateContext(withdrawal, scope)
}

export const getMerkleProof = async (leaves: bigint[], leaf: bigint) => {
  return await generateMerkleProof(leaves, leaf)
}

export const verifyWithdrawalProof = async (proof: WithdrawalProof) => {
  const sdkInstance = initializeSDK()
  return await sdkInstance.verifyWithdrawal(proof)
}

export const createAccount = (seed: string) => {
  const accountService = new AccountService(dataService, { mnemonic: seed })

  return accountService
}

export const loadAccount = async (seed: string) => {
  const accountService = new AccountService(dataService, { mnemonic: seed })
  await accountService.retrieveHistory(pools)
  return accountService
}

export const createDepositSecrets = (accountService: AccountService, scope: Hash) => {
  return accountService.createDepositSecrets(scope)
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

export const addWithdrawal = async (
  accountService: AccountService,
  withdrawalParams: {
    parentCommitment: AccountCommitment
    value: bigint
    nullifier: Secret
    secret: Secret
    blockNumber: bigint
    txHash: Hex
  }
) => {
  return accountService.addWithdrawalCommitment(
    withdrawalParams.parentCommitment,
    withdrawalParams.value,
    withdrawalParams.nullifier,
    withdrawalParams.secret,
    withdrawalParams.blockNumber,
    withdrawalParams.txHash
  )
}

export const addRagequit = async (
  accountService: AccountService,
  ragequitParams: {
    label: Hash
    ragequit: {
      ragequitter: string
      commitment: Hash
      label: Hash
      value: bigint
      blockNumber: bigint
      transactionHash: Hex
    }
  }
) => {
  return accountService.addRagequitToAccount(ragequitParams.label, ragequitParams.ragequit)
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

      const publicClient = createPublicClient({
        chain: whitelistedChains.find((chain: Chain) => chain.id === Number(paChainId))!,
        transport: transports[Number(paChainId)]
      })

      updatedPoolAccount.deposit.timestamp = await getTimestampFromBlockNumber(
        poolAccount.deposit.blockNumber,
        publicClient
      )

      if (updatedPoolAccount.children.length > 0) {
        updatedPoolAccount.children.forEach(async (child) => {
          // eslint-disable-next-line no-param-reassign
          child.timestamp = await getTimestampFromBlockNumber(child.blockNumber, publicClient)
        })
      }

      if (updatedPoolAccount.ragequit) {
        updatedPoolAccount.balance = 0n
        updatedPoolAccount.reviewStatus = ReviewStatus.EXITED
      }

      if (updatedPoolAccount.ragequit) {
        updatedPoolAccount.ragequit.timestamp = await getTimestampFromBlockNumber(
          updatedPoolAccount.ragequit.blockNumber,
          publicClient!
        )
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

  // Fetch deposit data from ASP for specific labels
  const depositData = await aspClient.fetchDepositsByLabel(aspUrl, chainId, scope, labels)

  const updatedPoolAccounts = loadedPoolAccounts.map((entry) => {
    const deposit = depositData.find((d) => d.label === entry.label.toString())
    if (!deposit) return entry

    if (entry.reviewStatus === ReviewStatus.EXITED) {
      return {
        ...entry,
        reviewStatus: ReviewStatus.EXITED,
        isValid: false
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
      timestamp: deposit.timestamp
    }
  })

  return updatedPoolAccounts
}
