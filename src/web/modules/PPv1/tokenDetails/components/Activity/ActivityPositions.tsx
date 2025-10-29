import React, { FC, useCallback, useEffect, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Animated, FlatListProps, View } from 'react-native'
import { useForm } from 'react-hook-form'

import shortenAddress from '@ambire-common/utils/shortenAddress'
import Button from '@common/components/Button'
import Text from '@common/components/Text'
import useTheme from '@common/hooks/useTheme'
import ActivityPositionsSkeleton from '@web/modules/PPv1/tokenDetails/components/Activity/ActivityPositionsSkeleton'
import DashboardPageScrollContainer from '@web/modules/PPv1/tokenDetails/components/DashboardPageScrollContainer'
import ActivityFilter from '@web/modules/PPv1/tokenDetails/components/Activity/ActivityFilter'
import { ActivityFilterType } from '@web/modules/PPv1/tokenDetails/components/Activity/types'
import { TabType } from '@web/modules/PPv1/tokenDetails/components/TabsAndSearch/Tabs/Tab/Tab'
import spacings from '@common/styles/spacings'
import flexbox from '@common/styles/utils/flexbox'
import useActivityControllerState from '@web/hooks/useActivityControllerState'
import useBackgroundService from '@web/hooks/useBackgroundService'
import useSelectedAccountControllerState from '@web/hooks/useSelectedAccountControllerState'
import SubmittedTransactionSummary from '@web/modules/settings/components/TransactionHistory/SubmittedTransactionSummary'
import { getUiType } from '@web/utils/uiType'
import { humanizeAccountOp } from '@ambire-common/libs/humanizer'
import useNetworksControllerState from '@web/hooks/useNetworksControllerState'

import styles from './styles'

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

const ActivityPositions: FC<Props> = ({
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
  const { networks } = useNetworksControllerState()

  const [filterType, setFilterType] = useState<ActivityFilterType>('all')
  const { control, watch } = useForm({
    mode: 'all',
    defaultValues: {
      search: ''
    }
  })

  const searchValue = watch('search')

  // Debounce searchValue to avoid remounting FlatList on every keystroke
  const [debouncedSearchValue, setDebouncedSearchValue] = useState('')

  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedSearchValue(searchValue)
    }, 300) // 300ms delay

    return () => clearTimeout(timer)
  }, [searchValue])

  useEffect(() => {
    // Optimization: Don't apply filtration if we are not on Activity tab
    if (!account?.addr || openTab !== 'activity') return

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

  // Filter activity items based on filter type and search value
  const filteredActivityItems = useMemo(() => {
    if (!accountsOps?.[sessionId]?.result.items) return []

    let items = [...accountsOps[sessionId].result.items] // Create a new array reference

    // Filter by type (send/deposit)
    if (filterType !== 'all') {
      items = items.filter((item: any) => {
        const network = networks.find((n) => n.chainId === item.chainId)
        const humanizedCalls = humanizeAccountOp(item, { network })

        const hasMatchingAction = humanizedCalls.some((call) => {
          const actionElement = call.fullVisualization?.find((v) => v.type === 'action')
          const actionType = actionElement?.content?.toLowerCase() || ''

          if (filterType === 'send') {
            const hasSend = actionType.includes('send')
            const hasDeposit = actionType.includes('deposit')
            const result = hasSend && !hasDeposit

            return result
          }

          if (filterType === 'deposit') {
            const hasDeposit = actionType.includes('deposit')
            const hasReceive = actionType.includes('receive')
            const result = hasDeposit || hasReceive
            return result
          }

          return false // Don't match anything for unknown filter types
        })

        return hasMatchingAction
      })
    }

    // Filter by search text (using debounced value)
    if (debouncedSearchValue) {
      items = items.filter((item: any) => {
        const searchLower = debouncedSearchValue.toLowerCase()
        const txnId = item.txnId?.toLowerCase() || ''
        const status = item.status?.toLowerCase() || ''

        const network = networks.find((n) => n.chainId === item.chainId)
        const humanizedCalls = humanizeAccountOp(item, { network })

        const hasMatchingAction = humanizedCalls.some((call) => {
          const actionElement = call.fullVisualization?.find((v) => v.type === 'action')
          const actionType = actionElement?.content?.toLowerCase() || ''
          return actionType.includes(searchLower)
        })

        const matches =
          txnId.includes(searchLower) || hasMatchingAction || status.includes(searchLower)
        return matches
      })
    }

    return items
  }, [accountsOps, sessionId, filterType, debouncedSearchValue, networks])

  const renderItem = useCallback(
    ({ item }: any) => {
      if (item === 'empty') {
        return (
          <Text
            testID="no-transaction-history-text"
            fontSize={16}
            weight="medium"
            style={styles.noPositions}
          >
            {t('No transactions history for {{account}}', {
              account: `${account!.preferences.label} (${shortenAddress(account!.addr, 10)})`
            })}
            {!!dashboardNetworkFilter && !!dashboardNetworkFilterName && (
              <> {t('on {{network}}', { network: dashboardNetworkFilterName })}</>
            )}
          </Text>
        )
      }

      if (!initTab?.activity || !item) return null

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
      initTab?.activity,
      theme.primaryBackground,
      openTab,
      setOpenTab,
      sessionId,
      control,
      filterType,
      t,
      account,
      dashboardNetworkFilter,
      dashboardNetworkFilterName,
      accountsOps,
      dispatch
    ]
  )

  const keyExtractor = useCallback(
    (positionOrElement: any, index: number) => {
      if (typeof positionOrElement === 'string') return `${positionOrElement}-${index}`

      // Include filterType in the key to force FlatList to treat items as new when filter changes
      return `${filterType}-${positionOrElement.txnId}`
    },
    [filterType]
  )

  const dataArray = useMemo(() => {
    const items = initTab?.activity ? filteredActivityItems : []
    const skeleton = !accountsOps ? 'skeleton' : null
    const emptyMessage = accountsOps?.[sessionId] && !filteredActivityItems.length ? 'empty' : null
    const loadMore = 'load-more'
    const result = []

    if (skeleton) result.push(skeleton)
    result.push(...items)
    if (emptyMessage) result.push(emptyMessage)
    result.push(loadMore)

    return result
  }, [accountsOps, sessionId, filteredActivityItems, initTab?.activity, filterType])

  if (openTab !== 'activity') {
    return null
  }

  return (
    <>
      <ActivityFilter
        openTab={openTab}
        setOpenTab={setOpenTab}
        sessionId={sessionId}
        searchControl={control}
        filterType={filterType}
        setFilterType={setFilterType}
        searchPlaceholder="Search activity..."
      />
      <DashboardPageScrollContainer
        key={`activity-filter-${filterType}-search-${debouncedSearchValue}`}
        tab="activity"
        openTab={openTab}
        data={dataArray}
        renderItem={renderItem}
        keyExtractor={keyExtractor}
        extraData={{
          filterType,
          debouncedSearchValue,
          filteredCount: filteredActivityItems.length
        }}
        resetScrollKey={filterType}
        disableStickyHeader
        onEndReachedThreshold={isPopup ? 5 : 2.5}
        initialNumToRender={isPopup ? 10 : 20}
        windowSize={9} // Larger values can cause performance issues.
        onScroll={onScroll}
        animatedOverviewHeight={animatedOverviewHeight}
      />
    </>
  )
}

export default React.memo(ActivityPositions)
