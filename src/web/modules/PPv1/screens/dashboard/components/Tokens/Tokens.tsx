import React, { useCallback, useEffect, useMemo } from 'react'
import { useForm } from 'react-hook-form'
import { Animated, FlatListProps, View } from 'react-native'

import Text from '@common/components/Text'
import { useTranslation } from '@common/config/localization'
import useTheme from '@common/hooks/useTheme'
import spacings from '@common/styles/spacings'
import flexbox from '@common/styles/utils/flexbox'
import { getUiType } from '@web/utils/uiType'
import usePrivacyPoolsForm from '@web/modules/PPv1/hooks/usePrivacyPoolsForm'

import DashboardPageScrollContainer from '../DashboardPageScrollContainer'
import TabsAndSearch from '../TabsAndSearch'
import { TabType } from '../TabsAndSearch/Tabs/Tab/Tab'
import TokenItem from './TokenItem'
import Skeleton from './TokensSkeleton'

interface Props {
  openTab: TabType
  setOpenTab: React.Dispatch<React.SetStateAction<TabType>>
  sessionId: string
  initTab?: {
    [key: string]: boolean
  }
  onScroll: FlatListProps<any>['onScroll']
  dashboardNetworkFilterName: string | null
  animatedOverviewHeight: Animated.Value
}

const { isPopup } = getUiType()

const Tokens = ({
  openTab,
  setOpenTab,
  initTab,
  sessionId,
  onScroll,
  animatedOverviewHeight,
  dashboardNetworkFilterName
}: Props) => {
  const { t } = useTranslation()
  const { theme } = useTheme()
  const { control, watch, setValue } = useForm({
    mode: 'all',
    defaultValues: {
      search: ''
    }
  })

  const searchValue = watch('search')

  const { ethPrice, totalApprovedBalance, isAccountLoaded, isReadyToLoad } = usePrivacyPoolsForm()

  // Create token-like objects for display - only approved tokens
  const privateTokens = useMemo(() => {
    const tokens = []

    if (totalApprovedBalance.total > 0n) {
      tokens.push({
        id: 'approved-eth',
        name: 'Ethereum',
        symbol: 'ETH',
        amount: totalApprovedBalance.total.toString(),
        address: '0x0000000000000000000000000000000000000000',
        chainId: 11155111,
        decimals: 18,
        priceIn: [{ baseCurrency: 'usd', price: ethPrice }],
        flags: {
          onGasTank: false,
          rewardsType: null,
          canTopUpGasTank: false,
          isHidden: false,
          defiTokenType: null
        },
        accounts: totalApprovedBalance.accounts
      })
    }

    return tokens
  }, [totalApprovedBalance, ethPrice])

  const filteredTokens = useMemo(() => {
    if (!searchValue) return privateTokens

    return privateTokens.filter(
      (token) =>
        token.name.toLowerCase().includes(searchValue.toLowerCase()) ||
        token.symbol.toLowerCase().includes(searchValue.toLowerCase())
    )
  }, [privateTokens, searchValue])

  const renderItem = useCallback(
    ({ item, index }: any) => {
      if (item === 'header') {
        return (
          <View style={{ backgroundColor: theme.primaryBackground }}>
            <TabsAndSearch
              openTab={openTab}
              setOpenTab={setOpenTab}
              searchControl={control}
              sessionId={sessionId}
            />
            <View style={[flexbox.directionRow, spacings.mbTy, spacings.phTy]}>
              <Text appearance="secondaryText" fontSize={14} weight="medium" style={{ flex: 1.5 }}>
                {t('ASSET/AMOUNT')}
              </Text>
              <Text appearance="secondaryText" fontSize={14} weight="medium" style={{ flex: 0.7 }}>
                {t('PRICE')}
              </Text>
              <Text
                appearance="secondaryText"
                fontSize={14}
                weight="medium"
                style={{ flex: 0.4, textAlign: 'right' }}
              >
                {t('USD VALUE')}
              </Text>
            </View>
          </View>
        )
      }

      if (item === 'empty') {
        return (
          <View style={[flexbox.alignCenter, spacings.pv]}>
            <Text fontSize={16} weight="medium">
              {!searchValue &&
                !dashboardNetworkFilterName &&
                t("You don't have any private tokens yet.")}
              {searchValue &&
                t(
                  `No tokens match "${searchValue}"${
                    dashboardNetworkFilterName ? ` on ${dashboardNetworkFilterName}` : ''
                  }.`
                )}
            </Text>
          </View>
        )
      }

      if (item === 'skeleton')
        return (
          <View style={spacings.ptTy}>
            <Skeleton amount={3} withHeader={false} />
          </View>
        )

      if (item === 'footer') {
        return isAccountLoaded && index === filteredTokens.length + 4 ? (
          <View style={spacings.ptSm}>
            <Text
              appearance="secondaryText"
              fontSize={12}
              style={[spacings.phTy, { textAlign: 'center' }]}
            >
              {t('Private balances from Privacy Pools')}
            </Text>
          </View>
        ) : null
      }

      if (
        !initTab?.tokens ||
        !item ||
        item === 'keep-this-to-avoid-key-warning' ||
        item === 'keep-this-to-avoid-key-warning-2'
      )
        return null

      return <TokenItem token={item} />
    },
    [
      initTab?.tokens,
      theme.primaryBackground,
      openTab,
      setOpenTab,
      control,
      sessionId,
      t,
      searchValue,
      dashboardNetworkFilterName,
      isAccountLoaded,
      filteredTokens.length,
      ethPrice
    ]
  )

  const keyExtractor = useCallback((tokenOrElement: any) => {
    if (typeof tokenOrElement === 'string') {
      return tokenOrElement
    }

    return tokenOrElement.id
  }, [])

  useEffect(() => {
    setValue('search', '')
  }, [setValue])

  return (
    <DashboardPageScrollContainer
      tab="tokens"
      openTab={openTab}
      animatedOverviewHeight={animatedOverviewHeight}
      data={[
        'header',
        !filteredTokens.length && !isAccountLoaded && isReadyToLoad
          ? 'skeleton'
          : 'keep-this-to-avoid-key-warning',
        ...(initTab?.tokens ? filteredTokens : []),
        filteredTokens.length && !isAccountLoaded && isReadyToLoad
          ? 'skeleton'
          : 'keep-this-to-avoid-key-warning-2',
        !filteredTokens.length && isAccountLoaded ? 'empty' : '',
        'footer'
      ]}
      renderItem={renderItem}
      keyExtractor={keyExtractor}
      onEndReachedThreshold={isPopup ? 5 : 2.5}
      initialNumToRender={isPopup ? 10 : 20}
      windowSize={9}
      onScroll={onScroll}
    />
  )
}

export default React.memo(Tokens)
