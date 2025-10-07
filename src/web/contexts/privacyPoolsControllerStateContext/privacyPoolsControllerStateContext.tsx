/* eslint-disable @typescript-eslint/no-shadow */
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
  type PoolInfo,
  type AccountCommitment,
  type CommitmentProof,
  type WithdrawalProof,
  type Hash,
  type WithdrawalProofInput,
  type Withdrawal,
  type Secret,
  type LeanIMTMerkleProof,
  type RagequitEvent,
  Circuits,
  PrivacyPoolSDK,
  DataService,
  AccountService,
  calculateContext,
  generateMerkleProof,
  PoolAccount as SDKPoolAccount
} from '@0xbow/privacy-pools-core-sdk'

import { TokenResult } from '@ambire-common/libs/portfolio'
import { getTokenAmount } from '@ambire-common/libs/portfolio/helpers'
import { sortPortfolioTokenList } from '@ambire-common/libs/swapAndBridge/swapAndBridge'
import useDeepMemo from '@common/hooks/useDeepMemo'
import useBackgroundService from '@web/hooks/useBackgroundService'
import useControllerState from '@web/hooks/useControllerState'
import useSelectedAccountControllerState from '@web/hooks/useSelectedAccountControllerState'
import useNetworksControllerState from '@web/hooks/useNetworksControllerState'
import { getPoolAccountsFromAccount, processDeposits } from '@web/modules/PPv1-old/utils/sdk'
import type { PrivacyPoolsController } from '@ambire-common/controllers/privacyPools/privacyPools'
import { aspClient, MtLeavesResponse, MtRootResponse } from '@web/modules/PPv1-old/utils/aspClient'
import { AddressState } from '@ambire-common/interfaces/domains'

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
}

