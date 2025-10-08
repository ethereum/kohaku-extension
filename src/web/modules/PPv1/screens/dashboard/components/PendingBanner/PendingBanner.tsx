import React from 'react'
import { View } from 'react-native'
import { formatEther } from 'viem'

import formatDecimals from '@ambire-common/utils/formatDecimals/formatDecimals'
import Text from '@common/components/Text'
import ClockIcon from '@common/assets/svg/ClockIcon'
import useTheme from '@common/hooks/useTheme'
import usePrivacyPoolsForm from '@web/modules/PPv1/hooks/usePrivacyPoolsForm'

import getStyles from './styles'

const PendingBanner = () => {
  const { theme } = useTheme()
  const styles = getStyles(theme)
  const { totalPendingBalance, ethPrice } = usePrivacyPoolsForm()

  if (!totalPendingBalance.accounts.length) return null

  const ethAmount = formatEther(totalPendingBalance.total)
  const formattedEthAmount = formatDecimals(Number(ethAmount), 'amount')
  const usdValue = Number(ethAmount) * (ethPrice || 0)
  const formattedUsdValue = formatDecimals(usdValue, 'value')

  return (
    <View style={styles.container}>
      <View style={styles.leftContent}>
        <View style={styles.iconContainer}>
          <ClockIcon
            width={24}
            height={24}
            color={theme.secondaryText}
            testID="pending-banner-icon"
          />
        </View>
        <View style={styles.textContainer}>
          <Text fontSize={16} weight="semiBold" color={theme.primaryText}>
            Pending ({totalPendingBalance.accounts.length})
          </Text>
          <Text fontSize={14} weight="regular" color={theme.secondaryText}>
            {formattedEthAmount} ETH in Privacy Pools
          </Text>
        </View>
      </View>
      <View style={styles.rightContent}>
        <Text fontSize={16} weight="semiBold" color={theme.primaryText}>
          {formattedUsdValue}
        </Text>
      </View>
    </View>
  )
}

export default React.memo(PendingBanner)
