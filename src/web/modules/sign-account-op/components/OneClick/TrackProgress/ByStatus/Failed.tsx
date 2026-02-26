import React, { FC } from 'react'
import { useTranslation } from 'react-i18next'
import { View } from 'react-native'

import { Hex } from '@ambire-common/interfaces/hex'
import RetryIcon from '@common/assets/svg/RetryIcon'
import AlertVertical from '@common/components/AlertVertical'
import Text from '@common/components/Text'
import useTheme from '@common/hooks/useTheme'
import spacings from '@common/styles/spacings'
import flexbox from '@common/styles/utils/flexbox'
import useBackgroundService from '@web/hooks/useBackgroundService'
import { AnimatedPressable, useCustomHover } from '@web/hooks/useHover'

type FailedProps = {
  title: string
  errorMessage: string
  toToken?: {
    chainId: string
    address: Hex
  }
  amount?: string
  handleClose?: () => void
}

const Failed: FC<FailedProps> = ({ title, errorMessage, handleClose, toToken, amount }) => {
  const { t } = useTranslation()
  const { theme } = useTheme()
  const { dispatch } = useBackgroundService()
  const [bindAnim, animStyle] = useCustomHover({
    property: 'backgroundColor',
    values: {
      from: `${theme.primary as string}14`,
      to: theme.primary20
    }
  })

  return (
    <View>
      <View
        style={[flexbox.directionRow, flexbox.alignCenter, flexbox.justifyCenter, spacings.mbLg]}
      >
        <AlertVertical size="md" title={title} text={errorMessage} style={{ width: '100%' }}>
          {!!toToken && (
            <AnimatedPressable
              style={{
                borderRadius: 50,
                ...flexbox.directionRow,
                ...flexbox.alignCenter,
                ...spacings.pvSm,
                ...spacings.ph,
                ...spacings.mt,
                ...animStyle
              }}
              onPress={() => {
                dispatch({
                  type: 'SWAP_AND_BRIDGE_CONTROLLER_UPDATE_FORM',
                  params: {
                    formValues: {
                      toSelectedTokenAddr: toToken?.address,
                      toChainId: BigInt(toToken?.chainId),
                      fromAmount: amount
                    },
                    updateProps: {
                      shouldIncrementFromAmountUpdateCounter: true
                    }
                  }
                })
                if (handleClose) handleClose()
              }}
              {...bindAnim}
            >
              <Text fontSize={12} weight="medium" color={theme.primary} style={spacings.mrTy}>
                {t('Retry')}
              </Text>
              <RetryIcon color={theme.primary} />
            </AnimatedPressable>
          )}
        </AlertVertical>
      </View>
    </View>
  )
}

export default Failed
