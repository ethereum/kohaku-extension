/**
 * The settings chrome around a step, given the step its records, the recovery
 * chain and the selected account.
 */
import React, { useMemo } from 'react'
import { isAddress } from 'viem'

import useNavigation from '@common/hooks/useNavigation'
import useSelectedAccountControllerState from '@web/hooks/useSelectedAccountControllerState'
import SetupChrome from '@web/modules/social-recovery/shared/chrome/SetupChrome'
import { CHAIN_IDS, WALLET_RECOVERY_CHAIN } from '@web/modules/social-recovery/shared/client'
import {
  createWalletRecords,
  extensionRecordStorage
} from '@web/modules/social-recovery/shared/records'

import type { SettingsChromeProps } from './types'

const SettingsChrome = ({ step: Step }: SettingsChromeProps) => {
  const { navigate } = useNavigation()
  const { account } = useSelectedAccountControllerState()

  const records = useMemo(() => createWalletRecords({ storage: extensionRecordStorage }), [])

  // The selected account arrives from the background's state push.
  const address = account && isAddress(account.addr) ? account.addr : null

  return (
    <SetupChrome>
      {!!address && (
        <Step
          key={address}
          records={records}
          chainId={CHAIN_IDS[WALLET_RECOVERY_CHAIN]}
          account={address}
          navigate={navigate}
        />
      )}
    </SetupChrome>
  )
}

export default React.memo(SettingsChrome)
