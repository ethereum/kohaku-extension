import React, { ReactNode, useEffect, useState } from 'react'
import { View } from 'react-native'

import ScrollableWrapper from '@common/components/ScrollableWrapper'
import Text from '@common/components/Text'
import { useTranslation } from '@common/config/localization'
import spacings from '@common/styles/spacings'
import useSelectedAccountControllerState from '@web/hooks/useSelectedAccountControllerState'
import { formatEther, parseEther, zeroAddress } from 'viem'
import { PoolInfo } from '@ambire-common/controllers/privacyPools/config'
import { getTokenAmount } from '@ambire-common/libs/portfolio/helpers'
import SendToken from '../SendToken'
import styles from './styles'

const DepositForm = ({
  poolInfo,
  depositAmount,
  amountErrorMessage,
  formTitle,
  handleUpdateForm
}: {
  poolInfo?: PoolInfo
  depositAmount?: string
  amountErrorMessage: string
  formTitle: string | ReactNode
  handleUpdateForm: (params: { [key: string]: any }) => void
}) => {
  const { portfolio } = useSelectedAccountControllerState()
  const { t } = useTranslation()
  const [displayAmount, setDisplayAmount] = useState('')

  const sepoliaEth = portfolio.tokens.find(
    (token) => token.chainId === 11155111n && token.address === zeroAddress
  )

  const ethBalance = sepoliaEth ? getTokenAmount(sepoliaEth) : 0n

  const handleSetMaxAmount = () => {
    if (ethBalance && ethBalance > 0n) {
      const formattedAmount = formatEther(ethBalance)
      setDisplayAmount(formattedAmount)
      handleUpdateForm({ depositAmount: parseEther(formattedAmount).toString() })
    } else {
      setDisplayAmount('')
      handleUpdateForm({ depositAmount: '0' })
    }
  }

  const handleAmountChange = (inputValue: string) => {
    setDisplayAmount(inputValue)

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

      const weiAmount = parseEther(inputValue)
      handleUpdateForm({ depositAmount: weiAmount.toString() })
    } catch (error) {
      // eslint-disable-next-line no-console
      console.warn('Invalid ETH amount entered:', inputValue)
    }
  }

  useEffect(() => {
    if (depositAmount && depositAmount !== '0') {
      try {
        setDisplayAmount(formatEther(BigInt(depositAmount)))
      } catch {
        setDisplayAmount('')
      }
    } else {
      setDisplayAmount('')
    }
  }, [depositAmount])

  if (!poolInfo) {
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
      <SendToken
        fromTokenOptions={[
          {
            label: `ETH (${ethBalance ? formatEther(ethBalance) : '0'})`,
            value: 'eth',
            leftIcon: 'ETH'
          }
        ]}
        fromTokenValue={{
          label: `ETH (${ethBalance ? formatEther(ethBalance) : '0'})`,
          value: 'eth',
          leftIcon: 'ETH'
        }}
        fromAmountValue={displayAmount}
        fromTokenAmountSelectDisabled={false}
        handleChangeFromToken={() => {}}
        fromSelectedToken={sepoliaEth || null}
        fromAmount={depositAmount ? formatEther(BigInt(depositAmount)) : '0'}
        fromAmountInFiat="0"
        fromAmountFieldMode="token"
        maxFromAmount={ethBalance ? formatEther(ethBalance) : '0'}
        validateFromAmount={{ success: !amountErrorMessage, message: amountErrorMessage }}
        onFromAmountChange={handleAmountChange}
        handleSetMaxFromAmount={handleSetMaxAmount}
        inputTestId="amount-field"
        selectTestId="tokens-select"
        title={formTitle}
        maxAmountDisabled={!ethBalance || ethBalance === 0n}
      />
    </ScrollableWrapper>
  )
}

export default React.memo(DepositForm)
