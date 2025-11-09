import React, { ReactNode, useCallback, useEffect, useMemo } from 'react'
import { View } from 'react-native'
import { formatUnits, parseUnits, zeroAddress } from 'viem'

import TokenIcon from '@common/components/TokenIcon'
import ScrollableWrapper from '@common/components/ScrollableWrapper'
import SkeletonLoader from '@common/components/SkeletonLoader'
import Text from '@common/components/Text'
import { useTranslation } from '@common/config/localization'
import useAddressInput from '@common/hooks/useAddressInput'
import spacings from '@common/styles/spacings'
import flexbox from '@common/styles/utils/flexbox'
import useTheme from '@common/hooks/useTheme'
import formatDecimals from '@ambire-common/utils/formatDecimals/formatDecimals'
import { getTokenId } from '@web/utils/token'

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
  totalPrivateBalancesFormatted: Record<string, { amount: string; decimals: number; symbol: string; name: string }>
  chainId: number
}) => {
  const { validation } = addressInputState
  const { account, portfolio } = useSelectedAccountControllerState()
  const { t } = useTranslation()
  const { styles } = useTheme(getStyles)

  // Get tokens that have Railgun balances and match the current chainId
  const availableTokens = useMemo(() => {
    if (!portfolio?.tokens || !portfolio.isReadyToVisualize) return []
    
    return portfolio.tokens.filter((token) => {
      // Only include tokens on the current chain
      if (token.chainId !== BigInt(chainId)) return false
      
      // Check if token has a Railgun balance
      const tokenAddressLower = token.address.toLowerCase()
      return tokenAddressLower in totalPrivateBalancesFormatted
    })
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
    handleUpdateForm({ withdrawalAmount: maxAmountFormatted, maxAmount: maxAmountFormatted })
  }, [selectedToken, selectedTokenBalance, selectedTokenDecimals, handleUpdateForm])

  const onRecipientCheckboxClick = useCallback(() => {
    handleUpdateForm({ isRecipientAddressUnknownAgreed: true })
  }, [handleUpdateForm])

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

  // For Railgun, we'll use a placeholder fee for now (0 ETH)
  const quoteFee = '0'

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
          fromTokenAmountSelectDisabled={availableTokens.length === 0 || selectedTokenBalance === 0n}
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
              {formatUnits(BigInt(quoteFee), selectedTokenDecimals)} {selectedToken?.symbol || 'ETH'}
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
              {parseFloat(amountFieldValue) || 0} {selectedToken?.symbol || 'ETH'}
            </Text>
          </View>
        </View>
      </View>
    </ScrollableWrapper>
  )
}

export default React.memo(RailgunTransferForm)

