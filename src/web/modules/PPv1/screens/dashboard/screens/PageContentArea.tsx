import React, { useCallback, useRef } from 'react'
import { Animated, NativeScrollEvent, NativeSyntheticEvent } from 'react-native'

import DepositStatusBanner from '@common/modules/dashboard/components/DepositStatusBanner/DepositStatusBanner'
import DashboardPages from '@common/modules/dashboard/components/DashboardPages'
import useNavigation from '@common/hooks/useNavigation'
import { WEB_ROUTES } from '@common/modules/router/constants/common'
import PPv1DashboardPages from '../components/DashboardPages'

type ActiveView = 'public' | 'private'

interface Props {
  activeView: ActiveView
  isLoadingPublicBalances: boolean
}

const PageContentArea = ({ activeView, isLoadingPublicBalances }: Props) => {
  const { navigate } = useNavigation()
  const animatedOverviewHeight = useRef(new Animated.Value(0)).current
  const noop = useCallback(() => {}, []) as (e: NativeSyntheticEvent<NativeScrollEvent>) => void

  const onWithdrawBack = useCallback(() => navigate(WEB_ROUTES.pp1Ragequit), [navigate])
  const onDeposit = useCallback(() => navigate(WEB_ROUTES.pp1Deposit), [navigate])

  return (
    <>
      <DepositStatusBanner onWithdrawBack={onWithdrawBack} onDeposit={onDeposit} />
      {activeView === 'public' && !isLoadingPublicBalances && (
        <DashboardPages onScroll={noop} animatedOverviewHeight={animatedOverviewHeight} />
      )}
      {activeView === 'private' && (
        <PPv1DashboardPages onScroll={noop} animatedOverviewHeight={animatedOverviewHeight} />
      )}
    </>
  )
}

export default PageContentArea
