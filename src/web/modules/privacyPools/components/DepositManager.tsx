import React, { useEffect, useState } from 'react'
import { View } from 'react-native'
import { formatEther, parseEther, zeroAddress } from 'viem'

import Button from '@common/components/Button'
import Text from '@common/components/Text'
import Input from '@common/components/Input'
import Alert from '@common/components/Alert'
import Heading from '@common/components/Heading'
import Panel from '@common/components/Panel'
import spacings from '@common/styles/spacings'
import flexbox from '@common/styles/utils/flexbox'

import { getTokenAmount } from '@ambire-common/libs/portfolio/helpers'
import { PoolInfo } from '@ambire-common/controllers/privacyPools/config'
import useSelectedAccountControllerState from '@web/hooks/useSelectedAccountControllerState'

interface DepositManagerProps {
  amount?: string
  poolInfo?: PoolInfo
  onDeposit: () => void
  onValueChange: (params: { [key: string]: any }) => void
}

const DepositManager = ({ amount, poolInfo, onDeposit, onValueChange }: DepositManagerProps) => {
  const { portfolio } = useSelectedAccountControllerState()

  const [displayAmount, setDisplayAmount] = useState('')

  const sepoliaEth = portfolio.tokens.find(
    (token) => token.chainId === 11155111n && token.address === zeroAddress
  )

  const ethBalance = sepoliaEth ? getTokenAmount(sepoliaEth) : 0n

  const isSending = false
  const isConfirming = false

  const handleSetMaxAmount = (balance: bigint) => {
    if (balance && balance > 0n) {
      const formattedAmount = formatEther(balance)
      setDisplayAmount(formattedAmount)
      onValueChange({ amount: parseEther(formattedAmount).toString() })
    } else {
      setDisplayAmount('')
      onValueChange({ amount: '0' })
    }
  }

  const handleAmountChange = (inputValue: string) => {
    setDisplayAmount(inputValue)

    try {
      if (inputValue === '') {
        onValueChange({ depositAmount: '0' })
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
      onValueChange({ depositAmount: weiAmount.toString() })
    } catch (error) {
      // eslint-disable-next-line no-console
      console.warn('Invalid ETH amount entered:', inputValue)
    }
  }

  // This is not 100% needed but prevents the displayAmount to not be
  // synchronized with the amount prop
  useEffect(() => {
    if (amount && amount !== '0') {
      try {
        setDisplayAmount(formatEther(BigInt(amount)))
      } catch {
        setDisplayAmount('')
      }
    } else {
      setDisplayAmount('')
    }
  }, [amount])

  if (!poolInfo) {
    return (
      <View style={[spacings.mb24]}>
        <Alert
          type="warning"
          text="No privacy pool available on this chain. Please switch to Sepolia testnet."
        />
      </View>
    )
  }

  return (
    <View style={[spacings.mb24]}>
      <Heading style={[spacings.mb16, { textAlign: 'center' }]}>Deposit</Heading>

      <Text appearance="secondaryText" style={[spacings.mb24, { textAlign: 'center' }]}>
        Deposit ETH into the privacy pool to maintain financial privacy. Maximum deposit:{' '}
        {ethBalance ? `${formatEther(ethBalance)}` : '0'} ETH.
      </Text>

      {/* Balance Display */}
      <Panel style={[spacings.mb24]}>
        <Text appearance="secondaryText">
          Your Balance: {ethBalance ? `${formatEther(ethBalance)} ETH` : 'Loading...'}
        </Text>
      </Panel>

      {/* Amount Input */}
      <View style={[spacings.mb16]}>
        <Input
          label="Deposit Amount"
          value={displayAmount}
          onChange={(event: any) => handleAmountChange(event.target.value)}
          placeholder="0.0"
          button="MAX"
          onButtonPress={() => handleSetMaxAmount(ethBalance)}
          buttonProps={{ disabled: !ethBalance || ethBalance === 0n }}
        />
      </View>

      {/* Action Buttons */}
      <View style={[flexbox.directionRow, spacings.mb16]}>
        <Button
          type="primary"
          onPress={onDeposit}
          disabled={isSending || isConfirming}
          text={isSending || isConfirming ? 'Processing...' : 'Confirm Deposit'}
        />
      </View>
    </View>
  )
}

export default React.memo(DepositManager)
