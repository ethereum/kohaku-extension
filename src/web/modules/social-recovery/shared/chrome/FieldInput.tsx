/**
 * The wallet's input with a neutral focus: the wallet draws a focused field in
 * its accent red, which reads as an error, so a focused field here takes the
 * primary colour and a neutral ring instead. A field with an error, or one
 * marked valid, keeps the input's own colours.
 */
import React, { useState } from 'react'
import { StyleSheet } from 'react-native'
import type { NativeSyntheticEvent, TextInputFocusEventData } from 'react-native'

import Input from '@common/components/Input'
import useTheme from '@common/hooks/useTheme'

import type { FieldInputProps } from './types'

const FieldInput = ({
  onFocus,
  onBlur,
  error,
  isValid,
  disabled,
  inputWrapperStyle,
  borderWrapperStyle,
  ...rest
}: FieldInputProps) => {
  const { theme } = useTheme()
  const [focused, setFocused] = useState(false)
  const neutral = focused && !error && !isValid

  const handleFocus = (event: NativeSyntheticEvent<TextInputFocusEventData>) => {
    setFocused(true)
    onFocus?.(event)
  }
  const handleBlur = (event: NativeSyntheticEvent<TextInputFocusEventData>) => {
    setFocused(false)
    onBlur?.(event)
  }

  return (
    <Input
      {...rest}
      error={error}
      isValid={isValid}
      disabled={disabled}
      onFocus={handleFocus}
      onBlur={handleBlur}
      inputWrapperStyle={StyleSheet.flatten([
        neutral ? { borderColor: theme.primary } : {},
        inputWrapperStyle
      ])}
      borderWrapperStyle={StyleSheet.flatten([
        neutral ? { borderColor: theme.primaryBorder } : {},
        borderWrapperStyle
      ])}
    />
  )
}

export default React.memo(FieldInput)
