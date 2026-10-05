/**
 * The review's route: the settings chrome around the review of the selected
 * account's setup records, with the recovery client that reads the trust list,
 * the wallet's read of the keys holding a privilege on the account over the
 * recovery chain's provider, and that network's provider kind.
 */
import React, { useMemo, useRef } from 'react'
import { isAddress, isAddressEqual } from 'viem'

import useNavigation from '@common/hooks/useNavigation'
import useNetworksControllerState from '@web/hooks/useNetworksControllerState'
import useSelectedAccountControllerState from '@web/hooks/useSelectedAccountControllerState'
import SetupChrome from '@web/modules/social-recovery/shared/chrome/SetupChrome'
import {
  CHAIN_IDS,
  createPrivilegeReads,
  extensionProviderFor,
  networkOf,
  WALLET_RECOVERY_CHAIN
} from '@web/modules/social-recovery/shared/client'
import type { PrivilegeHoldersReading } from '@web/modules/social-recovery/shared/client'
import { useRecoveryClient } from '@web/modules/social-recovery/shared/client/useRecoveryClient'
import {
  createWalletRecords,
  extensionRecordStorage
} from '@web/modules/social-recovery/shared/records'

import ReviewView from './ReviewView'
import type { ReviewClient } from './types'

const ReviewScreen = () => {
  const { navigate } = useNavigation()
  const { account: selected } = useSelectedAccountControllerState()
  const { networks } = useNetworksControllerState()

  const records = useMemo(() => createWalletRecords({ storage: extensionRecordStorage }), [])

  // The selected account arrives from the background's state push.
  const account = selected && isAddress(selected.addr) ? selected.addr : undefined
  const accountLabel = selected?.preferences?.label || undefined
  const network = networkOf(networks, WALLET_RECOVERY_CHAIN)
  const providerKind = network?.rpcProvider
  const clientState = useRecoveryClient(account)
  // The privilege read takes the account and the network as they are when it
  // runs, so a state push does not start the review's reads over.
  const selectedRef = useRef(selected)
  selectedRef.current = selected
  const networkRef = useRef(network)
  networkRef.current = network

  const { status, retry } = clientState
  const kit = clientState.status === 'ready' ? clientState.client : null
  const client = useMemo<ReviewClient>(() => {
    if (kit) {
      const privilegeHolders = async (): Promise<PrivilegeHoldersReading> => {
        const held = selectedRef.current
        const heldNetwork = networkRef.current
        if (
          !held ||
          !heldNetwork ||
          !isAddress(held.addr) ||
          !isAddressEqual(held.addr, kit.account)
        ) {
          throw new Error(`The wallet holds no account ${kit.account} on the recovery chain.`)
        }
        const provider = extensionProviderFor(heldNetwork)
        try {
          return await createPrivilegeReads(provider).privilegeHoldersOf(
            held,
            CHAIN_IDS[WALLET_RECOVERY_CHAIN]
          )
        } finally {
          provider.destroy()
        }
      }
      return { status: 'ready', client: { ...kit, privilegeHolders } }
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
          providerKind={providerKind}
          accountLabel={accountLabel}
          navigate={navigate}
        />
      )}
    </SetupChrome>
  )
}

export default React.memo(ReviewScreen)
