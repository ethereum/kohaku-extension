/**
 * The return channel: how the ceremony tab hands its outcome back to the row
 * that opened it.
 *
 * The tab writes one report under `socialRecoveryCeremonyResult:<request id>`
 * in the extension's local storage (the `storage` of
 * `@web/extension-services/background/webapi/storage`), through the
 * visibility gate: a hidden tab writes nothing until it is shown again, so a
 * hand-off to a phone reports its result when the tab returns. A tab closed
 * while hidden drops its report, and the caller's row stays unchanged. No
 * background controller is involved.
 *
 * A report of a passed claim carries the reply and its proof, approval
 * material that must not outlive its use. So a report lives only until taken
 * and never past its expiry, ten minutes from `reportedAt`:
 *
 * - `takeCeremonyReport` and `listenForCeremonyReport` remove the report once
 *   they deliver it, and deliver it only where its id, call and method are the
 *   ones the caller expects and `reportedAt` is within the expiry;
 * - `sweepCeremonyReports` removes every report past its expiry, and every
 *   malformed one; the tab runs it on mount.
 *
 * The caller (the checklist row) files the reply into its session record at
 * once, which deletes it with the recovery it was gathered for, and keeps no
 * copy of the report.
 *
 * Storage and the listener are parameters, so the channel runs under node.
 * Both hand over values already parsed: the store's `get` reads its own
 * richJson text, and the subscription parses a change before it calls back.
 */
import type {
  CeremonyOutcome,
  CeremonyReport,
  ReportIdentity,
  ReportStore,
  ReportSubscribe,
  VisibilityGate
} from './types'
import { isCeremonyCall, isCeremonyVerdict } from './verdicts'

export const CEREMONY_RESULT_KEY_PREFIX = 'socialRecoveryCeremonyResult:'

/** How long a report may wait for its caller: ten minutes from `reportedAt`. */
export const CEREMONY_REPORT_TTL_MS = 10 * 60 * 1000

/** How far ahead of the reader's clock a `reportedAt` may sit and still count. */
export const CEREMONY_REPORT_CLOCK_SKEW_MS = 60 * 1000

export const ceremonyResultKey = (id: string): string => `${CEREMONY_RESULT_KEY_PREFIX}${id}`

/** Whether `value` is a well-formed report: one of the four verdicts or a dismissal. */
export const isCeremonyReport = (value: unknown): value is CeremonyReport => {
  if (typeof value !== 'object' || value === null) {
    return false
  }
  const report = value as Partial<CeremonyReport>
  if (typeof report.id !== 'string' || typeof report.method !== 'string') {
    return false
  }
  if (!isCeremonyCall(report.call) || typeof report.reportedAt !== 'number') {
    return false
  }
  if (typeof report.expiresAt !== 'number') {
    return false
  }
  const outcome = report.outcome as
    | { kind?: unknown; verdict?: unknown; note?: unknown }
    | undefined
  if (!outcome) {
    return false
  }
  if (outcome.kind === 'verdict') {
    return isCeremonyVerdict(outcome.verdict)
  }
  return (
    outcome.kind === 'dismissed' && (outcome.note === 'cancelled' || outcome.note === 'refused')
  )
}

/**
 * Whether a report reported at `reportedAt` is still within its expiry at
 * `now`: no older than `CEREMONY_REPORT_TTL_MS`, and not from the future past
 * a minute of clock skew.
 */
export const isWithinExpiry = (reportedAt: number, now: number): boolean =>
  now >= reportedAt - CEREMONY_REPORT_CLOCK_SKEW_MS && now < reportedAt + CEREMONY_REPORT_TTL_MS

/** Whether `report` is the one `expected` names, and still within its expiry at `now`. */
export const isReportFor = (
  report: CeremonyReport,
  expected: ReportIdentity,
  now: number
): boolean =>
  report.id === expected.id &&
  report.call === expected.call &&
  report.method === expected.method &&
  isWithinExpiry(report.reportedAt, now)

