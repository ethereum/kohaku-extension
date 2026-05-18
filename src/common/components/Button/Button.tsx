import React, { useMemo } from 'react'
import { Animated, ColorValue, PressableProps, TextStyle, ViewStyle } from 'react-native'

import useTheme from '@common/hooks/useTheme'
import spacings from '@common/styles/spacings'
import { THEME_TYPES } from '@common/styles/themeConfig'
import common from '@common/styles/utils/common'
import flexbox from '@common/styles/utils/flexbox'
import { AnimatedPressable, useCustomHover, useMultiHover } from '@web/hooks/useHover'
import { AnimatedText } from '@web/hooks/useHover/useHover'
import { AnimationValues } from '@web/hooks/useHover/useMultiHover'
import useOnEnterKeyPress from '@web/hooks/useOnEnterKeyPress'

import getStyles from './styles'

type ButtonTypes =
  | 'primary'
  | 'secondary'
  | 'tertiary'
  | 'danger'
  | 'outline'
  | 'ghost'
  | 'ghost2'
  | 'error'
  | 'warning'
  | 'info'
  | 'info2'
  | 'success'
  | 'gray'

type ButtonSizes = 'regular' | 'small' | 'large' | 'tiny'
export interface Props extends PressableProps {
  text?: string
  type?: ButtonTypes
  size?: ButtonSizes
  textStyle?: any
  textUnderline?: boolean
  accentColor?: ColorValue
  hasBottomSpacing?: boolean
  containerStyle?: PressableProps['style']
  disabledStyle?: ViewStyle
  forceHoveredStyle?: boolean
  children?: React.ReactNode
  childrenPosition?: 'left' | 'right'
  childrenContainerStyle?: ViewStyle
  innerContainerStyle?: (hovered: boolean) => ViewStyle
  testID?: string
  submitOnEnter?: boolean
}

const OPACITY_ANIMATION = {
  property: 'opacity' as keyof ViewStyle,
  from: 1,
  to: 0.7
}

const buttonTypesWithInnerContainer = ['ghost']

const ButtonInnerContainer = ({
  type,
  forceHoveredStyle,
  children,
  innerContainerStyle,
  ...rest
}: {
  type: ButtonTypes
  forceHoveredStyle?: boolean
  children?: React.ReactNode
  innerContainerStyle?: (hovered: boolean) => ViewStyle
} & PressableProps) => {
  const { themeType, theme } = useTheme()

  const buttonInnerContainerColors = useMemo(
    () => ({
      primary: [],
      secondary: [],
      tertiary: [],
      danger: [],
      outline: [],
      ghost:
        themeType === THEME_TYPES.DARK
          ? [
              {
                property: 'backgroundColor' as any,
                from: `${theme.primary as string}00`,
                to: theme.primary20
              }
            ]
          : [
              {
                property: 'backgroundColor' as any,
                from: `${theme.primary as string}00`,
                to: theme.primary20
              }
            ],
      ghost2: [],
      error: [],
      warning: [],
      info: [],
      info2: [],
      success: [],
      gray: []
    }),
    [themeType, theme]
  )

  const [buttonInnerContainerBind, buttonInnerContainerAnimatedStyle, isHovered] = useMultiHover({
    values: buttonInnerContainerColors[type],
    forceHoveredStyle
  })

  if (buttonInnerContainerColors[type]?.length) {
    return (
      <AnimatedPressable
        style={[
          flexbox.directionRow,
          flexbox.alignCenter,
          spacings.phTy,
          spacings.pvMi,
          common.borderRadiusPrimary,
          { height: 32 },
          buttonInnerContainerAnimatedStyle,
          !!innerContainerStyle && innerContainerStyle(isHovered)
        ]}
        {...buttonInnerContainerBind}
        {...rest}
        onHoverIn={(e) => {
          !!rest.onHoverIn && rest.onHoverIn(e)
          buttonInnerContainerBind.onHoverIn(e)
        }}
        onHoverOut={(e) => {
          !!rest.onHoverOut && rest.onHoverOut(e)
          buttonInnerContainerBind.onHoverOut(e)
        }}
        onPressIn={(e) => {
          !!rest.onPressIn && rest.onPressIn(e)
          buttonInnerContainerBind.onPressIn(e)
        }}
        onPressOut={(e) => {
          !!rest.onPressOut && rest.onPressOut(e)
          buttonInnerContainerBind.onPressOut(e)
        }}
      >
        {children}
      </AnimatedPressable>
    )
  }

  return children
}

