import React, { useCallback, useEffect, useMemo } from 'react'
import { useForm } from 'react-hook-form'
import { Animated, FlatListProps, Pressable, View } from 'react-native'
import { useModalize } from 'react-native-modalize'

import { PINNED_TOKENS } from '@ambire-common/consts/pinnedTokens'
import { Network } from '@ambire-common/interfaces/network'
import { AssetType } from '@ambire-common/libs/defiPositions/types'
import { getTokenAmount, getTokenBalanceInUSD } from '@ambire-common/libs/portfolio/helpers'
import { TokenResult } from '@ambire-common/libs/portfolio/interfaces'
import RightArrowIcon from '@common/assets/svg/RightArrowIcon'
// import Button from '@common/components/Button'
import Text from '@common/components/Text'
import { useTranslation } from '@common/config/localization'
import useNavigation from '@common/hooks/useNavigation'
import useTheme from '@common/hooks/useTheme'
import { WEB_ROUTES } from '@common/modules/router/constants/common'
import spacings from '@common/styles/spacings'
import flexbox from '@common/styles/utils/flexbox'
import { tokenSearch } from '@common/utils/search'
import useNetworksControllerState from '@web/hooks/useNetworksControllerState'
import usePortfolioControllerState from '@web/hooks/usePortfolioControllerState/usePortfolioControllerState'
import useSelectedAccountControllerState from '@web/hooks/useSelectedAccountControllerState'
import AddTokenBottomSheet from '@web/modules/settings/screens/ManageTokensSettingsScreen/AddTokenBottomSheet'
import { getTokenId } from '@web/utils/token'
import { getUiType } from '@web/utils/uiType'

import DashboardBanners from '../DashboardBanners'
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

