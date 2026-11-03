/**
 * The report of the ceremony this tab returned from. It is read, and removed
 * only by a row still on the page, which then applies it, wipes its request
 * and drops the id from the search, so a reload waits for nothing. A report
 * read by a row that left the page survives, and the next mount applies it
 * once. A report that lands after the mount arrives through the listener.
 * The stored request gives back what the row forgot when it left the page.
 */
import { useCallback, useEffect, useRef, useState } from 'react'

import {
  ceremonyResultKey,
  listenForCeremonyReport,
  readCeremonyReport
} from '@web/modules/social-recovery/shared/ceremony'
import type { CeremonyReport, ReportIdentity } from '@web/modules/social-recovery/shared/ceremony'

import { enrollPathOf } from './search'
import type { RowReport, RowReportInput } from './types'

const useRowReport = <A extends { call: 'enroll' | 'testAccess' }>({
  records,
  navigate,
  search,
  deps,
  slug,
  askedOf,
  onAsked,
  onReport
}: RowReportInput<A>): RowReport<A> => {
  const [undelivered, setUndelivered] = useState(false)
  const [stale, setStale] = useState<A | null>(null)

  const handlers = useRef({ askedOf, onAsked, onReport })
  handlers.current = { askedOf, onAsked, onReport }

  const taking = useRef<string | null>(null)
  const stopListening = useRef<(() => void) | undefined>()
  const ceremonyId = search.ceremony
  useEffect(() => {
    if (!ceremonyId || taking.current === ceremonyId) {
      return undefined
    }
    taking.current = ceremonyId
    let live = true
    let handled = false
    const done = (report: CeremonyReport, asked: A) => {
      handled = true
      records
        .ceremonyRequest(ceremonyId)
        .wipe()
        .catch(() => undefined)
      setUndelivered(false)
      setStale(null)
      handlers.current.onReport(report, asked)
      navigate(enrollPathOf(search), { replace: true })
    }
    // A row that left the page while a read was pending acts on nothing it
    // reads afterwards: its request stays, and it navigates nowhere.
    const take = async () => {
      // A request this row did not store stays where it is for its own row.
      const stored = await records.ceremonyRequest(ceremonyId).read()
      if (!live) {
        return
      }
      const asked = stored.status === 'present' ? handlers.current.askedOf(stored.value) : null
      if (!asked) {
        navigate(enrollPathOf(search), { replace: true })
        return
      }
      handlers.current.onAsked?.(asked)
      const identity: ReportIdentity = { id: ceremonyId, call: asked.call, method: slug }
      const report = await readCeremonyReport(identity, deps.reportStore, deps.now())
      if (!live) {
        return
      }
      if (report) {
        deps.reportStore.remove(ceremonyResultKey(ceremonyId)).catch(() => undefined)
        done(report, asked)
        return
      }
      setUndelivered(true)
      setStale(asked)
      stopListening.current = listenForCeremonyReport(
        identity,
        deps.reportSubscribe,
        deps.reportStore,
        (late) => done(late, asked),
        deps.now
      )
    }
    take().catch(() => {
      if (live) {
        setUndelivered(true)
      }
    })
    return () => {
      live = false
      // A run stopped before it handled the report leaves it for the next mount.
      if (!handled) {
        taking.current = null
      }
      stopListening.current?.()
      stopListening.current = undefined
    }
    // The search's slot is fixed for this row; only a new ceremony id runs this again.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ceremonyId])

  // A report that never came back: the stale request goes, the search drops
  // its id, and the same ceremony runs again under a new one.
  const retryWith = useCallback(
    async (rerun: (asked: A) => Promise<void>) => {
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

export default useRowReport
