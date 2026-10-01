/** The passkey row's state, its record writes and the handlers its blocks call. */
import { useCallback, useRef, useState } from 'react'

import { useTranslation } from '@common/config/localization'
import type { Hex } from '@web/modules/social-recovery/sdk-interfaces'
import { failed } from '@web/modules/social-recovery/shared/ceremony'
import type { CeremonyOutcome, CeremonyReport } from '@web/modules/social-recovery/shared/ceremony'

import { causeOf, testVerdictOf } from './outcome'
import {
  defaultPasskeyName,
  enrollValueOf,
  passkeyEnrollmentOf,
  recalledMemory,
  testValueOf
} from './passkey'
import { sameCredential } from './slot'
import type {
  PassedTest,
  PasskeyCeremonyRequest,
  PasskeyMemory,
  PasskeyRowState,
  PendingPlacement,
  RowProps
} from './types'
import usePasskeyLaunch from './usePasskeyLaunch'
import usePasskeyReport from './usePasskeyReport'
import { placeEnrollment, recordTest } from './writes'

const usePasskeyRow = ({
  records,
  setup,
  chainId,
  account,
  navigate,
  search,
  book,
  client,
  deps,
  enrollment,
  onEnrollment
}: RowProps): PasskeyRowState => {
  const { t } = useTranslation()
  const defaultName = defaultPasskeyName(deps.platform, t)
  const [name, setName] = useState(defaultName)
  const [explainer, setExplainer] = useState(false)
  const [memory, setMemory] = useState<PasskeyMemory>({})
  const [enrollOutcome, setEnrollOutcome] = useState<CeremonyOutcome<unknown> | null>(null)
  const [testOutcome, setTestOutcome] = useState<CeremonyOutcome<unknown> | null>(null)
  const [signedSalt, setSignedSalt] = useState<Hex | null>(null)
  const [skipped, setSkipped] = useState(false)
  const [pending, setPending] = useState<PendingPlacement | null>(null)
  const [writeFailed, setWriteFailed] = useState(false)
  const [duplicate, setDuplicate] = useState(false)
  const [busy, setBusy] = useState(false)

  const enrollmentRef = useRef(enrollment)
  enrollmentRef.current = enrollment

  // A passkey the authenticator already holds is kept until the records store
  // its enrollment, so a failed write retries without a second ceremony.
  const place = useCallback(
    async (placing: PendingPlacement) => {
      const created = passkeyEnrollmentOf(placing.value, book.methods.passkey, placing.userName)
      setBusy(true)
      try {
        const placed = await placeEnrollment(setup, search, book, created, placing.replaced)
        if (placed.status !== 'placed') {
          setPending(null)
          setDuplicate(placed.status === 'duplicate')
          setWriteFailed(placed.status === 'slot-taken')
          return
        }
      } catch {
        setPending(placing)
        setWriteFailed(true)
        return
      } finally {
        setBusy(false)
      }
      setPending(null)
      setWriteFailed(false)
      setDuplicate(false)
      setEnrollOutcome(null)
      setTestOutcome(null)
      setSignedSalt(null)
      setSkipped(false)
      setMemory({ handOff: placing.handOff })
      onEnrollment(created)
    },
    [book, setup, search, onEnrollment]
  )

  const applyEnroll = useCallback(
    async (outcome: CeremonyOutcome<unknown>, userName: string, handOff: boolean) => {
      setName(userName)
      if (outcome.kind !== 'verdict' || outcome.verdict !== 'passed') {
        setEnrollOutcome(outcome)
        return
      }
      const value = enrollValueOf(outcome.value)
      if (!value) {
        setEnrollOutcome(failed('material-rejected'))
        return
      }
      const replaced = enrollmentRef.current?.credential
      await place({ value, userName, handOff, ...(replaced ? { replaced } : {}) })
    },
    [place]
  )

  const applyTest = useCallback(
    async (outcome: CeremonyOutcome<unknown>, asked: PasskeyCeremonyRequest) => {
      if (asked.call !== 'testAccess') {
        return
      }
      // A test of a credential the slot no longer holds says nothing about the one it holds.
      const current = enrollmentRef.current
      const tested = { method: asked.request.method, config: asked.request.config }
      if (!current || !sameCredential(tested, current.credential)) {
        return
      }
      setTestOutcome(outcome)
      const verdict = testVerdictOf(outcome)
      if (!verdict) {
        return
      }
      const value =
        outcome.kind === 'verdict' && outcome.verdict === 'passed'
          ? testValueOf(outcome.value)
          : null
      const passedWith: PassedTest | undefined =
        verdict === 'passed'
          ? {
              lastTest: { salt: asked.request.salt, at: deps.now() },
              ...(value?.facts ? { facts: value.facts } : {})
            }
          : undefined
      try {
        const updated = await recordTest(
          setup,
          current.credential,
          verdict,
          causeOf(outcome),
          passedWith
        )
        setWriteFailed(false)
        setSignedSalt(passedWith ? passedWith.lastTest.salt : null)
        if (updated) {
          onEnrollment(updated)
        }
      } catch {
        setSignedSalt(null)
        setWriteFailed(true)
      }
    },
    [setup, onEnrollment, deps]
  )

  const applyReport = useCallback(
    (report: CeremonyReport, asked: PasskeyCeremonyRequest) =>
      asked.call === 'enroll'
        ? applyEnroll(report.outcome, asked.userName ?? defaultName, asked.handOff ?? false)
        : applyTest(report.outcome, asked),
    [applyEnroll, applyTest, defaultName]
  )

  const { undelivered, stale, retryWith } = usePasskeyReport({
    records,
    navigate,
    search,
    account,
    chainId,
    book,
    deps,
    onAsked: (asked) => {
      setMemory((held) => recalledMemory(held, asked))
      if (asked.call === 'enroll' && asked.userName) {
        setName(asked.userName)
      }
    },
    onReport: (report, asked) => {
      applyReport(report, asked).catch(() => setWriteFailed(true))
    }
  })

  const { create, runTest } = usePasskeyLaunch({
    records,
    navigate,
    search,
    account,
    chainId,
    book,
    client,
    deps,
    enrollment,
    name,
    defaultName,
    createdOnPhone: memory.handOff ?? false,
    setBusy,
    setWriteFailed
  })

  const retryUndelivered = useCallback(
    () =>
      retryWith((asked) =>
        asked.call === 'enroll'
          ? create(asked.handOff ?? false, asked.userName ?? defaultName)
          : runTest()
      ),
    [retryWith, create, defaultName, runTest]
  )

  const toggleExplainer = useCallback(() => setExplainer((open) => !open), [])
  const skip = useCallback(() => setSkipped(true), [])

  // A phone that never connected says the holder chose the hand-off where the
  // stored request did not.
  const handOffTried =
    enrollOutcome?.kind === 'verdict' &&
    enrollOutcome.verdict === 'unavailable' &&
    enrollOutcome.cause === 'unreachable'
  const canTest = deps.passkeysServed && client.status === 'ready' && !busy

  return {
    name,
    setName,
    explainer,
    toggleExplainer,
    enrollOutcome,
    testOutcome,
    signedSalt,
    skipped,
    skip,
    undelivered,
    stale,
    pending,
    writeFailed,
    duplicate,
    busy,
    phone: memory.handOff ?? handOffTried,
    canTest,
    canRetryUndelivered:
      !!stale && !busy && (stale.call === 'enroll' ? deps.passkeysServed : canTest && !!enrollment),
    place,
    create,
    runTest,
    retryUndelivered
  }
}

export default usePasskeyRow
