import React from 'react'

import Input from '../Input'
import { InputProps } from '../Input/Input'

interface Props extends InputProps {
  buttonText?: string
  onButtonPress?: () => any
  precision?: any
  disabled?: boolean
  allowHex?: boolean
}

const NumberInput = ({ onChangeText, precision, disabled, allowHex, ...rest }: Props) => {
  const onInputValue = (value: string) => {
    try {
      if (!onChangeText) return
      if (!value) return onChangeText('')
      // eslint-disable-next-line no-param-reassign
      value = value.replace(',', '.')
      // eslint-disable-next-line no-param-reassign
      if (value.startsWith('.')) value = `0${value}`
      const afterDecimals = value?.split('.')[1]
      if (afterDecimals && afterDecimals.length > precision) return

      const isValid = allowHex
        ? /^[0-9]*\.{0,1}[0-9]*$/g.test(value.trim()) ||
          value.startsWith('0x') ||
          (value.startsWith('0x') && /^[0-9a-fA-F]+$/.test(value.trim()))
        : /^[0-9]*\.{0,1}[0-9]*$/g.test(value.trim())

      isValid && onChangeText(value.trim())
      // eslint-disable-next-line no-empty
    } catch (error) {}
  }
  return (
    <Input
      keyboardType="numeric"
      autoCapitalize="none"
      disabled={disabled}
      autoCorrect={false}
      onChangeText={onInputValue}
      {...rest}
    />
  )
}

export default React.memo(NumberInput)
