/**
 * Which write the account's stored write in flight belongs to: none, one of
 * the editor's two, or another screen's. It is read on mount, again each time
 * the tab comes back into view, since another tab may have stored a write
 * meanwhile, and again on the screen's ask. A read again keeps the last answer
 * until the new one, so a run built over it is not dropped while it reads. A
 * screen builds its run only over no stored write or its own, so a run never
 * follows another screen's write as its own.
 */
import { useCallback, useEffect, useState } from 'react'

import type { Address } from '@kohaku-eth/social-recovery'
import type { ChainId, WalletRecords } from '@web/modules/social-recovery/shared/records'
import { intentOfRequest } from '@web/modules/social-recovery/shared/writes'

import type { HeldWrite, HeldWriteRead } from './types'

export const useHeldWrite = (
  records: Pick<WalletRecords, 'saveInFlight'>,
  chainId: ChainId,
  account: Address
): HeldWriteRead => {
  const [held, setHeld] = useState<HeldWrite>({ status: 'pending' })
  const [round, setRound] = useState(0)

  useEffect(() => {
    let live = true
    records
      .saveInFlight(chainId, account)
      .read()
      .then(
        (read) => {
          if (!live) {
            return
          }
          if (read.status !== 'present') {
            setHeld((was) => (was.status === 'none' ? was : { status: 'none' }))
            return
          }
          const intent = intentOfRequest(read.value.requestId)
          setHeld((was) => {
            if (intent === 'manageEdit' || intent === 'manageRemove') {
              return was.status === 'held' && was.write === intent
                ? was
                : { status: 'held', write: intent }
            }
            return was.status === 'other' ? was : { status: 'other' }
          })
        },
        () => {
          if (live) {
            setHeld((was) => (was.status === 'pending' ? { status: 'failed' } : was))
          }
        }
      )
    return () => {
      live = false
    }
  }, [records, chainId, account, round])

  const refresh = useCallback(() => setRound((at) => at + 1), [])
  const retry = useCallback(() => {
    setHeld({ status: 'pending' })
    refresh()
  }, [refresh])

  useEffect(() => {
    if (typeof window === 'undefined') {
      return undefined
    }
    const onShown = () => {
      if (typeof document === 'undefined' || document.visibilityState !== 'hidden') {
        refresh()
      }
    }
    window.addEventListener('focus', onShown)
    document.addEventListener('visibilitychange', onShown)
    return () => {
      window.removeEventListener('focus', onShown)
      document.removeEventListener('visibilitychange', onShown)
    }
  }, [refresh])

  return { held, retry, refresh }
}
