/**
 * The passkey rows' claim ceremony. A claim stores its request before the
 * tab leaves for the ceremony tab, and the return path carries the request's
 * id back. The report is read and left in place, so a passed claim survives a
 * reload until its reply is added. A report that lands after the mount
 * arrives through the subscription. A claim that did not pass loses its
 * request, its report and its id at once; a passed claim waits as `pending`,
 * its request, report and id kept, until the checklist adds its reply to the
 * live session or the session is abandoned. Once the session is wiped, every
 * claim this checklist knows of loses its request and its report, a report
 * that lands after the wipe included, and so does every claim of the account
 * stored for the request that died, one this tab never saw included. No
 * outcome and no undelivered claim outlives the wipe. A landed session leaves
 * no claim behind in the same way.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'

import type { ApproverRequest } from '@web/modules/social-recovery/sdk-interfaces'
import {
  ceremonyPath,
  ceremonyResultKey,
  isCeremonyReport,
  isReportFor,
  readCeremonyReport
} from '@web/modules/social-recovery/shared/ceremony'
import type {
  CeremonyOutcome,
  CeremonyReport,
  ReportIdentity
} from '@web/modules/social-recovery/shared/ceremony'

import {
  ceremonyRequestIdOf,
  claimAskedOf,
  claimOfDeadRequest,
  claimReplyOf,
  claimRequestRecordOf
} from './claim'
import { PASSKEY_SLUG } from './constants'
import { checklistPathOf } from './search'
import type {
  ClaimAsked,
  ClaimOutcome,
  ClaimReply,
  DeadRequest,
  PasskeyClaim,
  PasskeyClaimInput
} from './types'

const usePasskeyClaim = ({
  records,
  chainId,
  account,
  search,
  navigate,
  deps
}: PasskeyClaimInput): PasskeyClaim => {
  const [outcomes, setOutcomes] = useState<Partial<Record<number, ClaimOutcome>>>({})
  const [pending, setPending] = useState<ClaimReply | null>(null)
  const [undelivered, setUndelivered] = useState<ClaimAsked | null>(null)
  const [launchFailed, setLaunchFailed] = useState(false)
  const [busy, setBusy] = useState(false)
  const [launching, setLaunching] = useState<number | null>(null)

  const taking = useRef<string | null>(null)
  const stopListening = useRef<(() => void) | undefined>()
  // The claims a wipe or a landing removed: a report of one that arrives
  // later is removed in turn and changes nothing on the checklist.
  const forgotten = useRef(new Set<string>())

  const launch = useCallback(
    async (request: ApproverRequest, handOff: boolean) => {
      const id = deps.newRequestId()
      setBusy(true)
      setLaunchFailed(false)
      setLaunching(request.place)
      try {
        await records
          .ceremonyRequest(id)
          .write(claimRequestRecordOf({ account, chainId, request, handOff }))
      } catch {
        setLaunchFailed(true)
        setLaunching(null)
        setBusy(false)
        return
      }
      navigate(
        ceremonyPath({
          call: 'createClaim',
          method: PASSKEY_SLUG,
          id,
          handOff,
          returnTo: checklistPathOf(account, id)
        })
      )
    },
    [deps, records, account, chainId, navigate]
  )

  /**
   * A settled claim's request and report go; the search drops its id unless
   * the tab is leaving the checklist.
   */
  const forget = (id: string, leaving = false) => {
    records
      .ceremonyRequest(id)
      .wipe()
      .catch(() => undefined)
    deps.reportStore.remove(ceremonyResultKey(id)).catch(() => undefined)
    if (!leaving) {
      navigate(checklistPathOf(account), { replace: true })
    }
  }

  const ceremonyId = search.ceremony
  useEffect(() => {
    if (!ceremonyId || taking.current === ceremonyId) {
      return undefined
    }
    taking.current = ceremonyId
    let live = true
    const done = (report: CeremonyReport, asked: ClaimAsked) => {
      if (forgotten.current.has(ceremonyId)) {
        forget(ceremonyId, true)
        return
      }
      setUndelivered(null)
      const { outcome } = report
      setOutcomes((held) => ({ ...held, [asked.place]: { outcome, handOff: asked.handOff } }))
      if (outcome.kind === 'verdict' && outcome.verdict === 'passed') {
        const passed = claimReplyOf(outcome.value)
        if (passed) {
          setPending({ place: asked.place, id: ceremonyId, ...passed })
          return
        }
      }
      forget(ceremonyId)
    }
    const take = async () => {
      const stored = await records.ceremonyRequest(ceremonyId).read()
      if (!live) {
        return
      }
      const asked =
        stored.status === 'present' ? claimAskedOf(stored.value, { account, chainId }) : null
      if (!asked) {
        // A request that is gone leaves no report behind; a request of another
        // account or network keeps that one's report.
        if (stored.status === 'absent') {
          deps.reportStore.remove(ceremonyResultKey(ceremonyId)).catch(() => undefined)
        }
        navigate(checklistPathOf(account), { replace: true })
        return
      }
      const identity: ReportIdentity = { id: ceremonyId, call: 'createClaim', method: PASSKEY_SLUG }
      const report = await readCeremonyReport(identity, deps.reportStore, deps.now())
      if (!live) {
        return
      }
      if (report) {
        done(report, asked)
        return
      }
      if (!forgotten.current.has(ceremonyId)) {
        setUndelivered(asked)
      }
      if (!live) {
        return
      }
      stopListening.current = deps.reportSubscribe(ceremonyResultKey(ceremonyId), (late) => {
        if (isCeremonyReport(late) && isReportFor(late, identity, deps.now())) {
          stopListening.current?.()
          stopListening.current = undefined
          done(late, asked)
        }
      })
    }
    take().catch(() => undefined)
    return () => {
      live = false
      taking.current = null
      stopListening.current?.()
      stopListening.current = undefined
    }
    // Only a new ceremony id runs this again.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ceremonyId])

  const settle = useCallback(
    (place: number, refusal?: CeremonyOutcome<unknown>) => {
      if (pending && pending.place === place) {
        forget(pending.id)
      }
      setPending((held) => (held && held.place === place ? null : held))
      if (refusal) {
        setOutcomes((held) => ({
          ...held,
          [place]: { outcome: refusal, handOff: held[place]?.handOff ?? false }
        }))
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [pending]
  )

  // A report that never came back: the stale request goes, the search drops
  // its id, and the same claim runs again under a new one.
  const retryUndelivered = useCallback(async () => {
    if (!undelivered || !ceremonyId) {
      return
    }
    stopListening.current?.()
    stopListening.current = undefined
    await records
      .ceremonyRequest(ceremonyId)
      .wipe()
      .catch(() => undefined)
    const asked = undelivered
    setUndelivered(null)
    await launch(asked.request, asked.handOff)
  }, [undelivered, ceremonyId, records, launch])

  // An abandoned session takes its waiting claim with it, and a claim whose
  // report has not come back stops listening and loses its request and any
  // report that already landed.
  const forgetPending = useCallback(() => {
    if (pending) {
      forget(pending.id, true)
    }
    if (undelivered && ceremonyId) {
      stopListening.current?.()
      stopListening.current = undefined
      forget(ceremonyId, true)
    }
    setPending(null)
    setUndelivered(null)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pending, undelivered, ceremonyId])

  // The stored claims of the account for the request that died, those another
  // visit of the checklist launched included.
  const forgetStored = async (died?: DeadRequest) => {
    const entries = await deps.storedEntries()
    const ids = Object.keys(entries)
      .map(ceremonyRequestIdOf)
      .filter((id): id is string => id !== null)
    await Promise.all(
      ids.map(async (id) => {
        const stored = await records.ceremonyRequest(id).read()
        if (
          stored.status === 'present' &&
          claimOfDeadRequest(stored.value, { account, chainId }, died)
        ) {
          forgotten.current.add(id)
          forget(id, true)
        }
      })
    )
  }

  // A wiped or landed session keeps no claim: the waiting one, the one the
  // search names and every stored one of the request that ended lose their
  // request and report, and no outcome and no undelivered claim stays. The
  // listener stays, so a report the ceremony tab writes later is taken and
  // removed in turn.
  const forgetAll = useCallback(
    (died?: DeadRequest) => {
      const ids = [pending?.id, ceremonyId].filter((id): id is string => typeof id === 'string')
      new Set(ids).forEach((id) => {
        forgotten.current.add(id)
        forget(id, true)
      })
      setPending(null)
      setUndelivered(null)
      setOutcomes((held) => (Object.keys(held).length > 0 ? {} : held))
      forgetStored(died).catch(() => undefined)
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [pending, ceremonyId]
  )

  const asked = useMemo(
    () =>
      new Set(
        [launching, pending?.place, undelivered?.place].filter(
          (place): place is number => typeof place === 'number'
        )
      ),
    [launching, pending, undelivered]
  )

  return {
    launch,
    outcomes,
    pending,
    settle,
    forgetPending,
    forgetAll,
    asked,
    undelivered,
    retryUndelivered,
    launchFailed,
    busy
  }
}

export default usePasskeyClaim
