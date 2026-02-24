import React from 'react'
import { View } from 'react-native'

// import ReceiveIcon from '@common/assets/svg/ReceiveIcon'
import SendIcon from '@common/assets/svg/SendIcon'
import { useTranslation } from '@common/config/localization'
import { WEB_ROUTES } from '@common/modules/router/constants/common'
import flexbox from '@common/styles/utils/flexbox'

import RouteItem from './RouteItem'

// const Routes = ({ openReceiveModal }: { openReceiveModal: () => void }) => {
const Routes = () => {
  const { t } = useTranslation()

  const routeItems = [
    // {
    //   testID: 'dashboard-button-privacy-pools',
    //   icon: (props: any) => <SendIcon style={{ rotate: '90deg' }} {...props} />,
    //   label: t('Deposit'),
    //   route: WEB_ROUTES.pp1Deposit,
    //   isExternal: false,
    //   scale: 1.08,
    //   scaleOnHover: 1.18
    // },
    {
      testID: 'dashboard-button-send',
      icon: SendIcon,
      label: t('Send'),
      route: WEB_ROUTES.pp1Transfer,
      isExternal: false,
      scale: 1.08,
      scaleOnHover: 1.18
    }
    // {
    //   testID: 'dashboard-button-receive',
    //   icon: ReceiveIcon,
    //   label: t('Receive'),
    //   onPress: openReceiveModal,
    //   isExternal: false,
    //   scale: 1.08,
    //   scaleOnHover: 1.18
    // }
  ]

  return (
    <View style={[flexbox.directionRow]}>
      {routeItems.map((routeItem, index) => (
        <RouteItem
          key={routeItem.label}
          routeItem={routeItem}
          index={index}
          routeItemsLength={routeItems.length}
        />
      ))}
    </View>
  )
}

export default React.memo(Routes)
