/**
 * A row's claim, a passkey's or an identity method's: the ceremony request it
 * stores before the tab leaves for the ceremony, and what it reads back from
 * that request and from the tab's report. A stored request and a report are read from storage, so
 * their values are checked here before the row uses them.
 */
import type { ApproverRequest, Params, Reply } from '@kohaku-eth/social-recovery'
import { AUTHENTICATOR_PLACES } from '@web/modules/social-recovery/shared/ceremony'
import { sameAddress } from '@web/modules/social-recovery/shared/client'
import { recordKeys } from '@web/modules/social-recovery/shared/records'
import type { CeremonyRequestRecord } from '@web/modules/social-recovery/shared/records'

import { CLAIM_SLUGS } from './constants'
import type { ClaimAsked, ClaimRequestInput, ClaimTarget, DeadRequest, PassedClaim } from './types'

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null

/**
 * The claim's ceremony request: the method's slug, the place's request, and
 * the params the method receives; a passkey's say whether the holder chose
 * the phone.
 */
export const claimRequestRecordOf = (
  method: string,
  input: ClaimRequestInput,
  params: Params
): CeremonyRequestRecord => ({
  call: 'createClaim',
  method,
  account: input.account,
  chainId: input.chainId,
  request: input.request,
  params
})

/**
 * What a stored request asked for, or null for any other request: the
 * requests live under one key for every account, so a request another
 * account, chain, call or method stored is not this checklist's to take. The
 * slugs default to every method the checklist claims.
 */
export const claimAskedOf = (
  record: CeremonyRequestRecord,
  target: ClaimTarget,
  slugs: readonly string[] = CLAIM_SLUGS
): ClaimAsked | null => {
  if (record.call !== 'createClaim' || !slugs.includes(record.method)) {
    return null
  }
  if (!sameAddress(record.account, target.account)) {
    return null
  }
  if (String(record.chainId) !== String(target.chainId)) {
    return null
  }
  if (!sameAddress(record.request.account, target.account)) {
    return null
  }
  const params = isRecord(record.params) ? record.params : {}
  return {
    place: record.request.place,
    request: record.request,
    method: record.method,
    params,
    handOff: params.handOff === true
  }
}

/**
 * The request id a stored key holds a ceremony request under, or null for any
 * other key.
 */
export const ceremonyRequestIdOf = (key: string): string | null => {
  const id = key.slice(key.lastIndexOf(':') + 1)
  try {
    return recordKeys.ceremonyRequest(id) === key ? id : null
  } catch {
    return null
  }
}

/**
 * Whether a stored request is this checklist's claim for the request that
 * died, or for any request of the account where the one that died is unknown.
 */
export const claimOfDeadRequest = (
  record: CeremonyRequestRecord,
  target: ClaimTarget,
  died?: DeadRequest
): boolean => {
  const asked = claimAskedOf(record, target)
  if (!asked) {
    return false
  }
  return (
    !died ||
    (asked.request.attemptId === died.attemptId && asked.request.setupNonce === died.setupNonce)
  )
}

/**
 * Whether a reply answers the stored request: the same place, method,
 * configuration, attempt, account and chain. A reply for any other place
 * would fill that place while the asked one read answered.
 */
const answersRequest = (reply: Record<string, unknown>, request: ApproverRequest): boolean =>
  reply.place === request.place &&
  typeof reply.method === 'string' &&
  sameAddress(reply.method, request.method) &&
  reply.config === request.config &&
  reply.attemptId === request.attemptId &&
  typeof reply.account === 'string' &&
  sameAddress(reply.account, request.account) &&
  reply.chainId === request.chainId

/**
 * A passed claim's reply as the report carries it, with where the
 * authenticator sat, or null where the value carries no reply or a reply to
 * any request but the stored one. The client's add judges the reply itself;
 * this check only keeps a value that is not this claim's answer away from it.
 */
export const claimReplyOf = (value: unknown, request: ApproverRequest): PassedClaim | null => {
  if (!isRecord(value) || !isRecord(value.reply)) {
    return null
  }
  const { reply, facts } = value
  if (reply.kind !== 'recovery-proof-reply' || !answersRequest(reply, request)) {
    return null
  }
  const place = isRecord(facts)
    ? AUTHENTICATOR_PLACES.find((known) => known === facts.place)
    : undefined
  return { reply: reply as unknown as Reply, ...(place ? { facts: { place } } : {}) }
}
