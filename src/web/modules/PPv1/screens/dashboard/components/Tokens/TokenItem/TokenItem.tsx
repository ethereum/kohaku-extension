import React, { useCallback } from 'react'
import { View } from 'react-native'
import { formatUnits } from 'ethers'

import { TokenResult } from '@ambire-common/libs/portfolio'
import formatDecimals from '@ambire-common/utils/formatDecimals/formatDecimals'
import { getTokenBalanceInUSD } from '@ambire-common/libs/portfolio/helpers'
import Text from '@common/components/Text'
import Tooltip from '@common/components/Tooltip'
import useTheme from '@common/hooks/useTheme'
import spacings from '@common/styles/spacings'
import flexboxStyles from '@common/styles/utils/flexbox'
import { AnimatedPressable, useCustomHover } from '@web/hooks/useHover'
import { getTokenId } from '@web/utils/token'
import { THEME_TYPES } from '@common/styles/themeConfig'

import useNavigation from '@common/hooks/useNavigation'
import { WEB_ROUTES } from '@common/modules/router/constants/common'
import TokenIcon from '../TokenIcon'
import getStyles from './styles'

const TokenItem = ({ token }: { token: TokenResult }) => {
  const { styles, theme, themeType } = useTheme(getStyles)

  const {
    symbol,
    address,
    chainId,
    flags: { onGasTank }
  } = token

  const { navigate } = useNavigation()
  const navigateToTokenDetails = useCallback(() => {
    navigate(WEB_ROUTES.pp1TokenDetails)
  }, [navigate])

  const [bindAnim, animStyle] = useCustomHover({
    property: 'backgroundColor',
    values: {
      from: theme.primaryBackground,
      to: themeType === THEME_TYPES.DARK ? theme.tertiaryBackground : theme.secondaryBackground
    }
  })

  const tokenId = getTokenId(token)
  const balance = formatUnits(token.amount, token.decimals)
  const balanceFormatted = formatDecimals(Number(balance), 'amount')
  const priceUSD = token.priceIn.find(
    ({ baseCurrency }: { baseCurrency: string }) => baseCurrency.toLowerCase() === 'usd'
  )?.price
  const priceUSDFormatted = formatDecimals(priceUSD, 'price')
  const balanceUSD = getTokenBalanceInUSD(token)
  const balanceUSDFormatted = formatDecimals(balanceUSD, 'value')

  return (
    <AnimatedPressable
      style={[styles.container, animStyle]}
      {...bindAnim}
      onPress={navigateToTokenDetails}
    >
      <View style={flexboxStyles.flex1}>
        <View style={[flexboxStyles.directionRow, flexboxStyles.flex1]}>
          <View style={[flexboxStyles.directionRow, { flex: 1.5 }]}>
            <View style={[spacings.mr, flexboxStyles.justifyCenter]}>
              <TokenIcon
                withContainer
                address={address}
                chainId={chainId}
                onGasTank={onGasTank}
                containerHeight={40}
                containerWidth={40}
                width={28}
                height={28}
              />
            </View>
            <View style={[flexboxStyles.alignCenter]}>
              <View style={[flexboxStyles.flex1, flexboxStyles.directionRow]}>
                <View>
                  <Text
                    selectable
                    style={spacings.mrTy}
                    color={theme.primaryText}
                    fontSize={16}
                    weight="number_bold"
                    numberOfLines={1}
                    testID={`token-symbol-${tokenId}`}
                  >
                    {symbol}
                  </Text>
                  <Text
                    selectable
                    weight="regular"
                    fontSize={12}
                    numberOfLines={1}
                    // @ts-ignore
                    dataSet={{
                      tooltipId: `${tokenId}-balance`
                    }}
                    testID={`token-balance-${tokenId}`}
                  >
                    {balanceFormatted}
                  </Text>
                  <Tooltip content={String(balance)} id={`${tokenId}-balance`} />
                </View>
              </View>
            </View>
          </View>
          <Text selectable fontSize={16} weight="number_regular" style={{ flex: 0.7 }}>
            {priceUSDFormatted}
          </Text>
          <Text
            selectable
            fontSize={16}
            weight="number_bold"
            color={theme.primaryText}
            style={{ flex: 0.4, textAlign: 'right' }}
          >
            {balanceUSDFormatted}
          </Text>
        </View>
      </View>
    </AnimatedPressable>
  )
}

export default React.memo(TokenItem)
