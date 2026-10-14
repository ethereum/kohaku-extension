/**
 * The account step's route, shared by both routes into a recovery: the chrome
 * the route draws, the recovery client for the account being looked up, the
 * wallet's own name resolver, and the key a recovery installs, the receiving
 * account's own key. A search that names no route, no receiving account, or
 * an account whose key the wallet does not hold sends the holder back to the
 * route's entry. A holder who did not acknowledge the warning on the screen
 * before, as on a direct URL, meets the condensed warning first.
 */
import React, { useCallback, useEffect, useMemo, useState } from 'react'
import { useLocation } from 'react-router-dom'

import { resolveENSDomain } from '@ambire-common/services/ensDomains'
import type { MinNetworkConfig } from '@ambire-common/services/provider'
import useNavigation from '@common/hooks/useNavigation'
import useAccountsControllerState from '@web/hooks/useAccountsControllerState'
import useBackgroundService from '@web/hooks/useBackgroundService'
import useKeystoreControllerState from '@web/hooks/useKeystoreControllerState'
import useNetworksControllerState from '@web/hooks/useNetworksControllerState'
import { routeEntryPathOf } from '@web/modules/social-recovery/recovery/checklist/search'
import RecoveryChrome from '@web/modules/social-recovery/shared/chrome/RecoveryChrome'
import {
  CHAIN_IDS,
  networkOf,
  WALLET_RECOVERY_CHAIN
} from '@web/modules/social-recovery/shared/client'
import { useRecoveryClient } from '@web/modules/social-recovery/shared/client/useRecoveryClient'
import {
  createWalletRecords,
  extensionRecordStorage
} from '@web/modules/social-recovery/shared/records'
import { getRpcProviderForUI } from '@web/services/provider'

import AccountStepView from './AccountStepView'
import CondensedGate from './CondensedGate'
import { ACCOUNT_STAGE, CHAIN_NAMES } from './constants'
import { choiceFor, receivingChoicesOf } from './receiving'
import { acknowledgedInState, parseAccountStepSearch, routeOfSearch } from './search'
import type { EntryClient, LookupTarget } from './types'

const AccountStepScreen = () => {
  const { navigate } = useNavigation()
  const location = useLocation()
  const { dispatch } = useBackgroundService()
  const { accounts } = useAccountsControllerState()
  const { keys } = useKeystoreControllerState()
  const { networks } = useNetworksControllerState()

  const records = useMemo(() => createWalletRecords({ storage: extensionRecordStorage }), [])
  const search = useMemo(() => parseAccountStepSearch(location.search), [location.search])
  const route = search?.route ?? routeOfSearch(location.search) ?? 'logged-in'

  const loaded = !!accounts && !!keys
  const receiving = useMemo(
    () =>
      search && accounts && keys
        ? choiceFor(receivingChoicesOf(accounts, keys), search.receivingAccount)
        : undefined,
    [search, accounts, keys]
  )
  const unusable = !search || (loaded && !receiving)
  // The record keeps the wallet's own form of the receiving account, not the
  // casing the URL carried.
  const stepSearch = useMemo(
    () =>
      search && receiving ? { route: search.route, receivingAccount: receiving.address } : null,
    [search, receiving]
  )

  useEffect(() => {
    if (unusable) {
      navigate(routeEntryPathOf(route))
    }
  }, [unusable, route, navigate])

  // The acknowledgment travels in the navigation state of the step that
  // brought the holder here, never in storage. This mount keeps it and the
  // history entry drops it at once, so a reload, a direct URL or a new tab
  // meets the warning again.
  const fromState = acknowledgedInState(location.state)
  const [acknowledged, setAcknowledged] = useState(fromState)
  const pass = useCallback(() => setAcknowledged(true), [])

  useEffect(() => {
    if (!fromState) {
      return
    }
    setAcknowledged(true)
    navigate(`${location.pathname}${location.search}`, { replace: true })
  }, [fromState, location.pathname, location.search, navigate])

  const [target, setTarget] = useState<LookupTarget | null>(null)
  const clientState = useRecoveryClient(target?.address)
  const { status, retry } = clientState
  const kit = clientState.status === 'ready' ? clientState.client : null
  const client = useMemo<EntryClient>(() => {
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

  const networkName =
    networkOf(networks, WALLET_RECOVERY_CHAIN)?.name ?? CHAIN_NAMES[WALLET_RECOVERY_CHAIN]

  const resolveName = useCallback(
    (name: string) =>
      resolveENSDomain(name, undefined, (config: MinNetworkConfig) =>
        getRpcProviderForUI(config, dispatch)
      ),
    [dispatch]
  )

  return (
    <RecoveryChrome
      route={route}
      titleKey="socialRecovery.routes.recover"
      stage={{ step: ACCOUNT_STAGE, testID: 'recovery-stage' }}
      testID="recovery-account"
    >
      {!!search && !!receiving && !acknowledged && <CondensedGate onPass={pass} />}
      {!!stepSearch && !!receiving && acknowledged && (
        <AccountStepView
          records={records}
          chainId={CHAIN_IDS[WALLET_RECOVERY_CHAIN]}
          search={stepSearch}
          destination={receiving.key.addr}
          networkName={networkName}
          target={target}
          onTarget={setTarget}
          client={client}
          resolveName={resolveName}
          navigate={navigate}
        />
      )}
    </RecoveryChrome>
  )
}

export default React.memo(AccountStepScreen)
