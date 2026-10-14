/**
 * What the confirmation opens on, read once the client is ready: the stored
 * session, the setup's configuration and the set the submission carries. No
 * live session goes back to the checklist, which renders a wiped one; a
 * landed one goes on to the wait. A live session whose rule the assessment
 * does not find satisfied goes back to the checklist too. With no setup on
 * this device and no recovery password in memory, the readout unlocks it.
 */
import { useCallback, useEffect, useRef, useState } from 'react'

import { addressBookOf, WALLET_RECOVERY_CHAIN } from '@web/modules/social-recovery/shared/client'
import {
  checklistPathOf,
  chosenPlacesOf,
  configurationOf,
  layoutOf,
  readoutPathOf,
  waitPathOf
} from '@web/modules/social-recovery/recovery/checklist'

import type { SubmitLoad, SubmitLoadHook, SubmitLoadInput } from './types'

const useSubmitLoad = ({
  records,
  chainId,
  account,
  client,
  navigate,
  readPassword,
  now
}: SubmitLoadInput): SubmitLoadHook => {
  const [load, setLoad] = useState<SubmitLoad>({ phase: 'loading' })
  const [attempt, setAttempt] = useState(0)
  const navigateRef = useRef(navigate)
  navigateRef.current = navigate
  const nowRef = useRef(now)
  nowRef.current = now
  const readPasswordRef = useRef(readPassword)
  readPasswordRef.current = readPassword

  const kit = client.status === 'ready' ? client.client : null
  const { status } = client

  useEffect(() => {
    if (status === 'update-the-wallet') {
      setLoad({ phase: 'update-the-wallet' })
      return undefined
    }
    if (status === 'failed') {
      setLoad({ phase: 'failed', cause: 'client' })
      return undefined
    }
    if (!kit) {
      setLoad({ phase: 'loading' })
      return undefined
    }
    let live = true
    setLoad({ phase: 'loading' })
    const run = async () => {
      // The clock is read before any read, and the assessment takes it.
      const nowSeconds = Math.floor(nowRef.current() / 1000)
      let read
      try {
        read = await records.recoverySession(chainId, account).read()
      } catch {
        if (live) {
          setLoad({ phase: 'failed', cause: 'records' })
        }
        return
      }
      if (!live) {
        return
      }
      if (read.status === 'present' && read.value.state === 'landed') {
        navigateRef.current(waitPathOf(account), { replace: true })
        return
      }
      if (read.status !== 'present' || read.value.state !== 'live') {
        navigateRef.current(checklistPathOf(account), { replace: true })
        return
      }
      const session = read.value
      let reading
      try {
        reading = await configurationOf({
          records,
          chainId,
          account,
          client: kit,
          password: readPasswordRef.current(chainId, account)
        })
      } catch {
        if (live) {
          setLoad({ phase: 'failed', cause: 'setup' })
        }
        return
      }
      if (!live) {
        return
      }
      if (reading.kind === 'none') {
        navigateRef.current(readoutPathOf(account), { replace: true })
        return
      }
      const layout = layoutOf(
        reading.configuration,
        session.gathering,
        addressBookOf(WALLET_RECOVERY_CHAIN)
      )
      if (!layout) {
        setLoad({ phase: 'failed', cause: 'setup' })
        return
      }
      let assessment
      try {
        assessment = kit.recovery.assess(session.gathering, nowSeconds)
      } catch {
        setLoad({ phase: 'failed', cause: 'setup' })
        return
      }
      const chosen = chosenPlacesOf(kit, session.gathering, assessment, nowSeconds)
      if (!assessment.ruleSatisfied || !chosen) {
        navigateRef.current(checklistPathOf(account), { replace: true })
        return
      }
      setLoad({
        phase: 'ready',
        session,
        revision: read.revision,
        configuration: reading.configuration,
        layout,
        assessment,
        chosen
      })
    }
    run().catch(() => {
      if (live) {
        setLoad({ phase: 'failed', cause: 'records' })
      }
    })
    return () => {
      live = false
    }
  }, [kit, status, records, chainId, account, attempt])

  const retry = useCallback(() => setAttempt((n) => n + 1), [])

  return { load, retry }
}

export default useSubmitLoad
