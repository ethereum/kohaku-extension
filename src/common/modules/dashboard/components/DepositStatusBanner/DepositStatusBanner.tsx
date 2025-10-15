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
import spacings from '@common/styles/spacings'

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

  if (!totalDeclinedBalance.accounts.length && !totalPendingBalance.accounts.length) return null

  const isRejectedSelected = selectedTab === 'rejected'
  const isPendingSelected = selectedTab === 'pending'

  const currentBalance = isRejectedSelected ? totalDeclinedBalance : totalPendingBalance
  const ethAmount = formatEther(currentBalance.total)
  const formattedEthAmount = formatDecimals(Number(ethAmount), 'amount')

  const usdValue = isPendingSelected ? Number(ethAmount) * (ethPrice || 0) : null
  const formattedUsdValue = usdValue ? formatDecimals(usdValue, 'value') : null

  const rejectedCount = totalDeclinedBalance.accounts.length
  const pendingCount = totalPendingBalance.accounts.length

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
                <View style={styles.closeIconContainer}>
                  <CloseIcon
                    width={8}
                    height={8}
                    color={theme.depositRejectedText}
                    testID="deposit-status-banner-icon-rejected"
                  />
                </View>
              ) : (
                <ClockIcon
                  width={16}
                  height={16}
                  color={theme.depositPendingText}
                  testID="deposit-status-banner-icon-pending"
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
                  <View
                    style={[
                      styles.closeIconContainer,
                      {
                        borderColor: isRejectedSelected
                          ? theme.depositRejectedText
                          : theme.depositInactiveText
                      }
                    ]}
                  >
                    <CloseIcon
                      width={8}
                      height={8}
                      color={
                        isRejectedSelected ? theme.depositRejectedText : theme.depositInactiveText
                      }
                    />
                  </View>
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
    </View>
  )
}

export default React.memo(DepositStatusBanner)
