/**
 * Runs the account's reads the review asks before the confirmation: the key a
 * recovery would remove, the fit check, the setup read and the description of
 * the draft, and runs again the ones asked for once they settled. Each read places its answer as
 * it arrives, so a slow one holds back no other. A read that throws is failed;
 * it is never read as empty.
 */
import { useCallback, useEffect, useRef, useState } from 'react'

import type { SetupDraft } from '@web/modules/social-recovery/sdk-interfaces'

import { ACCOUNT_READ_NAMES } from './constants'
import type {
  AccountRead,
  AccountReaders,
  AccountReadName,
  AccountReads,
  AccountReadsState,
  ReviewKitClient
} from './types'

const PENDING = { status: 'pending' } as const
const FAILED = { status: 'failed' } as const

const INITIAL: AccountReads = {
  removedKey: PENDING,
  fitCheck: PENDING,
  setupState: PENDING,
  description: PENDING
}

const readersOf = (client: ReviewKitClient, draft: SetupDraft): AccountReaders => ({
  removedKey: () => client.walletReads.removedKey(),
  // The wallet reads carry the account implementation of the client
  // configuration, so the check judges the code the account will carry.
  fitCheck: () => client.walletReads.fitCheck(),
  setupState: () => client.setup.setupState(),
  description: () => client.setup.describeSetup(draft)
})

export const useAccountReads = (
  client: ReviewKitClient | null,
  draft: SetupDraft | null
): AccountReadsState => {
  const [reads, setReads] = useState<AccountReads>(INITIAL)
  const readsRef = useRef<AccountReads>(INITIAL)
  readsRef.current = reads
  // Each change of the client or of the draft starts a new round; an answer
  // from an earlier round lands nowhere.
  const round = useRef(0)

  const run = useCallback(
    (names: readonly AccountReadName[], at: number) => {
      if (!client || !draft) {
        return
      }
      // A read that throws before it returns a promise reads as failed, like
      // one that rejects.
      const settle = <T>(read: () => Promise<T>, put: (value: AccountRead<T>) => void) => {
        put(PENDING)
        Promise.resolve()
          .then(read)
          .then(
            (value) => {
              if (round.current === at) {
                put({ status: 'answered', value })
              }
            },
            () => {
              if (round.current === at) {
                put(FAILED)
              }
            }
          )
      }
      const readers = readersOf(client, draft)
      names.forEach(<K extends AccountReadName>(name: K) =>
        settle(readers[name], (value) => setReads((held) => ({ ...held, [name]: value })))
      )
    },
    [client, draft]
  )

  useEffect(() => {
    round.current += 1
    const at = round.current
    setReads(INITIAL)
    run(ACCOUNT_READ_NAMES, at)
    return () => {
      round.current += 1
    }
  }, [run])

  const retry = useCallback(
    (names: readonly AccountReadName[]) => {
      const settled = names.filter((name) => readsRef.current[name].status !== 'pending')
      if (settled.length > 0) {
        run(settled, round.current)
      }
    },
    [run]
  )

  return { ...reads, retry }
}
