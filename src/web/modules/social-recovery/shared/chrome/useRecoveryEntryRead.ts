/**
 * The recovery entry record of the account a recovery screen names: loading,
 * failed with a retry, or present with the account it was read for. A screen
 * with no account, or an account with no entry record, leaves through
 * `onAbsent`.
 */
import { useCallback, useEffect, useState } from 'react'

import type { Address } from '@web/modules/social-recovery/sdk-interfaces'
import type { ChainId, WalletRecords } from '@web/modules/social-recovery/shared/records'

import type { RecoveryEntryRead, RecoveryEntryReading } from './types'

const useRecoveryEntryRead = (
  records: WalletRecords,
  chainId: ChainId,
  account: Address | undefined,
  onAbsent: () => void
): RecoveryEntryRead => {
  const [reading, setReading] = useState<RecoveryEntryReading>({ status: 'loading' })
  const [attempt, setAttempt] = useState(0)

  useEffect(() => {
    if (!account) {
      onAbsent()
      return undefined
    }
    let live = true
    setReading({ status: 'loading' })
    records
      .recoveryEntry(chainId, account)
      .read()
      .then((read) => {
        if (!live) {
          return
        }
        if (read.status === 'absent') {
          setReading({ status: 'absent' })
          onAbsent()
          return
        }
        setReading({ status: 'present', account, entry: read.value })
      })
      .catch(() => {
        if (live) {
          setReading({ status: 'failed' })
        }
      })
    return () => {
      live = false
    }
  }, [records, chainId, account, attempt, onAbsent])

  const retry = useCallback(() => setAttempt((n) => n + 1), [])

  return { reading, retry }
}

export default useRecoveryEntryRead
