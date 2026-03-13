import React, { useState, useEffect, useMemo } from 'react'
import { View, TouchableOpacity } from 'react-native'
import { formatUnits, toHex } from 'viem'

import formatDecimals from '@ambire-common/utils/formatDecimals/formatDecimals'
import Text from '@common/components/Text'
import ClockIcon from '@common/assets/svg/ClockIcon'
import useTheme from '@common/hooks/useTheme'
import useRailgunForm from '@web/modules/railgun/hooks/useRailgunForm'
import Button from '@common/components/Button'
import spacings from '@common/styles/spacings'
import Tooltip from '@common/components/Tooltip'

import usePrivacyPools from '@web/hooks/usePrivacyPools/usePrivacyPools'
import useSelectedAccountControllerState from '@web/hooks/useSelectedAccountControllerState'
import { ZERO_ADDRESS } from '@ambire-common/services/socket/constants'
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
  const { isSynced, pendingNotes, approvedNotes } = usePrivacyPools()
  const { portfolio } = useSelectedAccountControllerState()
  const {
    totalApprovedBalance: totalApprovedBalanceRailgun,
    isAccountLoaded: isAccountLoadedRailgun
  } = useRailgunForm()

  // Group pending notes by asset address
  const pendingByAsset = useMemo(() => {
    return pendingNotes.reduce<Record<string, bigint>>((acc, note) => {
      const address = toHex(note.assetAddress, { size: 20 }).toLowerCase()
      return { ...acc, [address]: (acc[address] ?? 0n) + note.balance }
    }, {})
  }, [pendingNotes])

  // Group approved notes by asset address
  const approvedByAsset = useMemo(() => {
    return approvedNotes.reduce<Record<string, bigint>>((acc, note) => {
      const address = toHex(note.assetAddress, { size: 20 }).toLowerCase()
      return { ...acc, [address]: (acc[address] ?? 0n) + note.balance }
    }, {})
  }, [approvedNotes])

  const totalPendingBalance = useMemo(
    () => Object.values(pendingByAsset).reduce((sum, v) => sum + v, 0n),
    [pendingByAsset]
  )
  const totalApprovedBalance = useMemo(
    () => Object.values(approvedByAsset).reduce((sum, v) => sum + v, 0n),
    [approvedByAsset]
  )

  const [selectedTab, setSelectedTab] = useState<TabType>(() => {
    if (pendingNotes.length > 0) return 'pending'
    return 'rejected'
  })

  useEffect(() => {
    const pendingCount = pendingNotes.length
    if (selectedTab === 'rejected' && pendingCount > 0) {
      setSelectedTab('pending')
    } else if (selectedTab === 'pending' && pendingCount === 0) {
      setSelectedTab('rejected')
    }
  }, [pendingNotes, selectedTab])

  const isRejectedSelected = selectedTab === 'rejected'
  const isPendingSelected = selectedTab === 'pending'

  const rejectedCount = 0
  const pendingCount = pendingNotes.length

  const zeroBalance =
    totalPendingBalance === 0n &&
    totalApprovedBalance === 0n &&
    totalApprovedBalanceRailgun.total === 0n

  const onlyApprovedBalance =
    totalPendingBalance === 0n &&
    (totalApprovedBalance > 0n || totalApprovedBalanceRailgun.total > 0n)

  // Build per-asset rows for the pending view
  const pendingAssetRows = useMemo(() => {
    return Object.entries(pendingByAsset)
      .filter(([, total]) => total > 0n)
      .map(([address, total]) => {
        const isNative = address === ZERO_ADDRESS.toLowerCase()
        const portfolioToken = portfolio?.tokens.find((t) => t.address.toLowerCase() === address)
        const symbol = portfolioToken?.symbol ?? (isNative ? 'ETH' : address.slice(0, 6))
        const decimals = portfolioToken?.decimals ?? 18
        const price = portfolioToken?.priceIn.find((p) => p.baseCurrency === 'usd')?.price
        const formatted = formatUnits(total, decimals)
        const usdValue = price ? Number(formatted) * price : null
        return { address, symbol, formatted, usdValue }
      })
  }, [pendingByAsset, portfolio?.tokens])

  if (!isSynced || !isAccountLoadedRailgun || onlyApprovedBalance) return null

  if (zeroBalance && isSynced && isAccountLoadedRailgun) {
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
                  Shield tokens into your Private Account
                </Text>
              </View>
            </View>
            <View style={styles.rightContent}>
              <Button
                type="warning"
                size="small"
                accentColor={theme.depositPendingText}
                onPress={onDeposit}
                text="Shield"
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
              <View style={{ flexDirection: 'column' }}>
                {isPendingSelected
                  ? pendingAssetRows.map(({ address, symbol, formatted, usdValue }) => (
                      <View key={address} style={{ flexDirection: 'row', alignItems: 'center' }}>
                        <Text fontSize={14} weight="semiBold" color={theme.primaryText}>
                          {formatDecimals(Number(formatted), 'amount')} {symbol} in Privacy Pools
                        </Text>
                        {usdValue ? (
                          <Text
                            fontSize={12}
                            weight="medium"
                            color={theme.secondaryText}
                            style={{ marginLeft: 4 }}
                          >
                            ({formatDecimals(usdValue, 'value')})
                          </Text>
                        ) : null}
                      </View>
                    ))
                  : null}
              </View>
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
                text="Exit all"
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
