/**
 * The page's chain reads: the account's recovery state, with the attempt and
 * the setup number, and whether the account authorizes the action. One round
 * runs when the client is ready or another link opens, then one every minute
 * and on a retry. Rounds never overlap. A round that throws or runs past its
 * limit reads as failed, never as the last answer; a new client or a new link
 * starts again from nothing answered.
 */
import { useCallback, useEffect, useRef, useState } from 'react'

import { readPollFacts } from '@web/modules/social-recovery/recovery/checklist'

import { APPROVAL_READ_LIMIT_MS, APPROVAL_READ_MS } from './constants'
import type { ApprovalReads, ApprovalReadsHook, ApprovalReadsInput } from './types'

const PENDING: ApprovalReads = { status: 'pending' }

const useApprovalReads = ({ client, link, enabled }: ApprovalReadsInput): ApprovalReadsHook => {
  const [reads, setReads] = useState<ApprovalReads>(PENDING)
  const clientRef = useRef(client)
  clientRef.current = client
  // Each client's and each link's rounds carry their number; a round of an
  // earlier one is dropped.
  const generation = useRef(0)
  const inFlight = useRef(false)

  const run = useCallback(async () => {
    const current = clientRef.current
    const id = generation.current
    if (!current || inFlight.current) {
      return
    }
    inFlight.current = true
    const facts = await readPollFacts(current, APPROVAL_READ_LIMIT_MS)
    if (id !== generation.current) {
      return
    }
    inFlight.current = false
    setReads(facts ? { status: 'answered', facts } : { status: 'failed' })
  }, [])

  const active = enabled ? client : null
  useEffect(() => {
    generation.current += 1
    inFlight.current = false
    setReads(PENDING)
    if (!active) {
      return undefined
    }
    run().catch(() => undefined)
    const timer = setInterval(() => {
      run().catch(() => undefined)
    }, APPROVAL_READ_MS)
    return () => {
      generation.current += 1
      clearInterval(timer)
    }
  }, [active, link, run])

  // A retry after a failed round reads as reading until its round answers.
  const retry = useCallback(() => {
    if (!clientRef.current || inFlight.current) {
      return
    }
    setReads((last) => (last.status === 'failed' ? PENDING : last))
    run().catch(() => undefined)
  }, [run])

  return { reads, retry }
}

export default useApprovalReads
