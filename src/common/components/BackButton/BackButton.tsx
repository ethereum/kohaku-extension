import React, { FC } from 'react'
import { useTranslation } from 'react-i18next'
import { ViewStyle } from 'react-native'

import LeftArrowIcon from '@common/assets/svg/LeftArrowIcon'
import Button from '@common/components/Button'
import Text from '@common/components/Text'
import useNavigation from '@common/hooks/useNavigation'
import useTheme from '@common/hooks/useTheme'
import spacings from '@common/styles/spacings'
import flexbox from '@common/styles/utils/flexbox'
import useHover, { AnimatedPressable } from '@web/hooks/useHover'

interface Props {
  onPress?: () => void
  fallbackBackRoute?: string
  type?: 'primary' | 'secondary'
  style?: ViewStyle
  withIcon?: boolean
  text?: string
}

const BackButton: FC<Props> = ({
  onPress,
  fallbackBackRoute,
  type = 'primary',
  style = {},
  withIcon = true,
  text
}) => {
  const { t } = useTranslation()
  const { goBack, canGoBack, navigate } = useNavigation()
  const { theme } = useTheme()
  const [bindAnim, animStyle] = useHover({ preset: 'opacityInverted' })

  const handlePress = () => {
    if (onPress) {
      onPress()
      return
    }

    if (!canGoBack && fallbackBackRoute) {
      navigate(fallbackBackRoute)
      return
    }

    goBack()
  }

  return type === 'primary' ? (
    <Button
      childrenPosition="left"
      size="regular"
      hasBottomSpacing={false}
      type="secondary"
      onPress={handlePress}
      text={text ?? t('Back')}
      style={[
        spacings.phSm,
        { padding: 30, flex: 1, maxWidth: 132, borderColor: '#F9F6E94D' },
        style
      ]}
    >
      {withIcon && <LeftArrowIcon color={theme.primary} style={spacings.mrTy} />}
    </Button>
  ) : (
    <AnimatedPressable
      {...bindAnim}
      style={[animStyle, flexbox.directionRow, flexbox.alignCenter, style]}
      onPress={handlePress}
    >
      {withIcon && <LeftArrowIcon color={theme.secondaryText} style={spacings.mrTy} />}
      <Text fontSize={16} weight="medium" appearance="secondaryText">
        {t('Back')}
      </Text>
    </AnimatedPressable>
  )
}

export default BackButton
