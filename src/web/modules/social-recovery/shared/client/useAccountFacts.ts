/**
 * The hook that hands a screen the facts the wallet holds for one listed
 * account on the recovery chain (`accountFactsOf`), read from the accounts,
 * keystore, networks and providers controller states, so no screen reads
 * those itself.
 *
 * The wallet reads account states for some accounts only, and writes none
 * where a read fails. Where it lists the account but holds no state for it on
 * the chain, the hook asks the wallet to refresh that state, and again at each
 * `retry`. A refresh has ended when the accounts state reported its account
 * states loading after the request and then reported them no longer loading.
 * The loading flag covers every load on every chain, and a request made while
 * the chain is already loading joins that load, which may not read this
 * account; so a refresh that ends with no state is asked for once more by
 * itself, at most two requests in all for each attempt. A state still absent
 * after the second reads as `state-unread`, as does one the chain's provider
 * reports it cannot read.
 *
 * The reading stays the same object while nothing a screen reads changed
 * (`sameFactsReading`), so a refresh of another account, or of this account's
 * balance or block, renders nothing new.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'

import useAccountsControllerState from '@web/hooks/useAccountsControllerState'
import useBackgroundService from '@web/hooks/useBackgroundService'
import useKeystoreControllerState from '@web/hooks/useKeystoreControllerState'
import useNetworksControllerState from '@web/hooks/useNetworksControllerState'
import useProvidersControllerState from '@web/hooks/useProvidersControllerState'
import type { Address } from '@web/modules/social-recovery/sdk-interfaces'

import { accountFactsOf, sameFactsReading, stateRefreshOf } from './account-facts'
import { CHAIN_IDS, WALLET_RECOVERY_CHAIN } from './chains'
import type { AccountFactsReading, AccountFactsResult, StateRefreshProgress } from './types'

const REFRESH_DISPATCHES_PER_ATTEMPT = 2

export const useAccountFacts = (account: Address | undefined): AccountFactsResult => {
  const { accounts, accountStates, areAccountStatesLoading } = useAccountsControllerState()
  const { keys } = useKeystoreControllerState()
  const { networks } = useNetworksControllerState()
  const { providers } = useProvidersControllerState()
  const { dispatch } = useBackgroundService()

  const [attempt, setAttempt] = useState(0)
  const [progress, setProgress] = useState<StateRefreshProgress | undefined>()
  const refresh = stateRefreshOf(account, { accounts, accountStates, networks })
  const refreshKey = refresh ? `${refresh.addr}:${attempt}` : undefined
  const current = progress && progress.key === refreshKey ? progress : undefined

  useEffect(() => {
    if (!refresh || !refreshKey || current) {
      return
    }
    setProgress({ key: refreshKey, phase: 'requested', dispatches: 1 })
    dispatch({ type: 'ACCOUNTS_CONTROLLER_UPDATE_ACCOUNT_STATE', params: refresh })
  }, [refresh, refreshKey, current, dispatch])

  useEffect(() => {
    if (current?.phase === 'requested' && areAccountStatesLoading) {
      setProgress({ ...current, phase: 'running' })
    } else if (current?.phase === 'running' && !areAccountStatesLoading) {
      if (refresh && current.dispatches < REFRESH_DISPATCHES_PER_ATTEMPT) {
        setProgress({ ...current, phase: 'requested', dispatches: current.dispatches + 1 })
        dispatch({ type: 'ACCOUNTS_CONTROLLER_UPDATE_ACCOUNT_STATE', params: refresh })
      } else {
        setProgress({ ...current, phase: 'settled' })
      }
    }
  }, [current, areAccountStatesLoading, refresh, dispatch])

  const providerWorking = providers?.[String(CHAIN_IDS[WALLET_RECOVERY_CHAIN])]?.isWorking
  const next = accountFactsOf(account, {
    accounts,
    accountStates,
    keys,
    networks,
    providerWorking,
    stateRefreshSettled: current?.phase === 'settled'
  })
  const held = useRef<AccountFactsReading>(next)
  if (!sameFactsReading(held.current, next)) {
    held.current = next
  }
  const reading = held.current

  const retry = useCallback(() => setAttempt((count) => count + 1), [])
  return useMemo(() => ({ ...reading, retry }), [reading, retry])
}
