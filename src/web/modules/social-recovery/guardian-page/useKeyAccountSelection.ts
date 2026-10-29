/**
 * The wallet's sign window signs for the selected account, and asks the
 * holder to switch accounts first where another one is selected. So before a
 * sign request is queued, the page selects the handle's listed account in the
 * wallet, the key's own basic account or, for a handle that names a smart
 * account, that account itself, and waits, for a bounded time, until the
 * wallet's selected-account state reports it. A handle the wallet lists as
 * neither is left to the signer, which refuses it. The wait ends early when
 * the signal aborts.
 */
import { useCallback, useEffect, useRef } from 'react'

import useSelectedAccountControllerState from '@web/hooks/useSelectedAccountControllerState'
import {
  listedBasicAccountOf,
  listedSmartAccountOf,
  sameAddress
} from '@web/modules/social-recovery/shared/client'

import { SELECT_ACCOUNT_LIMIT_MS } from './constants'
import type { KeyAccountSelectionInput, SelectKeyAccount } from './types'

const useKeyAccountSelection = ({
  dispatch,
  accounts
}: KeyAccountSelectionInput): SelectKeyAccount => {
  const { account } = useSelectedAccountControllerState()
  const selected = account?.addr
  const selectedRef = useRef(selected)
  selectedRef.current = selected
  const waiters = useRef(new Set<() => void>())
  useEffect(() => {
    waiters.current.forEach((waiter) => waiter())
  }, [selected])

  return useCallback<SelectKeyAccount>(
    (key, signal) => {
      const listedAccounts = accounts() ?? []
      const listed =
        listedBasicAccountOf(listedAccounts, key) ?? listedSmartAccountOf(listedAccounts, key.addr)
      if (!listed) {
        return Promise.resolve()
      }
      const isSelected = () =>
        !!selectedRef.current && sameAddress(selectedRef.current, listed.addr)
      if (isSelected()) {
        return Promise.resolve()
      }
      if (signal?.aborted) {
        return Promise.reject(new Error('the account selection was withdrawn'))
      }
      return new Promise<void>((resolve, reject) => {
        let cleanup = () => {}
        const end = (error: Error | null) => {
          cleanup()
          if (error) {
            reject(error)
          } else {
            resolve()
          }
        }
        const onSelected = () => {
          if (isSelected()) {
            end(null)
          }
        }
        const onAbort = () => end(new Error('the account selection was withdrawn'))
        const timer = setTimeout(
          () => end(new Error('the wallet did not select the account in time')),
          SELECT_ACCOUNT_LIMIT_MS
        )
        waiters.current.add(onSelected)
        signal?.addEventListener('abort', onAbort)
        cleanup = () => {
          waiters.current.delete(onSelected)
          signal?.removeEventListener('abort', onAbort)
          clearTimeout(timer)
        }
        dispatch({ type: 'MAIN_CONTROLLER_SELECT_ACCOUNT', params: { accountAddr: listed.addr } })
      })
    },
    [dispatch, accounts]
  )
}

export default useKeyAccountSelection
