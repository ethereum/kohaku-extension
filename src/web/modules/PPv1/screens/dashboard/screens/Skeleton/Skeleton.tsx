import React from 'react'
import { View } from 'react-native'

import SkeletonLoader from '@common/components/SkeletonLoader'
import useTheme from '@common/hooks/useTheme'
import useWindowSize from '@common/hooks/useWindowSize'
import DashboardOverviewSkeleton from '@web/modules/PPv1/screens/dashboard/components/DashboardOverview/Skeleton'
import TabsAndSearchSkeleton from '@web/modules/PPv1/screens/dashboard/components/TabsAndSearch/Skeleton'
import spacings from '@common/styles/spacings'
import flexbox from '@common/styles/utils/flexbox'
import commonWebStyles from '@web/styles/utils/common'
import { getUiType } from '@web/utils/uiType'

import TokensSkeleton from '../../components/Tokens/TokensSkeleton'
import useBanners from '../../hooks/useBanners'
import getStyles from '../styles'

const { isTab } = getUiType()

const Skeleton = () => {
  const { styles } = useTheme(getStyles)
  const { minWidthSize } = useWindowSize()
  const [controllerBanners] = useBanners()

  return (
    <View style={styles.container}>
      <View style={[flexbox.flex1, isTab && minWidthSize('l') && spacings.phSm]}>
        <DashboardOverviewSkeleton />
        <View
          style={[commonWebStyles.contentContainer, !isTab ? spacings.phSm : {}, spacings.ptTy]}
        >
          {controllerBanners.map((banner) => (
            <SkeletonLoader key={banner.id} height={61} width="100%" style={spacings.mbTy} />
          ))}
          <TabsAndSearchSkeleton />
          <TokensSkeleton />
        </View>
      </View>
    </View>
  )
}

export default React.memo(Skeleton)
