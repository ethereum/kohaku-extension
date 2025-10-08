import React from 'react'
import { View } from 'react-native'
import { formatEther } from 'viem'

import formatDecimals from '@ambire-common/utils/formatDecimals/formatDecimals'
import Text from '@common/components/Text'
import CloseIcon from '@common/assets/svg/CloseIcon'
import useTheme from '@common/hooks/useTheme'
import usePrivacyPoolsForm from '@web/modules/PPv1/hooks/usePrivacyPoolsForm'
import Button from '@common/components/Button'

import getStyles from './styles'

const RejectedBanner = ({ onWithdrawBack }: { onWithdrawBack: () => void }) => {
  const { theme } = useTheme()
  const styles = getStyles(theme)
  const { totalDeclinedBalance } = usePrivacyPoolsForm()

  if (!totalDeclinedBalance.accounts.length) return null

  const ethAmount = formatEther(totalDeclinedBalance.total)
  const formattedEthAmount = formatDecimals(Number(ethAmount), 'amount')

  return (
    <View style={styles.container}>
      <View style={styles.leftContent}>
        <View style={styles.iconContainer}>
          <CloseIcon
            width={24}
            height={24}
            color={theme.errorDecorative}
            testID="rejected-banner-icon"
          />
        </View>
        <View style={styles.textContainer}>
          <Text fontSize={16} weight="semiBold" color={theme.primaryText}>
            Rejected ({totalDeclinedBalance.accounts.length})
          </Text>
          <Text fontSize={14} weight="regular" color={theme.secondaryText}>
            {formattedEthAmount} ETH in Privacy Pools
          </Text>
        </View>
      </View>
      <View style={styles.rightContent}>
        <Button
          type="danger"
          size="small"
          onPress={onWithdrawBack}
          text="Withdraw back"
          testID="withdraw-back-button"
        />
      </View>
    </View>
  )
}

export default React.memo(RejectedBanner)
