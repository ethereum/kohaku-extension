import React, { ReactNode, useCallback, useEffect, useMemo, useState } from 'react'
import { View } from 'react-native'

import ScrollableWrapper from '@common/components/ScrollableWrapper'
import Text from '@common/components/Text'
import TokenIcon from '@common/components/TokenIcon'
import { useTranslation } from '@common/config/localization'
import spacings from '@common/styles/spacings'
import flexbox from '@common/styles/utils/flexbox'
import useSelectedAccountControllerState from '@web/hooks/useSelectedAccountControllerState'
import useAccountsControllerState from '@web/hooks/useAccountsControllerState'
import useBackgroundService from '@web/hooks/useBackgroundService'
import useNetworksControllerState from '@web/hooks/useNetworksControllerState'
import { formatEther, formatUnits, parseUnits, zeroAddress } from 'viem'
import { PoolInfo } from '@ambire-common/controllers/privacyPools/config'
import { getTokenAmount } from '@ambire-common/libs/portfolio/helpers'
import PrivacyIcon from '@common/assets/svg/PrivacyIcon'
import Select from '@common/components/Select'
import { SelectValue } from '@common/components/Select/types'
import Avatar from '@common/components/Avatar'
import { isSmartAccount } from '@ambire-common/libs/account/account'
import shortenAddress from '@ambire-common/utils/shortenAddress'
import RailgunIcon from '@common/assets/svg/RailgunIcon'
import useGetTokenSelectProps from '@common/hooks/useGetTokenSelectProps/useGetTokenSelectProps'
import { getTokenId } from '@web/utils/token'
import SendToken from '../SendToken'
import styles from './styles'

