/**
 * The report of the ceremony this tab returned from. It is taken once, then
 * its request is wiped and the search loses the id, so a reload waits for
 * nothing. A report that lands after the mount arrives through the listener.
 * The stored request gives back what the row forgot when it left the page.
 */
import { useCallback, useEffect, useRef, useState } from 'react'

import {
  listenForCeremonyReport,
  takeCeremonyReport
} from '@web/modules/social-recovery/shared/ceremony'
import type { CeremonyReport, ReportIdentity } from '@web/modules/social-recovery/shared/ceremony'

import { passkeyRequestOf, PASSKEY_SLUG } from './passkey'
import { enrollPathOf } from './search'
import type { PasskeyCeremonyRequest, PasskeyReport, PasskeyReportInput } from './types'

const usePasskeyReport = ({
  records,
  navigate,
  search,
  account,
  chainId,
  book,
  deps,
  onAsked,
  onReport
}: PasskeyReportInput): PasskeyReport => {
  const [undelivered, setUndelivered] = useState(false)
  const [stale, setStale] = useState<PasskeyCeremonyRequest | null>(null)

  const handlers = useRef({ onAsked, onReport })
  handlers.current = { onAsked, onReport }

  const taking = useRef<string | null>(null)
  const stopListening = useRef<(() => void) | undefined>()
  const ceremonyId = search.ceremony
  useEffect(() => {
    if (!ceremonyId || taking.current === ceremonyId) {
      return undefined
    }
    taking.current = ceremonyId
    let live = true
    const done = (report: CeremonyReport, asked: PasskeyCeremonyRequest) => {
      records
        .ceremonyRequest(ceremonyId)
        .wipe()
        .catch(() => undefined)
      setUndelivered(false)
      setStale(null)
      handlers.current.onReport(report, asked)
      navigate(enrollPathOf(search), { replace: true })
    }
    const take = async () => {
      // A request this row did not store stays where it is for its own row.
      const stored = await records.ceremonyRequest(ceremonyId).read()
      const asked =
        stored.status === 'present'
          ? passkeyRequestOf(stored.value, {
              account,
              chainId,
              methodAddress: book.methods.passkey
            })
          : null
      if (!asked) {
        navigate(enrollPathOf(search), { replace: true })
        return
      }
      handlers.current.onAsked(asked)
      const identity: ReportIdentity = { id: ceremonyId, call: asked.call, method: PASSKEY_SLUG }
      const report = await takeCeremonyReport(identity, deps.reportStore, deps.now())
      if (report) {
        done(report, asked)
        return
      }
      setUndelivered(true)
      setStale(asked)
      if (!live) {
        return
      }
      stopListening.current = listenForCeremonyReport(
        identity,
        deps.reportSubscribe,
        deps.reportStore,
        (late) => done(late, asked),
        deps.now
      )
    }
    take().catch(() => setUndelivered(true))
    return () => {
      live = false
      stopListening.current?.()
      stopListening.current = undefined
    }
    // The search's slot is fixed for this row; only a new ceremony id runs this again.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ceremonyId])

  // A report that never came back: the stale request goes, the search drops
  // its id, and the same ceremony runs again under a new one.
  const retryWith = useCallback(
    async (rerun: (asked: PasskeyCeremonyRequest) => Promise<void>) => {
      if (!stale || !ceremonyId) {
        return
      }
      stopListening.current?.()
      stopListening.current = undefined
      await records
        .ceremonyRequest(ceremonyId)
        .wipe()
        .catch(() => undefined)
      setUndelivered(false)
      setStale(null)
      navigate(enrollPathOf(search), { replace: true })
      await rerun(stale)
    },
    [stale, ceremonyId, records, navigate, search]
  )

  return { undelivered, stale, retryWith }
}

export default usePasskeyReport
