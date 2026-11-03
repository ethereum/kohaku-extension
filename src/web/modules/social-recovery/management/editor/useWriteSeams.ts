/**
 * The seams the editor's writes run through, from the wallet's own states:
 * the request queue port over the background's dispatch, read through refs so
 * a state push never rebuilds the port, and the send port, which sends again a
 * request a hidden tab could not send once the tab is shown.
 */
import { useMemo, useRef } from 'react'

import useAccountsControllerState from '@web/hooks/useAccountsControllerState'
import useBackgroundService from '@web/hooks/useBackgroundService'
import useRequestsControllerState from '@web/hooks/useRequestsControllerState'
import useSelectedAccountControllerState from '@web/hooks/useSelectedAccountControllerState'
import { createSendPort, sendRequestPort } from '@web/modules/social-recovery/shared/client'
import type { HeldRequestQueue, ListedAccount } from '@web/modules/social-recovery/shared/client'
import type { ChainId } from '@web/modules/social-recovery/shared/records'

import type { WriteSeams } from './types'

export const useWriteSeams = (chainId: ChainId): WriteSeams => {
  const { accounts } = useAccountsControllerState()
  const { dispatch, windowId } = useBackgroundService()
  const queue = useRequestsControllerState()
  const { account: selectedAccount } = useSelectedAccountControllerState()

  const accountsRef = useRef<readonly ListedAccount[] | undefined>(accounts)
  accountsRef.current = accounts
  const queueRef = useRef<HeldRequestQueue | undefined>(queue)
  queueRef.current = queue
  const selectedRef = useRef<string | undefined>(selectedAccount?.addr)
  selectedRef.current = selectedAccount?.addr

  const requests = useMemo(
    () =>
      sendRequestPort(
        dispatch,
        () => accountsRef.current,
        () => queueRef.current,
        () => selectedRef.current,
        windowId
      ),
    [dispatch, windowId]
  )
  const port = useMemo(
    () => createSendPort(requests, { chainId, visibility: document }),
    [requests, chainId]
  )
  return useMemo(() => ({ requests, port }), [requests, port])
}
