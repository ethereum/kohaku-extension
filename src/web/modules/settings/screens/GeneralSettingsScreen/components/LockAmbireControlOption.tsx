import React, { useCallback } from 'react'
import { useTranslation } from 'react-i18next'

import LockIcon from '@common/assets/svg/LockIcon'
import Button from '@common/components/Button'
import ControlOption from '@common/components/ControlOption'
import useNavigation from '@common/hooks/useNavigation'
import useTheme from '@common/hooks/useTheme'
import { WEB_ROUTES } from '@common/modules/router/constants/common'
import spacings from '@common/styles/spacings'
import useBackgroundService from '@web/hooks/useBackgroundService'
import useKeystoreControllerState from '@web/hooks/useKeystoreControllerState'

const LockAmbireControlOption = () => {
  const { dispatch } = useBackgroundService()
  const { t } = useTranslation()
  const { theme } = useTheme()
  const { navigate } = useNavigation()
  const { hasPasswordSecret } = useKeystoreControllerState()

  const handleLockAmbire = useCallback(() => {
    dispatch({
      type: 'MAIN_CONTROLLER_LOCK'
    })
  }, [dispatch])

  const handleGoToDevicePasswordSet = useCallback(() => {
    navigate(WEB_ROUTES.devicePasswordSet)
  }, [navigate])

  return (
    <ControlOption
      style={spacings.mbTy}
      title={t('Lock Kohaku')}
      description={
        hasPasswordSecret
          ? t('Lock Kohaku extension, requiring your password the next time you use it.')
          : t('To lock Kohaku extension, please create a extension password first.')
      }
      renderIcon={<LockIcon color={theme.primaryText} />}
    >
      <Button
        testID="lock-extension-button"
        size="small"
        hasBottomSpacing={false}
        style={{
          width: 80
        }}
        text={hasPasswordSecret ? t('Lock') : 'Create'}
        onPress={hasPasswordSecret ? handleLockAmbire : handleGoToDevicePasswordSet}
      />
    </ControlOption>
  )
}

export default React.memo(LockAmbireControlOption)
