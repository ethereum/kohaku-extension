import React, { FC, ReactNode } from 'react'
import { ViewStyle } from 'react-native'

import spacings, { SPACING_TY, SPACING_XL } from '@common/styles/spacings'

import Button, { Props as CommonButtonProps } from '../Button/Button'
import Spinner from '../Spinner'

type Props = Omit<CommonButtonProps, 'style' | 'children'> & {
  style?: ViewStyle
  isLoading?: boolean
  proceedIcon?: ReactNode
}

const ButtonWithLoader: FC<Props> = ({
  style,
  isLoading,
  childrenContainerStyle = {},
  proceedIcon,
  ...rest
}) => {
  return (
    <Button
      style={[
        {
          minWidth: 160,
          ...spacings.mlLg
          // paddingHorizontal: SPACING_XL + SPACING_TY
        },
        style
      ]}
      hasBottomSpacing={false}
      childrenContainerStyle={{
        position: 'absolute',
        width: '100%',
        height: '100%',
        flexDirection: 'row',
        justifyContent: 'flex-end',
        alignItems: 'center',
        paddingRight: SPACING_TY,
        ...childrenContainerStyle
      }}
      {...rest}
    >
      {isLoading ? (
        <Spinner
          variant="white"
          style={{
            width: 32,
            height: 32
          }}
        />
      ) : (
        proceedIcon ?? null
      )}
    </Button>
  )
}

export default ButtonWithLoader
