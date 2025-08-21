import React, { useState } from 'react'
import { View } from 'react-native'
import Button from '@common/components/Button'
import Text from '@common/components/Text'
import Input from '@common/components/Input'
import Alert from '@common/components/Alert'
import Heading from '@common/components/Heading'
import Select from '@common/components/Select'
import spacings from '@common/styles/spacings'
import flexbox from '@common/styles/utils/flexbox'
import { PoolInfo } from '@ambire-common/controllers/privacyPools/config'
import { PoolAccount } from '@web/contexts/privacyPoolsControllerStateContext'

interface WithdrawalManagerProps {
  poolInfo?: PoolInfo
  poolAccounts: PoolAccount[]
}

const WithdrawalManager = ({ poolInfo, poolAccounts }: WithdrawalManagerProps) => {
  const [selectedPoolAccount, setSelectedPoolAccount] = useState<any>(null)
  const [amount, setAmount] = useState('')
  const [targetAddress, setTargetAddress] = useState('')
  const [message, setMessage] = useState<{
    type: 'success' | 'error' | 'info'
    text: string
  } | null>(null)
  const isSending = false

  // Get available pool accounts for withdrawal (approved deposits with balance > 0)
  const availablePoolAccounts =
    poolAccounts?.filter(
      (poolAccount) =>
        poolAccount.reviewStatus === 'approved' && poolAccount.balance > 0n && poolAccount.isValid
    ) || []

  // const handlePoolAccountChange = (selectedValue: any) => {
  //   setSelectedPoolAccount(selectedValue)
  //   setShowReview(false)
  //   if (message) setMessage(null)

  //   // Auto-fill the amount based on the selected pool account
  //   const poolAccount = availablePoolAccounts.find(
  //     (pa) => pa.label.toString() === selectedValue?.value
  //   )
  //   if (poolAccount) {
  //     setAmount(/* formatEther(poolAccount.balance) */ '1')
  //   }
  // }

  const handleAmountChange = (event: any) => {
    const value = event.target.value
    setAmount(value)
    if (message) setMessage(null)
  }

  const handleTargetAddressChange = (event: any) => {
    const value = event.target.value
    setTargetAddress(value)
    if (message) setMessage(null)
  }

  const handleWithdrawal = async () => {
    // eslint-disable-next-line no-console
    console.log('handleWithdrawal')
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

  if (!availablePoolAccounts.length) {
    return (
      <View style={[spacings.mb24]}>
        <Heading style={[spacings.mb16, { textAlign: 'center' }]}>Withdrawal</Heading>
        <Alert
          type="info"
          text="No approved pool accounts available for withdrawal. Make a deposit and wait for approval to have funds available for withdrawal."
        />
      </View>
    )
  }

  return (
    <View style={[spacings.mb24]}>
      <Heading style={[spacings.mb16, { textAlign: 'center' }]}>Withdrawal</Heading>

      <Text appearance="secondaryText" style={[spacings.mb24, { textAlign: 'center' }]}>
        Withdraw ETH from your privacy pool commitments while maintaining privacy.
      </Text>

      {/* Pool Account Selection */}
      <View style={[spacings.mb16]}>
        <Text weight="medium" style={[spacings.mb8]}>
          Select Pool Account
        </Text>
        <Select
          value={selectedPoolAccount}
          setValue={setSelectedPoolAccount}
          options={availablePoolAccounts.map((poolAccount) => ({
            label: `Account #${poolAccount.name} (${poolAccount.reviewStatus}) - ${
              /* formatEther(poolAccount.balance) */ '1'
            } ETH`,
            value: poolAccount.label.toString()
          }))}
          placeholder="Select a pool account..."
        />
      </View>

      {/* Amount Input */}
      <View style={[spacings.mb16]}>
        <Text weight="medium" style={[spacings.mb8]}>
          Withdrawal Amount
        </Text>
        <Input
          value={amount}
          onChange={handleAmountChange}
          placeholder="0.1"
          disabled={!selectedPoolAccount}
        />
        <Text appearance="secondaryText" fontSize={12} style={[spacings.mt4]}>
          {selectedPoolAccount
            ? 'Enter amount to withdraw (up to account balance)'
            : 'Select a pool account first'}
        </Text>
      </View>

      {/* Target Address Input */}
      <View style={[spacings.mb16]}>
        <Text weight="medium" style={[spacings.mb8]}>
          Target Address
        </Text>
        <Input
          value={targetAddress}
          onChange={handleTargetAddressChange}
          placeholder="0x..."
          disabled={!selectedPoolAccount}
        />
        <Text appearance="secondaryText" fontSize={12} style={[spacings.mt4]}>
          {selectedPoolAccount
            ? 'Enter the Ethereum address to receive the withdrawal'
            : 'Select a pool account first'}
        </Text>
      </View>

      {/* Action Buttons */}
      <View style={[flexbox.directionRow, spacings.mb16]}>
        <Button type="primary" onPress={handleWithdrawal} disabled={isSending}>
          {isSending ? 'Processing...' : 'Confirm Withdrawal'}
        </Button>
      </View>
    </View>
  )
}

export default React.memo(WithdrawalManager)
