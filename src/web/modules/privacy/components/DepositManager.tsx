import React from 'react'
import { View } from 'react-native'
import { formatEther, zeroAddress } from 'viem'

import Button from '@common/components/Button'
import Text from '@common/components/Text'
import Input from '@common/components/Input'
import Alert from '@common/components/Alert'
import Heading from '@common/components/Heading'
import Panel from '@common/components/Panel'
import spacings from '@common/styles/spacings'
import flexbox from '@common/styles/utils/flexbox'

import { getTokenAmount } from '@ambire-common/libs/portfolio/helpers'
import { PoolInfo } from '@ambire-common/controllers/privacy/config'
import useSelectedAccountControllerState from '@web/hooks/useSelectedAccountControllerState'

interface DepositManagerProps {
  displayValue: string
  poolInfo: PoolInfo | undefined
  message: { type: 'success' | 'error' | 'info'; text: string } | null
  onDeposit: () => void
  onAmountChange: (value: string) => void
  onSetMaxAmount: (balance: bigint) => void
}

const DepositManager = ({
  message,
  poolInfo,
  displayValue,
  onDeposit,
  onAmountChange,
  onSetMaxAmount
}: DepositManagerProps) => {
  const { portfolio } = useSelectedAccountControllerState()

  const sepoliaEth = portfolio.tokens.find(
    (token) => token.chainId === 11155111n && token.address === zeroAddress
  )

  const ethBalance = sepoliaEth ? getTokenAmount(sepoliaEth) : 0n

  const isSending = false
  const isConfirming = false

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
          value={displayValue}
          onChange={(event: any) => onAmountChange(event.target.value)}
          placeholder="0.0"
          button="MAX"
          onButtonPress={() => onSetMaxAmount(ethBalance)}
          buttonProps={{ disabled: !ethBalance || ethBalance === 0n }}
        />
      </View>

      {/* Action Buttons */}
      <View style={[flexbox.directionRow, spacings.mb16]}>
        <Button
          type="primary"
          onPress={() => onDeposit()}
          disabled={isSending || isConfirming}
          text={isSending || isConfirming ? 'Processing...' : 'Confirm Deposit'}
        />
      </View>

      {/* Messages */}
      {message && <Alert type={message.type} text={message.text} style={spacings.mt16} />}
    </View>
  )
}

export default React.memo(DepositManager)
