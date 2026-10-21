/**
 * The home surface's recovery band as the dashboard mounts it, over the
 * wallet's records on the recovery chain. Opening a recovery navigates to its
 * route, which opens in a full tab.
 */
import React, { useMemo } from 'react'

import useNavigation from '@common/hooks/useNavigation'
import {
  addressBookOf,
  CHAIN_IDS,
  WALLET_RECOVERY_CHAIN
} from '@web/modules/social-recovery/shared/client'
import {
  createWalletRecords,
  extensionRecordStorage,
  recordDeploymentOf
} from '@web/modules/social-recovery/shared/records'

import HomeRecoveryBandView from './HomeRecoveryBandView'
import useSessionHeadline from './useSessionHeadline'

const HomeRecoveryBand = () => {
  const { navigate } = useNavigation()
  const records = useMemo(() => createWalletRecords({ storage: extensionRecordStorage }), [])
  const timeZone = useMemo(() => Intl.DateTimeFormat().resolvedOptions().timeZone, [])
  // The client a recovery screen builds reads the address book's manager and action.
  const deployment = useMemo(() => recordDeploymentOf(addressBookOf(WALLET_RECOVERY_CHAIN)), [])

  return (
    <HomeRecoveryBandView
      records={records}
      chainId={CHAIN_IDS[WALLET_RECOVERY_CHAIN]}
      deployment={deployment}
      navigate={navigate}
      timeZone={timeZone}
      useHeadline={useSessionHeadline}
    />
  )
}

export default React.memo(HomeRecoveryBand)
