/**
 * One round of the page's chain reads: the manager's attempt state and the
 * action's authorization, read together. The removed key is never read: the
 * page does not show it, and its scans would fail a round on a slow or
 * rate-limited node. Resolves to undefined where either read throws or where
 * both have not answered within `limitMs`.
 */
import type { PollFacts } from '@web/modules/social-recovery/recovery/checklist'
import { within } from '@web/modules/social-recovery/shared/client'

import type { ApprovalKitClient } from './types'

export const readApprovalFacts = (
  client: ApprovalKitClient,
  limitMs: number
): Promise<PollFacts | undefined> =>
  within(async () => {
    const [state, authorized] = await Promise.all([
      client.walletReads.attemptState(),
      client.action.isAuthorized()
    ])
    return {
      attempt: state.attempt,
      nextAttemptId: state.nextAttemptId,
      setupNonce: state.setupNonce,
      authorized
    }
  }, limitMs)