type EnhancedPrivacyPoolsControllerState = {
  mtRoots: MtRootResponse | undefined
  mtLeaves: MtLeavesResponse | undefined
  accountService: AccountService | undefined
  selectedPoolAccount: PoolAccount | null
  poolAccounts: PoolAccount[]
  isAccountLoaded: boolean
  tokens: any[]
  loadAccount: () => Promise<void>
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
>

const PrivacyPoolsControllerStateContext = createContext<EnhancedPrivacyPoolsControllerState>(
  {} as EnhancedPrivacyPoolsControllerState
)

const PrivacyPoolsControllerStateProvider: React.FC<any> = ({ children }) => {
  const controller = 'privacyPools'
  const state = useControllerState(controller)
  const { dispatch } = useBackgroundService()
  const { portfolio } = useSelectedAccountControllerState()
  const { networks } = useNetworksControllerState()

  const [sdk, setSdk] = useState<PrivacyPoolSDK>()
  const [dataService, setDataService] = useState<DataService>()
  const [accountService, setAccountService] = useState<AccountService>()
  const [poolAccounts, setPoolAccounts] = useState<PoolAccount[]>([])
  const [selectedPoolAccount, setSelectedPoolAccount] = useState<PoolAccount | null>(null)
  const [mtRoots, setMtRoots] = useState<MtRootResponse | undefined>(undefined)
  const [mtLeaves, setMtLeaves] = useState<MtLeavesResponse | undefined>(undefined)
  const [isAccountLoaded, setIsAccountLoaded] = useState(false)

  const memoizedState = useDeepMemo(state, controller)

  const rawTokens = useMemo(() => {
    if (!networks || !portfolio?.tokens) return []

    return sortPortfolioTokenList(
      portfolio.tokens.filter((token) => {
        const hasAmount = Number(getTokenAmount(token)) > 0
        return hasAmount && !token.flags.onGasTank && !token.flags.rewardsType
      })
    )
  }, [portfolio?.tokens, networks])

  // This ensures that `tokens` won't trigger re-renders unless its deep content changes
  const tokens = useDeepMemo(rawTokens, 'tokens')

  const updatedSelectedToken = useMemo(() => {
    if (!memoizedState.selectedToken) return null

    return tokens.find(
      (token) =>
        token.address === memoizedState.selectedToken?.address &&
        token.chainId === memoizedState.selectedToken?.chainId
    )
  }, [tokens, memoizedState.selectedToken?.address, memoizedState.selectedToken?.chainId])

  // If a token is already selected, we should retrieve its latest value from tokens.
  // This is important because the token amount is likely to change,
  // especially when initiating a transfer or adding a new one to the queue.
  // As a result, the token `amountPostSimulation` may differ, and we need to update the available token balance accordingly.
  useEffect(() => {
    if (!updatedSelectedToken) return

    dispatch({
      type: 'PRIVACY_POOLS_CONTROLLER_UPDATE_FORM',
      params: { selectedToken: updatedSelectedToken }
    })
  }, [updatedSelectedToken, dispatch])

  const fetchMtData = useCallback(async () => {
    try {
      const firstChainInfo = memoizedState.chainData?.[11155111]

      if (!firstChainInfo || !firstChainInfo.poolInfo.length) {
        throw new Error('No pool information found')
      }

      const firstPool = firstChainInfo.poolInfo[0]
      const { aspUrl } = firstChainInfo
      const scope = firstPool.scope.toString()

      console.log('Fetching MT data for:', {
        firstChainInfo,
        aspUrl,
        scope
      })

      // Fetch MT roots and leaves in parallel
      const [rootsData, leavesData] = await Promise.all([
        aspClient.fetchMtRoots(aspUrl, 11155111, scope),
        aspClient.fetchMtLeaves(aspUrl, 11155111, scope)
      ])

      setMtRoots(rootsData)
      setMtLeaves(leavesData)

      console.log('MT data fetched successfully:', {
        roots: rootsData,
        leaves: leavesData
      })
    } catch (error) {
      console.error('Error fetching MT data:', error)
    }
  }, [memoizedState.chainData])

  const loadAccount = useCallback(async () => {
    if (!dataService) {
      throw new Error('DataService not initialized.')
    }

    const accountServiceResult = await AccountService.initializeWithEvents(
      dataService,
      {
        mnemonic: memoizedState.seedPhrase.trim()
      },
      memoizedState.pools as PoolInfo[]
    )

    setAccountService(accountServiceResult.account)

    const { poolAccounts: poolAccountFromAccount } = await getPoolAccountsFromAccount(
      accountServiceResult.account.account,
      11155111
    )

    if (!poolAccountFromAccount || !mtLeaves) {
      throw new Error('No pool information found.')
    }

    const firstChainInfo = memoizedState.chainData?.[11155111]

    const firstPool = firstChainInfo?.poolInfo[0]
    const aspUrl = firstChainInfo?.aspUrl ?? ''
    const scope = firstPool?.scope?.toString() ?? ''

    const newPoolAccounts = await processDeposits(
      poolAccountFromAccount,
      mtLeaves,
      aspUrl,
      11155111,
      scope
    )

    setPoolAccounts(newPoolAccounts)
    setIsAccountLoaded(true)
  }, [
    mtLeaves,
    dataService,
    memoizedState.pools,
    memoizedState.chainData,
    memoizedState.seedPhrase
  ])

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
    () => ({
      ...memoizedState,
      mtRoots,
      mtLeaves,
      accountService,
      poolAccounts,
      selectedPoolAccount,
      isAccountLoaded,
      tokens,
      loadAccount,
      generateRagequitProof,
      verifyRagequitProof,
      generateWithdrawalProof,
      verifyWithdrawalProof,
      createDepositSecrets,
      createWithdrawalSecrets,
      getContext,
      getMerkleProof,
      setSelectedPoolAccount
    }),
    [
      memoizedState,
      mtRoots,
      mtLeaves,
      accountService,
      poolAccounts,
      selectedPoolAccount,
      isAccountLoaded,
      tokens,
      loadAccount,
      generateRagequitProof,
      verifyRagequitProof,
      generateWithdrawalProof,
      verifyWithdrawalProof,
      createDepositSecrets,
      createWithdrawalSecrets,
      getContext,
      getMerkleProof,
      setSelectedPoolAccount
    ]
  )

  return (
    <PrivacyPoolsControllerStateContext.Provider value={value}>
      {children}
    </PrivacyPoolsControllerStateContext.Provider>
  )
}

export { PrivacyPoolsControllerStateProvider, PrivacyPoolsControllerStateContext }
