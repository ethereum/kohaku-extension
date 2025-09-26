import React, { FC, useCallback } from 'react'
import { useTranslation } from 'react-i18next'
import { Pressable, View } from 'react-native'

import Text from '@common/components/Text'
import useTheme from '@common/hooks/useTheme'
import spacings from '@common/styles/spacings'
import { THEME_TYPES } from '@common/styles/themeConfig'
import flexbox from '@common/styles/utils/flexbox'
import { openInTab } from '@web/extension-services/background/webapi/tab'

const Header: FC = () => {
  const { theme, themeType } = useTheme()
  const { t } = useTranslation()

  const openHelpCenter = useCallback(
    () => openInTab({ url: 'https://help.ambire.com/hc/en-us/requests/new' }),
    []
  )
  return (
    <View
      style={[
        flexbox.directionRow,
        flexbox.alignCenter,
        flexbox.justifySpaceBetween,
        spacings.mbSm,
        spacings.pbTy
      ]}
    >
      <Text fontSize={20} weight="medium" color={theme.primaryText}>
        {t('Portfolio errors')}
      </Text>
      <View style={[flexbox.directionRow, flexbox.alignCenter]}>
        <Text fontSize={14} weight="medium" appearance="secondaryText" style={spacings.mrSm}>
          {t('Experiencing frequent issues?')}
        </Text>
        <Pressable onPress={openHelpCenter}>
          <Text
            fontSize={14}
            weight="medium"
            color={themeType === THEME_TYPES.DARK ? theme.linkText : theme.primary}
            style={{
              textDecorationColor: themeType === THEME_TYPES.DARK ? theme.linkText : theme.primary,
              textDecorationLine: 'underline'
            }}
          >
            {t('Submit a ticket')}
          </Text>
        </Pressable>
      </View>
    </View>
  )
}

export default React.memo(Header)
