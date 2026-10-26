import type { ApproverRequest } from '@kohaku-eth/social-recovery'

/** The approval variant of a request, which carries the payload and the order. */
export type ApprovalRequest = Extract<ApproverRequest, { purpose: 'approval' }>

/** A write only the owner sends. */
export type OwnerWrite = 'clearSetup' | 'cancelByOwner'

/** A window and the line it reads. */
export type WindowCase = [bigint, string]

/** A case's name, the age and the line. */
export type AgeCase = [string, number, string]
