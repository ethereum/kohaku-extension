import React, { useState, useEffect } from 'react'
import { View, TouchableOpacity } from 'react-native'
import { formatEther } from 'viem'

import formatDecimals from '@ambire-common/utils/formatDecimals/formatDecimals'
import Text from '@common/components/Text'
import ClockIcon from '@common/assets/svg/ClockIcon'
import useTheme from '@common/hooks/useTheme'
import usePrivacyPoolsForm from '@web/modules/PPv1/hooks/usePrivacyPoolsForm'
import Button from '@common/components/Button'
import spacings from '@common/styles/spacings'
import Tooltip from '@common/components/Tooltip'

import CloseIconWithCircle from './CloseIconWithCircle'
import getStyles from './styles'

type TabType = 'rejected' | 'pending'

interface DepositStatusBannerProps {
  onWithdrawBack: () => void
  onDeposit: () => void
}

const DepositStatusBanner = ({ onWithdrawBack, onDeposit }: DepositStatusBannerProps) => {
  const { theme } = useTheme()
  const styles = getStyles(theme)
  const {
    totalDeclinedBalance,
    totalPendingBalance,
    totalApprovedBalance,
    ethPrice,
    isAccountLoaded
  } = usePrivacyPoolsForm()

  const [selectedTab, setSelectedTab] = useState<TabType>(() => {
    const hasRejected = totalDeclinedBalance.accounts.length > 0
    const hasPending = totalPendingBalance.accounts.length > 0

    if (hasRejected) return 'rejected'
    if (hasPending) return 'pending'
    return 'rejected' // fallback
  })

  // Update selected tab when data changes and current tab has no items
  useEffect(() => {
    const rejectedCount = totalDeclinedBalance.accounts.length
    const pendingCount = totalPendingBalance.accounts.length

    // If current selected tab has no items, switch to the tab that has items
    if (selectedTab === 'rejected' && rejectedCount === 0 && pendingCount > 0) {
      setSelectedTab('pending')
    } else if (selectedTab === 'pending' && pendingCount === 0 && rejectedCount > 0) {
      setSelectedTab('rejected')
    }
  }, [totalDeclinedBalance.accounts.length, totalPendingBalance.accounts.length, selectedTab])

  const isRejectedSelected = selectedTab === 'rejected'
  const isPendingSelected = selectedTab === 'pending'

  const currentBalance = isRejectedSelected ? totalDeclinedBalance : totalPendingBalance
  const ethAmount = formatEther(currentBalance.total)
  const formattedEthAmount = formatDecimals(Number(ethAmount), 'amount')

  const usdValue = isPendingSelected ? Number(ethAmount) * (ethPrice || 0) : null
  const formattedUsdValue = usdValue ? formatDecimals(usdValue, 'value') : null

  const rejectedCount = totalDeclinedBalance.accounts.length
  const pendingCount = totalPendingBalance.accounts.length
  const zeroBalance =
    totalDeclinedBalance.total === 0n &&
    totalPendingBalance.total === 0n &&
    totalApprovedBalance.total === 0n

  const onlyApprovedBalance =
    totalDeclinedBalance.total === 0n &&
    totalPendingBalance.total === 0n &&
    totalApprovedBalance.total > 0n

  if (!isAccountLoaded || onlyApprovedBalance) return null

  if (zeroBalance && isAccountLoaded) {
    return (
      <View style={spacings.phSm}>
        <View style={[styles.contentContainer]}>
          <View style={[styles.container, styles.containerPending]}>
            <View style={styles.leftContent}>
              <View style={styles.zeroBalanceContainer}>
                <Text fontSize={14} weight="semiBold" color={theme.primaryText}>
                  Zero private balance
                </Text>
                <Text fontSize={13} weight="light" color={theme.primaryText}>
                  Deposit some ETHs into Privacy Pools
                </Text>
              </View>
            </View>
            <View style={styles.rightContent}>
              <Button
                type="warning"
                size="small"
                accentColor={theme.depositPendingText}
                onPress={onDeposit}
                text="Deposit"
                testID="withdraw-back-button"
                style={styles.depositButton}
              />
            </View>
          </View>
        </View>
      </View>
    )
  }

  return (
    <View style={spacings.phSm}>
      <View style={[styles.contentContainer]}>
        <View
          style={[
            styles.container,
            isRejectedSelected ? styles.containerRejected : styles.containerPending
          ]}
        >
          <View style={styles.leftContent}>
            <View style={styles.iconContainer}>
              {isRejectedSelected ? (
                <CloseIconWithCircle
                  width={16}
                  height={16}
                  color={theme.depositRejectedText}
                  circleColor={theme.depositRejectedText}
                  data-tooltip-id="deposit-status-icon-rejected"
                  data-tooltip-content="Rejected"
                  testID="deposit-status-banner-icon-rejected"
                />
              ) : (
                <ClockIcon
                  width={16}
                  height={16}
                  color={theme.depositPendingText}
                  testID="deposit-status-banner-icon-pending"
                  data-tooltip-id="deposit-status-icon-pending"
                  data-tooltip-content="Pending"
                />
              )}
            </View>
            <View style={styles.amountContainer}>
              <Text fontSize={14} weight="semiBold" color={theme.primaryText}>
                {formattedEthAmount} ETH in Privacy Pools
              </Text>
              {formattedUsdValue && (
                <Text
                  fontSize={12}
                  weight="medium"
                  color={theme.secondaryText}
                  style={{ marginLeft: 4 }}
                >
                  ({formattedUsdValue})
                </Text>
              )}
            </View>
          </View>

          <View style={styles.rightContent}>
            <View style={styles.tabsContainer}>
              {rejectedCount > 0 && (
                <TouchableOpacity
                  style={[styles.tabPill, isRejectedSelected && styles.tabPillRejectedActive]}
                  onPress={() => setSelectedTab('rejected')}
                  testID="tab-rejected"
                >
                  <CloseIconWithCircle
                    width={16}
                    height={16}
                    color={
                      isRejectedSelected ? theme.depositRejectedText : theme.depositInactiveText
                    }
                  />
                  <Text
                    fontSize={14}
                    weight="semiBold"
                    color={
                      isRejectedSelected ? theme.depositRejectedText : theme.depositInactiveText
                    }
                    style={styles.tabText}
                  >
                    {rejectedCount}
                  </Text>
                </TouchableOpacity>
              )}

              {pendingCount > 0 && (
                <TouchableOpacity
                  style={[styles.tabPill, isPendingSelected && styles.tabPillPendingActive]}
                  onPress={() => setSelectedTab('pending')}
                  testID="tab-pending"
                >
                  <ClockIcon
                    width={16}
                    height={16}
                    color={isPendingSelected ? theme.depositPendingText : theme.depositInactiveText}
                  />
                  <Text
                    fontSize={14}
                    weight="semiBold"
                    color={isPendingSelected ? theme.depositPendingText : theme.depositInactiveText}
                    style={styles.tabText}
                  >
                    {pendingCount}
                  </Text>

                  {rejectedCount <= 0 && (
                    <Text
                      fontSize={14}
                      weight="semiBold"
                      color={theme.depositInactiveText}
                      style={styles.tabText}
                    >
                      Pending
                    </Text>
                  )}
                </TouchableOpacity>
              )}
            </View>

            {isRejectedSelected && (
              <Button
                type="warning"
                size="small"
                accentColor={theme.depositRejectedText}
                onPress={onWithdrawBack}
                text="Withdraw back"
                testID="withdraw-back-button"
                style={styles.withdrawButton}
              />
            )}
          </View>
        </View>
      </View>
      <Tooltip
        id="deposit-status-icon-pending"
        style={styles.pendingTooltip}
        border={styles.pendingTooltipBorder}
      />
      <Tooltip
        id="deposit-status-icon-rejected"
        style={styles.rejectedTooltip}
        border={styles.rejectedTooltipBorder}
      />
    </View>
  )
}

export default React.memo(DepositStatusBanner)
