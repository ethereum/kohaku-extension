import React, { ReactNode } from 'react'
import { ColorValue, TouchableOpacity, View, ViewProps } from 'react-native'

import CheckIcon from '@common/assets/svg/CheckIcon'
import Text, { Props as TextProps } from '@common/components/Text'
import useTheme from '@common/hooks/useTheme'
import flexboxStyles from '@common/styles/utils/flexbox'

import styles from './styles'

interface Props {
  label?: ReactNode
  labelProps?: TextProps
  onValueChange: (value: boolean) => void
  value: boolean
  children?: any
  style?: ViewProps['style']
  uncheckedBorderColor?: ColorValue
  checkedColor?: ColorValue
  isDisabled?: boolean
  testID?: string
  invertRowDirection?: boolean
}

const Checkbox = ({
  label,
  labelProps,
  children,
  onValueChange,
  value,
  style,
  uncheckedBorderColor,
  checkedColor,
  isDisabled,
  testID = 'checkbox',
  invertRowDirection
}: Props) => {
  const { theme } = useTheme()
  const onChange = () => {
    !!onValueChange && onValueChange(!value)
  }

  return (
    <View
      style={[
        styles.container,
        style,
        isDisabled && { opacity: 0.6 },
        invertRowDirection && flexboxStyles.directionRowReverse
      ]}
    >
      <View
        style={[
          styles.checkboxWrapper,
          invertRowDirection && {
            marginRight: 0
          }
        ]}
      >
        <TouchableOpacity
          style={[
            styles.webCheckbox,
            {
              borderColor: value
                ? checkedColor || theme.successDecorative
                : uncheckedBorderColor || theme.primaryBorder
            },
            !!value && { backgroundColor: checkedColor || theme.successDecorative }
          ]}
          testID={testID}
          onPress={onChange}
          activeOpacity={0.6}
          disabled={isDisabled}
        >
          {!!value && <CheckIcon color={checkedColor || theme.successDecorative} />}
        </TouchableOpacity>
      </View>
      <View style={flexboxStyles.flex1}>
        {label ? (
          <Text
            shouldScale={false}
            onPress={onChange}
            weight="regular"
            fontSize={12}
            {...labelProps}
          >
            {label}
          </Text>
        ) : (
          children
        )}
      </View>
    </View>
  )
}

export default React.memo(Checkbox)
