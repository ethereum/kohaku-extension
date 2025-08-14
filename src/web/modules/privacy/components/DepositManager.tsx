import React, { useState } from 'react'
import { View } from 'react-native'
import Button from '@common/components/Button'
import Text from '@common/components/Text'
import Input from '@common/components/Input'
import Alert from '@common/components/Alert'
import Heading from '@common/components/Heading'
import Panel from '@common/components/Panel'
import spacings from '@common/styles/spacings'
import flexbox from '@common/styles/utils/flexbox'
import { Hash } from '@0xbow/privacy-pools-core-sdk'
import { chainData } from '../config/chainData'
import { createDepositSecrets } from '../utils/privacy/sdk'
import { prepareDepositTransaction } from '../utils/privacy/deposit'
import { usePP } from '../hooks/usePP'

type DepositManagerProps = {
  ppData: ReturnType<typeof usePP>
}

const DepositManager = ({ ppData }: DepositManagerProps) => {
  const { loadedAccount, handlePrivateRequest } = ppData
  const [amount, setAmount] = useState('')
  const [message, setMessage] = useState<{
    type: 'success' | 'error' | 'info'
    text: string
  } | null>(null)

  const isSending = false
  const isConfirming = false
  const balance = { value: 1n }

  // Get pool info for current chain
  const poolInfo = chainData[11155111]?.poolInfo?.[0]
  const maxDeposit = poolInfo ? /* formatEther(poolInfo.maxDeposit) */ '1' : '1'

  const handleAmountChange = (event: any) => {
    const value = event.target.value
    setAmount(value)
    if (message) setMessage(null)
  }

  const handleDeposit = async () => {
    if (!loadedAccount) return

    const secrets = createDepositSecrets(loadedAccount, poolInfo.scope as Hash)
    const result = await prepareDepositTransaction({
      amount,
      depositSecrets: secrets,
      entryPointAddress: poolInfo.entryPointAddress
    })

    // eslint-disable-next-line no-console
    console.log('result', result)

    handlePrivateRequest('privateDepositRequest', [result])
  }

  const handleSetMaxAmount = () => {
    // eslint-disable-next-line no-console
    console.log('handleSetMaxAmount')
  }

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
        {maxDeposit} ETH.
      </Text>

      {/* Balance Display */}
      <Panel style={[spacings.mb24]}>
        <Text appearance="secondaryText">
          Your Balance: {balance ? `${/* formatEther(balance.value) */ '1'} ETH` : 'Loading...'}
        </Text>
      </Panel>

      {/* Amount Input */}
      <View style={[spacings.mb16]}>
        <Input
          label="Deposit Amount"
          value={amount}
          onChange={handleAmountChange}
          placeholder="0.1"
          button="MAX"
          onButtonPress={handleSetMaxAmount}
          buttonProps={{ disabled: !balance }}
        />
      </View>

      {/* Action Buttons */}
      <View style={[flexbox.directionRow, spacings.mb16]}>
        <Button
          type="primary"
          onPress={handleDeposit}
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
