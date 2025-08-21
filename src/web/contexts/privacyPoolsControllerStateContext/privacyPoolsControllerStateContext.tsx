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

import useDeepMemo from '@common/hooks/useDeepMemo'
import useBackgroundService from '@web/hooks/useBackgroundService'
import useControllerState from '@web/hooks/useControllerState'
import { getPoolAccountsFromAccount } from '@web/modules/privacyPools/utils/sdk'
import type { PrivacyPoolsController } from '@ambire-common/controllers/privacyPools/privacyPools'

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
  accountService: AccountService | undefined
  selectedPoolAccount: PoolAccount | null
  poolAccounts: PoolAccount[]
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
  createWithdrawalSecrets: (
    commitment: AccountCommitment,
    input: WithdrawalProofInput
  ) => {
    nullifier: Secret
    secret: Secret
  }
  getContext: (withdrawal: Withdrawal, scope: Hash) => string
  getMerkleProof: (leaves: bigint[], leaf: bigint) => LeanIMTMerkleProof<bigint>
  setSelectedPoolAccount: Dispatch<SetStateAction<PoolAccount | null>>
} & Partial<PrivacyPoolsController>

const PrivacyPoolsControllerStateContext = createContext<EnhancedPrivacyPoolsControllerState>(
  {} as EnhancedPrivacyPoolsControllerState
)

const PrivacyPoolsControllerStateProvider: React.FC<any> = ({ children }) => {
  const controller = 'privacyPools'
  const state = useControllerState(controller)
  const { dispatch } = useBackgroundService()

  const [sdk, setSdk] = useState<PrivacyPoolSDK>()
  const [dataService, setDataService] = useState<DataService>()
  const [accountService, setAccountService] = useState<AccountService>()
  const [poolAccounts, setPoolAccounts] = useState<PoolAccount[]>([])
  const [selectedPoolAccount, setSelectedPoolAccount] = useState<PoolAccount | null>(null)

  useEffect(() => {
    if (!Object.keys(state).length) {
      dispatch({ type: 'INIT_CONTROLLER_STATE', params: { controller } })
    }
  }, [dispatch, state])

  const memoizedState = useDeepMemo(state, controller)

  useEffect(() => {
    // TODO: initialPromiseLoaded is probably not needed
    if (
      !memoizedState.isInitialized &&
      memoizedState.initialPromiseLoaded &&
      memoizedState.chainData
    ) {
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
      console.log('DEBUG: Privacy controller SDK initialized')

      dispatch({
        type: 'PRIVACY_POOLS_CONTROLLER_SDK_LOADED'
      })
    }
  }, [
    memoizedState.isInitialized,
    memoizedState.initialPromiseLoaded,
    memoizedState.chainData,
    memoizedState.poolsByChain,
    dispatch
  ])

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

    const { poolAccounts: newPoolAccounts } = await getPoolAccountsFromAccount(
      accountServiceResult.account.account,
      11155111
    )

    setPoolAccounts(newPoolAccounts)
  }, [dataService, memoizedState.seedPhrase, memoizedState.pools])

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

  const value = useMemo(
    () => ({
      ...memoizedState,
      accountService,
      poolAccounts,
      selectedPoolAccount,
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
      accountService,
      poolAccounts,
      selectedPoolAccount,
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
