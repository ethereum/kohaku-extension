/* eslint-disable no-console */
import React, {
  createContext,
  Dispatch,
  SetStateAction,
  useCallback,
  useEffect,
  useMemo,
  useState
} from 'react'

import {
  type ChainConfig,
  type AccountCommitment,
  type CommitmentProof,
  type WithdrawalProof,
  type Hash,
  type WithdrawalProofInput,
  type Withdrawal,
  type Secret,
  type LeanIMTMerkleProof,
  type RagequitEvent,
  type PoolInfo,
  Circuits,
  PrivacyPoolSDK,
  AccountService,
  DataService,
  calculateContext,
  generateMerkleProof,
  PoolAccount as SDKPoolAccount
} from '@0xbow/privacy-pools-core-sdk'
import {
  ImportedAccountInitSource,
  initializeAccountWithEvents,
  type AccountInitSource
} from '@web/modules/PPv1/sdk/accountInitializer'
// import { getTokenAmount } from '@ambire-common/libs/portfolio/helpers'
// import { sortPortfolioTokenList } from '@ambire-common/libs/swapAndBridge/swapAndBridge'
import { AddressState } from '@ambire-common/interfaces/domains'
import useDeepMemo from '@common/hooks/useDeepMemo'
import useBackgroundService from '@web/hooks/useBackgroundService'
import useControllerState from '@web/hooks/useControllerState'
// import useSelectedAccountControllerState from '@web/hooks/useSelectedAccountControllerState'
// import useNetworksControllerState from '@web/hooks/useNetworksControllerState'
import { getPoolAccountsFromAccount, processDeposits } from '@web/modules/PPv1/utils/sdk'
import type { PrivacyPoolsController } from '@ambire-common/controllers/privacyPools/privacyPools'
import { aspClient, MtLeavesResponse, MtRootResponse } from '@web/modules/PPv1/utils/aspClient'
import {
  storeFirstPrivateAccount,
  getPrivateAccount,
  getPPv1Accounts,
  storePPv1Accounts
} from '@web/modules/PPv1/sdk/misc'

export enum ReviewStatus {
  PENDING = 'pending',
  APPROVED = 'approved',
  DECLINED = 'declined',
  EXITED = 'exited',
  SPENT = 'spent'
}

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
  depositorAddress?: string
}

export type ImportedAccountWithName = {
  name: string
  poolAccounts: PoolAccount[]
}

type EnhancedPrivacyPoolsControllerState = {
  chainId: number
  mtRoots: MtRootResponse | undefined
  mtLeaves: MtLeavesResponse | undefined
  accountService: AccountService | undefined
  selectedPoolAccount: PoolAccount | null
  poolAccounts: PoolAccount[]
  isAccountLoaded: boolean
  isLoadingAccount: boolean
  isRefreshing: boolean
  isReadyToLoad: boolean
  importedPrivateAccounts: PoolAccount[][]
  importedAccountsWithNames: ImportedAccountWithName[]
  setIsAccountLoaded: Dispatch<SetStateAction<boolean>>
  loadPrivateAccount: () => Promise<void>
  refreshPrivateAccount: (refetchLeavesAndRoots?: boolean) => Promise<void>
  loadPPv1Accounts: () => Promise<void>
  addImportedPrivateAccount: (accountInitSource: ImportedAccountInitSource) => Promise<void>
  loadImportedPrivateAccount: (accountInitSource: AccountInitSource) => Promise<{
    poolAccounts: PoolAccount[]
    accountService: AccountService
  }>
  refreshImportedPrivateAccounts: () => Promise<void>
  generateRagequitProof: (commitment: AccountCommitment) => Promise<CommitmentProof>
  verifyRagequitProof: (commitment: CommitmentProof) => Promise<boolean>
  generateWithdrawalProof: (
    commitment: AccountCommitment,
    input: WithdrawalProofInput
  ) => Promise<WithdrawalProof>
  verifyWithdrawalProof: (proof: WithdrawalProof) => Promise<boolean>
  createDepositSecrets: (scope: Hash) => {
    nullifier: Secret
    secret: Secret
    precommitment: Hash
  }
  createWithdrawalSecrets: (commitment: AccountCommitment) => {
    nullifier: Secret
    secret: Secret
  }
  getContext: (withdrawal: Withdrawal, scope: Hash) => string
  getMerkleProof: (leaves: bigint[], leaf: bigint) => LeanIMTMerkleProof<bigint>
  setSelectedPoolAccount: Dispatch<SetStateAction<PoolAccount | null>>
  // Required PrivacyPoolsController properties
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
  depositAmount: string
  seedPhrase: string
  importedSecretNote: string
  proofsBatchSize: number
  privacyProvider: string
} & Omit<
  Partial<PrivacyPoolsController>,
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
  | 'seedPhrase'
  | 'importedSecretNote'
  | 'privacyProvider'
