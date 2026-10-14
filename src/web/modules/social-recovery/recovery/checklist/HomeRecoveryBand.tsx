/**
 * The home surface's recovery band as the dashboard mounts it, over the
 * wallet's records on the recovery chain. Opening a recovery navigates to its
 * route, which opens in a full tab.
 */
import React, { useMemo } from 'react'

import useNavigation from '@common/hooks/useNavigation'
import { CHAIN_IDS, WALLET_RECOVERY_CHAIN } from '@web/modules/social-recovery/shared/client'
import {
  createWalletRecords,
  extensionRecordStorage
} from '@web/modules/social-recovery/shared/records'

import HomeRecoveryBandView from './HomeRecoveryBandView'
import useSessionHeadline from './useSessionHeadline'

const HomeRecoveryBand = () => {
  const { navigate } = useNavigation()
  const records = useMemo(() => createWalletRecords({ storage: extensionRecordStorage }), [])
  const timeZone = useMemo(() => Intl.DateTimeFormat().resolvedOptions().timeZone, [])

  return (
    <HomeRecoveryBandView
      records={records}
      chainId={CHAIN_IDS[WALLET_RECOVERY_CHAIN]}
      navigate={navigate}
      timeZone={timeZone}
      useHeadline={useSessionHeadline}
    />
  )
}

export default React.memo(HomeRecoveryBand)
