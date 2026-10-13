/**
 * The refusals the submission reads from a thrown value or a reverted
 * receipt: the manager refuses the start because another attempt runs on the
 * account. A thrown value is a real boundary, so each is read by its shape.
 */
import type { WriteState } from '@web/modules/social-recovery/shared/writes'

import { ALREADY_RUNNING_CAUSES, ALREADY_RUNNING_FINDINGS } from './constants'
import type { AlreadyRunningCause, AlreadyRunningFinding } from './types'

const isObject = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null

const isAlreadyRunningFinding = (code: unknown): code is AlreadyRunningFinding =>
  typeof code === 'string' && (ALREADY_RUNNING_FINDINGS as readonly string[]).includes(code)

const isAlreadyRunningCause = (name: string): name is AlreadyRunningCause =>
  (ALREADY_RUNNING_CAUSES as readonly string[]).includes(name)

/**
 * Whether a prepare's refusal names an attempt already running: its findings
 * carry the attempt-active error for an attempt other than this gathering's,
 * or the attempt-id error. An active attempt that is this gathering's own is
 * the submission that landed, not a refusal.
 */
export const preparedRefusalRunning = (error: unknown): boolean => {
  if (!isObject(error) || !isObject(error.findings) || !Array.isArray(error.findings.errors)) {
    return false
  }
  return error.findings.errors.some(
    (finding: unknown) =>
      isObject(finding) &&
      isAlreadyRunningFinding(finding.code) &&
      !(isObject(finding.values) && finding.values.ownGathering === true)
  )
}

/** Whether a reverted start names the manager's refusal for an attempt already running. */
export const revertedRunning = (write: WriteState): boolean =>
  write.status === 'failedReverted' &&
  write.cause.kind === 'named' &&
  isAlreadyRunningCause(write.cause.name)
