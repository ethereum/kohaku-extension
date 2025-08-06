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
import { chainData } from '../config/chainData'

type DepositManagerProps = {
  account?: any
}

const DepositManager = ({ account }: DepositManagerProps) => {
  const [amount, setAmount] = useState('')
  const [showReview, setShowReview] = useState(false)
  const [depositSecrets, setDepositSecrets] = useState<any | null>(null)
  const [message, setMessage] = useState<{
    type: 'success' | 'error' | 'info'
    text: string
  } | null>(null)
  const [isGeneratingSecrets] = useState(false)

  const isSending = false
  const isConfirming = false
  const balance = { value: 1n }

  // Get pool info for current chain
  const poolInfo = chainData[11155111]?.poolInfo?.[0]
  const maxDeposit = poolInfo ? /* formatEther(poolInfo.maxDeposit) */ '1' : '1'

  const handleAmountChange = (event: any) => {
    const value = event.target.value
    setAmount(value)
    setShowReview(false)
    setDepositSecrets(null)
    if (message) setMessage(null)
  }

  const handleReviewDeposit = async () => {
    // eslint-disable-next-line no-console
    console.log('handleReviewDeposit')
  }

  const handleDeposit = async () => {
    // eslint-disable-next-line no-console
    console.log('handleDeposit')
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
        {!showReview ? (
          <Button
            type="primary"
            onPress={handleReviewDeposit}
            disabled={!amount || !account || isGeneratingSecrets}
            text={isGeneratingSecrets ? 'Generating Secrets...' : 'Review Deposit'}
          />
        ) : (
          <>
            <Button
              type="secondary"
              onPress={() => {
                setShowReview(false)
                setDepositSecrets(null)
              }}
              disabled={isSending || isConfirming}
              text="Edit Amount"
            />

            <Button
              type="primary"
              onPress={handleDeposit}
              disabled={isSending || isConfirming}
              text={isSending || isConfirming ? 'Processing...' : 'Confirm Deposit'}
            />
          </>
        )}
      </View>

      {/* Review Section */}
      {showReview && depositSecrets !== null && (
        <Panel style={[spacings.mt24]}>
          <Heading style={[spacings.mb16]}>Deposit Review</Heading>

          <View style={[flexbox.directionRow, flexbox.justifySpaceBetween, spacings.mb8]}>
            <Text appearance="secondaryText">Amount:</Text>
            <Text weight="medium">{amount} ETH</Text>
          </View>

          <View style={[flexbox.directionRow, flexbox.justifySpaceBetween, spacings.mb8]}>
            <Text appearance="secondaryText">Pool Contract:</Text>
            <Text style={{ fontFamily: 'monospace', fontSize: 12 }}>{poolInfo.address}</Text>
          </View>

          <View style={[flexbox.directionRow, flexbox.justifySpaceBetween, spacings.mb8]}>
            <Text appearance="secondaryText">Chain:</Text>
            <Text
              style={{
                backgroundColor: '#e9ecef',
                color: '#495057',
                paddingHorizontal: 8,
                paddingVertical: 2,
                borderRadius: 12,
                fontSize: 12
              }}
            >
              {chainData[11155111]?.name || 'Unknown'}
            </Text>
          </View>

          <View style={[flexbox.directionRow, flexbox.justifySpaceBetween]}>
            <Text appearance="secondaryText">Deposit Secrets:</Text>
            <Text appearance="successText">✓ Generated and ready</Text>
          </View>
        </Panel>
      )}

      {/* Messages */}
      {message && <Alert type={message.type} text={message.text} style={spacings.mt16} />}
    </View>
  )
}

export default React.memo(DepositManager)
