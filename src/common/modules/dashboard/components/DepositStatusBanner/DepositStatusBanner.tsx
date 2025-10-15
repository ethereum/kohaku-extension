import React, { useState } from 'react'
import { View, TouchableOpacity } from 'react-native'
import { formatEther } from 'viem'

import formatDecimals from '@ambire-common/utils/formatDecimals/formatDecimals'
import Text from '@common/components/Text'
import CloseIcon from '@common/assets/svg/CloseIcon'
import ClockIcon from '@common/assets/svg/ClockIcon'
import useTheme from '@common/hooks/useTheme'
import usePrivacyPoolsForm from '@web/modules/PPv1/hooks/usePrivacyPoolsForm'
import Button from '@common/components/Button'

import getStyles from './styles'

type TabType = 'rejected' | 'pending'

interface DepositStatusBannerProps {
  onWithdrawBack: () => void
}

const DepositStatusBanner = ({ onWithdrawBack }: DepositStatusBannerProps) => {
  const { theme } = useTheme()
  const styles = getStyles(theme)
  const { totalDeclinedBalance, totalPendingBalance, ethPrice } = usePrivacyPoolsForm()
  const [selectedTab, setSelectedTab] = useState<TabType>('rejected')

  // ========== MOCK DATA - REMOVE THIS SECTION WHEN DONE TESTING ==========
  const ENABLE_MOCK_DATA = true

  const mockTotalDeclinedBalance = {
    total: BigInt('2500000000000000000'), // 2.5 ETH
    accounts: ['0x123...', '0x456...', '0x789...'] // 3 rejected deposits
  }

  const mockTotalPendingBalance = {
    total: BigInt('1750000000000000000'), // 1.75 ETH
    accounts: ['0xabc...', '0xdef...'] // 2 pending deposits
  }

  const mockEthPrice = 2500 // $2500 per ETH

  // Use mock data if enabled, otherwise use real data
  const actualDeclinedBalance = ENABLE_MOCK_DATA ? mockTotalDeclinedBalance : totalDeclinedBalance
  const actualPendingBalance = ENABLE_MOCK_DATA ? mockTotalPendingBalance : totalPendingBalance
  const actualEthPrice = ENABLE_MOCK_DATA ? mockEthPrice : ethPrice
  // ========== END MOCK DATA ==========

  // Don't show if both are empty
  if (!actualDeclinedBalance.accounts.length && !actualPendingBalance.accounts.length) return null

  const isRejectedSelected = selectedTab === 'rejected'
  const isPendingSelected = selectedTab === 'pending'

  // Calculate amounts based on selected tab
  const currentBalance = isRejectedSelected ? actualDeclinedBalance : actualPendingBalance
  const ethAmount = formatEther(currentBalance.total)
  const formattedEthAmount = formatDecimals(Number(ethAmount), 'amount')

  // USD value only for pending
  const usdValue = isPendingSelected ? Number(ethAmount) * (actualEthPrice || 0) : null
  const formattedUsdValue = usdValue ? formatDecimals(usdValue, 'value') : null

  const rejectedCount = actualDeclinedBalance.accounts.length
  const pendingCount = actualPendingBalance.accounts.length

  return (
    <View style={[styles.container, isRejectedSelected && styles.containerRejected]}>
      <View style={styles.leftContent}>
        {/* Icon and Amount */}
        <View style={styles.iconContainer}>
          {isRejectedSelected ? (
            <CloseIcon
              width={16}
              height={16}
              color={theme.errorDecorative}
              testID="deposit-status-banner-icon-rejected"
            />
          ) : (
            <ClockIcon
              width={16}
              height={16}
              color={theme.infoDecorative}
              testID="deposit-status-banner-icon-pending"
            />
          )}
        </View>
        <View style={styles.amountContainer}>
          <Text fontSize={14} weight="semiBold" color={theme.primaryText}>
            {formattedEthAmount} ETH
          </Text>
          {formattedUsdValue && (
            <Text
              fontSize={12}
              weight="medium"
              color={theme.secondaryText}
              style={{ marginLeft: 4 }}
            >
              {formattedUsdValue}
            </Text>
          )}
        </View>
      </View>

      <View style={styles.rightContent}>
        {/* Tab Pills */}
        <View style={styles.tabsContainer}>
          {/* Rejected Tab */}
          {rejectedCount > 0 && (
            <TouchableOpacity
              style={[styles.tabPill, isRejectedSelected && styles.tabPillRejectedActive]}
              onPress={() => setSelectedTab('rejected')}
              testID="tab-rejected"
            >
              <View style={styles.closeIconContainer}>
                <CloseIcon
                  width={7}
                  height={7}
                  color={isRejectedSelected ? theme.depositRejectedText : theme.secondaryText}
                />
              </View>
              <Text
                fontSize={14}
                weight="semiBold"
                color={isRejectedSelected ? theme.depositRejectedText : theme.secondaryText}
                style={styles.tabText}
              >
                {rejectedCount}
              </Text>
            </TouchableOpacity>
          )}

          {/* Pending Tab */}
          {pendingCount > 0 && (
            <TouchableOpacity
              style={[styles.tabPill, isPendingSelected && styles.tabPillPendingActive]}
              onPress={() => setSelectedTab('pending')}
              testID="tab-pending"
            >
              <ClockIcon
                width={16}
                height={16}
                color={isPendingSelected ? theme.infoDecorative : theme.secondaryText}
              />
              <Text
                fontSize={14}
                weight="semiBold"
                color={isPendingSelected ? theme.infoDecorative : theme.secondaryText}
                style={styles.tabText}
              >
                {pendingCount}
              </Text>
            </TouchableOpacity>
          )}
        </View>

        {/* Withdraw Back Button - Only for rejected */}
        {isRejectedSelected && (
          <Button
            type="warning"
            size="small"
            accentColor="#9b2c2c"
            onPress={onWithdrawBack}
            text="Withdraw back"
            testID="withdraw-back-button"
            style={styles.withdrawButton}
          />
        )}
      </View>
    </View>
  )
}

export default React.memo(DepositStatusBanner)
