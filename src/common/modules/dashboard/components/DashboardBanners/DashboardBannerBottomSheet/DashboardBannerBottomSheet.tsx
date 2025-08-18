import React, { FC } from 'react'
import { useTranslation } from 'react-i18next'
import { View, ViewStyle } from 'react-native'

import { getIsBridgeRoute } from '@ambire-common/libs/swapAndBridge/swapAndBridge'
import BottomSheet from '@common/components/BottomSheet'
import Text from '@common/components/Text'
import spacings from '@common/styles/spacings'
import flexbox from '@common/styles/utils/flexbox'
import useSwapAndBridgeControllerState from '@web/hooks/useSwapAndBridgeControllerState'
import ActiveRouteCard from '@web/modules/swap-and-bridge/components/ActiveRouteCard'

type Props = {
  id: string
  sheetRef: React.RefObject<any>
  closeBottomSheet: () => void
}

const WITH_BOTTOM_SHEET = ['bridge-in-progress']
const RENDER_AS_MODAL: string[] = []

const style: {
  [key: string]: ViewStyle
} = {
  'update-available': {
    overflow: 'hidden',
    width: 496,
    ...spacings.ph0,
    ...spacings.pv0
  }
}

const DashboardBannerBottomSheet: FC<Props> = ({ id, sheetRef, closeBottomSheet }) => {
  const { t } = useTranslation()
  const { activeRoutes } = useSwapAndBridgeControllerState()

  if (!WITH_BOTTOM_SHEET.includes(id)) return null

  return (
    <BottomSheet
      id={`${id}-bottom-sheet`}
      sheetRef={sheetRef}
      closeBottomSheet={closeBottomSheet}
      backgroundColor="secondaryBackground"
      style={style[id]}
      type={RENDER_AS_MODAL.includes(id) ? 'modal' : undefined}
    >
      {id === 'bridge-in-progress' && (
        <View style={[flexbox.flex1, spacings.ptSm]}>
          <Text fontSize={16} weight="medium" style={spacings.mbLg}>
            {t('Pending bridge transactions')}
          </Text>
          {activeRoutes
            .filter(
              (route) =>
                route.route &&
                getIsBridgeRoute(route.route) &&
                (route.routeStatus === 'in-progress' ||
                  route.routeStatus === 'completed' ||
                  route.routeStatus === 'refunded' ||
                  route.routeStatus === 'failed')
            )

            .map((route) => (
              <View key={route.activeRouteId} style={spacings.mbTy}>
                <ActiveRouteCard activeRoute={route} />
              </View>
            ))}
        </View>
      )}
    </BottomSheet>
  )
}

export default DashboardBannerBottomSheet
