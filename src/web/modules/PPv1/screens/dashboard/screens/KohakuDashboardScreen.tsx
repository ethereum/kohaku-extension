import React, { useCallback, useEffect, useMemo, useRef } from 'react'
import { useModalize } from 'react-native-modalize'
import { ScrollView, StyleSheet, View, ViewStyle } from 'react-native'

import formatDecimals from '@ambire-common/utils/formatDecimals/formatDecimals'
import useNavigation from '@common/hooks/useNavigation'
import useTheme from '@common/hooks/useTheme'
import useToast from '@common/hooks/useToast'
import { ThemeProps } from '@common/styles/themeConfig'
import { BORDER_RADIUS_SECONDARY } from '@common/styles/utils/common'
import useAccountsControllerState from '@web/hooks/useAccountsControllerState'
import useBackgroundService from '@web/hooks/useBackgroundService'
import useRailgunControllerState from '@web/hooks/useRailgunControllerState'
import useSelectedAccountControllerState from '@web/hooks/useSelectedAccountControllerState'
import usePrivacyPoolsForm from '@web/modules/PPv1/hooks/usePrivacyPoolsForm'
import useRailgunForm from '@web/modules/railgun/hooks/useRailgunForm'
import { getUiType } from '@web/utils/uiType'
import ReceiveModal from '@web/components/ReceiveModal'
import PendingActionWindowModal from '../components/PendingActionWindowModal'
import DAppFooter from '../components/DAppFooter'

import ActionButtons from './ActionButtons'
import DashboardHeader from './DashboardHeader'
import FundsCards from './FundsCards'
import HoldingsSection from './HoldingsSection'
import PageContentArea from './PageContentArea'
import SelectedAccountInfo from './SelectedAccountInfo'
import usePublicBalanceCache from './usePublicBalanceCache'

const { isPopup } = getUiType()

type ActiveView = 'public' | 'private'

interface Style {
  container: ViewStyle
  innerContainer: ViewStyle
  divider: ViewStyle
}

const getStyles = (theme: ThemeProps) =>
  StyleSheet.create<Style>({
    container: {
      flex: 1,
      backgroundColor: theme.primaryBackground,
      ...(isPopup ? { height: '100vh' as unknown as number, overflow: 'hidden' as const } : {})
    },
    innerContainer: {
      width: '100%',
      maxWidth: 900,
      alignSelf: 'center',
      borderWidth: isPopup ? 0 : 1,
      borderTopWidth: 0,
      borderColor: theme.primaryBorder,
      borderBottomLeftRadius: isPopup ? 0 : BORDER_RADIUS_SECONDARY,
      borderBottomRightRadius: isPopup ? 0 : BORDER_RADIUS_SECONDARY,
      ...(isPopup ? { flex: 1 } : {})
    },
    divider: {
      height: 1,
      backgroundColor: theme.primaryBorder
    }
  })

