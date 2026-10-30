/** The way from the setup screen to the recovery of another account. */
import React from 'react'
import { Pressable, View } from 'react-native'

import RightArrowIcon from '@common/assets/svg/RightArrowIcon'
import Text from '@common/components/Text'
import { useTranslation } from '@common/config/localization'
import useTheme from '@common/hooks/useTheme'
import spacings from '@common/styles/spacings'
import common from '@common/styles/utils/common'
import flexbox from '@common/styles/utils/flexbox'

import type { RecoverLinkProps } from './types'

const RecoverLink = ({ onRecover }: RecoverLinkProps) => {
  const { t } = useTranslation()
  const { theme } = useTheme()

  return (
    <Pressable
      testID="recover"
      accessibilityRole="button"
      onPress={onRecover}
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
          {t('socialRecovery.routes.recover')}
        </Text>
        <Text fontSize={12} appearance="secondaryText">
          {t('socialRecovery.presets.recoverLine')}
        </Text>
      </View>
      <RightArrowIcon />
    </Pressable>
  )
}

export default React.memo(RecoverLink)
