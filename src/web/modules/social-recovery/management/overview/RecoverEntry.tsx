/** The entry to recover another account, under every reading of the overview. */
import React from 'react'
import { Pressable, View } from 'react-native'

import RightArrowIcon from '@common/assets/svg/RightArrowIcon'
import Text from '@common/components/Text'
import { useTranslation } from '@common/config/localization'
import useTheme from '@common/hooks/useTheme'
import { WEB_ROUTES } from '@common/modules/router/constants/common'
import spacings from '@common/styles/spacings'
import common from '@common/styles/utils/common'
import flexbox from '@common/styles/utils/flexbox'

import { OVERVIEW } from './constants'
import type { OverviewNavigateProps } from './types'

const RecoverEntry = ({ navigate }: OverviewNavigateProps) => {
  const { t } = useTranslation()
  const { theme } = useTheme()
  return (
    <Pressable
      testID="overview-recover"
      accessibilityRole="button"
      onPress={() => navigate(WEB_ROUTES.socialRecoveryRecovery)}
      style={[
        flexbox.directionRow,
        flexbox.alignCenter,
        common.borderRadiusSecondary,
        spacings.ph,
        spacings.pv,
        spacings.mtLg,
        { borderWidth: 1, borderColor: theme.secondaryBorder }
      ]}
    >
      <View style={[flexbox.flex1, spacings.mrSm]}>
        <Text fontSize={16} weight="medium">
          {t(`${OVERVIEW}.recover.title`)}
        </Text>
        <Text fontSize={12} appearance="secondaryText">
          {t(`${OVERVIEW}.recover.body`)}
        </Text>
      </View>
      <RightArrowIcon />
    </Pressable>
  )
}

export default React.memo(RecoverEntry)
