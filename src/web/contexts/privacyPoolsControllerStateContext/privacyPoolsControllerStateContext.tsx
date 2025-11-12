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
import useToast from '@common/hooks/useToast'
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
import {
  generateAnonymitySetFromChain,
  convertToAlgorithmFormat
} from '@web/modules/PPv1/sdk/noteSelection/anonimitySet/anonymitySetGeneration'
import { getRpcProviderForUI } from '@web/services/provider'
import {
  createDataServiceWithProviders,
  type ExtendedChainConfig
} from '@web/services/privacyPools'

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
  loadingError: string | null
  importedPrivateAccounts: PoolAccount[][]
  importedAccountsWithNames: ImportedAccountWithName[]
  anonymitySetData: Record<number, number> | undefined
  isLoadingAnonymitySet: boolean
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
  createWithdrawalSecretsForImportedAccount: (
    poolAccount: PoolAccount,
    commitment: AccountCommitment
  ) => {
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
  const { addToast } = useToast()
  // const { portfolio } = useSelectedAccountControllerState()
  // const { networks } = useNetworksControllerState()
  const chainId = 11155111 // Default PP chainId
  const PROOFS_BATCH_SIZE = 5

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
  const [loadingError, setLoadingError] = useState<string | null>(null)
  const [importedPrivateAccounts, setImportedPrivateAccounts] = useState<PoolAccount[][]>([[]])
  const [importedAccountsWithNames, setImportedAccountsWithNames] = useState<
    ImportedAccountWithName[]
  >([])
  // Map to store account services for imported accounts: key format is "chainId-scope-accountName"
  const [importedAccountServicesMap, setImportedAccountServicesMap] = useState<
    Map<string, AccountService>
  >(new Map())
  const [anonymitySetData, setAnonymitySetData] = useState<Record<number, number> | undefined>(
    undefined
  )
  const [isLoadingAnonymitySet, setIsLoadingAnonymitySet] = useState(false)
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
      setLoadingError(null)
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

      return { roots: rootsData, leaves: leavesData }
    } catch (error) {
      console.error('Error fetching MT data:', error)
      const errorMessage =
        error instanceof Error ? error.message : 'Failed to load Privacy Pools data'
      setLoadingError(errorMessage)
      addToast('Failed to load your Private Account. Please try again later.', {
        type: 'error',
        timeout: 12000
      })

      throw error
    }
  }, [memoizedState.chainData, addToast])

  const isReadyToLoad = useMemo(
    () => Boolean(mtLeaves && mtRoots && memoizedState.chainData),
    [mtLeaves, mtRoots, memoizedState.chainData]
  )

  const loadPoolAccounts = useCallback(
    async (
      accountInitSource: AccountInitSource,
      mtData?: { roots: MtRootResponse; leaves: MtLeavesResponse }
    ) => {
      if (!dataService) throw new Error('DataService not initialized.')

      const leavesData = mtData?.leaves || mtLeaves
      const rootsData = mtData?.roots || mtRoots

      if (!leavesData) throw new Error('Merkle tree data not loaded.')
      if (!rootsData) throw new Error('Merkle tree roots not loaded.')
      if (!memoizedState.chainData) throw new Error('Chain data not loaded.')

      const firstChainInfo = memoizedState.chainData?.[chainId]
      if (!firstChainInfo?.poolInfo?.[0]) throw new Error('No pool information found.')

      const firstPool = firstChainInfo.poolInfo[0]
      const aspUrl = firstChainInfo.aspUrl
      const scope = firstPool.scope.toString()

      const accountServiceResult = await initializeAccountWithEvents(
        dataService,
        accountInitSource,
        memoizedState.pools as PoolInfo[]
      )

      const { poolAccounts: poolAccountFromAccount } = await getPoolAccountsFromAccount(
        accountServiceResult.account.account,
        chainId
      )

      if (!poolAccountFromAccount) throw new Error('No pool accounts found.')

      const newPoolAccounts = await processDeposits(
        poolAccountFromAccount,
        leavesData,
        aspUrl,
        chainId,
        scope
      )

      return { poolAccounts: newPoolAccounts, accountService: accountServiceResult.account }
    },
    [dataService, mtLeaves, mtRoots, memoizedState.chainData, memoizedState.pools, chainId]
  )

  const loadPrivateAccount = useCallback(async () => {
    if (isAccountLoaded || isLoadingAccount) return
    if (!isReadyToLoad) throw new Error('Privacy Pools data not ready yet')

    try {
      setLoadingError(null)
      setIsLoadingAccount(true)
      const secrets = await getPrivateAccount()
      const result = await loadPoolAccounts({ secrets })
      setPoolAccounts(result.poolAccounts)
      setAccountService(result.accountService)
      setIsAccountLoaded(true)
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : 'Failed to load private account. Please try again.'
      setLoadingError(errorMessage)
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

        let mtData
        if (refetchLeavesAndRoots) {
          // Fetch MT data and get it returned
          mtData = await fetchMtData()
        }

        const secrets = await getPrivateAccount()
        // Pass the fetched MT data to loadPoolAccounts
        const result = await loadPoolAccounts({ secrets }, mtData)
        setPoolAccounts(result.poolAccounts)
        setAccountService(result.accountService)
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

    // Store account services in map for quick lookup
    const newAccountServicesMap = new Map<string, AccountService>()
    importedPrivateAccountsResult.forEach((result) => {
      const poolAccountsArray = result.poolAccounts
      poolAccountsArray.forEach((poolAccount) => {
        // Create unique key: chainId-scope-accountName
        const key = `${poolAccount.chainId}-${poolAccount.scope}-${poolAccount.name}`
        newAccountServicesMap.set(key, result.accountService)
      })
    })

    console.log('DEBUG:', { importedPrivateAccountsResult, accountsWithNames })

    setImportedPrivateAccounts(importedPoolAccounts)
    setImportedAccountsWithNames(accountsWithNames)
    setImportedAccountServicesMap(newAccountServicesMap)
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

  const createWithdrawalSecretsForImportedAccount = useCallback(
    (poolAccount: PoolAccount, commitment: AccountCommitment) => {
      // Create unique key to lookup the account service
      const key = `${poolAccount.chainId}-${poolAccount.scope}-${poolAccount.name}`
      const importedAccountService = importedAccountServicesMap.get(key)

      if (!importedAccountService) {
        throw new Error(
          `Could not find account service for imported pool account: ${key}. Make sure imported accounts are loaded.`
        )
      }

      return importedAccountService.createWithdrawalSecrets(commitment)
    },
    [importedAccountServicesMap]
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

  // Generate anonymity set data when app is ready
  useEffect(() => {
    if (isReadyToLoad && !anonymitySetData && !isLoadingAnonymitySet) {
      const loadAnonymitySet = async () => {
        try {
          setIsLoadingAnonymitySet(true)
          const rawAnonymitySetData = await generateAnonymitySetFromChain()
          const convertedData = convertToAlgorithmFormat(rawAnonymitySetData)
          setAnonymitySetData(convertedData)
        } finally {
          setIsLoadingAnonymitySet(false)
        }
      }

      loadAnonymitySet().catch(console.error)
    }
  }, [isReadyToLoad, anonymitySetData, isLoadingAnonymitySet])

  useEffect(() => {
    if (memoizedState.initialPromiseLoaded && memoizedState.chainData && !sdk) {
      const baseUrl = typeof window !== 'undefined' ? window.location.origin : ''

      const circuits = new Circuits({ baseUrl })

      const dataServiceConfig: ExtendedChainConfig[] = memoizedState.poolsByChain.map((pool) => {
        const chainData = memoizedState.chainData?.[pool.chainId]
        const sdkRpcUrl = chainData?.sdkRpcUrl || ''

        // Create a provider instance for this chain using UIProxyProvider
        const provider = getRpcProviderForUI(
          {
            chainId: BigInt(pool.chainId),
            rpcUrls: [sdkRpcUrl],
            selectedRpcUrl: sdkRpcUrl
          },
          dispatch
        )

        return {
          chainId: pool.chainId,
          privacyPoolAddress: pool.address,
          startBlock: pool.deploymentBlock,
          rpcUrl: sdkRpcUrl,
          provider
        }
      })

      const sdkModule = new PrivacyPoolSDK(circuits)
      const ds = createDataServiceWithProviders(dataServiceConfig)

      setDataService(ds)
      setSdk(sdkModule)

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
        loadingError,
        importedPrivateAccounts,
        importedAccountsWithNames,
        anonymitySetData,
        isLoadingAnonymitySet,
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
        createWithdrawalSecretsForImportedAccount,
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
      loadingError,
      importedPrivateAccounts,
      importedAccountsWithNames,
      anonymitySetData,
      isLoadingAnonymitySet,
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
      createWithdrawalSecretsForImportedAccount,
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
