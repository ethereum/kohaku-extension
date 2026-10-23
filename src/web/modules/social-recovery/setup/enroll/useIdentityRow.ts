/** An identity row's state, its record writes and the handlers its blocks call. */
import { useCallback, useRef, useState } from 'react'
import { isAddressEqual, zeroAddress } from 'viem'

import { failed } from '@web/modules/social-recovery/shared/ceremony'
import type { CeremonyOutcome, CeremonyReport } from '@web/modules/social-recovery/shared/ceremony'
import { sameCredential } from '@web/modules/social-recovery/shared/records'

import { enrollValueOf, identityEnrollmentOf } from './identity'
import { causeOf, testVerdictOf } from './outcome'
import type {
  IdentityCeremonyRequest,
  IdentityPendingPlacement,
  IdentityRowProps,
  IdentityRowState,
  PassedTest
} from './types'
import useIdentityLaunch from './useIdentityLaunch'
import useIdentityReport from './useIdentityReport'
import { placeEnrollment, recordTest } from './writes'

const useIdentityRow = ({
  kind,
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
}: IdentityRowProps): IdentityRowState => {
  const [enrollOutcome, setEnrollOutcome] = useState<CeremonyOutcome<unknown> | null>(null)
  const [testOutcome, setTestOutcome] = useState<CeremonyOutcome<unknown> | null>(null)
  const [skipped, setSkipped] = useState(false)
  const [pending, setPending] = useState<IdentityPendingPlacement | null>(null)
  const [writeFailed, setWriteFailed] = useState(false)
  const [duplicate, setDuplicate] = useState(false)
  const [busy, setBusy] = useState(false)

  const enrollmentRef = useRef(enrollment)
  enrollmentRef.current = enrollment

  // A document the ceremony already read is kept until the records store its
  // enrollment, so a failed write retries without a second ceremony.
  const place = useCallback(
    async (placing: IdentityPendingPlacement) => {
      const created = identityEnrollmentOf(placing.value, book.methods[kind])
      setBusy(true)
      try {
        const placed = await placeEnrollment(setup, search, book, created, placing.replaces)
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
      setSkipped(false)
      onEnrollment(created)
    },
    [book, kind, setup, search, onEnrollment]
  )

  const applyEnroll = useCallback(
    async (outcome: CeremonyOutcome<unknown>, asked: IdentityCeremonyRequest) => {
      if (outcome.kind !== 'verdict' || outcome.verdict !== 'passed') {
        setEnrollOutcome(outcome)
        return
      }
      const value = enrollValueOf(outcome.value)
      if (!value) {
        setEnrollOutcome(failed('material-rejected'))
        return
      }
      // The slot as the ceremony found it; a request stored without it reads the slot now.
      const launched = asked.call === 'enroll' ? asked.replaces : undefined
      const replaces = launched !== undefined ? launched : enrollmentRef.current?.credential
      await place({ value, ...(replaces !== undefined ? { replaces } : {}) })
    },
    [place]
  )

  const applyTest = useCallback(
    async (outcome: CeremonyOutcome<unknown>, asked: IdentityCeremonyRequest) => {
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
      const passedWith: PassedTest | undefined =
        verdict === 'passed'
          ? { lastTest: { salt: asked.request.salt, at: deps.now() } }
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
        if (updated) {
          onEnrollment(updated)
        }
      } catch {
        setWriteFailed(true)
      }
    },
    [setup, onEnrollment, deps]
  )

  const applyReport = useCallback(
    (report: CeremonyReport, asked: IdentityCeremonyRequest) =>
      asked.call === 'enroll'
        ? applyEnroll(report.outcome, asked)
        : applyTest(report.outcome, asked),
    [applyEnroll, applyTest]
  )

  const { undelivered, stale, retryWith } = useIdentityReport({
    kind,
    records,
    navigate,
    search,
    account,
    chainId,
    book,
    deps,
    onReport: (report, asked) => {
      applyReport(report, asked).catch(() => setWriteFailed(true))
    }
  })

  const { create, runTest } = useIdentityLaunch({
    kind,
    records,
    navigate,
    search,
    account,
    chainId,
    book,
    client,
    deps,
    enrollment,
    setBusy,
    setWriteFailed
  })

  const retryUndelivered = useCallback(
    () => retryWith((asked) => (asked.call === 'enroll' ? create() : runTest())),
    [retryWith, create, runTest]
  )

  const skip = useCallback(() => setSkipped(true), [])

  // A chain whose deployment omits the method, or names no params for it,
  // serves no ceremony of it, and that answer will not change.
  const unsupported =
    client.status === 'ready' &&
    (client.client.methodFor(kind) === undefined ||
      client.client.methodParamsFor(kind, 'enroll') === undefined ||
      isAddressEqual(book.methods[kind], zeroAddress))
  const canLaunch = client.status === 'ready' && !unsupported && !busy

  return {
    enrollOutcome,
    testOutcome,
    skipped,
    skip,
    undelivered,
    stale,
    pending,
    writeFailed,
    duplicate,
    busy,
    unsupported,
    canLaunch,
    canRetryUndelivered: !!stale && canLaunch && (stale.call === 'enroll' || !!enrollment),
    place,
    create,
    runTest,
    retryUndelivered
  }
}

export default useIdentityRow
