import React, { FC, memo, ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import { View } from 'react-native'

import { TokenResult } from '@ambire-common/libs/portfolio'
import formatDecimals from '@ambire-common/utils/formatDecimals/formatDecimals'
import NumberInput from '@common/components/NumberInput'
import Select from '@common/components/Select'
import { SelectValue } from '@common/components/Select/types'
import Text from '@common/components/Text'
import { FONT_FAMILIES } from '@common/hooks/useFonts'
import useTheme from '@common/hooks/useTheme'
import spacings from '@common/styles/spacings'
import { THEME_TYPES } from '@common/styles/themeConfig'
import flexbox from '@common/styles/utils/flexbox'
import useSelectedAccountControllerState from '@web/hooks/useSelectedAccountControllerState'
import MaxAmount from '@web/modules/swap-and-bridge/components/MaxAmount'

import getStyles from './styles'

type Props = {
  fromTokenOptions: SelectValue[]
  fromTokenValue?: SelectValue
  fromAmountValue: string
  fromTokenAmountSelectDisabled: boolean
  handleChangeFromToken: (value: SelectValue) => void
  fromSelectedToken: TokenResult | null
  fromAmount?: string
  fromAmountInFiat?: string
  fromAmountFieldMode: 'token' | 'fiat'
  maxFromAmount: string
  validateFromAmount: { message?: string; success?: boolean }
  onFromAmountChange: (value: string) => void
  handleSetMaxFromAmount: () => void
  inputTestId?: string
  selectTestId?: string
  title?: string | ReactNode
  maxAmountDisabled?: boolean
}

const SendToken: FC<Props> = ({
  fromTokenOptions,
  fromTokenValue,
  fromAmountValue,
  fromTokenAmountSelectDisabled,
  handleChangeFromToken,
  fromSelectedToken,
  fromAmount,
  fromAmountInFiat,
  fromAmountFieldMode,
  maxFromAmount,
  validateFromAmount,
  onFromAmountChange,
  handleSetMaxFromAmount,
  inputTestId,
  selectTestId,
  title,
  maxAmountDisabled
}) => {
  const { portfolio } = useSelectedAccountControllerState()
  const { theme, styles, themeType } = useTheme(getStyles)
  const { t } = useTranslation()
  const heading = title ?? t('Send')

  return (
    <View style={spacings.mbLg}>
      <Text appearance="secondaryText" fontSize={14} weight="light" style={spacings.mbTy}>
        {heading}
      </Text>
      <View
        style={[
          styles.outerContainer,
          validateFromAmount?.message ? styles.outerContainerWarning : {}
        ]}
      >
        <View
          style={[styles.container, validateFromAmount?.message ? styles.containerWarning : {}]}
        >
          <View style={[flexbox.flex1, flexbox.directionRow, flexbox.alignCenter]}>
            <Select
              setValue={handleChangeFromToken}
              options={fromTokenOptions}
              value={fromTokenValue}
              testID={selectTestId}
              bottomSheetTitle={t('Send token')}
              searchPlaceholder={t('Token name or address...')}
              emptyListPlaceholderText={t('No tokens found.')}
              containerStyle={{ ...flexbox.flex1, ...spacings.mb0 }}
              selectStyle={{
                backgroundColor:
                  themeType === THEME_TYPES.DARK ? theme.primaryBackground : '#54597A14',
                borderWidth: 0
              }}
              mode="bottomSheet"
            />
            <NumberInput
              value={fromAmountValue}
              onChangeText={onFromAmountChange}
              placeholder="0"
              borderless
              inputWrapperStyle={{ backgroundColor: 'transparent' }}
              nativeInputStyle={{
                fontFamily: FONT_FAMILIES.MEDIUM,
                fontSize: 20,
                textAlign: 'right'
              }}
              disabled={fromTokenAmountSelectDisabled}
              containerStyle={[
                spacings.mb0,
                flexbox.flex1,
                {
                  overflow: 'hidden'
                }
              ]}
              inputStyle={spacings.ph0}
              testID={inputTestId}
              childrenBelowInput={
                fromAmountFieldMode === 'fiat' && (
                  <View
                    style={{
                      position: 'absolute',
                      right: 0,
                      top: -2,
                      zIndex: -1,
                      width: '100%',
                      height: '100%',
                      flexDirection: 'row',
                      justifyContent: 'flex-end',
                      alignItems: 'center'
                    }}
                  >
                    <Text
                      fontSize={20}
                      weight="medium"
                      style={{ zIndex: 3 }}
                      appearance="secondaryText"
                    >
                      $
                      <Text
                        fontSize={20}
                        weight="medium"
                        style={{ opacity: 0 }}
                        appearance="secondaryText"
                      >
                        {fromAmountValue || '0'}
                      </Text>
                    </Text>
                  </View>
                )
              }
            />
          </View>
          <View
            style={[
              flexbox.directionRow,
              flexbox.alignCenter,
              flexbox.justifySpaceBetween,
              spacings.ptSm
            ]}
          >
            {!fromTokenAmountSelectDisabled && (
              <MaxAmount
                isLoading={!portfolio?.isReadyToVisualize}
                maxAmount={Number(maxFromAmount)}
                selectedTokenSymbol={fromSelectedToken?.symbol || ''}
                onMaxButtonPress={handleSetMaxFromAmount}
                disabled={maxAmountDisabled}
              />
            )}
            {fromSelectedToken && fromSelectedToken.priceIn.length !== 0 ? (
              <Text
                fontSize={12}
                color={themeType === THEME_TYPES.DARK ? theme.linkText : theme.primary}
                weight="medium"
                testID="switch-currency-sab"
              >
                {fromAmountFieldMode === 'token'
                  ? `${
                      fromAmountInFiat
                        ? formatDecimals(parseFloat(fromAmountInFiat || '0'), 'price')
                        : '$0'
                    }`
                  : `${fromAmount ? formatDecimals(parseFloat(fromAmount), 'amount') : 0} ${
                      fromSelectedToken?.symbol
                    }`}
              </Text>
            ) : (
              <View />
            )}
          </View>
        </View>
      </View>
      {validateFromAmount?.message && (
        <Text fontSize={12} style={[spacings.mlMi, spacings.mtMi]} appearance="errorText">
          {validateFromAmount?.message}
        </Text>
      )}
    </View>
  )
}

export default memo(SendToken)
