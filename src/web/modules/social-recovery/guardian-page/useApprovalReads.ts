/**
 * The page's chain reads: the manager's attempt state, with the attempt and
 * the setup number, and whether the account authorizes the action. One round
 * runs when the client is ready or another link opens, then one every minute
 * and on a retry. Rounds never overlap. A round that throws or runs past its
 * limit reads as failed, never as the last answer; a round that runs after an
 * answer keeps that answer, marked as refreshing; a new client or a new link
 * starts again from nothing answered. Once the last answer is final no round
 * runs, and that answer stays, through a new client too, until another link
 * opens.
 */
import { useCallback, useEffect, useRef, useState } from 'react'

import { APPROVAL_READ_LIMIT_MS, APPROVAL_READ_MS } from './constants'
import { readApprovalFacts } from './facts'
import type {
  ApprovalReads,
  ApprovalReadsHook,
  ApprovalReadsInput,
  LinkedApprovalReads
} from './types'

const PENDING: ApprovalReads = { status: 'pending' }

const useApprovalReads = ({
  client,
  link,
  enabled,
  stopped
}: ApprovalReadsInput): ApprovalReadsHook => {
  // Reads answered for another link read as pending, from the first render
  // of the new link on.
  const [linked, setLinked] = useState<LinkedApprovalReads>({ link, reads: PENDING })
  const linkedRef = useRef(linked)
  linkedRef.current = linked
  const clientRef = useRef(client)
  clientRef.current = client
  const linkRef = useRef(link)
  linkRef.current = link
  // Each client's and each link's rounds carry their number; a round of an
  // earlier one is dropped.
  const generation = useRef(0)
  const inFlight = useRef(false)
  const [running, setRunning] = useState(false)
  const stoppedRef = useRef(stopped)
  stoppedRef.current = stopped

  const run = useCallback(async () => {
    const current = clientRef.current
    const forLink = linkRef.current
    const id = generation.current
    if (!current || inFlight.current) {
      return
    }
    inFlight.current = true
    setRunning(true)
    const facts = await readApprovalFacts(current, APPROVAL_READ_LIMIT_MS)
    if (id !== generation.current) {
      return
    }
    inFlight.current = false
    setRunning(false)
    setLinked({
      link: forLink,
      reads: facts ? { status: 'answered', facts } : { status: 'failed' }
    })
  }, [])

  const active = enabled ? client : null
  useEffect(() => {
    generation.current += 1
    inFlight.current = false
    setRunning(false)
    // A final answer for this link outlives a new client: a round of the old
    // client is dropped, and nothing reads again.
    if (stoppedRef.current && linkedRef.current.link === link) {
      return undefined
    }
    setLinked({ link, reads: PENDING })
    if (!active) {
      return undefined
    }
    run().catch(() => undefined)
    return () => {
      generation.current += 1
    }
  }, [active, link, run])

  useEffect(() => {
    if (!active || stopped) {
      return undefined
    }
    const timer = setInterval(() => {
      run().catch(() => undefined)
    }, APPROVAL_READ_MS)
    return () => clearInterval(timer)
  }, [active, stopped, run])

  // A retry after a failed round reads as reading until its round answers.
  const retry = useCallback(() => {
    if (!clientRef.current || inFlight.current || stoppedRef.current) {
      return
    }
    setLinked((last) => (last.reads.status === 'failed' ? { ...last, reads: PENDING } : last))
    run().catch(() => undefined)
  }, [run])

  const reads = linked.link === link ? linked.reads : PENDING
  return { reads, refreshing: running && reads.status === 'answered', retry }
}

export default useApprovalReads
