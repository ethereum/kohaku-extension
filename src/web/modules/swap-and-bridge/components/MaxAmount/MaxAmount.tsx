import React from 'react'
import { Pressable, View } from 'react-native'

import formatDecimals from '@ambire-common/utils/formatDecimals/formatDecimals'
import WalletFilledIcon from '@common/assets/svg/WalletFilledIcon'
import SkeletonLoader from '@common/components/SkeletonLoader'
import Text from '@common/components/Text'
import { useTranslation } from '@common/config/localization'
import useTheme from '@common/hooks/useTheme'
import spacings from '@common/styles/spacings'
import flexbox from '@common/styles/utils/flexbox'

import getStyles from './styles'

const MaxAmount = ({
  maxAmount,
  selectedTokenSymbol,
  isLoading,
  onMaxButtonPress,
  disabled
}: {
  maxAmount: number | null
  selectedTokenSymbol: string
  isLoading: boolean
  onMaxButtonPress?: () => void
  disabled?: boolean
}) => {
  const { t } = useTranslation()
  const { styles, theme } = useTheme(getStyles)

  if (maxAmount === null) return null

  return selectedTokenSymbol && !isLoading ? (
    <View style={[flexbox.directionRow, flexbox.alignCenter]}>
      <WalletFilledIcon width={14} height={14} color={theme.tertiaryText} />
      <Text
        testID="max-available-amount"
        numberOfLines={1}
        fontSize={12}
        style={spacings.mlMi}
        weight="medium"
        appearance="tertiaryText"
        ellipsizeMode="tail"
      >
        {maxAmount === 0 ? 0 : formatDecimals(maxAmount, 'amount')} {selectedTokenSymbol}
      </Text>
      {!!onMaxButtonPress && !!maxAmount && (
        <Pressable
          style={({ hovered }: any) => [
            styles.maxButton,
            hovered && { backgroundColor: theme.primary20 }
          ]}
          onPress={onMaxButtonPress}
          disabled={disabled}
        >
          <Text fontSize={12} weight="medium" appearance="primary" testID="max-amount-button">
            {t('Max')}
          </Text>
        </Pressable>
      )}
    </View>
  ) : (
    <SkeletonLoader height={22} width={100} />
  )
}

export default React.memo(MaxAmount)