// if any of the post amount (during simulation) or the current state
// has a balance above 0, we should consider it legit and show it
const hasAmount = (token: TokenResult) => {
  return token.amount > 0n || (token.amountPostSimulation && token.amountPostSimulation > 0n)
}
// if the token is on the gas tank and the network is not a relayer network (a custom network)
// we should not show it on dashboard
const isGasTankTokenOnCustomNetwork = (token: TokenResult, networks: Network[]) => {
  return token.flags.onGasTank && !networks.find((n) => n.chainId === token.chainId && n.hasRelayer)
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
  const { navigate } = useNavigation()
  const { theme } = useTheme()
  const { networks } = useNetworksControllerState()
  const { customTokens } = usePortfolioControllerState()
  const { portfolio, dashboardNetworkFilter } = useSelectedAccountControllerState()
  const {
    ref: addTokenBottomSheetRef,
    // open: openAddTokenBottomSheet,
    close: closeAddTokenBottomSheet
  } = useModalize()
  const { control, watch, setValue } = useForm({
    mode: 'all',
    defaultValues: {
      search: ''
    }
  })

  const searchValue = watch('search')

  const tokens = useMemo(
    () =>
      (portfolio?.tokens || [])
        // Hide gas tank and borrowed defi tokens from the list
        .filter((token) => !token.flags.onGasTank && token.flags.defiTokenType !== AssetType.Borrow)
        .filter((token) => {
          if (!dashboardNetworkFilter) return true
          if (dashboardNetworkFilter === 'rewards') return token.flags.rewardsType
          if (dashboardNetworkFilter === 'gasTank') return token.flags.onGasTank

          return (
            token?.chainId?.toString() === dashboardNetworkFilter.toString() &&
            !token.flags.onGasTank
          )
        })
        .filter((token) => tokenSearch({ search: searchValue, token, networks })),
    [portfolio?.tokens, dashboardNetworkFilter, searchValue, networks]
  )

  const userHasNoBalance = useMemo(
    // Exclude gas tank tokens from the check
    // as new users get some Gas Tank balance by default
    () => !tokens.some((token) => !token.flags.onGasTank && hasAmount(token)),
    [tokens]
  )

  const sortedTokens = useMemo(
    () =>
      tokens
        .filter((token) => {
          if (isGasTankTokenOnCustomNetwork(token, networks)) return false
          if (token?.flags.isHidden) return false

          const hasTokenAmount = hasAmount(token)
          const isCustom = customTokens.find(
            ({ address, chainId }) =>
              token.address.toLowerCase() === address.toLowerCase() && token.chainId === chainId
          )
          const isPinned = PINNED_TOKENS.find(
            ({ address, chainId }) =>
              token.address.toLowerCase() === address.toLowerCase() && token.chainId === chainId
          )

          return (
            hasTokenAmount ||
            isCustom ||
            // Don't display pinned tokens until we are sure the user has no balance
            (isPinned && userHasNoBalance && portfolio?.isAllReady)
          )
        })
        .sort((a, b) => {
          // pending tokens go on top
          if (
            typeof a.amountPostSimulation === 'bigint' &&
            a.amountPostSimulation !== BigInt(a.amount)
          ) {
            return -1
          }
          if (
            typeof b.amountPostSimulation === 'bigint' &&
            b.amountPostSimulation !== BigInt(b.amount)
          ) {
            return 1
          }

          // If a is a rewards token and b is not, a should come before b.
          if (a.flags.rewardsType && !b.flags.rewardsType) {
            return -1
          }
          if (!a.flags.rewardsType && b.flags.rewardsType) {
            // If b is a rewards token and a is not, b should come before a.
            return 1
          }

          const aBalance = getTokenBalanceInUSD(a)
          const bBalance = getTokenBalanceInUSD(b)

          if (a.flags.rewardsType === b.flags.rewardsType) {
            if (aBalance === bBalance) {
              return Number(getTokenAmount(b)) - Number(getTokenAmount(a))
            }

            return bBalance - aBalance
          }

          if (a.flags.onGasTank && !b.flags.onGasTank) {
            return -1
          }
          if (!a.flags.onGasTank && b.flags.onGasTank) {
            return 1
          }

          return 0
        }),
    [tokens, networks, customTokens, userHasNoBalance, portfolio?.isAllReady]
  )

  const hiddenTokensCount = useMemo(
    () => tokens.filter((token) => token.flags.isHidden).length,
    [tokens]
  )

  // const navigateToAddCustomToken = useCallback(() => {
  //   openAddTokenBottomSheet()
  // }, [openAddTokenBottomSheet])

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
              {!searchValue && !dashboardNetworkFilterName && t("You don't have any tokens yet.")}
              {!searchValue &&
                dashboardNetworkFilterName &&
                t(`No tokens found on ${dashboardNetworkFilterName}.`)}
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
            {/* Display more skeleton items if there are no tokens */}
            <Skeleton amount={3} withHeader={false} />
          </View>
        )

      if (item === 'footer') {
        return portfolio?.isAllReady &&
          // A trick to render the button once all tokens have been rendered. Otherwise
          // there will be layout shifts
          index === sortedTokens.length + 4 ? (
          <View style={hiddenTokensCount ? spacings.ptTy : spacings.ptSm}>
            {!!hiddenTokensCount && (
              <Pressable
                style={[
                  flexbox.directionRow,
                  flexbox.alignCenter,
                  flexbox.justifySpaceBetween,
                  spacings.pvMi,
                  spacings.phTy,
                  spacings.mhTy,
                  spacings.mbLg,
                  {
                    borderRadius: 4,
                    backgroundColor: theme.secondaryBackground
                  }
                ]}
                onPress={() => {
                  navigate(WEB_ROUTES.manageTokens)
                }}
              >
                <Text appearance="secondaryText" fontSize={12}>
                  {t('You have {{count}} hidden {{tokensLabel}}', {
                    count: hiddenTokensCount,
                    tokensLabel: hiddenTokensCount > 1 ? t('tokens') : t('token')
                  })}{' '}
                  {dashboardNetworkFilter && t('on this network')}
                </Text>
                <RightArrowIcon height={12} color={theme.secondaryText} />
              </Pressable>
            )}
            {/* <Button
              type="secondary"
              text={t('+ Add custom token')}
              onPress={navigateToAddCustomToken}
            /> */}
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
      theme.secondaryBackground,
      theme.secondaryText,
      openTab,
      setOpenTab,
      control,
      sessionId,
      t,
      searchValue,
      dashboardNetworkFilterName,
      portfolio?.isAllReady,
      sortedTokens.length,
      hiddenTokensCount,
      dashboardNetworkFilter,
      // navigateToAddCustomToken,
      navigate
    ]
  )

  const keyExtractor = useCallback((tokenOrElement: any) => {
    if (typeof tokenOrElement === 'string') {
      return tokenOrElement
    }

    return getTokenId(tokenOrElement)
  }, [])

  useEffect(() => {
    setValue('search', '')
  }, [setValue])

  return (
    <>
      <DashboardPageScrollContainer
        tab="tokens"
        openTab={openTab}
        ListHeaderComponent={<DashboardBanners />}
        animatedOverviewHeight={animatedOverviewHeight}
        data={[
          'header',
          !sortedTokens.length && !portfolio?.isAllReady
            ? 'skeleton'
            : 'keep-this-to-avoid-key-warning',
          ...(initTab?.tokens ? sortedTokens : []),
          sortedTokens.length && !portfolio?.isAllReady
            ? 'skeleton'
            : 'keep-this-to-avoid-key-warning-2',
          !sortedTokens.length && portfolio?.isAllReady ? 'empty' : '',
          'footer'
        ]}
        renderItem={renderItem}
        keyExtractor={keyExtractor}
        onEndReachedThreshold={isPopup ? 5 : 2.5}
        initialNumToRender={isPopup ? 10 : 20}
        windowSize={9} // Larger values can cause performance issues.
        onScroll={onScroll}
      />
      <AddTokenBottomSheet
        sheetRef={addTokenBottomSheetRef}
        handleClose={closeAddTokenBottomSheet}
      />
    </>
  )
}

export default React.memo(Tokens)
