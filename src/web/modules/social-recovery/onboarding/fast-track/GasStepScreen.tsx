/**
 * The fast track's gas step, after the readout, at the readout's stage. It
 * reads the recovery entry of the account in the URL for the account that
 * receives control, finds the key that sends the recovery (that account
 * itself, the slot's basic account, whose key the recovery installs), and
 * runs the submission's gas check on it. A key that holds enough skips the
 * step; otherwise the deposit step waits for the funds and moves on to the
 * checklist by itself once they arrive.
 *
 * With no entry for the account the holder goes back to the account step,
 * and so does Back where no key in this wallet can send the recovery; Back
 * elsewhere returns to the readout. An entry on the logged-in route has no
 * gas step here: its check runs at the submission, so the holder goes
 * straight on to the checklist.
 */
import React, { useEffect, useMemo, useState } from 'react'

import useNavigation from '@common/hooks/useNavigation'
import useAccountsControllerState from '@web/hooks/useAccountsControllerState'
import useKeystoreControllerState from '@web/hooks/useKeystoreControllerState'
import useNetworksControllerState from '@web/hooks/useNetworksControllerState'
import useSelectedAccountControllerState from '@web/hooks/useSelectedAccountControllerState'
import { CHAIN_NAMES } from '@web/modules/social-recovery/recovery/entry'
import RecoveryChrome from '@web/modules/social-recovery/shared/chrome/RecoveryChrome'
import {
  CHAIN_IDS,
  seedBasicAccountOf,
  networkOf,
  WALLET_RECOVERY_CHAIN
} from '@web/modules/social-recovery/shared/client'
import {
  createWalletRecords,
  extensionRecordStorage
} from '@web/modules/social-recovery/shared/records'

import { ACKNOWLEDGED_STATE, FRESH_INSTALL_ROUTE, GAS_STAGE } from './constants'
import GasStepView from './GasStepView'
import {
  accountParamOf,
  accountStepPathOf,
  checklistPathOf,
  readoutPathOf,
  selectedBasicAccountOf
} from './navigation'
import type { EntryReading, GasStepState } from './types'
import useSubmissionGas from './useSubmissionGas'

const GasStepScreen = () => {
  const { navigate, searchParams } = useNavigation()
  const account = accountParamOf(searchParams)
  const records = useMemo(() => createWalletRecords({ storage: extensionRecordStorage }), [])
  const { accounts } = useAccountsControllerState()
  const { keys } = useKeystoreControllerState()
  const { networks } = useNetworksControllerState()
  const { account: selected } = useSelectedAccountControllerState()

  const [entry, setEntry] = useState<EntryReading>({ status: 'loading' })
  const [entryRun, setEntryRun] = useState(0)

  useEffect(() => {
    if (!account) {
      return undefined
    }
    let live = true
    setEntry({ status: 'loading' })
    records
      .recoveryEntry(CHAIN_IDS[WALLET_RECOVERY_CHAIN], account)
      .read()
      .then((read) => {
        if (live) {
          setEntry(read.status === 'present' ? { status: 'present', entry: read.value } : read)
        }
      })
      .catch(() => {
        if (live) {
          setEntry({ status: 'failed' })
        }
      })
    return () => {
      live = false
    }
  }, [records, account, entryRun])

  const present = entry.status === 'present' ? entry.entry : null
  const freshInstall = present?.route === FRESH_INSTALL_ROUTE

  const sendingKey =
    !present || !freshInstall || !accounts
      ? undefined
      : seedBasicAccountOf(present.receivingAccount, accounts, keys ?? [])
  const network = networks ? networkOf(networks, WALLET_RECOVERY_CHAIN) ?? null : undefined
  const gas = useSubmissionGas(sendingKey, network)

  const away =
    !account || entry.status === 'absent'
      ? accountStepPathOf(selectedBasicAccountOf(selected))
      : present && (!freshInstall || gas.state.kind === 'enough')
      ? checklistPathOf(present.account)
      : null

  useEffect(() => {
    if (away) {
      navigate(away, { replace: true })
    }
  }, [away, navigate])

  const state: GasStepState =
    entry.status === 'failed'
      ? { kind: 'failed' }
      : sendingKey === null
      ? { kind: 'noSendingKey' }
      : entry.status === 'present' && freshInstall
      ? gas.state
      : { kind: 'loading' }
  const retry = entry.status === 'failed' ? () => setEntryRun((run) => run + 1) : gas.retry
  const back = () => {
    if (account) {
      navigate(readoutPathOf(account))
    }
  }
  const backToAccount = () =>
    navigate(accountStepPathOf(present?.receivingAccount), {
      replace: true,
      state: ACKNOWLEDGED_STATE
    })

  return (
    <RecoveryChrome
      route={FRESH_INSTALL_ROUTE}
      titleKey="socialRecovery.routes.recover"
      stage={{ step: GAS_STAGE, testID: 'recovery-stage' }}
      testID="fast-track-gas-screen"
    >
      <GasStepView
        state={state}
        account={account}
        networkName={network?.name ?? CHAIN_NAMES[WALLET_RECOVERY_CHAIN]}
        onRetry={retry}
        onBack={back}
        onBackToAccount={backToAccount}
      />
    </RecoveryChrome>
  )
}

export default React.memo(GasStepScreen)
