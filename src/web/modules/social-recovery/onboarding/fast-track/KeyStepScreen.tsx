/**
 * The key step's route. It opens only from the password step, which hands
 * on the warning's acknowledgment; any other arrival meets the warning first.
 * With no extension password yet the holder goes back to step 2; with a
 * locked keystore, to the wallet's unlock.
 *
 * A wallet that already lists accounts when the step opens makes no new
 * phrase. Where onboarding is not complete and the selected account is a
 * basic account (the fast track's own holder back at the door after the add,
 * through a Back, a reload, choosing another account, abandoning or leaving
 * the wait), the holder goes on, past the warning, to the account step on the
 * fresh install's route with that basic account. Every other wallet that
 * lists accounts (onboarding complete, or a smart account selected) goes on
 * to the logged-in recovery entry, where the holder chooses the account that
 * receives control. A step that opens while the wallet still adds the account
 * of an earlier visit goes on to the account step for the selected basic
 * account once that add lists it. Once the wallet lists the slot's basic
 * account, the step closes the wallet's picker session and its newly-added
 * marks, as the wallet's own create flow does, and the holder goes on to the
 * account step on the fresh install's route, with that basic account as the
 * account that receives control. Every move replaces this step in the
 * history, so Back never returns to it.
 */
import React, { useCallback, useEffect, useRef, useState } from 'react'
import { useLocation } from 'react-router-dom'

import { useTranslation } from '@common/config/localization'
import useNavigation from '@common/hooks/useNavigation'
import { WEB_ROUTES } from '@common/modules/router/constants/common'
import useAccountsControllerState from '@web/hooks/useAccountsControllerState'
import useBackgroundService from '@web/hooks/useBackgroundService'
import useKeystoreControllerState from '@web/hooks/useKeystoreControllerState'
import useSelectedAccountControllerState from '@web/hooks/useSelectedAccountControllerState'
import useWalletStateController from '@web/hooks/useWalletStateController'
import RecoverScreen from '@web/modules/social-recovery/onboarding/recover/RecoverScreen'
import { acknowledgedInState } from '@web/modules/social-recovery/recovery/entry/search'
import PlainChrome from '@web/modules/social-recovery/shared/chrome/PlainChrome'

import { ACKNOWLEDGED_STATE } from './constants'
import KeyStepView from './KeyStepView'
import { accountStepPathOf, selectedBasicAccountOf } from './navigation'
import useAcknowledgment from './useAcknowledgment'
import useFastTrackKey from './useFastTrackKey'

const KeyStep = () => {
  const { t } = useTranslation()
  const { navigate } = useNavigation()
  const { dispatch } = useBackgroundService()
  const location = useLocation()
  const { account: selected } = useSelectedAccountControllerState()
  const key = useFastTrackKey()
  const [acknowledged, setAcknowledged] = useState(false)
  const dropping = acknowledgedInState(location.state)
  const closed = useRef(false)
  const { listed, listedByEarlierAdd } = key

  useEffect(() => {
    if ((!listed && !listedByEarlierAdd) || dropping || closed.current) {
      return
    }
    closed.current = true
    dispatch({ type: 'MAIN_CONTROLLER_ACCOUNT_PICKER_RESET' })
    dispatch({ type: 'ACCOUNTS_CONTROLLER_RESET_ACCOUNTS_NEWLY_ADDED_STATE' })
    navigate(accountStepPathOf(listed ?? selectedBasicAccountOf(selected)), {
      replace: true,
      state: ACKNOWLEDGED_STATE
    })
  }, [listed, listedByEarlierAdd, selected, dropping, dispatch, navigate])

  const proceed = useCallback(() => {
    if (acknowledged) {
      key.add()
    }
  }, [acknowledged, key])

  const back = useCallback(() => navigate(WEB_ROUTES.socialRecoveryRecover), [navigate])

  return (
    <PlainChrome title={t('socialRecovery.routes.recover')} testID="fast-track-key-screen">
      <KeyStepView
        phase={key.phase}
        words={key.words}
        controllingKey={key.controllingKey}
        acknowledged={acknowledged}
        onAcknowledge={setAcknowledged}
        onContinue={proceed}
        onRetry={key.retry}
        pending={key.pending}
        onBack={back}
      />
    </PlainChrome>
  )
}

const KeyStepScreen = () => {
  const { navigate } = useNavigation()
  const location = useLocation()
  const acknowledged = useAcknowledgment()
  const { hasPasswordSecret, isUnlocked } = useKeystoreControllerState()
  const { accounts } = useAccountsControllerState()
  const { account: selected } = useSelectedAccountControllerState()
  const { isSetupComplete } = useWalletStateController()
  // Whether the wallet listed accounts before this step opened.
  const [alreadyListed] = useState(!!accounts?.length)
  const dropping = acknowledgedInState(location.state)
  const fastTrackAccount = isSetupComplete ? undefined : selectedBasicAccountOf(selected)

  const away = !acknowledged
    ? null
    : alreadyListed
    ? fastTrackAccount
      ? accountStepPathOf(fastTrackAccount)
      : WEB_ROUTES.socialRecoveryRecovery
    : !hasPasswordSecret
    ? WEB_ROUTES.socialRecoveryFastTrack
    : !isUnlocked
    ? WEB_ROUTES.keyStoreUnlock
    : null

  useEffect(() => {
    if (away && !dropping) {
      navigate(away, {
        replace: true,
        ...(away !== WEB_ROUTES.keyStoreUnlock ? { state: ACKNOWLEDGED_STATE } : {})
      })
    }
  }, [away, dropping, navigate])

  if (!acknowledged) {
    return <RecoverScreen />
  }
  if (away) {
    return null
  }
  return <KeyStep />
}

export default React.memo(KeyStepScreen)
