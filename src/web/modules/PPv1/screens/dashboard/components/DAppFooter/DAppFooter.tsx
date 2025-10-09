import React, { useCallback } from 'react'
import { View } from 'react-native'

import useTheme from '@common/hooks/useTheme'

import useNavigation from '@common/hooks/useNavigation'
import { WEB_ROUTES } from '@common/modules/router/constants/common'
import getStyles from './styles'
import PendingBanner from '../PendingBanner'
import RejectedBanner from '../RejectedBanner'

const DAppFooter = () => {
  const { styles } = useTheme(getStyles)
  const { navigate } = useNavigation()

  const onWithdrawBack = useCallback(() => {
    navigate(WEB_ROUTES.pp1Ragequit)
  }, [navigate])

  return (
    <View style={styles.footerContainer}>
      <RejectedBanner onWithdrawBack={onWithdrawBack} />
      <PendingBanner />
    </View>
  )
}

export default React.memo(DAppFooter)
