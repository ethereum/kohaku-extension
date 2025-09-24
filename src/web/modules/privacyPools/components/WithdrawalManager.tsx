import React, { useEffect, useState } from 'react'
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
import { formatEther, parseEther } from 'viem'
import { SelectValue } from '@common/components/Select/types'

interface WithdrawalManagerProps {
  amount?: string
  message?: { type: 'success' | 'error'; text: string } | null
  poolInfo?: PoolInfo
  targetAddress?: string
  poolAccounts: PoolAccount[]
  onWithdrawal: (poolAccount: PoolAccount) => void
  onValueChange: (params: { [key: string]: any }) => void
}

const WithdrawalManager = ({
  amount,
  message,
  poolInfo,
  poolAccounts,
  targetAddress,
  onWithdrawal,
  onValueChange
}: WithdrawalManagerProps) => {
  const [displayAmount, setDisplayAmount] = useState('')
  const [selectedPoolAccount, setSelectedPoolAccount] = useState<SelectValue>()

  const isSending = false

  // Get available pool accounts for withdrawal (approved deposits with balance > 0)
  const availablePoolAccounts =
    poolAccounts?.filter(
      (poolAccount) =>
        poolAccount.reviewStatus === 'approved' && poolAccount.balance > 0n && poolAccount.isValid
    ) || []

  // eslint-disable-next-line no-console
  const handleWithdrawalAmountChange = (event: any) => {
    const inputValue = event.target.value

    setDisplayAmount(inputValue)

    try {
      if (inputValue === '') {
        onValueChange({ withdrawalAmount: '0' })
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
      onValueChange({ withdrawalAmount: weiAmount.toString() })
    } catch (error) {
      // eslint-disable-next-line no-console
      console.warn('Invalid ETH amount entered:', inputValue)
    }
  }

  const handleTargetAddressChange = (event: any) => {
    const value = event.target.value
    onValueChange({ targetAddress: value })
  }

  const handleSetMaxAmount = () => {
    if (!selectedPoolAccount) return

    const selectedPA = availablePoolAccounts.find(
      (pa) => pa.label && pa.label.toString() === selectedPoolAccount.value
    )

    if (selectedPA && selectedPA?.balance > 0n) {
      const formattedAmount = formatEther(selectedPA.balance)
      setDisplayAmount(formattedAmount)
      onValueChange({ withdrawalAmount: parseEther(formattedAmount).toString() })
    } else {
      setDisplayAmount('')
      onValueChange({ withdrawalAmount: '0' })
    }
  }

  const handleWithdrawal = () => {
    if (!selectedPoolAccount) return

    const selectedPA = availablePoolAccounts.find(
      (pa) => pa.label && pa.label.toString() === selectedPoolAccount.value
    )

    if (selectedPA) {
      onWithdrawal(selectedPA)
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
            label: `Account #${poolAccount.name} (${poolAccount.reviewStatus}) - ${formatEther(
              poolAccount.balance
            )} ETH`,
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
          value={displayAmount}
          onChange={handleWithdrawalAmountChange}
          placeholder="0.1"
          button="MAX"
          onButtonPress={handleSetMaxAmount}
          buttonProps={{ disabled: !selectedPoolAccount || selectedPoolAccount?.balance === 0n }}
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
        <Button
          type="primary"
          onPress={handleWithdrawal}
          disabled={isSending}
          text={isSending ? 'Processing...' : 'Confirm Withdrawal'}
        />
      </View>
    </View>
  )
}

export default React.memo(WithdrawalManager)
