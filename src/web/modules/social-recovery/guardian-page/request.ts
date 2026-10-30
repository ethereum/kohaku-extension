/**
 * The request the approval page's link carries. The page opens at
 * `<tab>#/social-recovery/approve?request=...`, so the router hands the
 * request in its search string; where the router hands none, the window's
 * own hash still holds the whole link. The page carries approvals alone, so
 * a request of any other purpose is no request this page reads.
 */
import type { ApproverRequest, RequestDescription } from '@kohaku-eth/social-recovery'
import { requestOfApprovalLink } from '@web/modules/social-recovery/recovery/checklist'

import type { DescribedRequest } from './types'

/** The approval request of the route's search, else of the window's hash, or null where neither carries one. */
export const approvalRequestOf = (search: string, hash: string): ApproverRequest | null => {
  const request = requestOfApprovalLink(search) ?? requestOfApprovalLink(hash)
  return request && request.purpose === 'approval' ? request : null
}

/**
 * The request with what the orchestrator described of it, or null where the
 * orchestrator cannot read it: a version it does not know throws.
 */
export const describedRequestOf = (
  request: ApproverRequest | null,
  describe: (request: ApproverRequest) => RequestDescription
): DescribedRequest | null => {
  if (!request) {
    return null
  }
  try {
    return { request, description: describe(request) }
  } catch {
    return null
  }
}
