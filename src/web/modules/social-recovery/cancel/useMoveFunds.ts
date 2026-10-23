/**
 * Moving funds: the wallet's transfer screen sends from the selected account,
 * so the page selects the account through the wallet's own select action, as
 * the holder's account switch does, and opens the transfer screen once the
 * wallet reports the selection, within a bounded wait. The action reads busy
 * while it waits; a selection the wallet does not report in time opens
 * nothing, is logged, and the action can be pressed again.
 */
import { useCallback, useEffect, useRef, useState } from 'react'

import useNavigation from '@common/hooks/useNavigation'
import { WEB_ROUTES } from '@common/modules/router/constants/common'
import useBackgroundService from '@web/hooks/useBackgroundService'
import useSelectedAccountControllerState from '@web/hooks/useSelectedAccountControllerState'
import type { Address } from '@kohaku-eth/social-recovery'
import { sameAddress } from '@web/modules/social-recovery/shared/client'

import { SELECT_ACCOUNT_LIMIT_MS } from './constants'
import type { MoveFunds, MoveFundsWaiting } from './types'

export const useMoveFunds = (account: Address | null): MoveFunds => {
  const { navigate } = useNavigation()
  const { dispatch } = useBackgroundService()
  const { account: selected } = useSelectedAccountControllerState()
  const selectedAddr = selected?.addr
  const selectedRef = useRef(selectedAddr)
  selectedRef.current = selectedAddr
  const waiting = useRef<MoveFundsWaiting | null>(null)
  const [busy, setBusy] = useState(false)

  const open = useCallback(() => {
    if (waiting.current) {
      clearTimeout(waiting.current.timer)
      waiting.current = null
    }
    setBusy(false)
    navigate(`/${WEB_ROUTES.transfer}`)
  }, [navigate])

  useEffect(() => {
    const held = waiting.current
    if (held && selectedAddr && sameAddress(selectedAddr, held.account)) {
      open()
    }
  }, [selectedAddr, open])

  useEffect(
    () => () => {
      if (waiting.current) {
        clearTimeout(waiting.current.timer)
      }
    },
    []
  )

  const move = useCallback(() => {
    if (!account || waiting.current) {
      return
    }
    if (selectedRef.current && sameAddress(selectedRef.current, account)) {
      open()
      return
    }
    setBusy(true)
    waiting.current = {
      account,
      timer: setTimeout(() => {
        waiting.current = null
        setBusy(false)
        // eslint-disable-next-line no-console
        console.error(
          `The wallet did not select ${account} within ${SELECT_ACCOUNT_LIMIT_MS} ms, so the transfer screen did not open.`
        )
      }, SELECT_ACCOUNT_LIMIT_MS)
    }
    dispatch({ type: 'MAIN_CONTROLLER_SELECT_ACCOUNT', params: { accountAddr: account } })
  }, [account, dispatch, open])

  return { move, busy }
}
