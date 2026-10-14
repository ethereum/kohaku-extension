/**
 * The add of the recovered account to this wallet, on both routes, through
 * the wallet's own action for an account the screen builds, with the key the
 * recovery granted as its signer. It dispatches once per run, once the
 * consume event names the granted key and the wallet pushed its accounts; it
 * reads done once the wallet lists the account with that key, and failed
 * where the accounts controller reports an error after the add started, or
 * where the account is not listed with the key within the limit of the add's
 * start. Before it builds the account, the add is kept in a pending entry by
 * chain, account and granted key that outlives the screen; a new mount that
 * finds the entry dispatches nothing and follows that add to done, failed or
 * a retry, and the entry goes once the add ends. A reload or a second tab
 * does not see the entry and dispatches again, and the wallet merges that add
 * into the listed account. A retry dispatches once and keeps a new entry. An
 * account the wallet already lists with the key is done with no dispatch; one
 * it lists without the key is added again, and the wallet merges the key into
 * it. Where the add may not dispatch, it reads done only once the wallet
 * lists the account with the key, and adds nothing. On the fast track, once
 * done, it marks the wallet's setup complete, as the end of the create door's
 * onboarding does, since the fast track never reaches that screen.
 */
import { useCallback, useEffect, useRef, useState } from 'react'

import useAccountsControllerState from '@web/hooks/useAccountsControllerState'
import useBackgroundService from '@web/hooks/useBackgroundService'
import type { Address } from '@web/modules/social-recovery/sdk-interfaces'

import { listsWithKey, recoveredAccountOf } from './account'
import { ADD_LIMIT_MS } from './constants'
import type { AddHook, AddInput, AddState, PendingAdd } from './types'

const pendingAdds = new Map<string, PendingAdd>()

const pendingKeyOf = (chainId: number, account: Address, granted: Address) =>
  `${chainId}:${account.toLowerCase()}:${granted.toLowerCase()}`

const endPending = (key: string, pending: PendingAdd) => {
  if (pendingAdds.get(key) === pending) {
    pendingAdds.delete(key)
  }
}

const failedIfAdding = (current: AddState): AddState =>
  current.status === 'adding' ? { status: 'failed' } : current

const useRecoveredAccountAdd = ({
  completesSetup,
  dispatches,
  chainId,
  account,
  event
}: AddInput): AddHook => {
  const { dispatch } = useBackgroundService()
  const { accounts, statuses } = useAccountsControllerState()
  const [run, setRun] = useState(0)
  const [state, setState] = useState<AddState>({ status: 'adding' })
  const [pending, setPending] = useState<PendingAdd | null>(null)
  const handled = useRef<number | null>(null)
  const completed = useRef(false)

  const granted = event?.granted
  const key = granted ? pendingKeyOf(chainId, account, granted) : null
  const listed = !!granted && listsWithKey(accounts, account, granted)
  const accountsRef = useRef(accounts)
  accountsRef.current = accounts
  const accountsReady = !!accounts

  useEffect(() => {
    if (!listed || !key) {
      return
    }
    const creation = pending?.creation ?? pendingAdds.get(key)?.creation
    if (pending) {
      endPending(key, pending)
    }
    setState({ status: 'done', ...(creation ? { creation } : {}) })
  }, [listed, key, pending])

  useEffect(() => {
    const existing = accountsRef.current
    // The wallet's accounts can go and come back while one add runs: that run is not sent again.
    if (!dispatches || listed || !event || !key || !existing || handled.current === run) {
      return
    }
    handled.current = run
    setState({ status: 'adding' })
    const running = pendingAdds.get(key)
    if (run === 0 && running) {
      setPending(running)
      return
    }
    const started: PendingAdd = { startedAt: Date.now() }
    pendingAdds.set(key, started)
    setPending(started)
    // Once built, the account is added even where this screen has gone meanwhile.
    recoveredAccountOf({
      account,
      granted: event.granted,
      removed: event.removed,
      ...(event.removedPrivilege ? { removedPrivilege: event.removedPrivilege } : {}),
      existing: [...existing]
    })
      .then((built) => {
        started.creation = built.creation
        dispatch({
          type: 'MAIN_CONTROLLER_ADD_VIEW_ONLY_ACCOUNTS',
          params: { accounts: [built.account] }
        })
      })
      .catch(() => {
        endPending(key, started)
        setState(failedIfAdding)
      })
  }, [dispatches, listed, event, key, run, account, dispatch, accountsReady])

  const adding = dispatches && state.status === 'adding' && !listed
  useEffect(() => {
    if (!adding || !pending || !key) {
      return undefined
    }
    const limit = setTimeout(() => {
      endPending(key, pending)
      setState(failedIfAdding)
    }, Math.max(0, pending.startedAt + ADD_LIMIT_MS - Date.now()))
    return () => clearTimeout(limit)
  }, [adding, pending, key])

  // Only an error that arrives while this screen sends or follows the add is its failure.
  const addStatus = statuses?.addAccounts
  const lastStatus = useRef(addStatus)
  useEffect(() => {
    const previous = lastStatus.current
    lastStatus.current = addStatus
    const errorArrived = addStatus === 'ERROR' && previous !== 'ERROR'
    if (!dispatches || !pending || !key || listed || !errorArrived) {
      return
    }
    endPending(key, pending)
    setState(failedIfAdding)
  }, [addStatus, listed, dispatches, pending, key])

  useEffect(() => {
    if (state.status === 'done' && completesSetup && !completed.current) {
      completed.current = true
      dispatch({ type: 'SET_IS_SETUP_COMPLETE', params: { isSetupComplete: true } })
    }
  }, [state.status, completesSetup, dispatch])

  const retry = useCallback(() => setRun((n) => n + 1), [])

  return { state, retry }
}

export default useRecoveredAccountAdd
