/**
 * The editor's route: the settings chrome around the editor over the selected
 * account's setup records, with the recovery client that runs the path check.
 */
import React, { useMemo } from 'react'
import { isAddress } from 'viem'

import Spinner from '@common/components/Spinner'
import useNavigation from '@common/hooks/useNavigation'
import useSelectedAccountControllerState from '@web/hooks/useSelectedAccountControllerState'
import SetupChrome from '@web/modules/social-recovery/shared/chrome/SetupChrome'
import {
  addressBookOf,
  CHAIN_IDS,
  WALLET_RECOVERY_CHAIN
} from '@web/modules/social-recovery/shared/client'
import { useRecoveryClient } from '@web/modules/social-recovery/shared/client/useRecoveryClient'
import {
  createWalletRecords,
  extensionRecordStorage
} from '@web/modules/social-recovery/shared/records'

import EditorView from './EditorView'
import type { EditorClient } from './types'

const EditorScreen = () => {
  const { account: selected } = useSelectedAccountControllerState()
  const { navigate } = useNavigation()
  // The controller's account address is a plain string; only a real address reaches the records.
  const account = selected?.addr && isAddress(selected.addr) ? selected.addr : undefined
  const clientState = useRecoveryClient(account)
  const addressBook = useMemo(() => addressBookOf(WALLET_RECOVERY_CHAIN), [])

  const records = useMemo(
    () =>
      account
        ? createWalletRecords({ storage: extensionRecordStorage }).setup(
            CHAIN_IDS[WALLET_RECOVERY_CHAIN],
            account
          )
        : null,
    [account]
  )

  const { status, retry } = clientState
  const setup = clientState.status === 'ready' ? clientState.client.setup : null
  const client = useMemo<EditorClient>(() => {
    if (setup) {
      return { status: 'ready', setup }
    }
    if (status === 'loading') {
      return { status: 'loading' }
    }
    if (status === 'update-the-wallet') {
      return { status: 'update-the-wallet', retry }
    }
    return { status: 'failed', retry }
  }, [setup, status, retry])

  return (
    <SetupChrome>
      {records ? (
        <EditorView
          key={account}
          records={records}
          client={client}
          addressBook={addressBook}
          navigate={navigate}
        />
      ) : (
        <Spinner />
      )}
    </SetupChrome>
  )
}

export default React.memo(EditorScreen)
