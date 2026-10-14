/**
 * The logged-in entry's route: the settings chrome at the first stage around
 * the owner stage, over the wallet's accounts and the keys its keystore holds.
 * Continue opens the account step with the route and the receiving account,
 * and tells it the holder acknowledged the warning here.
 */
import React, { useCallback, useMemo } from 'react'

import useNavigation from '@common/hooks/useNavigation'
import { WEB_ROUTES } from '@common/modules/router/constants/common'
import useAccountsControllerState from '@web/hooks/useAccountsControllerState'
import useKeystoreControllerState from '@web/hooks/useKeystoreControllerState'
import type { Address } from '@web/modules/social-recovery/sdk-interfaces'
import RecoveryChrome from '@web/modules/social-recovery/shared/chrome/RecoveryChrome'

import { ACKNOWLEDGED_STATE, OWNER_STAGE } from './constants'
import OwnerStageView from './OwnerStageView'
import { receivingChoicesOf } from './receiving'
import { accountStepPathOf } from './search'

const EntryScreen = () => {
  const { navigate } = useNavigation()
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

  return (
    <RecoveryChrome
      route="logged-in"
      titleKey="socialRecovery.routes.recover"
      stage={{ step: OWNER_STAGE, testID: 'recovery-stage' }}
      testID="recovery-entry"
    >
      <OwnerStageView choices={choices} loaded={loaded} onContinue={proceed} onCancel={cancel} />
    </RecoveryChrome>
  )
}

export default React.memo(EntryScreen)
