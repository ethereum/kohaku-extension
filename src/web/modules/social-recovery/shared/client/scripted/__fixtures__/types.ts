import type { ApproverRequest } from '@kohaku-eth/social-recovery'

/** The approval variant of a request, which carries the payload and the order. */
export type ApprovalRequest = Extract<ApproverRequest, { purpose: 'approval' }>