const DepositForm = ({
  poolInfo,
  depositAmount,
  amountErrorMessage,
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  formTitle,
  selectedToken,
  handleUpdateForm,
  chainId,
  privacyProvider
}: {
  poolInfo?: PoolInfo
  depositAmount?: string
  selectedToken: any
  amountErrorMessage: string
  formTitle: string | ReactNode
  handleUpdateForm: (params: { [key: string]: any }) => void
  chainId: bigint
  privacyProvider?: string
}) => {
  const { account: selectedAccount, portfolio: selectedAccountPortfolio } =
    useSelectedAccountControllerState()
  const { accounts } = useAccountsControllerState()
  const { networks } = useNetworksControllerState()
  const { dispatch } = useBackgroundService()
  const { t } = useTranslation()
  const [displayAmount, setDisplayAmount] = useState('')
  const [selectedAccountAddr, setSelectedAccountAddr] = useState<string | null>(null)
  const [mySelectedToken, setMySelectedToken] = useState<any>(null)

  const ethBalance =
    selectedAccountPortfolio?.tokens.find((token) => token.address === zeroAddress)?.amount || 0n

  // Filter out private account (zeroAddress)
  const regularAccounts = useMemo(
    () => accounts.filter((acc) => acc.addr !== zeroAddress),
    [accounts]
  )

  // Set initial selected account
  useEffect(() => {
    if (!selectedAccountAddr && selectedAccount && selectedAccount.addr !== zeroAddress) {
      setSelectedAccountAddr(selectedAccount.addr)
    }
  }, [selectedAccount, selectedAccountAddr])

  // Set initial selected token
  useEffect(() => {
    setMySelectedToken(selectedToken)
  }, [selectedToken])

  // Get portfolio for the currently selected account
  // When user selects a different account in the dropdown, we immediately switch to it
  const portfolio = selectedAccountPortfolio

  // Get all tokens from portfolio that match the chainId
  const availableTokens = useMemo(() => {
    if (!portfolio?.tokens || !networks) return []

    return portfolio.tokens.filter((token) => {
      // Filter by chainId
      if (token.chainId !== chainId) return false

      // Exclude gas tank tokens and rewards tokens
      if (token.flags.onGasTank || token.flags.rewardsType) return false

      // For Privacy Pools, only allow native ETH
      const isNative = token.address === zeroAddress
      if (privacyProvider === 'privacy-pools' && !isNative) return false

      // Include tokens with balance > 0 or native token
      const hasAmount = getTokenAmount(token) > 0n

      return hasAmount || isNative
    })
  }, [portfolio?.tokens, chainId, networks, privacyProvider])

  // Get the currently selected token from portfolio
  const currentSelectedToken = useMemo(() => {
    if (!mySelectedToken || !portfolio?.tokens) return null

    return (
      portfolio.tokens.find(
        (token) =>
          token.chainId === mySelectedToken.chainId &&
          token.address.toLowerCase() === mySelectedToken.address.toLowerCase()
      ) || null
    )
  }, [mySelectedToken, portfolio?.tokens])

  // Build token select options using useGetTokenSelectProps
  const { options: tokenOptions, value: tokenSelectValue } = useGetTokenSelectProps({
    tokens: availableTokens,
    token: currentSelectedToken ? getTokenId(currentSelectedToken) : '',
    networks: networks || [],
    isToToken: false
  })

  const [selectedProvider, setSelectedProvider] = useState<SelectValue>(() => {
    if (privacyProvider === 'railgun') {
      return { value: 'railgun', label: t('Railgun') }
    }
    return { value: 'privacy-pools', label: t('Privacy Pools') }
  })

  // Get balance for the currently selected token
  const selectedTokenBalance = useMemo(() => {
    if (!currentSelectedToken) return 0n
    return getTokenAmount(currentSelectedToken)
  }, [currentSelectedToken])

  // Create account options for the selector
  const accountOptions: SelectValue[] = useMemo(() => {
    return regularAccounts.map((account) => {
      return {
        label: account.preferences.label || shortenAddress(account.addr, 10),
        value: account.addr,
        icon: <Avatar pfp={account.preferences.pfp} size={30} isSmart={isSmartAccount(account)} />
      }
    })
  }, [regularAccounts])

  const selectedAccountValue = useMemo(() => {
    return accountOptions.find((opt) => opt.value === selectedAccountAddr) || null
  }, [accountOptions, selectedAccountAddr])

  const handleAccountChange = useCallback(
    (value: SelectValue) => {
      const newAccountAddr = value.value as string
      setSelectedAccountAddr(newAccountAddr)

      // Switch to the selected account immediately to load its portfolio
      if (selectedAccount?.addr !== newAccountAddr) {
        dispatch({
          type: 'MAIN_CONTROLLER_SELECT_ACCOUNT',
          params: { accountAddr: newAccountAddr }
        })
      }

      // Reset amount when changing accounts
      setDisplayAmount('')
      handleUpdateForm({ depositAmount: '0' })
    },
    [handleUpdateForm, selectedAccount?.addr, dispatch]
  )

  const handleChangeFromToken = useCallback(
    (value: SelectValue) => {
      const tokenId = value.value as string
      const tokenToSelect = availableTokens.find((token) => getTokenId(token) === tokenId)

      if (tokenToSelect) {
        setMySelectedToken(tokenToSelect)
        // Reset amount when changing tokens
        setDisplayAmount('')
        handleUpdateForm({ selectedToken: tokenToSelect, depositAmount: '0' })
      }
    },
    [availableTokens, handleUpdateForm]
  )

  const handleSetMaxAmount = useCallback(() => {
    if (!currentSelectedToken || selectedTokenBalance <= 0n) {
      setDisplayAmount('')
      handleUpdateForm({ depositAmount: '0' })
      return
    }

    const decimals = currentSelectedToken.decimals || 18
    const formattedAmount = formatUnits(selectedTokenBalance, decimals)
    setDisplayAmount(formattedAmount)

    // Store the amount in the smallest unit (wei for ETH, or token's smallest unit)
    handleUpdateForm({ depositAmount: selectedTokenBalance.toString() })
  }, [currentSelectedToken, selectedTokenBalance, handleUpdateForm])

  const handleAmountChange = useCallback(
    (inputValue: string) => {
      setDisplayAmount(inputValue)

      if (!currentSelectedToken) {
        handleUpdateForm({ depositAmount: '0' })
        return
      }

      try {
        if (inputValue === '') {
          handleUpdateForm({ depositAmount: '0' })
          return
        }

        if (inputValue.endsWith('.') || inputValue === '0.' || /^\d*\.0*$/.test(inputValue)) {
          return
        }

        const numValue = parseFloat(inputValue)
        if (Number.isNaN(numValue) || numValue < 0) {
          return
        }

        const decimals = currentSelectedToken.decimals || 18
        const tokenAmount = parseUnits(inputValue, decimals)
        handleUpdateForm({ depositAmount: tokenAmount.toString() })
      } catch (error) {
        // eslint-disable-next-line no-console
        console.warn('Invalid token amount entered:', inputValue)
      }
    },
    [currentSelectedToken, handleUpdateForm]
  )

  // Initialize selectedToken with default ETH token if not set
  useEffect(() => {
    if (!mySelectedToken && portfolio?.isReadyToVisualize && availableTokens.length > 0) {
      // Default to native token (ETH) if available, otherwise use first token
      const defaultToken =
        availableTokens.find((token) => token.address === zeroAddress) || availableTokens[0]

      if (defaultToken) {
        const defaultTokenBalance = getTokenAmount(defaultToken)
        const args =
          privacyProvider === 'railgun'
            ? { selectedToken: defaultToken }
            : {
                selectedToken: defaultToken,
                maxAmount:
                  defaultToken.decimals !== undefined
                    ? formatUnits(defaultTokenBalance, defaultToken.decimals)
                    : formatEther(defaultTokenBalance)
              }
        handleUpdateForm(args)
      }
    }
  }, [
    mySelectedToken,
    portfolio?.isReadyToVisualize,
    availableTokens,
    handleUpdateForm,
    privacyProvider
  ])

  const handleProviderChange = (provider: SelectValue) => {
    setSelectedProvider(provider)
    setMySelectedToken(null)
    handleUpdateForm({ privacyProvider: provider.value, selectedToken: null })
  }

  useEffect(() => {
    if (portfolio?.isReadyToVisualize && selectedAccountAddr) {
      const updatedToken = portfolio?.tokens.find(
        (token) => token.chainId === chainId && token.address === zeroAddress
      )
      if (updatedToken) {
        handleUpdateForm({ selectedToken: updatedToken, maxAmount: formatEther(ethBalance) })
      }
    }
  }, [
    selectedAccountAddr,
    portfolio?.isReadyToVisualize,
    portfolio?.tokens,
    chainId,
    ethBalance,
    handleUpdateForm
  ])

  useEffect(() => {
    if (depositAmount && depositAmount !== '0') {
      try {
        const decimals = currentSelectedToken?.decimals || 18
        setDisplayAmount(formatUnits(BigInt(depositAmount), decimals))
      } catch {
        setDisplayAmount('')
      }
    } else {
      setDisplayAmount('')
    }
  }, [depositAmount, currentSelectedToken])

  // Sync local provider state with parent privacyProvider prop
  useEffect(() => {
    if (privacyProvider === 'railgun') {
      setSelectedProvider({ value: 'railgun', label: t('Railgun') })
    } else {
      setSelectedProvider({ value: 'privacy-pools', label: t('Privacy Pools') })
    }
  }, [privacyProvider, t])

  // Move useMemo BEFORE the early return to comply with Rules of Hooks
  const vettingFeeEth = useMemo(() => {
    // Vetting Fee in PPv1 is 1% of the deposit amount
    let vettingFeeEthValue = '0'
    try {
      if (depositAmount && depositAmount !== '0') {
        const feeAmount = BigInt(depositAmount) / 100n
        // For vetting fee display, we always show in ETH format (18 decimals)
        // This assumes the fee is calculated in the same unit as the deposit
        vettingFeeEthValue = formatEther(feeAmount)
      }
    } catch {
      vettingFeeEthValue = '0'
    }
    return vettingFeeEthValue
  }, [depositAmount])

  // Format max amount for display
  const maxFromAmountFormatted = useMemo(() => {
    if (!currentSelectedToken || selectedTokenBalance <= 0n) return '0'
    const decimals = currentSelectedToken.decimals || 18
    return formatUnits(selectedTokenBalance, decimals)
  }, [currentSelectedToken, selectedTokenBalance])

  // Format current amount for display
  const fromAmountFormatted = useMemo(() => {
    if (!depositAmount || depositAmount === '0' || !currentSelectedToken) return '0'
    try {
      const decimals = currentSelectedToken.decimals || 18
      return formatUnits(BigInt(depositAmount), decimals)
    } catch {
      return '0'
    }
  }, [depositAmount, currentSelectedToken])

  // Validate that only native ETH is used for privacy pools
  const privacyPoolsTokenError = useMemo(() => {
    if (privacyProvider === 'privacy-pools' && currentSelectedToken) {
      const isNativeToken = currentSelectedToken.address === zeroAddress
      if (!isNativeToken) {
        return 'Only native ETH deposits for privacyPools'
      }
    }
    return ''
  }, [privacyProvider, currentSelectedToken])

  // Combine existing error message with privacy pools token validation
  const combinedErrorMessage = useMemo(() => {
    if (privacyPoolsTokenError) return privacyPoolsTokenError
    return amountErrorMessage
  }, [privacyPoolsTokenError, amountErrorMessage])

  // Only check for poolInfo when using Privacy Pools
  if (privacyProvider === 'privacy-pools' && !poolInfo) {
    return (
      <ScrollableWrapper contentContainerStyle={styles.container}>
        <View style={spacings.mbLg}>
          <Text appearance="secondaryText" fontSize={14} weight="regular" style={spacings.mbMi}>
            {t('No privacy pool available on this chain. Please switch to Sepolia testnet.')}
          </Text>
        </View>
      </ScrollableWrapper>
    )
  }

  return (
    <ScrollableWrapper contentContainerStyle={styles.container}>
      <View>
        <Text appearance="secondaryText" fontSize={14} weight="light">
          {t('Account')}
        </Text>
        <Select
          setValue={handleAccountChange}
          options={accountOptions}
          value={selectedAccountValue}
          testID="account-select"
          bottomSheetTitle={t('Select Account')}
          searchPlaceholder={t('Search for account...')}
          emptyListPlaceholderText={t('No accounts found.')}
          mode="bottomSheet"
        />
      </View>

      <View>
        <Text appearance="secondaryText" fontSize={14} weight="light">
          {t('Amount')}
        </Text>
        <SendToken
          fromTokenOptions={tokenOptions}
          fromTokenValue={tokenSelectValue}
          fromAmountValue={displayAmount}
          fromTokenAmountSelectDisabled={false}
          handleChangeFromToken={handleChangeFromToken}
          fromSelectedToken={currentSelectedToken}
          fromAmount={fromAmountFormatted}
          fromAmountInFiat="0"
          fromAmountFieldMode="token"
          maxFromAmount={maxFromAmountFormatted}
          validateFromAmount={{ success: !combinedErrorMessage, message: combinedErrorMessage }}
          onFromAmountChange={handleAmountChange}
          handleSetMaxFromAmount={handleSetMaxAmount}
          inputTestId="amount-field"
          selectTestId="tokens-select"
          title=""
          maxAmountDisabled={!currentSelectedToken || selectedTokenBalance === 0n}
        />
      </View>

      <View style={spacings.mbLg}>
        <View style={[flexbox.directionRow, flexbox.alignCenter, flexbox.justifySpaceBetween]}>
          <Text appearance="secondaryText" fontSize={14} weight="light">
            {t('Provider')}
          </Text>
          <View style={[flexbox.directionRow, flexbox.alignCenter]}>
            {/* Dropdown for selecting provider */}
            <Select
              options={[
                {
                  label: (
                    <View style={[flexbox.directionRow, flexbox.alignCenter]}>
                      <PrivacyIcon width={15} height={15} />
                      <Text fontSize={14} weight="light" style={spacings.mlMi}>
                        {t('Privacy Pools')}
                      </Text>
                    </View>
                  ),
                  value: 'privacy-pools'
                },
                {
                  label: (
                    <View style={[flexbox.directionRow, flexbox.alignCenter]}>
                      <RailgunIcon width={15} height={15} />
                      <Text fontSize={14} weight="light">
                        {t('Railgun')}
                      </Text>
                    </View>
                  ),
                  value: 'railgun'
                }
              ]}
              value={selectedProvider}
              setValue={handleProviderChange}
              selectStyle={{ minWidth: 150 }}
              testID="provider-dropdown"
            />
          </View>
        </View>
      </View>

      {/* Only show vetting fee for Privacy Pools */}
      {privacyProvider === 'privacy-pools' && (
        <View style={spacings.mbLg}>
          <View style={[flexbox.directionRow, flexbox.alignCenter, flexbox.justifySpaceBetween]}>
            <Text appearance="secondaryText" fontSize={14} weight="light">
              {t('Vetting fee')}
            </Text>
            <View style={[flexbox.directionRow, flexbox.alignCenter]}>
              <TokenIcon
                chainId={chainId}
                address={zeroAddress}
                width={20}
                height={20}
                withNetworkIcon={false}
              />
              <Text fontSize={14} weight="light" style={spacings.mlMi}>
                {vettingFeeEth} ETH
              </Text>
            </View>
          </View>
        </View>
      )}
    </ScrollableWrapper>
  )
}

export default React.memo(DepositForm)