const KohakuDashboardScreen = () => {
  const { styles, theme } = useTheme(getStyles)
  const { addToast } = useToast()
  const { setSearchParams, searchParams } = useNavigation()
  const { ref: receiveModalRef, open: openReceiveModal, close: closeReceiveModal } = useModalize()
  const activeView = (searchParams.get('view') ?? 'private') as ActiveView

  const { account, portfolio } = useSelectedAccountControllerState()
  const { accounts } = useAccountsControllerState()
  const { dispatch } = useBackgroundService()
  const scrollViewRef = useRef<ScrollView>(null)
  const scrollTimeout = useRef<NodeJS.Timeout>()
  const cachedPrivateBalanceRef = useRef<number>(0)

  const {
    loadPrivateAccount,
    refreshPrivateAccount,
    isAccountLoaded,
    isReadyToLoad,
    isLoading: isPrivateAccountLoading,
    loadingError,
    totalPrivatePortfolio
  } = usePrivacyPoolsForm()

  const { totalPrivatePortfolio: totalPrivatePortfolioRailgun, isLoading: isLoadingRailgun } =
    useRailgunForm()
  const { defaultRailgunKeys } = useRailgunControllerState()

  const handleRetryLoadPrivateAccount = useCallback(() => {
    refreshPrivateAccount(true).catch((error) => {
      // eslint-disable-next-line no-console
      console.error('Failed to load private account:', error)
    })
  }, [refreshPrivateAccount])

  const { balanceCache, isLoadingPublicBalances, refreshPublicBalances } = usePublicBalanceCache({
    accounts,
    accountAddr: account?.addr,
    portfolioIsAllReady: portfolio?.isAllReady,
    portfolioTotalBalance: portfolio?.totalBalance
  })

  const handleRefreshAll = useCallback(() => {
    refreshPrivateAccount(true).catch((error) => {
      // eslint-disable-next-line no-console
      console.error('Failed to refresh private account:', error)
    })
    refreshPublicBalances()
  }, [refreshPrivateAccount, refreshPublicBalances])

  const totalPublicBalance = useMemo(
    () => Object.values(balanceCache).reduce((sum, bal) => sum + bal, 0),
    [balanceCache]
  )

  const livePrivateBalance = (totalPrivatePortfolio || 0) + (totalPrivatePortfolioRailgun || 0)
  const isPrivateLoading = isPrivateAccountLoading || (!isAccountLoaded && !loadingError)

  if (livePrivateBalance > 0) cachedPrivateBalanceRef.current = livePrivateBalance

  const privateBalance = cachedPrivateBalanceRef.current
  const totalHoldings = totalPublicBalance + privateBalance

  const [displayedInteger, displayedDecimal] = useMemo(
    () => formatDecimals(totalHoldings, 'value').split('.'),
    [totalHoldings]
  )

  const [privateInteger, privateDecimal] = useMemo(
    () => formatDecimals(privateBalance, 'value').split('.'),
    [privateBalance]
  )

  const [publicInteger, publicDecimal] = useMemo(
    () => formatDecimals(totalPublicBalance, 'value').split('.'),
    [totalPublicBalance]
  )

  const selectedAccountBalance = account?.addr != null ? balanceCache[account.addr] ?? 0 : 0
  const [selectedInteger, selectedDecimal] = useMemo(
    () => formatDecimals(selectedAccountBalance, 'value').split('.'),
    [selectedAccountBalance]
  )

  const combinedTotal = privateBalance + totalPublicBalance
  const toPercent = (part: number, total: number) =>
    total > 0 ? Math.round((part / total) * 100) : 0
  const privatePercent = toPercent(privateBalance, combinedTotal)
  const publicPercent = toPercent(totalPublicBalance, combinedTotal)

  const autoScroll = () => {
    if (scrollTimeout.current) clearTimeout(scrollTimeout.current)

    scrollTimeout.current = setTimeout(() => {
      scrollViewRef.current?.scrollTo({
        y: 200,
        animated: true
      })
    }, 500)
  }

  const handleSelectPublicAccount = useCallback(
    (addr: string) => {
      if (account?.addr !== addr) {
        dispatch({ type: 'MAIN_CONTROLLER_SELECT_ACCOUNT', params: { accountAddr: addr } })
      }
      setSearchParams({ view: 'public' })
      autoScroll()
    },
    [account?.addr, dispatch, setSearchParams]
  )

  const handleSelectPrivateAccount = useCallback(() => {
    setSearchParams({ view: 'private' })

    autoScroll()
  }, [setSearchParams])

  useEffect(() => {
    if (!isAccountLoaded && isReadyToLoad) {
      loadPrivateAccount().catch((error) => {
        // eslint-disable-next-line no-console
        console.error('Failed to load private account:', error)
        addToast('Failed to load your privacy account. Please try again.', { type: 'error' })
      })
    }
  }, [loadPrivateAccount, isAccountLoaded, isReadyToLoad, addToast])

  useEffect(() => {
    if (isLoadingRailgun && isLoadingPublicBalances) return
    if (isPopup) autoScroll()

    return () => {
      if (scrollTimeout.current) clearTimeout(scrollTimeout.current)
    }
  }, [isLoadingRailgun, isLoadingPublicBalances])

  return (
    <>
      <ReceiveModal modalRef={receiveModalRef} handleClose={closeReceiveModal} />
      <PendingActionWindowModal />
      <View style={styles.container}>
        <ScrollView
          ref={scrollViewRef}
          style={{ flex: 1 }}
          contentContainerStyle={isPopup ? { flexGrow: 1 } : undefined}
          showsVerticalScrollIndicator={false}
          scrollEnabled
        >
          <View style={styles.innerContainer}>
            <DashboardHeader />

            <View style={styles.divider} />

            <HoldingsSection
              displayedInteger={displayedInteger}
              displayedDecimal={displayedDecimal}
              isPrivateLoading={isPrivateLoading}
              isLoadingPublicBalances={isLoadingPublicBalances}
              loadingError={loadingError}
              onRefresh={handleRefreshAll}
              onRetry={handleRetryLoadPrivateAccount}
            />

            <View style={styles.divider} />

            <FundsCards
              activeView={activeView}
              isPrivateLoading={isPrivateLoading}
              privateInteger={privateInteger}
              privateDecimal={privateDecimal}
              privatePercent={privatePercent}
              onSelectPrivate={handleSelectPrivateAccount}
              isLoadingPublicBalances={isLoadingPublicBalances}
              publicInteger={publicInteger}
              publicDecimal={publicDecimal}
              publicPercent={publicPercent}
              accounts={accounts}
              balanceCache={balanceCache}
              selectedAccountAddr={account?.addr}
              onSelectPublicAccount={handleSelectPublicAccount}
            />

            {(activeView === 'public' || activeView === 'private') && (
              <>
                <View style={{ height: 1.5, backgroundColor: theme.primaryBackgroundInverted }} />
                <SelectedAccountInfo
                  activeView={activeView}
                  accountLabel={account?.preferences.label}
                  accountAddr={account?.addr}
                  defaultRailgunKeys={defaultRailgunKeys}
                  selectedInteger={selectedInteger}
                  selectedDecimal={selectedDecimal}
                  privateInteger={privateInteger}
                  privateDecimal={privateDecimal}
                />

                <ActionButtons activeView={activeView} onReceive={openReceiveModal} />

                <View style={styles.divider} />
              </>
            )}

            <PageContentArea activeView={activeView} />
          </View>
        </ScrollView>
        <DAppFooter />
      </View>
    </>
  )
}

export default React.memo(KohakuDashboardScreen)
