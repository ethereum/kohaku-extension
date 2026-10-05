/**
 * What the chain itself would decide, shared by the simulations inside the
 * prepares and by `ScriptedChain.land`: the local rule evaluation, the manager's
 * acceptance path at `startAttempt` and `cancelByProofs`, and the action's
 * execute path with the account's batch behind it.
 *
 * A proof passes the doubles' verification exactly when it equals
 * `doubleProof(config, digest)`.
 */
import type {
  Address,
  AttemptRequest,
  CancelRequest,
  GatheringPurpose,
  Handover,
  Hex,
  KitError
} from '@web/modules/social-recovery/sdk-interfaces'
import { zeroAddress } from 'viem'

import { ActionCodecDouble } from './action-codec'
import type { ScriptedChain } from './chain'
import {
  credentialHash,
  digestOfSubmission,
  doubleProof,
  keccak256,
  readSetupBody,
  sameAddress,
  setupCommitmentOf
} from './encoding'
import { kitError } from './scripts'
import type { RuleEvaluation } from './types'

/**
 * The doubles' stand-in names for the account's own reverts at the execute: the
 * account does not honour the action (a dormant setup), or the account holds no
 * code or code the action does not serve. Both carry `source: 'account'`. The
 * real account's revert names will differ, so the client layer maps these two
 * by that source and these names.
 */
export const ACCOUNT_NOT_ARMED = 'AccountNotArmed'
export const ACCOUNT_UNFIT = 'AccountUnfit'

/**
 * The local rule evaluation over a body and a set of filled places: every
 * clause meets its threshold, false for a body with no clauses and false for a
 * rule whose every clause sits at zero.
 */
export const evaluateRule = (setupBody: Hex, filled: number[]): RuleEvaluation => {
  let body
  try {
    body = readSetupBody(setupBody)
  } catch {
    return { satisfied: false, clauses: [] }
  }
  const set = new Set(filled)
  let next = 0
  const clauses = body.clauses.map((c, clause) => {
    const places = c.credentials.map(() => next++)
    return {
      clause,
      threshold: c.threshold,
      places,
      filled: places.filter((p) => set.has(p)).length
    }
  })
  const failing = clauses.find((c) => c.filled < c.threshold)
  const allZero = clauses.length > 0 && clauses.every((c) => c.threshold === 0)
  return {
    satisfied: clauses.length > 0 && !allZero && !failing,
    clauses,
    failingClause: failing ? failing.clause : allZero ? 0 : undefined
  }
}

/** The shipped action's codec over the chain's action, for the doubles' own decodes. */
export const decodeHandover = (chain: ScriptedChain, payload: Hex): Handover | undefined => {
  try {
    return new ActionCodecDouble([chain.action]).decode(payload)
  } catch {
    return undefined
  }
}

/** Whether a handover names a zero key or one address on both sides (`MalformedHandover`). */
export const malformedHandover = (h: Handover): boolean =>
  sameAddress(h.newAuthority, zeroAddress) ||
  sameAddress(h.removedAuthority, zeroAddress) ||
  sameAddress(h.newAuthority, h.removedAuthority)

/**
 * The manager's acceptance of a submitted request at the head block, in the
 * contract's order: the window, the attempt, the setup, then each proof (order,
 * place, credential, stop, verdict), then the rule. `purpose` names the path:
 * `startAttempt` for an approval, `cancelByProofs` for a cancellation.
 */
