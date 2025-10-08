import React, { ReactNode, useCallback, useEffect, useMemo } from 'react'
import { View } from 'react-native'
import { formatEther, parseEther, zeroAddress } from 'viem'

// import { getTokenAmount } from '@ambire-common/libs/portfolio/helpers'
import { TokenResult } from '@ambire-common/libs/portfolio'
import TokenIcon from '@common/components/TokenIcon'
import Recipient from '@common/components/Recipient'
import ScrollableWrapper from '@common/components/ScrollableWrapper'
import SkeletonLoader from '@common/components/SkeletonLoader'
import Text from '@common/components/Text'
import { useTranslation } from '@common/config/localization'
import useAddressInput from '@common/hooks/useAddressInput'
import useGetTokenSelectProps from '@common/hooks/useGetTokenSelectProps'
import spacings from '@common/styles/spacings'

import useNetworksControllerState from '@web/hooks/useNetworksControllerState'
import useSelectedAccountControllerState from '@web/hooks/useSelectedAccountControllerState'
import { PoolAccount } from '@web/contexts/privacyPoolsControllerStateContext'
// import { getTokenId } from '@web/utils/token'

import SendToken from '../SendToken'
import styles from './styles'

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
  totalApprovedBalance
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
  totalApprovedBalance: { total: bigint; accounts: PoolAccount[] }
}) => {
  const { validation } = addressInputState
  const { account, portfolio } = useSelectedAccountControllerState()
  const { t } = useTranslation()
  // const { networks } = useNetworksControllerState()

  // const {
  //   value: tokenSelectValue,
  //   options,
  //   amountSelectDisabled
  // } = useGetTokenSelectProps({
  //   tokens,
  //   token: selectedToken ? getTokenId(selectedToken) : '',
  //   networks,
  //   isToToken: false
  // })

  // const disableForm = !tokens.length

  // totalApprovedBalance.total is already in wei (bigint), no need to parse
  const ethBalance = totalApprovedBalance.total || 0n

  const handleChangeToken = useCallback(
    (value: string) => {
      // const tokenToSelect = tokens.find((tokenRes: TokenResult) => getTokenId(tokenRes) === value)
      handleUpdateForm({ selectedToken: value })
    },
    [handleUpdateForm]
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

  const ethTokenIcon = (
    <TokenIcon
      key="eth-sepolia"
      containerHeight={30}
      containerWidth={30}
      networkSize={12}
      withContainer
      withNetworkIcon
      address={zeroAddress}
      chainId={11155111n}
    />
  )

  // Initialize selectedToken with default ETH token if not set
  useEffect(() => {
    if (!selectedToken && portfolio?.isReadyToVisualize && ethBalance !== undefined) {
      const defaultToken = portfolio?.tokens.find(
        (token) => token.chainId === 11155111n && token.address === zeroAddress
      )
      console.log('DEBUG: loading default token')
      handleUpdateForm({ selectedToken: defaultToken })
    }
  }, [selectedToken, portfolio?.isReadyToVisualize, ethBalance, handleUpdateForm])

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
          fromTokenOptions={[
            {
              label: `ETH (${ethBalance ? formatEther(ethBalance) : '0'})`,
              value: 'eth',
              icon: ethTokenIcon
            }
          ]}
          fromTokenValue={{
            label: `ETH (${ethBalance ? formatEther(ethBalance) : '0'})`,
            value: 'eth',
            icon: ethTokenIcon
          }}
          // fromTokenOptions={options}
          // fromTokenValue={tokenSelectValue}
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
    </ScrollableWrapper>
  )
}

export default React.memo(TransferForm)
