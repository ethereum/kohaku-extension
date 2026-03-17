/* eslint-disable @typescript-eslint/no-floating-promises */
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
import useSelectedAccountControllerState from '@web/hooks/useSelectedAccountControllerState'
import useRailgunForm from '@web/modules/railgun/hooks/useRailgunForm'
import { getUiType } from '@web/utils/uiType'
import ReceiveModal from '@web/components/ReceiveModal'
import flexbox from '@common/styles/utils/flexbox'
import spacings from '@common/styles/spacings'
import { usePrivacyPoolsDepositForm } from '@web/hooks/useDepositForm'
import PendingActionWindowModal from '../components/PendingActionWindowModal'
import DAppFooter from '../components/DAppFooter'

import ActionButtons from './ActionButtons'
import DashboardHeader from './DashboardHeader'
import FundsCards from './FundsCards'
import HoldingsSection from './HoldingsSection'
import PageContentArea from './PageContentArea'
import usePublicBalanceCache from './usePublicBalanceCache'
import { SelectedPrivateBalance, SelectedPublicBalance } from './SelectedAccountBalance'
import { SelctedAccountAddress } from './SelctedAccountAddress'

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

  const privacyPoolsForm = usePrivacyPoolsDepositForm()
  const railgunForm = useRailgunForm()

  const handleRetryLoadPrivateAccount = useCallback(() => {
    privacyPoolsForm.refreshPrivateAccount()
    railgunForm.refreshPrivateAccount()
  }, [privacyPoolsForm.refreshPrivateAccount, railgunForm.refreshPrivateAccount])

  const { balanceCache, isLoadingPublicBalances, refreshPublicBalances } = usePublicBalanceCache({
    accounts,
    accountAddr: account?.addr,
    portfolioIsAllReady: portfolio?.isAllReady,
    portfolioTotalBalance: portfolio?.totalBalance
  })

  const handleRefreshAll = useCallback(() => {
    privacyPoolsForm.refreshPrivateAccount()
    railgunForm.refreshPrivateAccount()
    refreshPublicBalances()
  }, [
    privacyPoolsForm.refreshPrivateAccount,
    railgunForm.refreshPrivateAccount,
    refreshPublicBalances
  ])

  const totalPublicBalance = useMemo(
    () => Object.values(balanceCache).reduce((sum, bal) => sum + bal, 0),
    [balanceCache]
  )

  const livePrivateBalance =
    (privacyPoolsForm.totalPrivatePortfolio || 0) + (railgunForm.totalPrivatePortfolio || 0)
  const isPrivateLoading =
    privacyPoolsForm.isLoading ||
    (!privacyPoolsForm.isAccountLoaded && !privacyPoolsForm.loadingError) ||
    railgunForm.isLoading

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
    if (!privacyPoolsForm.isAccountLoaded && privacyPoolsForm.isReadyToLoad) {
      privacyPoolsForm.loadPrivateAccount().catch((error) => {
        // eslint-disable-next-line no-console
        console.error('Failed to load private account:', error)
        addToast('Failed to load your privacy account. Please try again.', { type: 'error' })
      })
    }
    if (!railgunForm.isAccountLoaded && !railgunForm.isLoading) {
      railgunForm.loadPrivateAccount()
    }
  }, [
    privacyPoolsForm.loadPrivateAccount,
    privacyPoolsForm.isAccountLoaded,
    privacyPoolsForm.isReadyToLoad,
    railgunForm.isAccountLoaded,
    railgunForm.isLoading,
    addToast
  ])

  useEffect(() => {
    if (railgunForm.isLoading && isLoadingPublicBalances) return
    if (isPopup) autoScroll()

    return () => {
      if (scrollTimeout.current) clearTimeout(scrollTimeout.current)
    }
  }, [railgunForm.isLoading, isLoadingPublicBalances])

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
              loadingError={privacyPoolsForm.loadingError}
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

                <View
                  style={[
                    flexbox.directionRow,
                    flexbox.alignStart,
                    flexbox.justifySpaceBetween,
                    spacings.phMd
                  ]}
                >
                  <View>
                    {activeView === 'private' ? (
                      <SelectedPrivateBalance
                        integerValue={privateInteger}
                        decimalValue={privateDecimal}
                      />
                    ) : !isLoadingPublicBalances ? (
                      <SelectedPublicBalance
                        label={account?.preferences.label || ''}
                        integerValue={selectedInteger}
                        decimalValue={selectedDecimal}
                      />
                    ) : null}
                  </View>

                  <View style={[{ flexDirection: 'column' }, flexbox.alignEnd]}>
                    {activeView === 'private' ? (
                      <SelctedAccountAddress address="" activeView="private" />
                    ) : !isLoadingPublicBalances ? (
                      <SelctedAccountAddress address={account?.addr || ''} activeView="public" />
                    ) : null}
                    <ActionButtons activeView={activeView} onReceive={openReceiveModal} />
                  </View>
                </View>
                {(activeView === 'private' || !isLoadingPublicBalances) && (
                  <View style={styles.divider} />
                )}
              </>
            )}

            <PageContentArea
              activeView={activeView}
              isLoadingPublicBalances={isLoadingPublicBalances}
            />
          </View>
        </ScrollView>
        <DAppFooter />
      </View>
    </>
  )
}

export default React.memo(KohakuDashboardScreen)
