/**
 * The review's route: the settings chrome around the review of the setup
 * records of the tab's account, with the recovery client that reads the trust list.
 */
import React, { useMemo } from 'react'
import { isAddress, isAddressEqual } from 'viem'

import useNavigation from '@common/hooks/useNavigation'
import useAccountsControllerState from '@web/hooks/useAccountsControllerState'
import SetupChrome from '@web/modules/social-recovery/shared/chrome/SetupChrome'
import useSetupAccount from '@web/modules/social-recovery/shared/chrome/useSetupAccount'
import { CHAIN_IDS, WALLET_RECOVERY_CHAIN } from '@web/modules/social-recovery/shared/client'
import { useRecoveryClient } from '@web/modules/social-recovery/shared/client/useRecoveryClient'
import {
  createWalletRecords,
  extensionRecordStorage
} from '@web/modules/social-recovery/shared/records'

import ReviewView from './ReviewView'
import type { ReviewClient } from './types'

const ReviewScreen = () => {
  const { navigate } = useNavigation()
  const { account } = useSetupAccount()
  const { accounts } = useAccountsControllerState()

  const records = useMemo(() => createWalletRecords({ storage: extensionRecordStorage }), [])

  // The wallet's own record of the tab's account, from the background's state push.
  const listed = account
    ? accounts?.find(
        (candidate) => isAddress(candidate.addr) && isAddressEqual(candidate.addr, account)
      )
    : undefined
  const accountLabel = listed?.preferences?.label || undefined
  const clientState = useRecoveryClient(account)

  const { status, retry } = clientState
  const kit = clientState.status === 'ready' ? clientState.client : null
  const client = useMemo<ReviewClient>(() => {
    if (kit) {
      return { status: 'ready', client: kit }
    }
    if (status === 'loading') {
      return { status: 'loading' }
    }
    if (status === 'update-the-wallet') {
      return { status: 'update-the-wallet', retry }
    }
    return { status: 'failed', retry }
  }, [kit, status, retry])

  return (
    <SetupChrome>
      {!!account && (
        <ReviewView
          key={account}
          records={records}
          chainId={CHAIN_IDS[WALLET_RECOVERY_CHAIN]}
          account={account}
          client={client}
          accountLabel={accountLabel}
          navigate={navigate}
        />
      )}
    </SetupChrome>
  )
}

export default React.memo(ReviewScreen)
