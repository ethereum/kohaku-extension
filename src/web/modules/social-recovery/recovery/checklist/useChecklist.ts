/**
 * The checklist's session: it opens once the client is ready, reads the
 * stored session before anything renders, opens a gathering only where none
 * is stored, and writes every change under the revision it read. A change
 * another tab made first reads as a conflict to reload, never as a lost reply
 * or note. While a session is open it polls the account's recovery state,
 * assesses the gathering again after every poll that answers, and wipes the
 * session with its reason once the request dies: the deadline passed, another
 * attempt opened or the setup changed. A poll that reads the request's own
 * submission on the chain lands the session and goes on to the wait.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'

import type {
  ApproverReply,
  Assessment,
  Configuration
} from '@web/modules/social-recovery/sdk-interfaces'
import { isSessionRevisionConflict } from '@web/modules/social-recovery/shared/records'
import type {
  DirectWipeEvent,
  RowNote,
  StoredSession
} from '@web/modules/social-recovery/shared/records'

import { deadlinePassed, outcomeOf, pollTargetOf } from './poll'
import { readoutPathOf, routeEntryPathOf, waitPathOf } from './search'
import {
  configurationOf,
  gatherAgain as gatherAgainOver,
  openChecklist,
  resultOfRead
} from './session'
import type {
  AddReplyResult,
  HeldConfiguration,
  ChecklistHookInput,
  ChecklistLoad,
  ChecklistState,
  LiveChecklist,
  OpenResult,
  PollFacts
} from './types'
import usePoll from './usePoll'

const LOADING: ChecklistLoad = { phase: 'loading' }

/** The live checklist a stored write leaves, keeping the configuration it was opened over. */
const liveOf = (stored: StoredSession, configuration: Configuration): ChecklistLoad =>
  stored.value.state === 'live'
    ? {
        phase: 'live',
        session: stored.value,
        revision: stored.revision,
        savedAt: stored.savedAt,
        configuration
      }
    : LOADING

