/**
 * The recovery banners as the dashboard mounts them, over the watcher's
 * records of the accounts the wallet lists. The cancel opens in a full tab at
 * its route, since its sign request would die with a closed popup; "it is me"
 * dismisses that one attempt; a failed poll's retry runs one poll of that
 * account from the page.
 */
import React, { useCallback, useMemo } from 'react'

import useNavigation from '@common/hooks/useNavigation'
import useAccountsControllerState from '@web/hooks/useAccountsControllerState'
import useNetworksControllerState from '@web/hooks/useNetworksControllerState'
import type { Address } from '@kohaku-eth/social-recovery'
import { CHAIN_IDS, WALLET_RECOVERY_CHAIN } from '@web/modules/social-recovery/shared/client'
import { dismissAttempt, watchedNetworkOf } from '@web/modules/social-recovery/watcher'
import { useWatchedAttempt } from '@web/modules/social-recovery/watcher/useWatchedAttempt'

import { pollOnce } from './reads'
import RecoveryAttemptBannerView from './RecoveryAttemptBannerView'
import { cancelPathOf } from './search'
import { useDismissed } from './useDismissed'

const RecoveryAttemptBanner = () => {
  const { navigate } = useNavigation()
  const { accounts } = useAccountsControllerState()
  const { networks } = useNetworksControllerState()
  const timeZone = useMemo(() => Intl.DateTimeFormat().resolvedOptions().timeZone, [])
  const network = watchedNetworkOf(networks)

  const onCancel = useCallback((account: Address) => navigate(cancelPathOf(account)), [navigate])
  const onDismiss = useCallback(
    (account: Address, attemptId: bigint) =>
      dismissAttempt(CHAIN_IDS[WALLET_RECOVERY_CHAIN], account, attemptId),
    []
  )
  const onRetry = useCallback((account: Address) => pollOnce({ account, network }), [network])

  if (!accounts) {
    return null
  }
  return (
    <RecoveryAttemptBannerView
      accounts={accounts}
      useAttempt={useWatchedAttempt}
      useDismissed={useDismissed}
      onCancel={onCancel}
      onDismiss={onDismiss}
      onRetry={onRetry}
      timeZone={timeZone}
    />
  )
}

export default React.memo(RecoveryAttemptBanner)
