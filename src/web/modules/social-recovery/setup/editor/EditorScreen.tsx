/**
 * The editor's route: the settings chrome around the editor over the setup
 * records of the tab's account, with the recovery client that runs the path check.
 */
import React, { useMemo } from 'react'

import { useTranslation } from '@common/config/localization'
import useNavigation from '@common/hooks/useNavigation'
import {
  SETUP_STAGE_COUNTER_KEY,
  SETUP_STAGES
} from '@web/modules/social-recovery/shared/chrome/constants'
import LoadingBlock from '@web/modules/social-recovery/shared/chrome/LoadingBlock'
import SetupChrome from '@web/modules/social-recovery/shared/chrome/SetupChrome'
import useSetupAccount from '@web/modules/social-recovery/shared/chrome/useSetupAccount'
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
  const { t } = useTranslation()
  const { account } = useSetupAccount()
  const { navigate } = useNavigation()
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
    <SetupChrome
      counter={{
        labelKey: SETUP_STAGE_COUNTER_KEY,
        step: 2,
        total: SETUP_STAGES,
        testID: 'editor-stage'
      }}
    >
      {records ? (
        <EditorView
          key={account}
          records={records}
          client={client}
          addressBook={addressBook}
          navigate={navigate}
        />
      ) : (
        <LoadingBlock variant="screen" message={t('socialRecovery.loading.draft')} />
      )}
    </SetupChrome>
  )
}

export default React.memo(EditorScreen)
