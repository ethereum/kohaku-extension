import React, { ReactNode, useCallback, useEffect, useMemo } from 'react'
import { View } from 'react-native'
import { formatUnits, parseUnits, zeroAddress } from 'viem'

import TokenIcon from '@common/components/TokenIcon'
import ScrollableWrapper from '@common/components/ScrollableWrapper'
import SkeletonLoader from '@common/components/SkeletonLoader'
import Text from '@common/components/Text'
import Checkbox from '@common/components/Checkbox'
import { useTranslation } from '@common/config/localization'
import useAddressInput from '@common/hooks/useAddressInput'
import spacings from '@common/styles/spacings'
import flexbox from '@common/styles/utils/flexbox'
import useTheme from '@common/hooks/useTheme'
import formatDecimals from '@ambire-common/utils/formatDecimals/formatDecimals'
import { getTokenId } from '@web/utils/token'
import { ZERO_ADDRESS } from '@ambire-common/services/socket/constants'

import useSelectedAccountControllerState from '@web/hooks/useSelectedAccountControllerState'
import useRailgunControllerState from '@web/hooks/useRailgunControllerState'
import Recipient from '../Recipient'

import SendToken from '../SendToken'
import getStyles from '../TransferForm/styles'

const RailgunTransferForm = ({
  addressInputState,
  amountErrorMessage,
  isRecipientAddressUnknown,
  formTitle,
  amountFieldValue,
  setAmountFieldValue,
  addressStateFieldValue,
  setAddressStateFieldValue,
  handleUpdateForm,
  selectedToken,
  maxAmount,
  amountFieldMode,
  amountInFiat,
  isRecipientAddressUnknownAgreed,
  addressState,
  controllerAmount,
  totalApprovedBalance,
  totalPrivateBalancesFormatted,
  chainId
}: {
  addressInputState: ReturnType<typeof useAddressInput>
  amountErrorMessage: string
  isRecipientAddressUnknown: boolean
  formTitle: string | ReactNode
  amountFieldValue: string
  setAmountFieldValue: (value: string) => void
  addressStateFieldValue: string
  setAddressStateFieldValue: (value: string) => void
  handleUpdateForm: (formValues: any) => void
  selectedToken: any
  maxAmount: string
  amountFieldMode: 'token' | 'fiat'
  amountInFiat: string
  isRecipientAddressUnknownAgreed: boolean
  addressState: any
  controllerAmount: string
  totalApprovedBalance: { total: bigint; accounts: [] }
  totalPrivateBalancesFormatted: Record<
    string,
    { amount: string; decimals: number; symbol: string; name: string }
  >
  chainId: number
}) => {
  const { validation } = addressInputState
  const { account, portfolio } = useSelectedAccountControllerState()
  const { t } = useTranslation()
  const { styles } = useTheme(getStyles)

  // Get tokens that have Railgun balances and match the current chainId
  // Includes tokens from both portfolio and pinnedTokens, and creates tokens from balances if needed
  const availableTokens = useMemo(() => {
    const tokens: any[] = []
    const addedAddresses = new Set<string>()

    // Add tokens from portfolio
    if (portfolio?.tokens && portfolio.isReadyToVisualize) {
      portfolio.tokens.forEach((token) => {
        // Only include tokens on the current chain
        if (token.chainId !== BigInt(chainId)) return

        // Check if token has a Railgun balance
        const tokenAddressLower = token.address.toLowerCase()
        if (tokenAddressLower in totalPrivateBalancesFormatted) {
          tokens.push(token)
          addedAddresses.add(tokenAddressLower)
        }
      })
    }

    // Add tokens from pinnedTokens that have Railgun balances
    if (typeof window !== 'undefined' && (window as any).pinnedTokens) {
      const pinnedTokens = (window as any).pinnedTokens as any[]
      pinnedTokens.forEach((token) => {
        // Only include tokens on the current chain
        if (token.chainId !== BigInt(chainId)) return

        // Check if token has a Railgun balance
        const tokenAddressLower = token.address.toLowerCase()
        if (
          tokenAddressLower in totalPrivateBalancesFormatted &&
          !addedAddresses.has(tokenAddressLower)
        ) {
          tokens.push(token)
          addedAddresses.add(tokenAddressLower)
        }
      })
    }

    // Also add tokens directly from balances if they're not in portfolio or pinnedTokens
    // This ensures all tokens with balances are available
    Object.keys(totalPrivateBalancesFormatted).forEach((tokenAddressLower) => {
      if (addedAddresses.has(tokenAddressLower)) return

      const balanceInfo = totalPrivateBalancesFormatted[tokenAddressLower]
      // Create a basic token object from the balance info
      const token: any = {
        address: tokenAddressLower, // Use lowercase for consistency
        chainId: BigInt(chainId),
        symbol: balanceInfo.symbol || 'UNKNOWN',
        name: balanceInfo.name || 'Unknown Token',
        decimals: balanceInfo.decimals || 18,
        amount: balanceInfo.amount,
        flags: {}
      }
      tokens.push(token)
      addedAddresses.add(tokenAddressLower)
    })

    return tokens
  }, [portfolio?.tokens, portfolio?.isReadyToVisualize, chainId, totalPrivateBalancesFormatted])

  // Build token options for the selector
  const tokenOptions = useMemo(() => {
    return availableTokens.map((token) => {
      const balanceInfo = totalPrivateBalancesFormatted[token.address.toLowerCase()]
      const balance = balanceInfo ? BigInt(balanceInfo.amount) : 0n
      const decimals = balanceInfo?.decimals || token.decimals || 18
      const formattedBalance = formatUnits(balance, decimals)
      const balanceFormatted = formatDecimals(Number(formattedBalance), 'amount')

      return {
        label: `${token.symbol} (${balanceFormatted})`,
        value: getTokenId(token),
        icon: (
          <TokenIcon
            key={`${token.address}-${token.chainId}`}
            containerHeight={30}
            containerWidth={30}
            networkSize={12}
            withContainer
            withNetworkIcon
            address={token.address}
            chainId={BigInt(chainId)}
          />
        )
      }
    })
  }, [availableTokens, totalPrivateBalancesFormatted, chainId])

  // Get the selected token's Railgun balance
  const selectedTokenBalance = useMemo(() => {
    if (!selectedToken) return 0n

    const balanceInfo = totalPrivateBalancesFormatted[selectedToken.address?.toLowerCase()]
    if (!balanceInfo) return 0n

    return BigInt(balanceInfo.amount)
  }, [selectedToken, totalPrivateBalancesFormatted])

  // Get selected token's decimals
  const selectedTokenDecimals = useMemo(() => {
    if (!selectedToken) return 18

    const balanceInfo = totalPrivateBalancesFormatted[selectedToken.address?.toLowerCase()]
    return balanceInfo?.decimals || selectedToken.decimals || 18
  }, [selectedToken, totalPrivateBalancesFormatted])

  // Format the selected token's balance for display
  const selectedTokenBalanceFormatted = useMemo(() => {
    if (!selectedToken || selectedTokenBalance === 0n) return '0'
    return formatUnits(selectedTokenBalance, selectedTokenDecimals)
  }, [selectedToken, selectedTokenBalance, selectedTokenDecimals])

  // Token select value for SendToken component
  const tokenSelectValue = useMemo(() => {
    if (!selectedToken) return undefined

    const balanceInfo = totalPrivateBalancesFormatted[selectedToken.address?.toLowerCase()]
    const balance = balanceInfo ? BigInt(balanceInfo.amount) : 0n
    const decimals = balanceInfo?.decimals || selectedToken.decimals || 18
    const formattedBalance = formatUnits(balance, decimals)
    const balanceFormatted = formatDecimals(Number(formattedBalance), 'amount')

    return {
      label: `${selectedToken.symbol} (${balanceFormatted})`,
      value: getTokenId(selectedToken),
      icon: (
        <TokenIcon
          key={`${selectedToken.address}-${selectedToken.chainId}`}
          containerHeight={30}
          containerWidth={30}
          networkSize={12}
          withContainer
          withNetworkIcon
          address={selectedToken.address}
          chainId={BigInt(chainId)}
        />
      )
    }
  }, [selectedToken, totalPrivateBalancesFormatted, chainId])

  const handleChangeToken = useCallback(
    (value: string) => {
      const tokenToSelect = availableTokens.find((token) => getTokenId(token) === value)
      if (tokenToSelect) {
        const balanceInfo = totalPrivateBalancesFormatted[tokenToSelect.address.toLowerCase()]
        const balance = balanceInfo ? BigInt(balanceInfo.amount) : 0n
        const decimals = balanceInfo?.decimals || tokenToSelect.decimals || 18
        const maxAmountFormatted = formatUnits(balance, decimals)
        handleUpdateForm({ selectedToken: tokenToSelect, maxAmount: maxAmountFormatted })
      }
    },
    [availableTokens, totalPrivateBalancesFormatted, handleUpdateForm]
  )

  const setMaxAmount = useCallback(() => {
    if (!selectedToken || selectedTokenBalance === 0n) return

    const maxAmountFormatted = formatUnits(selectedTokenBalance, selectedTokenDecimals)
    // Update the input field directly
    setAmountFieldValue(maxAmountFormatted)
    // Also update the form state
    handleUpdateForm({ withdrawalAmount: maxAmountFormatted, maxAmount: maxAmountFormatted })
  }, [
    selectedToken,
    selectedTokenBalance,
    selectedTokenDecimals,
    setAmountFieldValue,
    handleUpdateForm
  ])

  const onRecipientCheckboxClick = useCallback(() => {
    handleUpdateForm({ isRecipientAddressUnknownAgreed: true })
  }, [handleUpdateForm])

  // TODO: Add WETH checkbox UI later
  // For now, always use native ETH (withdrawAsWETH = false)
  const withdrawAsWETH = false

  const onWithdrawAsWETHCheckboxClick = useCallback(() => {
    // TODO: Implement when checkbox is added
    // handleUpdateForm({ withdrawAsWETH: !withdrawAsWETH })
  }, [])

  // Check if selected token is native ETH
  const isNativeETH = useMemo(() => {
    return selectedToken?.address?.toLowerCase() === ZERO_ADDRESS.toLowerCase()
  }, [selectedToken])

  const isMaxAmountEnabled = useMemo(() => {
    if (!selectedToken || selectedTokenBalance === 0n) return false
    if (account && account.associatedKeys && account.associatedKeys.length > 0) return true
    return true
  }, [account, selectedToken, selectedTokenBalance])

  // Initialize selectedToken with first available token if not set
  useEffect(() => {
    if (!selectedToken && availableTokens.length > 0 && portfolio?.isReadyToVisualize) {
      const defaultToken = availableTokens[0]
      const balanceInfo = totalPrivateBalancesFormatted[defaultToken.address.toLowerCase()]
      const balance = balanceInfo ? BigInt(balanceInfo.amount) : 0n
      const decimals = balanceInfo?.decimals || defaultToken.decimals || 18
      const maxAmountFormatted = formatUnits(balance, decimals)
      handleUpdateForm({ selectedToken: defaultToken, maxAmount: maxAmountFormatted })
    }
  }, [
    selectedToken,
    availableTokens,
    portfolio?.isReadyToVisualize,
    totalPrivateBalancesFormatted,
    handleUpdateForm
  ])

  // Calculate 0.25% fee for Railgun withdrawals (only for unshields, not internal transfers)
  // Internal transfers (0zk addresses) have no fee
  const calculatedFee = useMemo(() => {
    if (!amountFieldValue || !selectedToken || parseFloat(amountFieldValue) <= 0) {
      return { amount: 0n, formatted: '0' }
    }

    // Check if this is an internal transfer (0zk address)
    // Internal transfers have no fee - the 0.25% fee only applies to unshields (withdrawals to 0x addresses)
    const addressValue = addressStateFieldValue || addressInputState.address || ''
    const isInternalTransfer = addressValue.toLowerCase().startsWith('0zk')

    if (isInternalTransfer) {
      return { amount: 0n, formatted: '0' }
    }

    try {
      const amount = parseUnits(amountFieldValue, selectedTokenDecimals)
      // 0.25% = 0.0025 = 25 / 10000
      const feeAmount = (amount * 25n) / 10000n
      const feeFormatted = formatUnits(feeAmount, selectedTokenDecimals)
      return { amount: feeAmount, formatted: feeFormatted }
    } catch (error) {
      return { amount: 0n, formatted: '0' }
    }
  }, [
    amountFieldValue,
    selectedToken,
    selectedTokenDecimals,
    addressStateFieldValue,
    addressInputState.address
  ])

  // Calculate recipient gets (amount - fee)
  const recipientGets = useMemo(() => {
    if (!amountFieldValue || parseFloat(amountFieldValue) <= 0) {
      return '0'
    }

    try {
      const amount = parseFloat(amountFieldValue)
      const fee = parseFloat(calculatedFee.formatted)
      const recipientAmount = amount - fee
      return recipientAmount > 0 ? recipientAmount.toString() : '0'
    } catch (error) {
      return '0'
    }
  }, [amountFieldValue, calculatedFee.formatted])

  return (
    <ScrollableWrapper contentContainerStyle={styles.container}>
      {!portfolio?.isReadyToVisualize ? (
        <View>
          <Text appearance="secondaryText" fontSize={14} weight="regular" style={spacings.mbMi}>
            {t('Loading tokens...')}
          </Text>
          <SkeletonLoader width="100%" height={120} style={spacings.mbLg} />
        </View>
      ) : (
        <SendToken
          fromTokenOptions={tokenOptions}
          fromTokenValue={tokenSelectValue}
          fromAmountValue={amountFieldValue}
          fromTokenAmountSelectDisabled={
            availableTokens.length === 0 || selectedTokenBalance === 0n
          }
          handleChangeFromToken={({ value }) => handleChangeToken(value as string)}
          fromSelectedToken={selectedToken}
          fromAmount={controllerAmount}
          fromAmountInFiat={amountInFiat}
          fromAmountFieldMode={amountFieldMode}
          maxFromAmount={selectedTokenBalanceFormatted}
          validateFromAmount={{ success: !amountErrorMessage, message: amountErrorMessage }}
          onFromAmountChange={setAmountFieldValue}
          handleSetMaxFromAmount={setMaxAmount}
          inputTestId="amount-field-railgun"
          selectTestId="tokens-select-railgun"
          title={formTitle}
          maxAmountDisabled={!isMaxAmountEnabled}
        />
      )}

      <View style={[spacings.mbSm, styles.disclaimer]}>
        <View style={[flexbox.directionRow, flexbox.alignCenter, flexbox.justifyCenter]}>
          <Text
            style={styles.disclaimerText}
            appearance="secondaryText"
            fontSize={14}
            weight="light"
          >
            {t('Funds being send through your private account')}
          </Text>
        </View>
      </View>

      <View>
        <Recipient
          disabled={!selectedToken || selectedTokenBalance === 0n}
          address={addressStateFieldValue}
          setAddress={setAddressStateFieldValue}
          validation={validation}
          ensAddress={addressState.ensAddress}
          addressValidationMsg={validation.message}
          isRecipientAddressUnknown={isRecipientAddressUnknown}
          isRecipientDomainResolving={addressState.isDomainResolving}
          isRecipientAddressUnknownAgreed={isRecipientAddressUnknownAgreed}
          onRecipientCheckboxClick={onRecipientCheckboxClick}
          isRecipientHumanizerKnownTokenOrSmartContract={false}
          isSWWarningVisible={false}
          isSWWarningAgreed={false}
          recipientMenuClosedAutomaticallyRef={{ current: false }}
          selectedTokenSymbol={selectedToken?.symbol}
        />
      </View>

      {/* TODO: Add WETH checkbox UI when native ETH is selected */}
      {/* {isNativeETH && (
        <View style={spacings.mbLg}>
          <Checkbox
            value={withdrawAsWETH}
            onValueChange={onWithdrawAsWETHCheckboxClick}
            label={t('Withdraw as WETH token instead of native ETH')}
            style={spacings.mb0}
            testID="withdraw-as-weth-checkbox"
          />
        </View>
      )} */}

      <View style={spacings.mbLg}>
        <View style={[flexbox.directionRow, flexbox.alignCenter, flexbox.justifySpaceBetween]}>
          <Text appearance="secondaryText" fontSize={14} weight="light">
            {t('Fee')}
          </Text>
          <View style={[flexbox.directionRow, flexbox.alignCenter]}>
            <TokenIcon
              chainId={BigInt(chainId)}
              address={selectedToken?.address || zeroAddress}
              width={20}
              height={20}
              withNetworkIcon={false}
            />
            <Text fontSize={14} weight="light" style={spacings.mlMi}>
              {calculatedFee.formatted} {selectedToken?.symbol || 'ETH'}
            </Text>
          </View>
        </View>
      </View>

      <View style={spacings.mbMi}>
        <View style={[flexbox.directionRow, flexbox.alignCenter, flexbox.justifySpaceBetween]}>
          <Text appearance="secondaryText" fontSize={14} weight="light">
            {t('Recipient gets')}
          </Text>
          <View style={[flexbox.directionRow, flexbox.alignCenter]}>
            <TokenIcon
              chainId={BigInt(chainId)}
              address={selectedToken?.address || zeroAddress}
              width={20}
              height={20}
              withNetworkIcon={false}
            />
            <Text fontSize={14} weight="light" style={spacings.mlMi}>
              {formatDecimals(parseFloat(recipientGets), 'amount')} {selectedToken?.symbol || 'ETH'}
            </Text>
          </View>
        </View>
      </View>
    </ScrollableWrapper>
  )
}

export default React.memo(RailgunTransferForm)
