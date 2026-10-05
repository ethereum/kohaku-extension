/**
 * The presets in the settings chrome, for the selected account on the
 * recovery chain.
 */
import React, { useCallback, useMemo } from 'react'
import { isAddress } from 'viem'

import useNavigation from '@common/hooks/useNavigation'
import { WEB_ROUTES } from '@common/modules/router/constants/common'
import useSelectedAccountControllerState from '@web/hooks/useSelectedAccountControllerState'
import SetupChrome from '@web/modules/social-recovery/shared/chrome/SetupChrome'
import { CHAIN_IDS, WALLET_RECOVERY_CHAIN } from '@web/modules/social-recovery/shared/client'
import {
  createWalletRecords,
  extensionRecordStorage
} from '@web/modules/social-recovery/shared/records'

import PresetsView from './PresetsView'

const PresetsScreen = () => {
  const { navigate } = useNavigation()
  const { account } = useSelectedAccountControllerState()

  const chainId = CHAIN_IDS[WALLET_RECOVERY_CHAIN]
  const records = useMemo(() => createWalletRecords({ storage: extensionRecordStorage }), [])
  const openEditor = useCallback(() => navigate(WEB_ROUTES.socialRecoverySetupEditor), [navigate])
  const recover = useCallback(() => navigate(WEB_ROUTES.socialRecoveryRecover), [navigate])

  // The selected account arrives from the background's state push.
  const address = account && isAddress(account.addr) ? account.addr : null

  return (
    <SetupChrome>
      {/* Another account or chain mounts a new view, so no state carries across. */}
      {!!address && (
        <PresetsView
          key={`${chainId}:${address}`}
          records={records}
          chainId={chainId}
          account={address}
          onOpenEditor={openEditor}
          onRecover={recover}
        />
      )}
    </SetupChrome>
  )
}

export default React.memo(PresetsScreen)
