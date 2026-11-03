/**
 * The logged-in entry's route: the settings chrome at the first stage around
 * the owner stage, over the wallet's accounts and the keys its keystore holds.
 * Continue opens the account step with the route and the receiving account,
 * and tells it the holder acknowledged the warning here. A holder who arrives
 * from the recovery door's full warning keeps that acknowledgment: the
 * condensed warning shows ticked.
 */
import React, { useCallback, useEffect, useMemo, useState } from 'react'
import { useLocation } from 'react-router-dom'

import useNavigation from '@common/hooks/useNavigation'
import { WEB_ROUTES } from '@common/modules/router/constants/common'
import useAccountsControllerState from '@web/hooks/useAccountsControllerState'
import useKeystoreControllerState from '@web/hooks/useKeystoreControllerState'
import type { Address } from '@kohaku-eth/social-recovery'
import RecoveryChrome from '@web/modules/social-recovery/shared/chrome/RecoveryChrome'

import { ACKNOWLEDGED_STATE, OWNER_STAGE } from './constants'
import OwnerStageView from './OwnerStageView'
import { receivingChoicesOf } from './receiving'
import { accountStepPathOf, acknowledgedInState } from './search'

const EntryScreen = () => {
  const { navigate } = useNavigation()
  const location = useLocation()
  const { accounts } = useAccountsControllerState()
  const { keys } = useKeystoreControllerState()

  const loaded = !!accounts && !!keys
  const choices = useMemo(
    () => (accounts && keys ? receivingChoicesOf(accounts, keys) : []),
    [accounts, keys]
  )
  const proceed = useCallback(
    (receivingAccount: Address) =>
      navigate(accountStepPathOf({ route: 'logged-in', receivingAccount }), {
        state: ACKNOWLEDGED_STATE
      }),
    [navigate]
  )
  const cancel = useCallback(() => navigate(WEB_ROUTES.socialRecoverySetup), [navigate])

  // The acknowledgment travels in the navigation state of the screen that
  // brought the holder here, never in storage. This mount reads it once and
  // the history entry drops it at once, so a reload, a direct URL or a new tab
  // asks the tick again.
  const inState = acknowledgedInState(location.state)
  const [arrivedAcknowledged] = useState(inState)

  useEffect(() => {
    if (!inState) {
      return
    }
    navigate(`${location.pathname}${location.search}`, { replace: true })
  }, [inState, location.pathname, location.search, navigate])

  return (
    <RecoveryChrome
      route="logged-in"
      titleKey="socialRecovery.routes.recover"
      stage={{ step: OWNER_STAGE, testID: 'recovery-stage' }}
      testID="recovery-entry"
    >
      <OwnerStageView
        initiallyAcknowledged={arrivedAcknowledged}
        choices={choices}
        loaded={loaded}
        onContinue={proceed}
        onCancel={cancel}
      />
    </RecoveryChrome>
  )
}

export default React.memo(EntryScreen)
