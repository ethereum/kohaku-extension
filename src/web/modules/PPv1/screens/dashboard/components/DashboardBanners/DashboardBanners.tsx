import React from 'react'
import { View } from 'react-native'

import { BannerType } from '@ambire-common/interfaces/banner'
import DashboardBanner from '@common/modules/dashboard/components/DashboardBanners/DashboardBanner/DashboardBanner'
import useBanners from '../../hooks/useBanners'

const DashboardBanners = () => {
  const [controllerBanners] = useBanners()

  return (
    <View>
      {controllerBanners.map((banner) => (
        <DashboardBanner key={banner.id} banner={{ ...banner, type: banner.type as BannerType }} />
      ))}
    </View>
  )
}

export default React.memo(DashboardBanners)

