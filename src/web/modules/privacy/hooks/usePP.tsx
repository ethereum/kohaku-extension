import useBackgroundService from '@web/hooks/useBackgroundService'
import { useState } from 'react'
import { AccountService, PoolAccount } from '@0xbow/privacy-pools-core-sdk'
import useSelectedAccountControllerState from '@web/hooks/useSelectedAccountControllerState'
import { generateSeedPhrase } from '../utils/seedPhrase'
import { getPoolAccountsFromAccount, loadAccount } from '../utils/privacy/sdk'

type PrivateRequestType = 'privateDepositRequest' | 'privateSendRequest' | 'privateRagequitRequest'

export const usePP = () => {
  const selectedAccount = useSelectedAccountControllerState()
  const { dispatch } = useBackgroundService()

  const [seedPhrase, setSeedPhrase] = useState('')
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null)
  const [isGenerating, setIsGenerating] = useState(false)
  const [isLoading, setIsLoadingAccount] = useState(false)
  const [loadedAccount, setLoadedAccount] = useState<AccountService | undefined>(undefined)
  const [poolAccounts, setPoolAccounts] = useState<PoolAccount[] | undefined>(undefined)

  // const [mtRoots, setMtRoots] = useState<MtRootResponse | undefined>(undefined)
  // const [mtLeaves, setMtLeaves] = useState<MtLeavesResponse | undefined>(undefined)

  const handleGenerateSeedPhrase = async () => {
    try {
      setIsGenerating(true)
      setMessage(null)

      const newSeedPhrase = generateSeedPhrase()
      setSeedPhrase(newSeedPhrase)
      setMessage({ type: 'success', text: 'New seed phrase generated successfully!' })
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : 'Failed to generate seed phrase. Please try again.'
      setMessage({ type: 'error', text: errorMessage })
    } finally {
      setIsGenerating(false)
    }
  }

  const handleLoadAccount = async () => {
    setIsLoadingAccount(true)
    if (!seedPhrase.trim()) {
      setMessage({ type: 'error', text: 'Please enter a seed phrase to load an existing account.' })
      return
    }

    setMessage(null)

    const account = await loadAccount(seedPhrase.trim())

    setMessage({ type: 'success', text: 'Account loaded successfully!' })
    setLoadedAccount(account)

    const { poolAccounts: newPoolAccounts } = await getPoolAccountsFromAccount(
      account.account,
      11155111
    )

    // eslint-disable-next-line no-console
    console.log('newPoolAccounts', newPoolAccounts)

    setPoolAccounts(newPoolAccounts)
    setIsLoadingAccount(false)

    // if (!poolAccounts || !mtLeaves) return

    // // Get the first whitelisted chain and its first pool for the demo
    // const firstChain = whitelistedChains[0]
    // const chainInfo = chainData[firstChain.id]

    // if (!chainInfo || !chainInfo.poolInfo.length) {
    //   throw new Error('No pool information found')
    // }

    // const firstPool = chainInfo.poolInfo[0]
    // const { aspUrl } = chainInfo
    // const scope = firstPool.scope.toString()

    // console.log('poolAccounts', poolAccounts)

    // const newPoolAccounts = await processDeposits(
    //   poolAccounts,
    //   mtLeaves,
    //   aspUrl,
    //   firstChain.id,
    //   scope
    // )

    // setPoolAccounts(newPoolAccounts)
  }

  const handlePrivateRequest = (
    type: PrivateRequestType,
    txList: { to: string; value: bigint; data: string }[]
  ) => {
    dispatch({
      type: 'REQUESTS_CONTROLLER_BUILD_REQUEST',
      params: { type, params: { txList, actionExecutionType: 'open-action-window' } }
    })
  }

  return {
    handlePrivateRequest,
    handleGenerateSeedPhrase,
    handleLoadAccount,
    setSeedPhrase,
    setMessage,
    seedPhrase,
    message,
    isGenerating,
    isLoading,
    loadedAccount,
    poolAccounts,
    userAddress: selectedAccount.account?.addr
  }
}
