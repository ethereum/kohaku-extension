import React, { useCallback } from 'react'
import { useTranslation } from 'react-i18next'

import DevIcon from '@common/assets/svg/DevIcon/DevIcon'
import ControlOption from '@common/components/ControlOption'
import FatToggle from '@common/components/FatToggle'
import useTheme from '@common/hooks/useTheme'
import spacings from '@common/styles/spacings'
import useBackgroundService from '@web/hooks/useBackgroundService'
import useWalletStateController from '@web/hooks/useWalletStateController'

const CrashAnalyticsControlOption = () => {
  const { t } = useTranslation()
  const { theme } = useTheme()
  const { crashAnalyticsEnabled } = useWalletStateController()
  const { dispatch } = useBackgroundService()

  const handleToggleCrashAnalytics = useCallback(() => {
    dispatch({
      type: 'SET_CRASH_ANALYTICS',
      params: { enabled: !crashAnalyticsEnabled }
    })
  }, [dispatch, crashAnalyticsEnabled])

  return (
    <ControlOption
      style={spacings.mbTy}
      title={t('Crash analytics')}
      description={t(
        'Help us fix issues faster with error reports. Wallet addresses, seed phrases, and private keys are not intentionally included.'
      )}
      renderIcon={<DevIcon color={theme.primaryText} />}
    >
      <FatToggle isOn={crashAnalyticsEnabled} onToggle={handleToggleCrashAnalytics} />
    </ControlOption>
  )
}

export default React.memo(CrashAnalyticsControlOption)
