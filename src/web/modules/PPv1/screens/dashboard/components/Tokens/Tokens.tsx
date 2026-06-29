import React, { useCallback, useEffect, useMemo, useState } from 'react'
import { useForm } from 'react-hook-form'
import { Animated, FlatListProps, StyleProp, StyleSheet, View, ViewStyle } from 'react-native'

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
import useRailgunForm from '@web/modules/railgun/hooks/useRailgunForm'
import { useCustomHover, AnimatedPressable } from '@web/hooks/useHover'
import { ZERO_ADDRESS } from '@ambire-common/services/socket/constants'
import { PrivacyProtocolType } from '@web/modules/PPv1/types/privacy'
import { toHex } from 'viem'

import { usePrivacyPoolsDepositForm } from '@web/hooks/useDepositForm'
import useSelectedAccountControllerState from '@web/hooks/useSelectedAccountControllerState'
import DashboardPageScrollContainer from '../DashboardPageScrollContainer'
import TabsAndSearch from '../TabsAndSearch'
import { TabType } from '../TabsAndSearch/Tabs/Tab/Tab'
import TokenItem from './TokenItem'

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
  style?: StyleProp<ViewStyle>
}

const { isPopup } = getUiType()

// Railgun wraps native ETH into WETH when shielding, so shielded ETH comes back
// from the SDK as the chain's WETH ERC20 (not ZERO_ADDRESS). Treat these as
// ETH for display so a shielded-ETH balance reads "ETH (Railgun)" rather than
// the raw WETH contract address.
const WETH_ADDRESSES = new Set<string>([
  '0xfff9976782d46cc05630d1f6ebab18b2324d6b14', // Sepolia WETH
  '0xc02aaa39b223fe8d0a0e5c4f27ead9083c756cc2' // Mainnet WETH
])

const Tokens = ({
  openTab,
  setOpenTab,
  initTab,
  sessionId,
  onScroll,
  animatedOverviewHeight,
  dashboardNetworkFilterName,
  style
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

  const { ethPrice, totalApprovedBalance, isAccountLoaded, isReadyToLoad } =
    usePrivacyPoolsDepositForm()
  const { portfolio } = useSelectedAccountControllerState()
  const { isAccountLoaded: railgunIsAccountLoaded } = useRailgunForm()

  const { zkAddress: railgunAddress, railgunAccountsState } = useRailgunControllerState()

  const [bindCopyIconAnim, copyIconAnimStyle] = useCustomHover({
    property: 'opacity',
    values: {
      from: 1,
      to: 0.7
    }
  })

  // Create token-like objects for display - only approved tokens, grouped by asset
  const privateTokens = useMemo(() => {
    const tokens: any[] = []

    // Group approved notes by asset address
    const notesByAsset = totalApprovedBalance.accounts.reduce<Record<string, bigint>>(
      (acc, note) => {
        const address = toHex(note.assetAddress, { size: 20 }).toLowerCase()
        return { ...acc, [address]: (acc[address] ?? 0n) + note.balance }
      },
      {}
    )

    Object.entries(notesByAsset)
      .filter(([, total]) => total > 0n)
      .forEach(([address, total]) => {
        const portfolioToken = portfolio?.tokens.find(
          (token) => token.address.toLowerCase() === address
        )
        const isNative = address === ZERO_ADDRESS.toLowerCase()
        tokens.push({
          id: `approved-pp-${address}`,
          name: portfolioToken?.name ?? (isNative ? 'Ethereum' : address),
          symbol: `${portfolioToken?.symbol ?? (isNative ? 'ETH' : address)} (Privacy Pools)`,
          amount: total.toString(),
          address,
          chainId: portfolioToken?.chainId ?? 11155111,
          decimals: portfolioToken?.decimals ?? 18,
          priceIn: [
            {
              baseCurrency: 'usd',
              price: isNative
                ? ethPrice
                : portfolioToken?.priceIn.find((p) => p.baseCurrency === 'usd')?.price
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
          accounts: totalApprovedBalance.accounts.filter(
            (note) => toHex(note.assetAddress, { size: 20 }).toLowerCase() === address
          ),
          privacyProtocol: PrivacyProtocolType.PRIVACY_POOLS
        })
      })
    // Railgun: mirror the Privacy Pools enrichment above — iterate the raw
    // balances from the controller and ALWAYS push a row, enriching from the
    // portfolio when the token is known and falling back gracefully otherwise.
    // (Shielded native ETH comes back as the wrapped-ETH ERC20, so it's matched
    // by address like any other token.)
    railgunAccountsState.balances
      .filter((bal) => {
        try {
          return BigInt(bal.amount) > 0n
        } catch {
          return false
        }
      })
      .forEach((bal) => {
        const address = bal.tokenAddress.toLowerCase()
        const portfolioToken = portfolio?.tokens.find(
          (token) => token.address.toLowerCase() === address
        )
        // Shielded native ETH comes back as WETH — show both native and WETH as ETH.
        const isEthLike = address === ZERO_ADDRESS.toLowerCase() || WETH_ADDRESSES.has(address)
        tokens.push({
          id: `approved-railgun-${address}`,
          name: isEthLike ? 'Ethereum' : portfolioToken?.name ?? address,
          symbol: `${isEthLike ? 'ETH' : portfolioToken?.symbol ?? address} (Railgun)`,
          amount: bal.amount,
          address,
          chainId: portfolioToken?.chainId ?? 11155111,
          decimals: isEthLike ? 18 : portfolioToken?.decimals ?? 18,
          priceIn: [
            {
              baseCurrency: 'usd',
              price: isEthLike
                ? ethPrice
                : portfolioToken?.priceIn.find((p) => p.baseCurrency === 'usd')?.price
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
      })

    return tokens
  }, [totalApprovedBalance, railgunAccountsState, ethPrice, portfolio?.tokens])

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
          <View style={{ backgroundColor: theme.primaryBackground, ...StyleSheet.flatten(style) }}>
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

      return <TokenItem token={item} style={style} />
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
        ...(initTab?.tokens ? filteredTokens : []),
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
