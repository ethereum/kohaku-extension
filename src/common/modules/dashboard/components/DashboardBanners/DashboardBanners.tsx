import React from 'react'
import { View } from 'react-native'

import { BannerType } from '@ambire-common/interfaces/banner'
import DashboardBanner from '@common/modules/dashboard/components/DashboardBanners/DashboardBanner/DashboardBanner'
import MarketingBanner from '@common/modules/dashboard/components/DashboardBanners/MarketingBanner/MarketingBanner'
import useBanners from '@common/modules/dashboard/hooks/useBanners'

const DashboardBanners = () => {
  const [controllerBanners, marketingBanners] = useBanners()

  return (
    <View>
      {marketingBanners.map((banner) => (
        <MarketingBanner key={banner.id} banner={banner} />
      ))}
      {controllerBanners.map((banner) => (
        <DashboardBanner key={banner.id} banner={{ ...banner, type: banner.type as BannerType }} />
      ))}
    </View>
  )
}

export default React.memo(DashboardBanners)