export const acceptanceRevert = (
  chain: ScriptedChain,
  request: AttemptRequest | CancelRequest,
  purpose: GatheringPurpose
): KitError | undefined => {
  const isApproval = purpose === 'approval'
  const state = chain.stateOf()
  const { account, action } = request
  if (chain.head.timestamp > request.validUntil) {
    return kitError('RequestExpired', {
      blockTimestamp: chain.head.timestamp,
      validUntil: request.validUntil
    })
  }
  if (chain.setup.status !== 'committed') return kitError('NoSetup', { account, action })
  if (isApproval) {
    if (state.attempt.state === 'Waiting') {
      return kitError('AttemptAlreadyActive', {
        account,
        action,
        attemptId: state.attempt.attemptId
      })
    }
    if (request.attemptId !== state.nextAttemptId) {
      return kitError('WrongAttemptId', {
        supplied: request.attemptId,
        expected: state.nextAttemptId
      })
    }
  } else {
    if (state.attempt.state !== 'Waiting') return kitError('NoActiveAttempt', { account, action })
    if (request.attemptId !== state.attempt.attemptId) {
      return kitError('WrongAttemptId', {
        supplied: request.attemptId,
        expected: state.attempt.attemptId
      })
    }
    if (state.attempt.setupNonce !== state.setupNonce) {
      return kitError('StaleAttempt', {
        judgedUnder: state.attempt.setupNonce,
        currentNonce: state.setupNonce
      })
    }
  }
  if (request.setupNonce !== state.setupNonce) {
    return kitError('WrongSetupNonce', { supplied: request.setupNonce, expected: state.setupNonce })
  }
  const recomputed = setupCommitmentOf(account, action, request.setupNonce, request.setupBody)
  if (recomputed !== state.setupCommitment) {
    return kitError('SetupCommitmentMismatch', { recomputed, committed: state.setupCommitment })
  }
  let body
  try {
    body = readSetupBody(request.setupBody)
  } catch {
    return kitError('SetupCommitmentMismatch', { recomputed, committed: state.setupCommitment })
  }
  const hashes = body.clauses.flatMap((c) => c.credentials)
  const domain = {
    chainId: chain.manager.domain.chainId,
    manager: chain.descriptor.manager,
    digestVersion: chain.manager.domain.version
  }
  for (let i = 0; i < request.proofs.length; i++) {
    const p = request.proofs[i]
    if (i > 0 && p.place <= request.proofs[i - 1].place) {
      return kitError('PlacesNotStrictlyIncreasing', { place: p.place })
    }
    if (p.place >= BigInt(hashes.length)) {
      return kitError('PlaceOutOfRange', { place: p.place, count: BigInt(hashes.length) })
    }
    const recomputedCredential = credentialHash(p.method, p.config, p.salt)
    if (recomputedCredential !== hashes[Number(p.place)]) {
      return kitError('CredentialMismatch', { place: p.place, recomputed: recomputedCredential })
    }
    if (!body.ignoresPause && chain.method(p.method)?.paused === true) {
      return kitError('MethodStopped', { place: p.place, method: p.method })
    }
    const digest = digestOfSubmission(request, purpose, domain, p.place)
    if (p.proof.toLowerCase() !== doubleProof(p.config, digest).toLowerCase()) {
      return kitError('ProofRejected', { place: p.place, method: p.method })
    }
  }
  const rule = evaluateRule(
    request.setupBody,
    request.proofs.map((p) => Number(p.place))
  )
  if (!rule.satisfied)
    return kitError('RuleUnsatisfied', { clause: BigInt(rule.failingClause ?? 0) })
  return undefined
}

/**
 * The execute path at the head block: the action's pre-check (the payload
 * decodes in its layout, the attempt is waiting at its
 * wait and committed to this payload, the two authorities are what the handover
 * needs), then the account, which must honour the action and be one the action
 * serves, then the consume inside the batch, which a stopped used method vetoes.
 */
export const executeRevert = (
  chain: ScriptedChain,
  attemptId: bigint,
  payload: Hex
): KitError | undefined => {
  const handover = decodeHandover(chain, payload)
  if (!handover || malformedHandover(handover)) {
    return kitError('MalformedHandover', { payload }, 'action')
  }
  const live = chain.attemptRecord()
  if (
    live.state !== 'Waiting' ||
    live.attemptId !== attemptId ||
    live.consumableAfter > chain.head.timestamp ||
    keccak256(payload) !== live.payloadHash
  ) {
    return kitError(
      'NotConsumable',
      {
        account: chain.account,
        state: live.state,
        consumableAfter: live.consumableAfter,
        committedPayloadHash: live.payloadHash
      },
      'action'
    )
  }
  if (!chain.isAuthority(handover.removedAuthority)) {
    return kitError('ReservedAuthority', { authority: handover.removedAuthority }, 'action')
  }
  if (chain.holdsAnyPrivilege(handover.newAuthority)) {
    return kitError('ReservedAuthority', { authority: handover.newAuthority }, 'action')
  }
  if (!chain.authorized) {
    return kitError(ACCOUNT_NOT_ARMED, { account: chain.account, action: chain.action }, 'account')
  }
  if (!(chain.hasCode && chain.supportsAccount)) {
    return kitError(
      ACCOUNT_UNFIT,
      { account: chain.account, hasCode: chain.hasCode, supportsAccount: chain.supportsAccount },
      'account'
    )
  }
  if (!live.ignoresPause) {
    const stopped = live.usedMethods.find((m: Address) => chain.method(m)?.paused === true)
    if (stopped) return kitError('MethodVetoedSpend', { method: stopped })
  }
  return undefined
}
