/** The guardian row's state, its record writes and the handlers its blocks call. */
import { useCallback, useEffect, useRef, useState } from 'react'

import type { Hex } from '@web/modules/social-recovery/sdk-interfaces'
import { enrollHost, notSupported } from '@web/modules/social-recovery/shared/ceremony'
import type { CeremonyOutcome } from '@web/modules/social-recovery/shared/ceremony'
import { isSignerNotWired, isSignFlowFailure } from '@web/modules/social-recovery/shared/client'
import type { Enrollment } from '@web/modules/social-recovery/shared/records'

import { checkGuardianSignature, guardianDevice, heldKeyOf, outcomeOfSignError } from './guardian'
import { causeOf, testVerdictOf } from './outcome'
import { keyTestOf, keyTestToSignOf } from './testRequest'
import type { GuardianChallenge, GuardianRowState, RowProps } from './types'
import useGuardianChecks from './useGuardianChecks'
import { placeEnrollment, recordTest } from './writes'

const useGuardianRow = ({
  setup,
  chainId,
  account,
  search,
  book,
  client,
  deps,
  enrollment,
  onEnrollment
}: RowProps): GuardianRowState => {
  const [value, setValue] = useState('')
  const [resolvedName, setResolvedName] = useState<string | undefined>()
  const [addOutcome, setAddOutcome] = useState<CeremonyOutcome<unknown> | null>(null)
  const [testOutcome, setTestOutcome] = useState<CeremonyOutcome<unknown> | null>(null)
  const [challenge, setChallenge] = useState<GuardianChallenge | null>(null)
  const [offline, setOffline] = useState(false)
  const [busy, setBusy] = useState(false)
  const [waiting, setWaiting] = useState(false)
  const pending = useRef<AbortController | null>(null)
  const [writeFailed, setWriteFailed] = useState(false)
  const [duplicate, setDuplicate] = useState(false)

  // A request still queued when the row goes away is withdrawn.
  useEffect(
    () => () => {
      pending.current?.abort()
    },
    []
  )

  const { nameCheck, address, checkLines } = useGuardianChecks({ value, enrollment, deps })

  const add = useCallback(async () => {
    if (client.status !== 'ready' || !address) {
      return
    }
    const method = client.client.methodFor('ecdsa')
    if (!method) {
      setAddOutcome(notSupported('no-implementation'))
      return
    }
    const replaced = enrollment?.credential
    setBusy(true)
    try {
      const outcome = await enrollHost({
        orchestrator: client.client.approving,
        method,
        methodAddress: book.methods.ecdsa,
        params: { address },
        device: guardianDevice
      })
      if (outcome.kind !== 'verdict' || outcome.verdict !== 'passed') {
        setAddOutcome(outcome)
        return
      }
      const created: Enrollment = {
        credential: { method: book.methods.ecdsa, config: outcome.value.config, label: '' },
        test: 'not-tested'
      }
      const placed = await placeEnrollment(setup, search, book, created, replaced)
      setDuplicate(placed.status === 'duplicate')
      setWriteFailed(placed.status === 'slot-taken')
      if (placed.status !== 'placed') {
        return
      }
      setAddOutcome(null)
      setResolvedName(nameCheck?.status === 'resolved' ? nameCheck.name : undefined)
      onEnrollment(created)
    } catch {
      setWriteFailed(true)
    } finally {
      setBusy(false)
    }
  }, [client, address, enrollment, book, setup, search, nameCheck, onEnrollment])

  const applyTest = useCallback(
    async (outcome: CeremonyOutcome<unknown>) => {
      setTestOutcome(outcome)
      const verdict = testVerdictOf(outcome)
      if (!enrollment || !verdict) {
        return
      }
      if (verdict === 'passed') {
        setOffline(false)
      }
      try {
        const updated = await recordTest(setup, enrollment.credential, verdict, causeOf(outcome))
        setWriteFailed(false)
        if (updated) {
          onEnrollment(updated)
        }
      } catch {
        setWriteFailed(true)
      }
    },
    [enrollment, setup, onEnrollment]
  )

  const check = useCallback(
    async (signed: GuardianChallenge, signature: Hex) => {
      if (!address) {
        return
      }
      setBusy(true)
      try {
        await applyTest(
          await checkGuardianSignature({
            keyTest: signed.keyTest,
            signature,
            address,
            chain: deps.chain,
            now: deps.now()
          })
        )
      } finally {
        setBusy(false)
      }
    },
    [address, deps, applyTest]
  )

  // The offline block serves any key; a key the wallet holds signs on this
  // device unless the holder asks for the offline block.
  const runTest = useCallback(
    async (offlineOnly: boolean) => {
      if (!enrollment || !address) {
        return
      }
      const keyTest = keyTestOf({
        chainId,
        account,
        key: address,
        now: deps.now(),
        randomBytes: deps.randomBytes
      })
      const next: GuardianChallenge = { keyTest }
      setChallenge(next)
      setTestOutcome(null)
      const held = heldKeyOf(deps.keys, address)
      if (!held || offlineOnly) {
        setOffline(true)
        return
      }
      setOffline(false)
      const controller = new AbortController()
      pending.current = controller
      setBusy(true)
      setWaiting(true)
      let signature: Hex
      try {
        signature = await deps.signTypedData(
          { addr: held.addr, type: held.type },
          keyTestToSignOf(keyTest),
          { signal: controller.signal }
        )
      } catch (error: unknown) {
        if (controller.signal.aborted) {
          return
        }
        pending.current = null
        setWaiting(false)
        setBusy(false)
        // A key the request queue cannot sign for, or a request withdrawn from
        // the queue, is carried to the offline block.
        if (isSignerNotWired(error) || (isSignFlowFailure(error) && error.reason === 'withdrawn')) {
          setOffline(true)
        } else {
          await applyTest(outcomeOfSignError(error))
        }
        return
      }
      // A signature that arrives after the holder withdrew the request is dropped.
      if (controller.signal.aborted) {
        return
      }
      pending.current = null
      setWaiting(false)
      setBusy(false)
      await check(next, signature)
    },
    [enrollment, address, chainId, account, deps, applyTest, check]
  )

  const withdraw = useCallback(() => {
    pending.current?.abort()
    pending.current = null
    setWaiting(false)
    setBusy(false)
    setOffline(true)
  }, [])

  const paste = useCallback(() => {
    deps
      .readClipboard?.()
      .then((text) => setValue(text.trim()))
      // A refused clipboard leaves the field as it was.
      .catch(() => undefined)
  }, [deps])

  return {
    value,
    setValue,
    nameCheck,
    address,
    checkLines,
    resolvedName,
    addOutcome,
    testOutcome,
    challenge,
    offline,
    busy,
    waiting,
    writeFailed,
    duplicate,
    heldKey: address ? heldKeyOf(deps.keys, address) : undefined,
    add,
    check,
    runTest,
    withdraw,
    paste
  }
}

export default useGuardianRow