const useChecklist = ({
  records,
  chainId,
  account,
  entry,
  client,
  destination,
  navigate,
  deps
}: ChecklistHookInput): ChecklistState => {
  const [load, setLoad] = useState<ChecklistLoad>(LOADING)
  const [attempt, setAttempt] = useState(0)
  const [needsDestination, setNeedsDestination] = useState(false)
  const [busy, setBusy] = useState(false)
  const [noteFailed, setNoteFailed] = useState(false)
  const [abandonFailed, setAbandonFailed] = useState(false)
  const [gatherFailed, setGatherFailed] = useState(false)
  const [deathFailed, setDeathFailed] = useState(false)
  const [dying, setDying] = useState(false)

  const kit = client.status === 'ready' ? client.client : null
  const destinationKey = destination.status === 'ready' ? destination.key : undefined
  const destinationUnavailable = destination.status === 'unavailable'

  // Every write reads the session as it stands after the last write, never a
  // render's copy, so two changes in a row both carry the latest revision.
  const loadRef = useRef(load)
  loadRef.current = load
  const configurationRef = useRef<HeldConfiguration | null>(null)
  const destinationRef = useRef(destinationKey)
  destinationRef.current = destinationKey
  const depsRef = useRef(deps)
  depsRef.current = deps
  const navigateRef = useRef(navigate)
  navigateRef.current = navigate

  const apply = useCallback(
    (result: OpenResult, configuration: Configuration) => {
      switch (result.kind) {
        case 'live':
          setNeedsDestination(false)
          // A setup read again with the password after a commitment mismatch:
          // the rows follow the setup the chain commits.
          if (result.configuration) {
            configurationRef.current = { configuration: result.configuration, source: 'password' }
          }
          setLoad({
            phase: 'live',
            session: result.session,
            revision: result.revision,
            savedAt: result.savedAt,
            configuration: result.configuration ?? configuration
          })
          return
        case 'wiped':
          setNeedsDestination(false)
          setLoad({ phase: 'wiped', session: result.session, revision: result.revision })
          return
        case 'landed':
          navigateRef.current(waitPathOf(account), { replace: true })
          return
        case 'needs-password':
          configurationRef.current = null
          navigateRef.current(readoutPathOf(account), { replace: true })
          return
        case 'needs-destination':
        default:
          setNeedsDestination(true)
      }
    },
    [account]
  )

  // The destination key matters only while no session is stored, so it
  // starts the open again only then.
  const openKey = needsDestination ? destinationKey ?? (destinationUnavailable ? 'none' : '') : ''

  useEffect(() => {
    if (!kit) {
      return undefined
    }
    if (needsDestination && destinationUnavailable) {
      setLoad({ phase: 'failed', cause: 'destination' })
      return undefined
    }
    let live = true
    const run = async () => {
      let held = configurationRef.current
      if (!held) {
        try {
          const reading = await configurationOf({
            records,
            chainId,
            account,
            client: kit,
            password: depsRef.current.readPassword(chainId, account)
          })
          if (!live) {
            return
          }
          if (reading.kind === 'none') {
            navigateRef.current(readoutPathOf(account), { replace: true })
            return
          }
          held = { configuration: reading.configuration, source: reading.source }
          configurationRef.current = held
        } catch {
          if (live) {
            setLoad({ phase: 'failed', cause: 'setup' })
          }
          return
        }
      }
      try {
        const result = await openChecklist({
          records,
          chainId,
          account,
          client: kit,
          ...held,
          password: depsRef.current.readPassword(chainId, account),
          destination: destinationRef.current
        })
        if (live) {
          apply(result, held.configuration)
        }
      } catch {
        if (live) {
          setLoad({ phase: 'failed', cause: 'open' })
        }
      }
    }
    run().catch(() => undefined)
    return () => {
      live = false
    }
    // The open runs again on a retry, a new client, or a destination key that
    // arrives while no session is stored.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [kit, records, chainId, account, attempt, openKey])

  const retry = useCallback(() => {
    setLoad(LOADING)
    setNoteFailed(false)
    setAbandonFailed(false)
    configurationRef.current = null
    if (client.status === 'update-the-wallet' || client.status === 'failed') {
      client.retry()
    }
    if (destination.status === 'unavailable') {
      destination.retry()
    }
    setAttempt((n) => n + 1)
  }, [client, destination])

  const currentLive = (): LiveChecklist | null => {
    const current = loadRef.current
    return current.phase === 'live' ? current : null
  }

  const settleWrite = (stored: StoredSession, configuration: Configuration) => {
    const next = liveOf(stored, configuration)
    loadRef.current = next
    setLoad(next)
  }

  const conflict = () => {
    const next: ChecklistLoad = { phase: 'conflict' }
    loadRef.current = next
    setLoad(next)
  }

  const addReply = useCallback(
    async (reply: ApproverReply): Promise<AddReplyResult> => {
      const current = currentLive()
      if (!current || !kit) {
        return { kind: 'refused', cause: 'not-live' }
      }
      const added = kit.recovery.addApproverReply(current.session.gathering, reply)
      if (added.reason) {
        return { kind: 'refused', cause: added.reason.cause }
      }
      setBusy(true)
      try {
        const stored = await records
          .recoverySession(chainId, account)
          .write(added.gathering, current.revision)
        settleWrite(stored, current.configuration)
        return { kind: 'added' }
      } catch (error: unknown) {
        if (isSessionRevisionConflict(error)) {
          conflict()
          return { kind: 'conflict' }
        }
        return { kind: 'write-failed' }
      } finally {
        setBusy(false)
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [kit, records, chainId, account]
  )

  const setNote = useCallback(
    async (place: number, note: RowNote | null) => {
      const current = currentLive()
      if (!current) {
        return
      }
      setBusy(true)
      setNoteFailed(false)
      try {
        const stored = await records
          .recoverySession(chainId, account)
          .setNote(place, note, current.revision)
        settleWrite(stored, current.configuration)
      } catch (error: unknown) {
        if (isSessionRevisionConflict(error)) {
          conflict()
        } else {
          setNoteFailed(true)
        }
      } finally {
        setBusy(false)
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [records, chainId, account]
  )

  const abandon = useCallback(
    async (onWiped?: () => void) => {
      const current = currentLive()
      if (!current) {
        return
      }
      setBusy(true)
      setAbandonFailed(false)
      try {
        await records.wipeRecoverySession(chainId, account, 'recoverer-abandoned', current.revision)
        onWiped?.()
        navigateRef.current(routeEntryPathOf(entry.route), { replace: true })
      } catch (error: unknown) {
        if (isSessionRevisionConflict(error)) {
          conflict()
        } else {
          setAbandonFailed(true)
        }
      } finally {
        setBusy(false)
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [records, chainId, account, entry.route]
  )

  const gatherAgain = useCallback(async () => {
    const current = loadRef.current
    const held = configurationRef.current
    if (current.phase !== 'wiped' || !kit || !held) {
      return
    }
    setBusy(true)
    setGatherFailed(false)
    try {
      const result = await gatherAgainOver({
        records,
        chainId,
        account,
        client: kit,
        ...held,
        password: depsRef.current.readPassword(chainId, account),
        destination: destinationRef.current,
        revision: current.revision
      })
      // Without the destination key nothing opened, and the reason stays.
      if (result.kind === 'needs-destination') {
        setGatherFailed(true)
      } else {
        apply(result, held.configuration)
      }
    } catch {
      setGatherFailed(true)
    } finally {
      setBusy(false)
    }
  }, [kit, records, chainId, account, apply])

  // A request that died is wiped once, with its reason, under the revision
  // this tab holds; the wiped line it leaves is what the checklist renders.
  // A request whose own submission landed turns into its countdown and the
  // holder goes on to the wait. Either write holds the rows until it returns.
  const ending = useRef(false)
  const end = useCallback(
    async (write: (current: LiveChecklist) => Promise<void>) => {
      const current = currentLive()
      if (!current || ending.current) {
        return
      }
      ending.current = true
      setDying(true)
      try {
        await write(current)
        setDeathFailed(false)
      } catch (error: unknown) {
        if (isSessionRevisionConflict(error)) {
          conflict()
        } else {
          setDeathFailed(true)
        }
      } finally {
        ending.current = false
        setDying(false)
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    []
  )
  const die = useCallback(
    (event: DirectWipeEvent) =>
      end(async (current) => {
        const { request, replies } = current.session.gathering
        await records.wipeRecoverySession(chainId, account, event, current.revision)
        // The wipe is written. A read after it that fails or finds nothing
        // opens the checklist again from storage, so the old revision never
        // stays live and the wipe is never written a second time.
        const found = await records
          .recoverySession(chainId, account)
          .read()
          .then(resultOfRead, () => null)
        if (!found) {
          loadRef.current = LOADING
          retry()
        } else if (found.kind === 'wiped') {
          const next: ChecklistLoad = {
            phase: 'wiped',
            session: found.session,
            revision: found.revision,
            hadReplies: replies.length > 0,
            died: { attemptId: request.attemptId, setupNonce: request.setupNonce }
          }
          loadRef.current = next
          setLoad(next)
        } else {
          apply(found, current.configuration)
        }
      }),
    [end, records, chainId, account, apply, retry]
  )
  const land = useCallback(
    () =>
      end(async (current) => {
        await records.landSubmission(chainId, account, current.revision)
        // No live session is left to poll or to change.
        loadRef.current = LOADING
        setLoad(LOADING)
        navigateRef.current(waitPathOf(account), { replace: true })
      }),
    [end, records, chainId, account]
  )

  const target = useMemo(() => pollTargetOf(load), [load])
  // Past the deadline the round still reads the chain once within its limit:
  // another holder can have submitted this request before the deadline, and
  // then it lands. A read that fails, or shows no attempt of this request,
  // wipes the session as expired. The deadline is judged on the clock read
  // before the round's read.
  const afterPoll = useCallback(
    (facts: PollFacts | undefined, clock: number) => {
      const current = currentLive()
      if (!current) {
        return
      }
      const { gathering } = current.session
      const outcome = facts ? outcomeOf(gathering, facts) : null
      if (outcome === 'landed') {
        land().catch(() => undefined)
      } else if (deadlinePassed(gathering, clock)) {
        die('deadline-passed').catch(() => undefined)
      } else if (outcome) {
        die(outcome).catch(() => undefined)
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [die, land]
  )
  const { poll, retry: retryPoll } = usePoll({
    kit,
    target,
    deps,
    after: afterPoll
  })

  const readSetupAgain = useCallback(async () => {
    const current = loadRef.current
    if (current.phase !== 'wiped') {
      return
    }
    setBusy(true)
    setGatherFailed(false)
    try {
      // The setup goes before the wiped line, so a failure leaves the line and
      // its revision for a retry to clear.
      await records.decryptedSetupCache(chainId, account).wipe()
      depsRef.current.forgetPassword(chainId, account)
      configurationRef.current = null
      await records.clearWipedSession(chainId, account, current.revision)
      navigateRef.current(readoutPathOf(account), { replace: true })
    } catch (error: unknown) {
      if (isSessionRevisionConflict(error)) {
        conflict()
      } else {
        setGatherFailed(true)
      }
    } finally {
      setBusy(false)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [records, chainId, account])

  const gathering = load.phase === 'live' ? load.session.gathering : null
  // The assessment takes the clock the last answered poll read before its read.
  const assessedAt = poll.status === 'answered' ? poll.clock : null
  const assessment = useMemo<Assessment | null>(() => {
    if (!gathering || !kit) {
      return null
    }
    try {
      return kit.recovery.assess(
        gathering,
        Math.floor((assessedAt ?? depsRef.current.now()) / 1000)
      )
    } catch {
      return null
    }
  }, [gathering, kit, assessedAt])

  return {
    load,
    assessment,
    retry,
    addReply,
    setNote,
    noteFailed,
    abandon,
    abandonFailed,
    gatherAgain,
    gatherFailed,
    readSetupAgain,
    poll,
    retryPoll,
    deathFailed,
    dying,
    busy
  }
}

export default useChecklist
