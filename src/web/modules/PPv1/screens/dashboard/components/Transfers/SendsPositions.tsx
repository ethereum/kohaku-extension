import React, { FC, useCallback, useEffect } from 'react'
import { useTranslation } from 'react-i18next'
import { Animated, FlatListProps, View } from 'react-native'

import shortenAddress from '@ambire-common/utils/shortenAddress'
import Button from '@common/components/Button'
import Text from '@common/components/Text'
import useTheme from '@common/hooks/useTheme'
import ActivityPositionsSkeleton from '@web/modules/PPv1/screens/dashboard/components/Activity/ActivityPositionsSkeleton'
import DashboardPageScrollContainer from '@web/modules/PPv1/screens/dashboard/components/DashboardPageScrollContainer'
import TabsAndSearch from '@web/modules/PPv1/screens/dashboard/components/TabsAndSearch'
import { TabType } from '@web/modules/PPv1/screens/dashboard/components/TabsAndSearch/Tabs/Tab/Tab'
import spacings from '@common/styles/spacings'
import flexbox from '@common/styles/utils/flexbox'
import useActivityControllerState from '@web/hooks/useActivityControllerState'
import useBackgroundService from '@web/hooks/useBackgroundService'
import useSelectedAccountControllerState from '@web/hooks/useSelectedAccountControllerState'
import SubmittedTransactionSummary from '@web/modules/settings/components/TransactionHistory/SubmittedTransactionSummary'
import { getUiType } from '@web/utils/uiType'

import styles from '../Activity/styles'

interface Props {
  openTab: TabType
  setOpenTab: React.Dispatch<React.SetStateAction<TabType>>
  initTab?: { [key: string]: boolean }
  sessionId: string
  onScroll: FlatListProps<any>['onScroll']
  dashboardNetworkFilterName: string | null
  animatedOverviewHeight: Animated.Value
}

const { isPopup } = getUiType()

const ITEMS_PER_PAGE = 10

const SendsPositions: FC<Props> = ({
  openTab,
  sessionId,
  setOpenTab,
  initTab,
  onScroll,
  dashboardNetworkFilterName,
  animatedOverviewHeight
}) => {
  const { t } = useTranslation()
  const { theme } = useTheme()

  const { dispatch } = useBackgroundService()
  const { accountsOps } = useActivityControllerState()
  const { account, dashboardNetworkFilter } = useSelectedAccountControllerState()

  useEffect(() => {
    // Optimization: Don't apply filtration if we are not on Transfers tab
    if (!account?.addr || openTab !== 'sends') return

    dispatch({
      type: 'MAIN_CONTROLLER_ACTIVITY_SET_ACC_OPS_FILTERS',
      params: {
        sessionId,
        filters: {
          account: account.addr,
          ...(dashboardNetworkFilter && {
            chainId: dashboardNetworkFilter ? BigInt(dashboardNetworkFilter) : undefined
          })
        },
        pagination: {
          itemsPerPage: ITEMS_PER_PAGE,
          fromPage: 0
        }
      }
    })
  }, [openTab, account?.addr, dispatch, dashboardNetworkFilter, sessionId])

  const renderItem = useCallback(
    ({ item }: any) => {
      if (item === 'header') {
        return (
          <View style={{ backgroundColor: theme.primaryBackground }}>
            <TabsAndSearch openTab={openTab} setOpenTab={setOpenTab} sessionId={sessionId} />
          </View>
        )
      }

      if (item === 'empty') {
        return (
          <Text
            testID="no-transaction-history-text"
            fontSize={16}
            weight="medium"
            style={styles.noPositions}
          >
            {t('No transfer transactions for {{account}}', {
              account: `${account!.preferences.label} (${shortenAddress(account!.addr, 10)})`
            })}
            {!!dashboardNetworkFilter && !!dashboardNetworkFilterName && (
              <> {t('on {{network}}', { network: dashboardNetworkFilterName })}</>
            )}
          </Text>
        )
      }

      if (!initTab?.transfers || !item || item === 'keep-this-to-avoid-key-warning') return null

      if (item === 'skeleton') {
        return <ActivityPositionsSkeleton amount={4} />
      }

      if (item === 'load-more') {
        if (!accountsOps[sessionId]) return null

        const { result } = accountsOps[sessionId]
        const hasMoreTxnToLoad = result.currentPage + 1 < result.maxPages

        if (!hasMoreTxnToLoad) return null

        return (
          <View>
            <Button
              type="secondary"
              size="small"
              style={[flexbox.alignSelfCenter, spacings.mbSm]}
              onPress={() => {
                dispatch({
                  type: 'MAIN_CONTROLLER_ACTIVITY_SET_ACC_OPS_FILTERS',
                  params: {
                    sessionId,
                    filters: {
                      account: account!.addr,
                      ...(dashboardNetworkFilter && {
                        chainId: dashboardNetworkFilter ? BigInt(dashboardNetworkFilter) : undefined
                      })
                    },
                    pagination: {
                      itemsPerPage: accountsOps[sessionId].pagination.itemsPerPage + ITEMS_PER_PAGE,
                      fromPage: 0
                    }
                  }
                })
              }}
              text={t('Show more')}
            />
          </View>
        )
      }

      return (
        <SubmittedTransactionSummary
          key={item.txnId}
          defaultType="summary"
          submittedAccountOp={item}
          style={spacings.mbSm}
          size="md"
        />
      )
    },
    [
      initTab?.transfers,
      theme.primaryBackground,
      openTab,
      setOpenTab,
      sessionId,
      t,
      account,
      dashboardNetworkFilter,
      dashboardNetworkFilterName,
      accountsOps,
      dispatch
    ]
  )

  const keyExtractor = useCallback((positionOrElement: any) => {
    if (typeof positionOrElement === 'string') return positionOrElement

    return positionOrElement.txnId
  }, [])

  // Filter transactions to only show transfers (privateSendRequest)
  const filteredItems =
    accountsOps?.[sessionId]?.result.items.filter((item: any) => {
      // Check if this is a transfer transaction from privacy pools
      // This assumes the transaction has some identifier for transfer type
      return item.type === 'privateSendRequest' || item.meta?.type === 'privateSendRequest'
    }) || []

  return (
    <DashboardPageScrollContainer
      tab="sends"
      openTab={openTab}
      data={[
        'header',
        !accountsOps ? 'skeleton' : 'keep-this-to-avoid-key-warning',
        ...(initTab?.transfers && filteredItems.length ? filteredItems : []),
        accountsOps?.[sessionId] && !filteredItems.length ? 'empty' : '',
        'load-more'
      ]}
      renderItem={renderItem}
      keyExtractor={keyExtractor}
      onEndReachedThreshold={isPopup ? 5 : 2.5}
      initialNumToRender={isPopup ? 10 : 20}
      windowSize={9}
      onScroll={onScroll}
      animatedOverviewHeight={animatedOverviewHeight}
    />
  )
}

export default React.memo(SendsPositions)
