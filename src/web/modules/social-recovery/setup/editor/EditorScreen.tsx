/**
 * The editor's route: the settings chrome around the editor over the selected
 * account's setup records, with the recovery client that runs the path check.
 */
import React, { useMemo } from 'react'
import { ScrollView, View } from 'react-native'
import { isAddress } from 'viem'

import Panel from '@common/components/Panel'
import Spinner from '@common/components/Spinner'
import useNavigation from '@common/hooks/useNavigation'
import spacings from '@common/styles/spacings'
import flexbox from '@common/styles/utils/flexbox'
import useSelectedAccountControllerState from '@web/hooks/useSelectedAccountControllerState'
import Sidebar from '@web/modules/settings/components/Sidebar'
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
    <View style={[flexbox.flex1, flexbox.directionRow]}>
      <Sidebar activeLink="account-recovery" />
      <View style={[flexbox.flex1, spacings.pvLg, spacings.phLg]}>
        <Panel>
          <ScrollView>
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
          </ScrollView>
        </Panel>
      </View>
    </View>
  )
}

export default React.memo(EditorScreen)
