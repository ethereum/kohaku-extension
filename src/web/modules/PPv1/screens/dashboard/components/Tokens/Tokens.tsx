import React, { useCallback, useEffect, useMemo, useState } from 'react'
import { useForm } from 'react-hook-form'
import { Animated, FlatListProps, View } from 'react-native'

import CopyIcon from '@common/assets/svg/CopyIcon'
import Text from '@common/components/Text'
import Spinner from '@common/components/Spinner'
import { useTranslation } from '@common/config/localization'
import useTheme from '@common/hooks/useTheme'
import useToast from '@common/hooks/useToast'
import spacings from '@common/styles/spacings'
import flexbox from '@common/styles/utils/flexbox'
import { setStringAsync } from '@common/utils/clipboard'
import { getUiType } from '@web/utils/uiType'
import useRailgunControllerState from '@web/hooks/useRailgunControllerState'
import usePrivacyPoolsForm from '@web/modules/PPv1/hooks/usePrivacyPoolsForm'
import useRailgunForm from '@web/modules/railgun/hooks/useRailgunForm'
import { getRailgunAddress } from '@kohaku-eth/railgun'
import { useCustomHover, AnimatedPressable } from '@web/hooks/useHover'
import { ZERO_ADDRESS } from '@ambire-common/services/socket/constants'
import { PrivacyProtocolType } from '@web/modules/PPv1/types/privacy'

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
  const { addToast } = useToast()
  const { control, watch, setValue } = useForm({
    mode: 'all',
    defaultValues: {
      search: ''
    }
  })

  const searchValue = watch('search')

  const { ethPrice, totalApprovedBalance, isAccountLoaded, isReadyToLoad } = usePrivacyPoolsForm()
  const { isAccountLoaded: railgunIsAccountLoaded, totalPrivateBalancesFormatted } =
    useRailgunForm()
  const { defaultRailgunKeys } = useRailgunControllerState()
  const [railgunAddress, setRailgunAddress] = useState<string | null>(null)

  const [bindCopyIconAnim, copyIconAnimStyle] = useCustomHover({
    property: 'opacity',
    values: {
      from: 1,
      to: 0.7
    }
  })

  // Create token-like objects for display - only approved tokens
  const privateTokens = useMemo(() => {
    const tokens: any[] = []

    if (totalApprovedBalance.total > 0n) {
      tokens.push({
        id: 'approved-eth',
        name: 'Ethereum',
        symbol: 'ETH (Privacy Pools)',
        amount: totalApprovedBalance.total.toString(),
        address: '0x0000000000000000000000000000000000000000',
        chainId: 11155111,
        decimals: 18,
        priceIn: [{ baseCurrency: 'usd', price: ethPrice }],
        flags: {
          onGasTank: false,
          rewardsType: null,
          canTopUpGasTank: false,
          isFeeToken: false,
          isHidden: false,
          defiTokenType: null
        },
        accounts: totalApprovedBalance.accounts,
        privacyProtocol: PrivacyProtocolType.PRIVACY_POOLS
      })
    }
    Object.entries(totalPrivateBalancesFormatted).forEach(([tokenAddress, tokenInfo]) => {
      if (tokenInfo.amount !== '0') {
        tokens.push({
          id: `approved-railgun-${tokenInfo.symbol.toLowerCase()}`,
          name: tokenInfo.name,
          symbol: `${tokenInfo.symbol} (Railgun)`,
          amount: tokenInfo.amount,
          address: tokenAddress,
          chainId: 11155111,
          decimals: tokenInfo.decimals,
          priceIn: [
            {
              baseCurrency: 'usd',
              price: tokenAddress === ZERO_ADDRESS ? ethPrice : tokenInfo.price
            }
          ],
          flags: {
            onGasTank: false,
            rewardsType: null,
            canTopUpGasTank: false,
            isFeeToken: false,
            isHidden: false,
            defiTokenType: null
          },
          accounts: [],
          privacyProtocol: PrivacyProtocolType.RAILGUN
        })
      }
    })

    return tokens
  }, [totalApprovedBalance, totalPrivateBalancesFormatted, ethPrice])

  const filteredTokens = useMemo(() => {
    if (!searchValue) return privateTokens

    return privateTokens.filter(
      (token) =>
        token.name.toLowerCase().includes(searchValue.toLowerCase()) ||
        token.symbol.toLowerCase().includes(searchValue.toLowerCase())
    )
  }, [privateTokens, searchValue])

  // New: decide if we should show the Railgun loading row
  const showRailgunLoadingRow = !railgunIsAccountLoaded

  // Calculate railgun address from defaultRailgunKeys
  useEffect(() => {
    const calculateRailgunAddress = async () => {
      if (defaultRailgunKeys) {
        try {
          const address = await getRailgunAddress({
            type: 'key',
            spendingKey: defaultRailgunKeys.spendingKey,
            viewingKey: defaultRailgunKeys.viewingKey
          })
          setRailgunAddress(address)
        } catch (error) {
          console.error('Failed to calculate railgun address:', error)
          setRailgunAddress(null)
        }
      } else {
        setRailgunAddress(null)
      }
    }
    calculateRailgunAddress()
  }, [defaultRailgunKeys])

  const handleCopyRailgunAddress = useCallback(async () => {
    if (railgunAddress) {
      await setStringAsync(railgunAddress)
      addToast(t('Copied to clipboard!') as string, { timeout: 2500 })
    }
  }, [railgunAddress, addToast, t])

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

      if (item === 'railgun-loading') {
        return (
          <View
            style={[
              spacings.pvTy,
              spacings.phTy,
              { alignItems: 'center', justifyContent: 'center' }
            ]}
          >
            <Spinner style={{ width: 24, height: 24 }} />
            <Text fontSize={14} style={spacings.mtXs}>
              {t('Loading Railgun Balances...')}
            </Text>
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
              {t('Private balances from Privacy Pools and Railgun')}
            </Text>
          </View>
        ) : null
      }

      if (item === 'railgun-address') {
        return railgunAddress ? (
          <View
            style={[
              flexbox.directionRow,
              flexbox.alignCenter,
              spacings.phTy,
              spacings.ptSm,
              spacings.pbLg
            ]}
          >
            <Text fontSize={14} appearance="secondaryText" style={spacings.mrTy}>
              Your Railgun Address: {railgunAddress.slice(0, 6)}...{railgunAddress.slice(-4)}
            </Text>
            <AnimatedPressable
              onPress={handleCopyRailgunAddress}
              style={copyIconAnimStyle}
              {...bindCopyIconAnim}
            >
              <CopyIcon width={16} height={16} color={theme.secondaryText} />
            </AnimatedPressable>
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
      theme.primaryText, // added for spinner color
      openTab,
      setOpenTab,
      control,
      sessionId,
      t,
      searchValue,
      dashboardNetworkFilterName,
      isAccountLoaded,
      filteredTokens.length,
      railgunAddress,
      handleCopyRailgunAddress,
      copyIconAnimStyle,
      bindCopyIconAnim,
      theme.secondaryText
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
        ...(showRailgunLoadingRow ? (['railgun-loading'] as const) : []),
        'footer',
        'railgun-address'
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
