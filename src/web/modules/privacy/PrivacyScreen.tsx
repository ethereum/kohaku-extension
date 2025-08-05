import { ROUTES } from '@common/modules/router/constants/common'
import React, { useCallback } from 'react'
import useNavigation from '@common/hooks/useNavigation'
import BackButton from '@common/components/BackButton'

const PrivacyScreen = () => {
  const { navigate } = useNavigation()

  const onBack = useCallback(() => {
    navigate(ROUTES.dashboard)
  }, [navigate])

  return (
    <div>
      <BackButton onPress={onBack} />
      Privacy
    </div>
  )
}

export default React.memo(PrivacyScreen)
