/**
 * The request validation the start and the cancellation by proofs run before
 * their call is prepared, over the chain's reads at one block: the window,
 * the stored attempt, the committed setup, the order of the places, the rule
 * over the proofs, each named method's stop unless the setup ignores stops,
 * and on an opening request the handover its payload decodes to. The codes,
 * the subject and the values are the scripted client's, so a screen reads a
 * refusal the same way on either.
 */
import {
  evaluatorOf,
  rowsToFindings,
  unansweredRead
} from '@web/modules/social-recovery/sdk-doubles'
import type { RequestRow } from '@web/modules/social-recovery/sdk-doubles/types'
import type {
  AttemptRequest,
  BlockHeader,
  CancelRequest,
  Finding,
  GatheringPurpose
} from '@web/modules/social-recovery/sdk-interfaces'

import { sameAddress } from '../../addresses'
import { readSetupBody, setupCommitmentOf } from '../formats'
import { decodedHandoverOf, handoverRowsOf } from './handover'
import type { KitRecoveryContext } from './types'

/** The rule evaluation over the kit's ABI-encoded setup body. */
export const evaluateBody = evaluatorOf(readSetupBody)

/** Whether a body ignores the methods' stops; a body that does not decode does not. */
const ignoresPauseOf = (setupBody: AttemptRequest['setupBody']): boolean => {
  try {
    return readSetupBody(setupBody).ignoresPause
  } catch {
    return false
  }
}

export const requestFindingsOf = async (
  ctx: KitRecoveryContext,
  request: AttemptRequest | CancelRequest,
  purpose: GatheringPurpose,
  now: number,
  block: BlockHeader
): Promise<Finding[]> => {
  const { account, descriptor, manager, moduleReads } = ctx
  const state = await manager.stateOf(account, descriptor.action, block.number)
  const rows: RequestRow[] = []
  if (now > request.validUntil) {
    rows.push(['request.expired', { validUntil: request.validUntil, now }])
  }
  if (purpose === 'approval') {
    if (state.attempt.state === 'Waiting') {
      rows.push([
        'request.attempt-active',
        {
          attemptId: state.attempt.attemptId,
          consumableAfter: state.attempt.consumableAfter,
          ownGathering: state.attempt.attemptId === request.attemptId
        }
      ])
    } else if (request.attemptId !== state.nextAttemptId) {
      rows.push([
        'request.attempt-id',
        { attemptId: request.attemptId, expected: state.nextAttemptId }
      ])
    }
  } else if (state.attempt.state !== 'Waiting') {
    rows.push(['request.no-active-attempt', { action: request.action, state: state.attempt.state }])
  } else {
    if (request.attemptId !== state.attempt.attemptId) {
      rows.push([
        'request.attempt-id',
        { attemptId: request.attemptId, expected: state.attempt.attemptId }
      ])
    }
    if (state.attempt.setupNonce !== state.setupNonce) {
      rows.push([
        'request.stale-attempt',
        { judgedUnder: state.attempt.setupNonce, currentNonce: state.setupNonce }
      ])
    }
  }
  const recomputed = setupCommitmentOf(
    request.account,
    request.action,
    request.setupNonce,
    request.setupBody
  )
  if (
    request.setupNonce !== state.setupNonce ||
    recomputed.toLowerCase() !== state.setupCommitment.toLowerCase()
  ) {
    rows.push(['request.body-mismatch', { recomputed, committed: state.setupCommitment }])
  }
  for (let i = 1; i < request.proofs.length; i++) {
    if (request.proofs[i].place <= request.proofs[i - 1].place) {
      rows.push(['proof.places-unordered', { place: request.proofs[i].place }])
      break
    }
  }
  const rule = evaluateBody(
    request.setupBody,
    request.proofs.map((p) => Number(p.place))
  )
  if (!rule.satisfied) {
    const failing = rule.clauses.find((c) => c.clause === rule.failingClause)
    rows.push([
      'request.rule-unsatisfied',
      { clause: rule.failingClause, filled: failing?.filled, threshold: failing?.threshold }
    ])
  }
  const ignoresPause = ignoresPauseOf(request.setupBody)
  if (!ignoresPause) {
    const stops = await Promise.all(request.proofs.map((p) => moduleReads.paused(p.method)))
    request.proofs.forEach((p, i) => {
      const stop = stops[i]
      // An unanswered stop read refuses, never reads as not stopped.
      if (!stop.answered) {
        throw unansweredRead('manager.paused', p.method, Number(p.place))
      }
      if (stop.value) {
        rows.push(['request.method-stopped', { place: p.place, method: p.method, ignoresPause }])
      }
    })
  }
  if (purpose === 'approval') {
    const opening = request as AttemptRequest
    // The codec serves the deployed action only; a request for another action
    // carries a payload nothing here decodes.
    const handover = sameAddress(opening.action, descriptor.action)
      ? decodedHandoverOf(descriptor.action, opening.payload)
      : undefined
    if (!handover) {
      rows.push(['handover.malformed', { payload: opening.payload, cause: 'undecodable' }])
    } else {
      rows.push(...(await handoverRowsOf(ctx, handover, block)))
    }
  }
  return rowsToFindings(rows)
}
