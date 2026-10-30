/**
 * What the page reads of a request, as pure functions over the request, the
 * chain reads and the page's clock: whether its domain is this build's, the
 * state that takes the place of the sign action, and whether the sign action
 * is enabled.
 */
import { isAddressEqual, keccak256 } from 'viem'

import type { ApproverRequest, Attempt } from '@kohaku-eth/social-recovery'
import { attemptLive } from '@web/modules/social-recovery/recovery/checklist'
import type { PollFacts } from '@web/modules/social-recovery/recovery/checklist'

import type {
  ApprovalClient,
  ApprovalReading,
  ApprovalReads,
  DomainOfBuild,
  SignGates
} from './types'

/**
 * Whether the request is aimed at the deployment this build reads: the same
 * chain, the same manager and the same digest version. The build's client
 * refuses a manager whose published domain carries another digest version,
 * so a request that agrees here also agrees with the manager's own domain.
 */
export const domainAgrees = (request: ApproverRequest, build: DomainOfBuild): boolean =>
  request.chainId === String(build.chainId) &&
  isAddressEqual(request.manager, build.manager) &&
  request.digestVersion === build.digestVersion

/**
 * Whether the clock, in ms, has reached the request's deadline: no time left
 * reads as expired, as the deadline's own line reads it.
 */
const requestExpired = (request: ApproverRequest, clock: number): boolean =>
  clock >= Number(request.validUntil) * 1000

/**
 * Whether the account's attempt is this request's own submission, waiting or
 * already ended: it carries the request's attempt id, the setup nonce the
 * request was built under and the hash of the request's handover. The id
 * alone names whoever opened next, so another holder's attempt can carry it.
 */
const isOwnAttempt = (request: ApproverRequest, attempt: Attempt): boolean =>
  attempt.state !== 'None' &&
  attempt.attemptId === BigInt(request.attemptId) &&
  attempt.setupNonce === BigInt(request.setupNonce) &&
  request.purpose === 'approval' &&
  keccak256(request.payload) === attempt.payloadHash

/**
 * The reading of an answered round. A request the recoverer submitted reads
 * as waiting until its recovery ends and as used after that, never as void.
 * Otherwise the deaths in this order: expired, another attempt waiting, the
 * setup changed, the attempt counter moved past the request's id. A request
 * with none of them is live, the account authorizing the action or not.
 */
export const readingOfFacts = (
  request: ApproverRequest,
  facts: PollFacts,
  clock: number
): ApprovalReading => {
  if (isOwnAttempt(request, facts.attempt)) {
    return attemptLive(facts.attempt)
      ? {
          kind: 'waiting',
          endsAt: facts.attempt.consumableAfter * 1000,
          authorized: facts.authorized
        }
      : { kind: 'dead', death: 'used' }
  }
  if (requestExpired(request, clock)) {
    return { kind: 'dead', death: 'expired' }
  }
  if (attemptLive(facts.attempt)) {
    return { kind: 'dead', death: 'void' }
  }
  if (facts.setupNonce !== BigInt(request.setupNonce)) {
    return { kind: 'dead', death: 'setup-changed' }
  }
  if (facts.nextAttemptId > BigInt(request.attemptId)) {
    return { kind: 'dead', death: 'void' }
  }
  return { kind: 'live', authorized: facts.authorized }
}

/**
 * The reading of the page: another deployment before any read and where the
 * manager publishes a digest version this build does not sign, then the
 * client and the reads, where nothing answered yet reads as reading and a
 * failure as failed, never as a death and never as live.
 */
export const readingOf = (
  request: ApproverRequest,
  build: DomainOfBuild,
  client: ApprovalClient,
  reads: ApprovalReads,
  clock: number
): ApprovalReading => {
  if (!domainAgrees(request, build) || client.status === 'refused') {
    return { kind: 'other-deployment' }
  }
  if (client.status === 'failed') {
    return { kind: 'failed' }
  }
  if (client.status === 'loading' || reads.status === 'pending') {
    return { kind: 'reading' }
  }
  if (reads.status === 'failed') {
    return { kind: 'failed' }
  }
  return readingOfFacts(request, reads.facts, clock)
}

/**
 * Whether the request no longer takes an approval: its deadline passed on the
 * page's clock, whatever the reads say, or the reading is a death or the
 * recoverer's submission.
 */
export const approvalEnded = (
  request: ApproverRequest,
  reading: ApprovalReading,
  clock: number
): boolean =>
  requestExpired(request, clock) || reading.kind === 'dead' || reading.kind === 'waiting'

/**
 * Whether the sign action is enabled: the four values and the deadline
 * rendered, the request live with the account authorizing the action, and
 * the acknowledgment ticked.
 */
export const signEnabled = ({ values, deadline, reading, acknowledged }: SignGates): boolean =>
  values.rendered &&
  deadline !== null &&
  !deadline.passed &&
  reading.kind === 'live' &&
  reading.authorized &&
  acknowledged
