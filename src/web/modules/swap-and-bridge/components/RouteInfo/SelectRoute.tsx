import React, { FC } from 'react'
import { Pressable } from 'react-native'

import RightArrowIcon from '@common/assets/svg/RightArrowIcon'
import Text from '@common/components/Text'
import useTheme from '@common/hooks/useTheme'
import spacings from '@common/styles/spacings'
import { THEME_TYPES } from '@common/styles/themeConfig'
import flexbox from '@common/styles/utils/flexbox'
import { useTranslation } from 'react-i18next'

type Props = {
  shouldEnableRoutesSelection: boolean
  openRoutesModal: () => void
}

const SelectRoute: FC<Props> = ({ shouldEnableRoutesSelection, openRoutesModal }) => {
  const { theme, themeType } = useTheme()
  const { t } = useTranslation()

  return (
    <Pressable
      style={{
        paddingVertical: 2,
        ...spacings.phTy,
        ...flexbox.directionRow,
        ...flexbox.alignCenter,
        opacity: shouldEnableRoutesSelection ? 1 : 0.5
      }}
      onPress={openRoutesModal as any}
      disabled={!shouldEnableRoutesSelection}
    >
      <Text
        fontSize={14}
        weight="medium"
        color={themeType === THEME_TYPES.DARK ? theme.linkText : theme.primary}
        style={{
          ...spacings.mr,
          textDecorationColor: themeType === THEME_TYPES.DARK ? theme.linkText : theme.primary,
          textDecorationLine: 'underline'
        }}
        testID="select-route"
      >
        {t('Select route')}
      </Text>
      <RightArrowIcon
        weight="2"
        width={5}
        height={16}
        color={themeType === THEME_TYPES.DARK ? theme.linkText : theme.primary}
      />
    </Pressable>
  )
}

export default SelectRoute
