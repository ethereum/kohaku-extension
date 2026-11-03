/**
 * The recover door: the warning in its full form under the plain header.
 * Continue opens the fast track and hands it the acknowledgment in the
 * router state, the only place it travels; import instead opens the seed
 * import the welcome screen's import door opens. Leave goes back to the
 * account recovery settings for a holder with an account, who can only have
 * come from there, and to the welcome screen otherwise.
 */
import React, { useCallback } from 'react'

import { useTranslation } from '@common/config/localization'
import useNavigation from '@common/hooks/useNavigation'
import { AUTH_STATUS } from '@common/modules/auth/constants/authStatus'
import useAuth from '@common/modules/auth/hooks/useAuth'
import useOnboardingNavigation from '@common/modules/auth/hooks/useOnboardingNavigation'
import { WEB_ROUTES } from '@common/modules/router/constants/common'
import { ACKNOWLEDGED_STATE } from '@web/modules/social-recovery/onboarding/fast-track/constants'
import PlainChrome from '@web/modules/social-recovery/shared/chrome/PlainChrome'

import WarningGate from './WarningGate'

const RecoverScreen = () => {
  const { t } = useTranslation()
  const { navigate } = useNavigation()
  const { goToNextRoute } = useOnboardingNavigation()
  const { authStatus } = useAuth()

  const proceed = useCallback(
    () => navigate(WEB_ROUTES.socialRecoveryFastTrack, { state: ACKNOWLEDGED_STATE }),
    [navigate]
  )
  const importInstead = useCallback(
    () => goToNextRoute(WEB_ROUTES.importSeedPhrase),
    [goToNextRoute]
  )
  const leave = useCallback(
    () =>
      navigate(
        authStatus === AUTH_STATUS.AUTHENTICATED
          ? WEB_ROUTES.socialRecoverySetup
          : WEB_ROUTES.getStarted
      ),
    [authStatus, navigate]
  )

  return (
    <PlainChrome title={t('socialRecovery.routes.recover')} testID="recover">
      <WarningGate
        form="recover"
        onContinue={proceed}
        onLeave={leave}
        onImportInstead={importInstead}
      />
    </PlainChrome>
  )
}

export default React.memo(RecoverScreen)