const Button = ({
  type = 'primary',
  size = 'regular',
  accentColor,
  text,
  style = {},
  textStyle = {},
  textUnderline,
  disabled = false,
  hasBottomSpacing = true,
  children,
  disabledStyle,
  forceHoveredStyle = false,
  childrenPosition = 'right',
  childrenContainerStyle,
  testID,
  submitOnEnter: _submitOnEnter,
  ...rest
}: Props) => {
  const { styles, theme, themeType } = useTheme(getStyles)
  const submitOnEnter = _submitOnEnter ?? type === 'primary'

  useOnEnterKeyPress({
    action: rest.onPress,
    disabled: !!disabled || !submitOnEnter
  })

  const buttonColors: {
    [key in ButtonTypes]: AnimationValues[]
  } = useMemo(
    () => ({
      primary: [
        {
          property: 'backgroundColor',
          from: '#0D9FD8',
          to: '#2EB5E5'
        }
        // ...(themeType === THEME_TYPES.DARK
        //   ? [
        //       {
        //         property: 'borderWidth',
        //         from: 0,
        //         to: 1
        //       },
        //       {
        //         property: 'borderColor',
        //         from: theme.primary,
        //         to: theme.primary
        //       }
        //     ]
        //   : [])
      ],
      secondary: [
        // {
        //   property: 'backgroundColor',
        //   from:
        //     themeType === THEME_TYPES.DARK
        //       ? `${String(theme.primary)}00`
        //       : `${String(theme.infoBackground)}00`,
        //   to: themeType === THEME_TYPES.DARK ? `${String(theme.primary)}20` : theme.infoBackground
        // }
        {
          property: 'backgroundColor',
          // from:
          //   themeType === THEME_TYPES.DARK
          //     ? `${String(theme.primary)}00`
          //     : `${String(theme.infoBackground)}00`,
          // to: themeType === THEME_TYPES.DARK ? `${String(theme.primary)}20` : theme.infoBackground
          from: 'transparent',
          to: theme.accent
        }
      ],
      tertiary: [
        {
          property: 'backgroundColor',
          from: 'transparent',
          to: theme.accent
        }
      ],
      danger: [
        {
          property: 'backgroundColor',
          // from: `${String(theme.errorBackground)}00`,
          // to: theme.errorBackground
          from: theme.danger,
          to: theme.danger
        }
      ],
      outline: [OPACITY_ANIMATION],
      ghost: [],
      ghost2: [],
      error: [OPACITY_ANIMATION],
      warning: [OPACITY_ANIMATION],
      info: [OPACITY_ANIMATION],
      info2: [OPACITY_ANIMATION],
      success: [OPACITY_ANIMATION],
      gray: [
        {
          property: 'backgroundColor',
          from:
            themeType === THEME_TYPES.DARK ? theme.tertiaryBackground : theme.quaternaryBackground,
          to:
            themeType === THEME_TYPES.DARK
              ? theme.secondaryBackground
              : `${String(theme.primaryLight)}10`
        },
        {
          property: 'borderWidth',
          from: 0,
          to: 1
        },
        {
          property: 'borderColor',
          from: theme.quaternaryBackground,
          to: themeType === THEME_TYPES.DARK ? `${theme.linkText as string}80` : theme.primaryLight
        }
      ]
    }),
    [themeType, theme]
  )

  const [buttonContainerBind, buttonContainerAnimatedStyle] = useMultiHover({
    values: buttonColors[type],
    forceHoveredStyle
  })

  const containerStyles: { [key in ButtonTypes]: ViewStyle } = {
    primary: styles.buttonContainerPrimary,
    secondary: styles.buttonContainerSecondary,
    tertiary: styles.buttonContainerTertiary,
    danger: styles.buttonContainerDanger,
    outline: styles.buttonContainerOutline,
    ghost: styles.buttonContainerGhost,
    ghost2: {},
    error: {
      backgroundColor: theme.errorText,
      borderWidth: 0
    },
    warning: {
      // backgroundColor: theme.warningText,
      backgroundColor: theme.warning,
      borderWidth: 0
    },
    info: {
      backgroundColor: theme.infoText,
      borderWidth: 0
    },
    info2: {
      backgroundColor: theme.info2Text,
      borderWidth: 0
    },
    success: {
      // backgroundColor: theme.successText,
      backgroundColor: theme.success,
      borderWidth: 0
    },
    gray: {
      backgroundColor: theme.quaternaryBackground,
      borderWidth: 0
    }
  }

  const containerStylesSizes: { [key in ButtonSizes]: ViewStyle } = {
    large: styles.buttonContainerStylesSizeLarge,
    regular: styles.buttonContainerStylesSizeRegular,
    small: styles.buttonContainerStylesSizeSmall,
    tiny: styles.buttonContainerStylesSizeTiny
  }

  // @ts-ignore
  const buttonTextColors: {
    [key in ButtonTypes]: AnimationValues[]
  } = useMemo(
    () => ({
      primary: [
        {
          property: 'color',
          // from: themeType === THEME_TYPES.DARK ? theme.primaryBackground : '#fff',
          // to: '#fff'
          // from: theme.textPrimary,
          // to: theme.textPrimary
          from: theme.textPrimary,
          to: theme.textPrimary
        }
      ],
      secondary: [
        {
          property: 'color',
          from: theme.primary,
          // to: themeType === THEME_TYPES.DARK ? '#fff' : theme.primary
          // to: theme.textPrimary
          to: '#fff'
        }
      ],
      tertiary: [
        {
          property: 'color',
          from: '#0D9FD8',
          to: theme.textPrimary
        }
      ],
      danger: [
        {
          property: 'color',
          // from: themeType === THEME_TYPES.DARK ? theme.errorText : theme.errorDecorative,
          // to: themeType === THEME_TYPES.DARK ? theme.errorText : theme.errorDecorative
          from: theme.textPrimary,
          to: theme.textPrimary
        }
      ],
      outline: [
        {
          property: 'color',
          from: themeType === THEME_TYPES.DARK ? theme.primary : theme.successDecorative,
          to: themeType === THEME_TYPES.DARK ? '#fff' : theme.successDecorative
        }
      ],
      ghost: [
        {
          property: 'color',
          from: theme.primary,
          to: theme.primary
        }
      ],
      ghost2: [
        {
          property: 'color',
          from: theme.iconPrimary,
          to: theme.primaryBackgroundInverted
        }
      ],
      error: [
        {
          property: 'color',
          from: theme.primaryBackground,
          to: theme.primaryBackground
        }
      ],
      warning: [
        {
          property: 'color',
          // from: theme.primaryBackground,
          // to: theme.primaryBackground
          from: theme.surfaceInput,
          to: theme.surfaceInput
        }
      ],
      info: [
        {
          property: 'color',
          from: theme.primaryBackground,
          to: theme.primaryBackground
        }
      ],
      info2: [
        {
          property: 'color',
          from: theme.primaryBackground,
          to: theme.primaryBackground
        }
      ],
      success: [
        {
          property: 'color',
          // from: theme.primaryBackground,
          // to: theme.primaryBackground
          from: theme.surfaceInput,
          to: theme.surfaceInput
        }
      ],
      gray: [
        {
          property: 'color',
          from: theme.primaryText,
          to: theme.primaryText
        }
      ]
    }),
    [themeType, theme]
  )

  const [buttonTextBind, buttonTextAnimatedStyle, isHovered] = useMultiHover({
    values: buttonTextColors[type],
    forceHoveredStyle
  })

  const buttonTextStylesSizes: { [key in ButtonSizes]: TextStyle } = {
    large: styles.buttonTextStylesSizeLarge,
    regular: styles.buttonTextStylesSizeRegular,
    small: styles.buttonTextStylesSizeSmall,
    tiny: styles.buttonTextStylesSizeTiny
  }

  const [childrenScaleBind, childrenScaleAnimationStyle] = useCustomHover({
    property: 'scaleX',
    values: { from: 1, to: 1.1 }
  })

  const fromColor = buttonTextColors[type][0]?.from
  const toColor = buttonTextColors[type][0]?.to

  const effectiveColor = isHovered ? toColor : fromColor

  const enhancedChildren = React.Children.toArray(children).map((child, index) => {
    if (index === 0 && React.isValidElement(child)) {
      // Only override color if it's not already set
      const childProps = child.props as any
      if (childProps.color === undefined) {
        return React.cloneElement(child, { color: accentColor || effectiveColor } as any)
      }
    }

    return child
  })

  return (
    <AnimatedPressable
      testID={testID}
      disabled={disabled}
      style={
        [
          containerStylesSizes[size],
          styles.buttonContainer,
          containerStyles[type],
          style,
          !!accentColor && { borderColor: accentColor },
          !hasBottomSpacing && spacings.mb0,
          buttonContainerAnimatedStyle,
          disabled && disabledStyle ? disabledStyle : {},
          disabled && !disabledStyle ? styles.disabled : {}
        ] as ViewStyle
      }
      {...rest}
      onHoverIn={(e) => {
        if (buttonTypesWithInnerContainer.includes(type)) return

        buttonContainerBind.onHoverIn(e)
        buttonTextBind.onHoverIn(e)
        childrenScaleBind.onHoverIn(e)

        rest?.onHoverIn && rest.onHoverIn(e)
      }}
      onHoverOut={(e) => {
        if (buttonTypesWithInnerContainer.includes(type)) return

        buttonContainerBind.onHoverOut(e)
        buttonTextBind.onHoverOut(e)
        childrenScaleBind.onHoverOut(e)

        rest?.onHoverOut && rest.onHoverOut(e)
      }}
      onPressIn={(e) => {
        if (buttonTypesWithInnerContainer.includes(type)) return

        buttonContainerBind.onPressIn(e)
        buttonTextBind.onPressIn(e)
        childrenScaleBind.onPressIn(e)

        rest?.onPressIn && rest.onPressIn(e)
      }}
      onPressOut={(e) => {
        if (buttonTypesWithInnerContainer.includes(type)) return

        buttonContainerBind.onPressOut(e)
        buttonTextBind.onPressOut(e)
        childrenScaleBind.onPressOut(e)
        rest?.onPressOut && rest.onPressOut(e)
      }}
    >
      {/* @ts-ignore */}
      <ButtonInnerContainer
        type={type}
        forceHoveredStyle={forceHoveredStyle}
        {...rest}
        onHoverIn={(e) => {
          buttonContainerBind.onHoverIn(e)
          buttonTextBind.onHoverIn(e)
          childrenScaleBind.onHoverIn(e)

          rest?.onHoverIn && rest.onHoverIn(e)
        }}
        onHoverOut={(e) => {
          buttonContainerBind.onHoverOut(e)
          buttonTextBind.onHoverOut(e)
          childrenScaleBind.onHoverOut(e)

          rest?.onHoverOut && rest.onHoverOut(e)
        }}
        onPressIn={(e) => {
          buttonContainerBind.onPressIn(e)
          buttonTextBind.onPressIn(e)
          childrenScaleBind.onPressIn(e)

          rest?.onPressIn && rest.onPressIn(e)
        }}
        onPressOut={(e) => {
          buttonContainerBind.onPressOut(e)
          buttonTextBind.onPressOut(e)
          childrenScaleBind.onPressOut(e)
          rest?.onPressOut && rest.onPressOut(e)
        }}
      >
        {childrenPosition === 'left' && (
          <Animated.View
            style={[
              childrenContainerStyle || {
                transform: [{ scale: childrenScaleAnimationStyle.scaleX as number }]
              }
            ]}
          >
            {enhancedChildren}
          </Animated.View>
        )}

        {!!text && (
          <AnimatedText
            selectable={false}
            style={[
              styles.buttonText,
              !!textUnderline && styles.buttonTextUnderline,
              buttonTextStylesSizes[size],
              { ...buttonTextAnimatedStyle },
              !!accentColor && { color: accentColor },
              textStyle
            ]}
          >
            {text}
          </AnimatedText>
        )}

        {childrenPosition === 'right' && (
          <Animated.View
            style={[
              childrenContainerStyle || {
                transform: [{ scale: childrenScaleAnimationStyle.scaleX as number }]
              }
            ]}
          >
            {enhancedChildren}
          </Animated.View>
        )}
      </ButtonInnerContainer>
    </AnimatedPressable>
  )
}

export default React.memo(Button)
