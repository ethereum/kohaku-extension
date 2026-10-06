/**
 * Reads the setup records the save commits from: the draft, the enrollments
 * the trust list heads its rows with, and the password-set flag. A read that
 * fails is a failure, never an empty draft.
 */
import { useCallback, useEffect, useState } from 'react'

import type { Address } from '@web/modules/social-recovery/sdk-interfaces'
import { defaultSetupDraft } from '@web/modules/social-recovery/shared/records'
import type { ChainId, WalletRecords } from '@web/modules/social-recovery/shared/records'

import type { ArmLoad, SaveLoad } from './types'

export const useSaveLoad = (
  records: Pick<WalletRecords, 'setup'>,
  chainId: ChainId,
  account: Address
): SaveLoad => {
  const [load, setLoad] = useState<ArmLoad>({ status: 'loading' })
  const [attempt, setAttempt] = useState(0)

  useEffect(() => {
    let live = true
    const setup = records.setup(chainId, account)
    setLoad({ status: 'loading' })
    Promise.all([setup.setupDraft.read(), setup.enrollments.read(), setup.passwordSet.read()])
      .then(([draft, enrollments, passwordSet]) => {
        if (live) {
          setLoad({
            status: 'loaded',
            draft: draft.status === 'present' ? draft.value : defaultSetupDraft(),
            enrollments: enrollments.status === 'present' ? enrollments.value : [],
            passwordSet: passwordSet.status === 'present'
          })
        }
      })
      .catch(() => {
        if (live) {
          setLoad({ status: 'failed' })
        }
      })
    return () => {
      live = false
    }
  }, [records, chainId, account, attempt])

  const retry = useCallback(() => setAttempt((count) => count + 1), [])
  return { load, retry }
}