/** The report the tab writes for `params`, expiring ten minutes after `reportedAt`. */
export const ceremonyReport = <T>(
  params: ReportIdentity,
  outcome: CeremonyOutcome<T>,
  reportedAt: number
): CeremonyReport<T> => ({
  id: params.id,
  call: params.call,
  method: params.method,
  outcome,
  reportedAt,
  expiresAt: reportedAt + CEREMONY_REPORT_TTL_MS
})

/**
 * Writes the report of `outcome` through the gate: at once where the tab is
 * visible, when it is shown again where it is hidden. `reportedAt`
 * and `expiresAt` are stamped inside the dispatch, at write time, so a
 * hand-off that ends while the tab is hidden still reports a fresh result
 * when the tab returns, however long it stayed hidden.
 */
export const sendCeremonyReport = <T>(
  identity: ReportIdentity,
  outcome: CeremonyOutcome<T>,
  deps: { store: ReportStore; gate: VisibilityGate; now?: () => number }
): Promise<unknown> =>
  deps.gate.dispatch(() =>
    deps.store.set(
      ceremonyResultKey(identity.id),
      ceremonyReport(identity, outcome, (deps.now ?? Date.now)())
    )
  )

const storedReport = (id: string, store: ReportStore): Promise<unknown> =>
  store.get(ceremonyResultKey(id), null)

/**
 * The report stored for `expected`, or null: a malformed report, one for
 * another call or method, and one past its expiry all read null. It removes
 * nothing.
 */
export const readCeremonyReport = async (
  expected: ReportIdentity,
  store: ReportStore,
  now: number = Date.now()
): Promise<CeremonyReport | null> => {
  const value = await storedReport(expected.id, store)
  return isCeremonyReport(value) && isReportFor(value, expected, now) ? value : null
}

/**
 * Takes the report for `expected` and removes it, so a row applies an outcome
 * once and no reply stays behind. A report past its expiry is removed and
 * reads null. A report for another call or method stays and reads null.
 */
export const takeCeremonyReport = async (
  expected: ReportIdentity,
  store: ReportStore,
  now: number = Date.now()
): Promise<CeremonyReport | null> => {
  const value = await storedReport(expected.id, store)
  if (value === null || value === undefined) {
    return null
  }
  const key = ceremonyResultKey(expected.id)
  if (!isCeremonyReport(value) || !isWithinExpiry(value.reportedAt, now)) {
    await store.remove(key)
    return null
  }
  if (!isReportFor(value, expected, now)) {
    return null
  }
  await store.remove(key)
  return value
}

/**
 * Calls `onReport` with the report written for `expected`, then removes it
 * from storage. A report for another call or method, or past its expiry, is
 * not delivered. Returns the unsubscribe.
 */
export const listenForCeremonyReport = (
  expected: ReportIdentity,
  subscribe: ReportSubscribe,
  store: ReportStore,
  onReport: (report: CeremonyReport) => void,
  now: () => number = () => Date.now()
): (() => void) =>
  subscribe(ceremonyResultKey(expected.id), (value) => {
    if (!isCeremonyReport(value) || !isReportFor(value, expected, now())) {
      return
    }
    onReport(value)
    store.remove(ceremonyResultKey(expected.id)).catch(() => undefined)
  })

/**
 * Removes every report under `keys` that is past its expiry or malformed, and
 * returns how many it removed. `keys` is every key of the store; the others
 * are left alone.
 */
export const sweepCeremonyReports = async (
  store: ReportStore,
  keys: readonly string[],
  now: number = Date.now()
): Promise<number> => {
  let removed = 0
  // eslint-disable-next-line no-restricted-syntax
  for (const key of keys) {
    if (key.startsWith(CEREMONY_RESULT_KEY_PREFIX)) {
      // eslint-disable-next-line no-await-in-loop
      const value: unknown = await store.get(key, null)
      if (!isCeremonyReport(value) || !isWithinExpiry(value.reportedAt, now)) {
        // eslint-disable-next-line no-await-in-loop
        await store.remove(key)
        removed += 1
      }
    }
  }
  return removed
}
