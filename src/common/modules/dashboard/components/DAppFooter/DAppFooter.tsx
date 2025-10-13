import React, { useCallback, useState } from 'react'
import { View } from 'react-native'
import { useModalize } from 'react-native-modalize'

import useTheme from '@common/hooks/useTheme'
import useDappsControllerState from '@web/hooks/useDappsControllerState'
import DappControl from '@web/modules/dapp-catalog/components/DappControl'
import ManageDapp from '@web/modules/dapp-catalog/components/ManageDapp'
import { getUiType } from '@web/utils/uiType'

import RejectedBanner from '@common/modules/dashboard/components/RejectedBanner'
import PendingBanner from '@common/modules/dashboard/components/PendingBanner'
import { WEB_ROUTES } from '@common/modules/router/constants/common'
import useNavigation from '@common/hooks/useNavigation'
import getStyles from './styles'

const { isPopup } = getUiType()

const DAppFooter = () => {
  const { styles } = useTheme(getStyles)
  const { currentDapp } = useDappsControllerState()
  const { ref: sheetRef, open: openBottomSheet, close: closeBottomSheet } = useModalize()
  const [hovered, setHovered] = useState(false)

  const { navigate } = useNavigation()

  const onWithdrawBack = useCallback(() => {
    navigate(WEB_ROUTES.pp1Ragequit)
  }, [navigate])

  if (!currentDapp || !isPopup) return null

  return (
    <View style={styles.footerContainer}>
      <PendingBanner />
      <RejectedBanner onWithdrawBack={onWithdrawBack} />
      <div onMouseEnter={() => setHovered(true)} onMouseLeave={() => setHovered(false)}>
        <View style={styles.container}>
          <DappControl
            dapp={currentDapp}
            isHovered={hovered}
            inModal={false}
            isCurrentDapp
            openBottomSheet={openBottomSheet}
            closeBottomSheet={closeBottomSheet}
          />
        </View>
      </div>
      <ManageDapp
        dapp={currentDapp}
        isCurrentDapp
        sheetRef={sheetRef}
        openBottomSheet={openBottomSheet}
        closeBottomSheet={closeBottomSheet}
      />
    </View>
  )
}

export default React.memo(DAppFooter)
