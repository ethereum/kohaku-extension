/**
 * The settings chrome around a step, with the step's stage on its counter,
 * given the step its records, the recovery chain and the setup tab's account.
 */
import React, { useMemo } from 'react'

import useNavigation from '@common/hooks/useNavigation'
import {
  SETUP_STAGE_COUNTER_KEY,
  SETUP_STAGES
} from '@web/modules/social-recovery/shared/chrome/constants'
import SetupChrome from '@web/modules/social-recovery/shared/chrome/SetupChrome'
import useSetupAccount from '@web/modules/social-recovery/shared/chrome/useSetupAccount'
import { CHAIN_IDS, WALLET_RECOVERY_CHAIN } from '@web/modules/social-recovery/shared/client'
import {
  createWalletRecords,
  extensionRecordStorage
} from '@web/modules/social-recovery/shared/records'

import type { SettingsChromeProps } from './types'

const SettingsChrome = ({ step: Step, stage }: SettingsChromeProps) => {
  const { navigate } = useNavigation()
  const { account: address } = useSetupAccount()

  const records = useMemo(() => createWalletRecords({ storage: extensionRecordStorage }), [])

  return (
    <SetupChrome
      counter={{
        labelKey: SETUP_STAGE_COUNTER_KEY,
        step: stage,
        total: SETUP_STAGES,
        testID: 'setup-stage'
      }}
    >
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
