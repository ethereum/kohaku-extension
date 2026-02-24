import React, { ReactNode, useCallback, useEffect, useMemo } from 'react'
import { View } from 'react-native'
import { formatEther, zeroAddress } from 'viem'

import TokenIcon from '@common/components/TokenIcon'
import ScrollableWrapper from '@common/components/ScrollableWrapper'
import SkeletonLoader from '@common/components/SkeletonLoader'
import Text from '@common/components/Text'
import { useTranslation } from '@common/config/localization'
import useAddressInput from '@common/hooks/useAddressInput'
import spacings from '@common/styles/spacings'
import flexbox from '@common/styles/utils/flexbox'
import useTheme from '@common/hooks/useTheme'

import useSelectedAccountControllerState from '@web/hooks/useSelectedAccountControllerState'
import { PoolAccount } from '@web/contexts/privacyPoolsControllerStateContext'
import { getTokenId } from '@web/utils/token'
import Recipient from '../Recipient'

import SendToken from '../SendToken'
import { formatAmount } from '../../utils/formatAmount'
import getStyles from './styles'

const TransferForm = ({
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
  quoteFee,
  totalApprovedBalance,
  updateQuoteStatus,
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
  quoteFee: string
  updateQuoteStatus: 'INITIAL' | 'LOADING' | undefined
  totalApprovedBalance: { total: bigint; accounts: PoolAccount[] }
  chainId: bigint
}) => {
  const { validation } = addressInputState
  const { account, portfolio } = useSelectedAccountControllerState()
  const { t } = useTranslation()
  const { styles } = useTheme(getStyles)

  const ethBalance = totalApprovedBalance.total || 0n

  // Get ETH token from portfolio for Privacy Pools
  const availableTokens = useMemo(() => {
    const tokens: any[] = []

    if (portfolio?.tokens && portfolio.isReadyToVisualize) {
      const ethToken = portfolio.tokens.find(
        (token) => token.chainId === chainId && token.address === zeroAddress
      )
      if (ethToken) {
        tokens.push(ethToken)
      }
    }

    return tokens
  }, [portfolio?.tokens, portfolio?.isReadyToVisualize, chainId])

  const handleChangeToken = useCallback(
    (value: string) => {
      const tokenToSelect = availableTokens.find((token) => getTokenId(token) === value)
      if (tokenToSelect) {
        handleUpdateForm({ selectedToken: tokenToSelect, maxAmount: formatEther(ethBalance) })
      }
    },
    [availableTokens, ethBalance, handleUpdateForm]
  )

  const setMaxAmount = useCallback(() => {
    handleUpdateForm({ shouldSetMaxAmount: true })
  }, [handleUpdateForm])

  const onRecipientCheckboxClick = useCallback(() => {
    handleUpdateForm({ isRecipientAddressUnknownAgreed: true })
  }, [handleUpdateForm])

  const isMaxAmountEnabled = useMemo(() => {
    if (!maxAmount) return false
    if (account && account.associatedKeys && account.associatedKeys.length > 0) return true

    const isNativeSelected = selectedToken?.address === zeroAddress

    if (!isNativeSelected) return true

    return true
  }, [account, maxAmount, selectedToken?.address])

  // Build token options for the selector
  const tokenOptions = useMemo(() => {
    return availableTokens.map((token) => {
      const formattedBalance = formatEther(ethBalance)

      return {
        label: `${token.symbol} (${formattedBalance})`,
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
            chainId={chainId}
          />
        )
      }
    })
  }, [availableTokens, ethBalance, chainId])

  const tokenSelectValue = useMemo(() => {
    if (!selectedToken) return undefined

    const formattedBalance = formatEther(ethBalance)

    return {
      label: `${selectedToken.symbol} (${formattedBalance})`,
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
          chainId={chainId}
        />
      )
    }
  }, [selectedToken, ethBalance, chainId])

  // Initialize selectedToken with default ETH token if not set
  useEffect(() => {
    if (!selectedToken && portfolio?.isReadyToVisualize && ethBalance !== undefined) {
      const defaultToken = portfolio?.tokens.find(
        (token) => token.chainId === chainId && token.address === zeroAddress
      )
      handleUpdateForm({ selectedToken: defaultToken, maxAmount: formatEther(ethBalance) })
    }
  }, [
    selectedToken,
    portfolio?.isReadyToVisualize,
    portfolio?.tokens,
    ethBalance,
    handleUpdateForm,
    chainId
  ])

  useEffect(() => {
    if (ethBalance !== undefined) {
      handleUpdateForm({ maxAmount: formatEther(ethBalance) })
    }
  }, [ethBalance, handleUpdateForm])

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
          fromTokenAmountSelectDisabled={ethBalance === 0n}
          handleChangeFromToken={({ value }) => handleChangeToken(value as string)}
          fromSelectedToken={selectedToken}
          fromAmount={controllerAmount}
          fromAmountInFiat={amountInFiat}
          fromAmountFieldMode={amountFieldMode}
          maxFromAmount={maxAmount}
          validateFromAmount={{ success: !amountErrorMessage, message: amountErrorMessage }}
          onFromAmountChange={setAmountFieldValue}
          handleSetMaxFromAmount={setMaxAmount}
          inputTestId="amount-field"
          selectTestId="tokens-select"
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
          disabled={ethBalance === 0n}
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
          {updateQuoteStatus === 'LOADING' ? (
            <SkeletonLoader
              appearance="tertiaryBackground"
              width={100}
              height={20}
              style={{ marginLeft: 'auto' }}
            />
          ) : (
            <View style={[flexbox.directionRow, flexbox.alignCenter]}>
              <TokenIcon
                chainId={chainId}
                address={zeroAddress}
                width={20}
                height={20}
                withNetworkIcon={false}
              />
              <Text fontSize={14} weight="light" style={spacings.mlMi}>
                {formatAmount(formatEther(BigInt(quoteFee)))} ETH
              </Text>
            </View>
          )}
        </View>
      </View>

      <View style={spacings.mbMi}>
        <View style={[flexbox.directionRow, flexbox.alignCenter, flexbox.justifySpaceBetween]}>
          <Text appearance="secondaryText" fontSize={14} weight="light">
            {t('Recipient gets')}
          </Text>
          {updateQuoteStatus === 'LOADING' ? (
            <SkeletonLoader
              appearance="tertiaryBackground"
              width={100}
              height={20}
              style={{ marginLeft: 'auto' }}
            />
          ) : (
            <View style={[flexbox.directionRow, flexbox.alignCenter]}>
              <TokenIcon
                chainId={chainId}
                address={zeroAddress}
                width={20}
                height={20}
                withNetworkIcon={false}
              />
              <Text fontSize={14} weight="light" style={spacings.mlMi}>
                {formatAmount(
                  (parseFloat(amountFieldValue) || 0) - parseFloat(formatEther(BigInt(quoteFee)))
                )}{' '}
                ETH
              </Text>
            </View>
          )}
        </View>
      </View>
    </ScrollableWrapper>
  )
}

export default React.memo(TransferForm)
