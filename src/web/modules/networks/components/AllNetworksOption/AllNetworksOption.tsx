import React, { useCallback } from 'react'
import { useTranslation } from 'react-i18next'
import { View } from 'react-native'

import formatDecimals from '@ambire-common/utils/formatDecimals/formatDecimals'
import NetworksIcon from '@common/assets/svg/NetworksIcon'
import Text from '@common/components/Text'
import useTheme from '@common/hooks/useTheme'
import spacings from '@common/styles/spacings'
import { THEME_TYPES } from '@common/styles/themeConfig'
import flexbox from '@common/styles/utils/flexbox'
import { AnimatedPressable, useMultiHover } from '@web/hooks/useHover'
import useSelectedAccountControllerState from '@web/hooks/useSelectedAccountControllerState'
import getStyles from '@web/modules/networks/screens/styles'

const AllNetworksOption = ({ onPress }: { onPress: (chainId: bigint | null) => void }) => {
  const { t } = useTranslation()
  const { themeType, theme, styles } = useTheme(getStyles)
  const { portfolio: selectedAccountPortfolio, dashboardNetworkFilter } =
    useSelectedAccountControllerState()

  const [bindAnim, animStyle] = useMultiHover({
    values: [
      {
        property: 'backgroundColor',
        from: `${String(theme.secondaryBackground)}00`,
        to: theme.secondaryBackground
      },
      {
        property: 'borderColor',
        from:
          themeType === THEME_TYPES.DARK
            ? `${String(theme.primaryLight)}00`
            : `${String(theme.secondaryBorder)}`,
        to: themeType === THEME_TYPES.DARK ? theme.primaryLight80 : theme.secondaryBorder
      }
    ],
    forceHoveredStyle: !dashboardNetworkFilter
  })

  const handleOnPress = useCallback(() => {
    onPress(null)
  }, [onPress])

  return (
    <AnimatedPressable
      onPress={handleOnPress}
      style={[styles.network, styles.noKebabNetwork, animStyle]}
      {...bindAnim}
    >
      <View style={[flexbox.alignCenter, flexbox.directionRow]}>
        <View
          style={{
            width: 32,
            height: 32,
            ...flexbox.center
          }}
        >
          {/* @ts-ignore */}
          <NetworksIcon width={20} height={20} />
        </View>
        <Text style={spacings.mlTy} fontSize={16}>
          {t('All Networks')}
        </Text>
      </View>
      <Text fontSize={!dashboardNetworkFilter ? 20 : 16} weight="semiBold">
        {`$${formatDecimals(Number(selectedAccountPortfolio?.totalBalance || 0))}` || '$-'}
      </Text>
    </AnimatedPressable>
  )
}

export default React.memo(AllNetworksOption)
