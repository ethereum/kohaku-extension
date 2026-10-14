/**
 * The readout's route, `?account=<the account being recovered>`: the recovery
 * entry record names the route the holder came by and the account that
 * receives control, so the screen reads it first and draws the route's chrome.
 * A search that names no account, or an account with no entry, sends the
 * holder to the account step. The recovery client is built for the account
 * being recovered, and the origin this build serves is read from the page.
 */
import React, { useCallback, useEffect, useMemo } from 'react'
import { ActivityIndicator, View } from 'react-native'
import { useLocation } from 'react-router-dom'

import { useTranslation } from '@common/config/localization'
import useNavigation from '@common/hooks/useNavigation'
import { WEB_ROUTES } from '@common/modules/router/constants/common'
import spacings from '@common/styles/spacings'
import useNetworksControllerState from '@web/hooks/useNetworksControllerState'
import { relyingPartyOf } from '@web/modules/social-recovery/shared/ceremony'
import ReadFailedBlock from '@web/modules/social-recovery/shared/chrome/ReadFailedBlock'
import RecoveryChrome from '@web/modules/social-recovery/shared/chrome/RecoveryChrome'
import {
  addressBookOf,
  CHAIN_IDS,
  networkOf,
  WALLET_RECOVERY_CHAIN
} from '@web/modules/social-recovery/shared/client'
import { useRecoveryClient } from '@web/modules/social-recovery/shared/client/useRecoveryClient'
import {
  createWalletRecords,
  extensionRecordStorage
} from '@web/modules/social-recovery/shared/records'

import { CHAIN_NAMES } from './constants'
import { READOUT_STAGE, readoutAccountOf } from './readout'
import ReadoutView from './ReadoutView'
import { accountStepPathOf } from './search'
import type { ReadoutClient, ReadoutRowContext, ReadoutStageProps } from './types'
import { useReadout, useReadoutEntry } from './useReadout'

const ReadoutStage = ({
  records,
  chainId,
  account,
  entry,
  networkName,
  context,
  navigate
}: ReadoutStageProps) => {
  const clientState = useRecoveryClient(account)
  const { status, retry } = clientState
  const kit = clientState.status === 'ready' ? clientState.client : null
  const client = useMemo<ReadoutClient>(() => {
    if (kit) {
      return { status: 'ready', client: kit }
    }
    if (status === 'loading') {
      return { status: 'loading' }
    }
    if (status === 'update-the-wallet') {
      return { status: 'update-the-wallet' }
    }
    return { status: 'failed', retry }
  }, [kit, status, retry])

  const state = useReadout({ client, records, chainId, account, entry, navigate })
  const { route, receivingAccount } = entry
  const onBack = useCallback(
    () => navigate(accountStepPathOf({ route, receivingAccount })),
    [navigate, route, receivingAccount]
  )

  return (
    <ReadoutView
      state={state}
      account={account}
      networkName={networkName}
      context={context}
      onBack={onBack}
    />
  )
}

const ReadoutScreen = () => {
  const { t } = useTranslation()
  const { navigate } = useNavigation()
  const location = useLocation()
  const { networks } = useNetworksControllerState()

  const records = useMemo(() => createWalletRecords({ storage: extensionRecordStorage }), [])
  const chainId = CHAIN_IDS[WALLET_RECOVERY_CHAIN]
  const account = useMemo(() => readoutAccountOf(location.search), [location.search])
  const { read, retry } = useReadoutEntry(records, chainId, account)

  const missing = !account || read.status === 'absent'
  useEffect(() => {
    if (missing) {
      navigate(`/${WEB_ROUTES.socialRecoveryRecoveryAccount}`)
    }
  }, [missing, navigate])

  const networkName =
    networkOf(networks, WALLET_RECOVERY_CHAIN)?.name ?? CHAIN_NAMES[WALLET_RECOVERY_CHAIN]
  const context = useMemo<ReadoutRowContext>(
    () => ({
      addressBook: addressBookOf(WALLET_RECOVERY_CHAIN),
      ownRpIdHash: relyingPartyOf(window.location).rpIdHash
    }),
    []
  )

  const entry = read.status === 'present' ? read.entry : null

  return (
    <RecoveryChrome
      route={entry?.route ?? 'fresh-install'}
      titleKey="socialRecovery.routes.recover"
      stage={{ step: READOUT_STAGE, testID: 'recovery-stage' }}
      testID="recovery-readout"
    >
      {!!account && read.status === 'pending' && (
        <View testID="readout-entry-reading">
          <ActivityIndicator style={spacings.mbSm} />
        </View>
      )}
      {!!account && read.status === 'failed' && (
        <ReadFailedBlock
          testID="readout-entry-read-failed"
          title={t('socialRecovery.readout.entryReadFailed')}
          body={t('socialRecovery.client.unavailableBody')}
          onRetry={retry}
        />
      )}
      {!!account && !!entry && (
        <ReadoutStage
          records={records}
          chainId={chainId}
          account={account}
          entry={entry}
          networkName={networkName}
          context={context}
          navigate={navigate}
        />
      )}
    </RecoveryChrome>
  )
}

export default React.memo(ReadoutScreen)
