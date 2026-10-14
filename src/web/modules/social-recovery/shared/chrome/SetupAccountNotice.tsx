/**
 * The notice the setup chrome shows above its view while the wallet selects
 * another account than the one the tab sets up. Reading the tab's account
 * latches it, so only a chrome that keeps the latch draws this.
 */
import React, { useCallback } from 'react'

import useNavigation from '@common/hooks/useNavigation'
import { WEB_ROUTES } from '@common/modules/router/constants/common'

import OtherAccountNotice from './OtherAccountNotice'
import useSetupAccount from './useSetupAccount'

const SetupAccountNotice = () => {
  const { navigate } = useNavigation()
  const { account, differs, switchToSelected } = useSetupAccount()

  // The selected account's setup starts from its own records, at the entry. The
  // entry replaces the current step, so Back does not reopen that step's route
  // for the new account.
  const switchAccount = useCallback(() => {
    switchToSelected()
    navigate(WEB_ROUTES.socialRecoverySetup, { replace: true })
  }, [switchToSelected, navigate])

  if (!differs || !account) {
    return null
  }
  return (
    <OtherAccountNotice account={account} onSwitch={switchAccount} testID="setup-other-account" />
  )
}

export default React.memo(SetupAccountNotice)