>

const PrivacyPoolsControllerStateContext = createContext<EnhancedPrivacyPoolsControllerState>(
  {} as EnhancedPrivacyPoolsControllerState
)

const PrivacyPoolsControllerStateProvider: React.FC<any> = ({ children }) => {
  const controller = 'privacyPools'
  const state = useControllerState(controller)
  const { dispatch } = useBackgroundService()
  // const { portfolio } = useSelectedAccountControllerState()
  // const { networks } = useNetworksControllerState()
  const chainId = 11155111 // Default PP chainId
  const PROOFS_BATCH_SIZE = 10

  const [sdk, setSdk] = useState<PrivacyPoolSDK>()
  const [dataService, setDataService] = useState<DataService>()
  const [accountService, setAccountService] = useState<AccountService>()
  const [poolAccounts, setPoolAccounts] = useState<PoolAccount[]>([])
  const [selectedPoolAccount, setSelectedPoolAccount] = useState<PoolAccount | null>(null)
  const [mtRoots, setMtRoots] = useState<MtRootResponse | undefined>(undefined)
  const [mtLeaves, setMtLeaves] = useState<MtLeavesResponse | undefined>(undefined)
  const [isAccountLoaded, setIsAccountLoaded] = useState(false)
  const [isLoadingAccount, setIsLoadingAccount] = useState(false)
  const [isRefreshing, setIsRefreshing] = useState(false)
  const [importedPrivateAccounts, setImportedPrivateAccounts] = useState<PoolAccount[][]>([[]])
  const [importedAccountsWithNames, setImportedAccountsWithNames] = useState<
    ImportedAccountWithName[]
  >([])
  const memoizedState = useDeepMemo(state, controller)

  const { secret } = memoizedState

  // Load default private account if secret is provided and reset the secret in the controller state
  useEffect(() => {
    if (secret) {
      storeFirstPrivateAccount(secret)
        .then(() => {
          dispatch({ type: 'PRIVACY_POOLS_CONTROLLER_RESET_SECRET' })
        })
        .catch(console.error)
    }
  }, [dispatch, secret])

  const fetchMtData = useCallback(async () => {
    try {
      const firstChainInfo = memoizedState.chainData?.[chainId]
      if (!firstChainInfo?.poolInfo?.length) throw new Error('No pool information found')

      const firstPool = firstChainInfo.poolInfo[0]
      const { aspUrl } = firstChainInfo
      const scope = firstPool.scope.toString()

      console.log('Fetching MT data for:', { aspUrl, scope, chainId })

      const [rootsData, leavesData] = await Promise.all([
        aspClient.fetchMtRoots(aspUrl, chainId, scope),
        aspClient.fetchMtLeaves(aspUrl, chainId, scope)
      ])

      setMtRoots(rootsData)
      setMtLeaves(leavesData)

      console.log('MT data fetched successfully:', {
        rootsCount: rootsData,
        leavesCount: leavesData
      })
    } catch (error) {
      console.error('Error fetching MT data:', error)
    }
  }, [memoizedState.chainData])

  const isReadyToLoad = useMemo(
    () => Boolean(mtLeaves && mtRoots && memoizedState.chainData),
    [mtLeaves, mtRoots, memoizedState.chainData]
  )

  const loadPoolAccounts = useCallback(
    async (accountInitSource: AccountInitSource) => {
      if (!dataService) throw new Error('DataService not initialized.')
      if (!mtLeaves) throw new Error('Merkle tree data not loaded.')
      if (!isReadyToLoad) throw new Error('Privacy Pools data not ready yet')

      const firstChainInfo = memoizedState.chainData?.[chainId]
      if (!firstChainInfo?.poolInfo?.[0]) throw new Error('No pool information found.')

      const firstPool = firstChainInfo.poolInfo[0]
      const aspUrl = firstChainInfo.aspUrl
      const scope = firstPool.scope.toString()

      // Initialize account service using isolated wrapper
      const accountServiceResult = await initializeAccountWithEvents(
        dataService,
        accountInitSource,
        memoizedState.pools as PoolInfo[]
      )

      // Get pool accounts
      const { poolAccounts: poolAccountFromAccount } = await getPoolAccountsFromAccount(
        accountServiceResult.account.account,
        chainId
      )

      if (!poolAccountFromAccount) throw new Error('No pool accounts found.')

      // Process deposits and set pool accounts
      const newPoolAccounts = await processDeposits(
        poolAccountFromAccount,
        mtLeaves,
        aspUrl,
        chainId,
        scope
      )

      return { poolAccounts: newPoolAccounts, accountService: accountServiceResult.account }
    },
    [dataService, mtLeaves, isReadyToLoad, memoizedState.chainData, memoizedState.pools, chainId]
  )

  const loadPrivateAccount = useCallback(async () => {
    if (isAccountLoaded || isLoadingAccount) return
    if (!isReadyToLoad) throw new Error('Privacy Pools data not ready yet')

    try {
      setIsLoadingAccount(true)
      const secrets = await getPrivateAccount()
      const result = await loadPoolAccounts({ secrets })
      setPoolAccounts(result.poolAccounts)
      setAccountService(result.accountService)
      setIsAccountLoaded(true)
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : 'Failed to load private account. Please try again.'
      throw new Error(errorMessage)
    } finally {
      setIsLoadingAccount(false)
    }
  }, [isAccountLoaded, isLoadingAccount, isReadyToLoad, loadPoolAccounts])

  const refreshPrivateAccount = useCallback(
    async (refetchLeavesAndRoots = false) => {
      if (isLoadingAccount || isRefreshing) {
        return
      }

      try {
        setIsRefreshing(true)
        setIsAccountLoaded(false)
        setIsLoadingAccount(true)

        const secrets = await getPrivateAccount()
        const result = await loadPoolAccounts({ secrets })
        setPoolAccounts(result.poolAccounts)
        setAccountService(result.accountService)

        if (refetchLeavesAndRoots) {
          await fetchMtData()
        }
      } catch (error) {
        const errorMessage =
          error instanceof Error ? error.message : 'Failed to refresh account. Please try again.'
        throw new Error(errorMessage)
      } finally {
        setIsLoadingAccount(false)
        setIsAccountLoaded(true)
        setIsRefreshing(false)
      }
    },
    [isLoadingAccount, isRefreshing, loadPoolAccounts, fetchMtData]
  )

  const loadImportedPPv1Accounts = useCallback(async () => {
    const accounts = await getPPv1Accounts()

    const importedPrivateAccountsResult = await Promise.all(
      accounts.map(async (account) => {
        return loadPoolAccounts(account)
      })
    )

    const importedPoolAccounts = importedPrivateAccountsResult.map((result) => result.poolAccounts)

    const accountsWithNames: ImportedAccountWithName[] = accounts.map((account, index) => ({
      name: account.name || `Privacy Pools #${index + 1}`,
      poolAccounts: importedPoolAccounts[index] || []
    }))

    console.log('DEBUG:', { importedPrivateAccountsResult, accountsWithNames })

    setImportedPrivateAccounts(importedPoolAccounts)
    setImportedAccountsWithNames(accountsWithNames)
  }, [loadPoolAccounts])

  const addImportedPrivateAccount = useCallback(
    async (accountInitSource: ImportedAccountInitSource) => {
      try {
        await storePPv1Accounts(accountInitSource)
        await loadImportedPPv1Accounts()
      } catch (error) {
        const errorMessage =
          error instanceof Error
            ? error.message
            : 'Failed to add imported private account. Please try again.'
        throw new Error(errorMessage)
      }
    },
    [loadImportedPPv1Accounts]
  )

  const refreshImportedPrivateAccounts = useCallback(async () => {
    try {
      setIsRefreshing(true)
      await loadImportedPPv1Accounts()
    } catch (error) {
      const errorMessage =
        error instanceof Error
          ? error.message
          : 'Failed to refresh imported private accounts. Please try again.'
      throw new Error(errorMessage)
    } finally {
      setIsRefreshing(false)
    }
  }, [loadImportedPPv1Accounts])

  const generateRagequitProof = useCallback(
    async (commitment: AccountCommitment): Promise<CommitmentProof> => {
      if (!sdk) throw new Error('SDK not initialized.')

      return sdk.proveCommitment(
        commitment.value,
        commitment.label,
        commitment.nullifier,
        commitment.secret
      )
    },
    [sdk]
  )

  const verifyRagequitProof = useCallback(
    async ({ proof, publicSignals }: CommitmentProof) => {
      if (!sdk) throw new Error('SDK not initialized.')

      return sdk.verifyCommitment({ proof, publicSignals })
    },
    [sdk]
  )

  const generateWithdrawalProof = useCallback(
    async (commitment: AccountCommitment, input: WithdrawalProofInput) => {
      if (!sdk) throw new Error('SDK not initialized.')

      return sdk.proveWithdrawal(
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
    },
    [sdk]
  )

  const verifyWithdrawalProof = useCallback(
    async (proof: WithdrawalProof) => {
      if (!sdk) throw new Error('SDK not initialized.')

      return sdk.verifyWithdrawal(proof)
    },
    [sdk]
  )

  const createDepositSecrets = useCallback(
    (scope: Hash) => {
      if (!accountService) throw new Error('AccountService not initialized')

      return accountService.createDepositSecrets(scope)
    },
    [accountService]
  )

  const createWithdrawalSecrets = useCallback(
    (commitment: AccountCommitment) => {
      if (!accountService) throw new Error('AccountService not initialized')

      return accountService.createWithdrawalSecrets(commitment)
    },
    [accountService]
  )

  const getContext = useCallback(
    (withdrawal: Withdrawal, scope: Hash) => {
      if (!sdk) throw new Error('SDK not initialized.')

      return calculateContext(withdrawal, scope)
    },
    [sdk]
  )

  const getMerkleProof = useCallback(
    (leaves: bigint[], leaf: bigint) => {
      if (!sdk) throw new Error('SDK not initialized.')

      return generateMerkleProof(leaves, leaf)
    },
    [sdk]
  )

  useEffect(() => {
    if (!Object.keys(state).length) {
      dispatch({ type: 'INIT_CONTROLLER_STATE', params: { controller } })
    }
  }, [dispatch, state])

  // Load PPv1 accounts on initialization
  useEffect(() => {
    if (isReadyToLoad) {
      loadImportedPPv1Accounts().catch(console.error)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isReadyToLoad])

  useEffect(() => {
    if (memoizedState.initialPromiseLoaded && memoizedState.chainData && !sdk) {
      const baseUrl = typeof window !== 'undefined' ? window.location.origin : ''

      const circuits = new Circuits({ baseUrl })

      const dataServiceConfig: ChainConfig[] = memoizedState.poolsByChain.map((pool) => {
        return {
          chainId: pool.chainId,
          privacyPoolAddress: pool.address,
          startBlock: pool.deploymentBlock,
          rpcUrl: memoizedState.chainData?.[pool.chainId]?.sdkRpcUrl || '',
          apiKey: 'sdk'
        }
      })

      const sdkModule = new PrivacyPoolSDK(circuits)
      const ds = new DataService(dataServiceConfig)

      setDataService(ds)
      setSdk(sdkModule)

      // eslint-disable-next-line no-console
      fetchMtData().catch(console.error)

      dispatch({
        type: 'PRIVACY_POOLS_CONTROLLER_SDK_LOADED'
      })
    }
  }, [
    memoizedState.isInitialized,
    memoizedState.initialPromiseLoaded,
    memoizedState.chainData,
    memoizedState.poolsByChain,
    memoizedState,
    fetchMtData,
    dispatch,
    sdk
  ])

  const value = useMemo(
    () =>
      ({
        ...memoizedState,
        selectedToken: memoizedState.selectedToken,
        maxAmount: memoizedState.maxAmount,
        privacyProvider: memoizedState.privacyProvider,
        mtRoots,
        mtLeaves,
        accountService,
        poolAccounts,
        selectedPoolAccount,
        isAccountLoaded,
        isLoadingAccount,
        isRefreshing,
        chainId,
        isReadyToLoad,
        importedPrivateAccounts,
        importedAccountsWithNames,
        proofsBatchSize: PROOFS_BATCH_SIZE,
        loadPrivateAccount,
        refreshPrivateAccount,
        loadPPv1Accounts: loadImportedPPv1Accounts,
        addImportedPrivateAccount,
        loadImportedPrivateAccount: loadPoolAccounts,
        refreshImportedPrivateAccounts,
        setIsAccountLoaded,
        generateRagequitProof,
        verifyRagequitProof,
        generateWithdrawalProof,
        verifyWithdrawalProof,
        createDepositSecrets,
        createWithdrawalSecrets,
        getContext,
        getMerkleProof,
        setSelectedPoolAccount
      } as EnhancedPrivacyPoolsControllerState),
    [
      memoizedState,
      mtRoots,
      mtLeaves,
      accountService,
      poolAccounts,
      selectedPoolAccount,
      isAccountLoaded,
      isLoadingAccount,
      isRefreshing,
      chainId,
      isReadyToLoad,
      importedPrivateAccounts,
      importedAccountsWithNames,
      loadPrivateAccount,
      refreshPrivateAccount,
      loadImportedPPv1Accounts,
      addImportedPrivateAccount,
      loadPoolAccounts,
      refreshImportedPrivateAccounts,
      setIsAccountLoaded,
      generateRagequitProof,
      verifyRagequitProof,
      generateWithdrawalProof,
      verifyWithdrawalProof,
      createDepositSecrets,
      createWithdrawalSecrets,
      getContext,
      getMerkleProof
    ]
  )

  return (
    <PrivacyPoolsControllerStateContext.Provider value={value}>
      {children}
    </PrivacyPoolsControllerStateContext.Provider>
  )
}

export { PrivacyPoolsControllerStateProvider, PrivacyPoolsControllerStateContext }
