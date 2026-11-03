/**
 * The fast track's route. A holder who arrives from the warning carries its
 * acknowledgment and sees step 2 of 3, the extension password, at once. Any
 * other arrival (a direct URL, a reload) meets the warning first, in the
 * recover door's form, and continue there brings the holder back here with
 * the acknowledgment.
 *
 * A device that already holds an extension password skips the step straight
 * to the key; the count does not change. Otherwise the step stores the
 * password through the wallet's own keystore setup, unlocked, and moves on
 * once the keystore holds it and is unlocked.
 */
import React, { useCallback, useEffect, useState } from 'react'
import { useLocation } from 'react-router-dom'

import { useTranslation } from '@common/config/localization'
import useNavigation from '@common/hooks/useNavigation'
import { WEB_ROUTES } from '@common/modules/router/constants/common'
import useKeystoreControllerState from '@web/hooks/useKeystoreControllerState'
import useKeyStoreSetup from '@web/modules/keystore/components/KeyStoreSetupForm/hooks/useKeyStoreSetup'
import RecoverScreen from '@web/modules/social-recovery/onboarding/recover/RecoverScreen'
import { acknowledgedInState } from '@web/modules/social-recovery/recovery/entry/search'
import PlainChrome from '@web/modules/social-recovery/shared/chrome/PlainChrome'

import { ACKNOWLEDGED_STATE } from './constants'
import PasswordStepView from './PasswordStepView'
import useAcknowledgment from './useAcknowledgment'

const PasswordStep = () => {
  const { t } = useTranslation()
  const { navigate } = useNavigation()
  const location = useLocation()
  const { hasPasswordSecret, isUnlocked } = useKeystoreControllerState()
  const setup = useKeyStoreSetup()
  // A password stored before this step opened skips it, whether or not the
  // keystore is unlocked: the key step asks for the unlock itself.
  const [skipped] = useState(hasPasswordSecret)

  const done = hasPasswordSecret && (skipped || isUnlocked)
  // The history entry drops the acknowledgment first; moving on before that
  // would let the drop replace the next step's entry.
  const dropping = acknowledgedInState(location.state)

  const back = useCallback(() => navigate(WEB_ROUTES.socialRecoveryRecover), [navigate])

  useEffect(() => {
    if (done && !dropping) {
      navigate(WEB_ROUTES.socialRecoveryFastTrackKey, { replace: true, state: ACKNOWLEDGED_STATE })
    }
  }, [done, dropping, navigate])

  return (
    <PlainChrome title={t('socialRecovery.routes.recover')} testID="fast-track">
      {!skipped && <PasswordStepView setup={setup} onBack={back} />}
    </PlainChrome>
  )
}

const FastTrackScreen = () => {
  const acknowledged = useAcknowledgment()

  if (!acknowledged) {
    return <RecoverScreen />
  }
  return <PasswordStep />
}

export default React.memo(FastTrackScreen)
