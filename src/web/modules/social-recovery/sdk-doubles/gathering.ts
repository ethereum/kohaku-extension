/**
 * The four record operations over a gathering, pure arithmetic with no chain:
 * the approvers' requests, the filing of a reply with its refusals, the
 * assessment and the completion into a submission request. The rule
 * evaluation is passed in, since the setup body's bytes differ between the
 * doubles and a deployed kit.
 */
import type {
  AddRefusalReason,
  AddResult,
  ApproverReply,
  ApproverRequest,
  Assessment,
  AttemptRequest,
  CancelRequest,
  Finding,
  Gathering,
  GatheringPlace,
  Hex,
  ProofPlace
} from '@web/modules/social-recovery/sdk-interfaces'
import { zeroAddress } from 'viem'

import { deserializeOrder, digestOf, distinctAddresses, keccak256, sameAddress } from './encoding'
import { RECORD_VERSION, replyReadable } from './orchestrator'
import { codedError, finding, validationRefusal } from './scripts'
import type { AssessOptions, RequestFinding, RequestRow, RuleEvaluator, SetRank } from './types'

/**
 * How far a caller's moment may sit from the pinned timestamp before
 * `request.moment-skew`. The client configuration has no field for it, so the
 * span is the doubles' own.
 */
export const MOMENT_SKEW_SPAN = 15 * 60

/** Every request row carries the subject `request`. */
export const rowsToFindings = (rows: RequestRow[]): Finding[] =>
  rows.map(([code, values]) => finding(code, 'request', values ?? {}))

export const refuseWith = (...rows: RequestRow[]): never => {
  throw validationRefusal({ errors: rowsToFindings(rows), warnings: [] })
}

const readsGathering = (g: Gathering): boolean =>
  !!g && g.kind === 'gathering' && g.version === RECORD_VERSION

const refuseUnread = (gathering: Gathering): never => {
  throw codedError('version-unread', { kind: gathering?.kind, version: gathering?.version })
}

const digestForPlace = (g: Gathering, place: GatheringPlace): Hex =>
  digestOf({
    chainId: g.request.chainId,
    manager: g.request.manager,
    digestVersion: g.request.digestVersion,
    purpose: g.purpose,
    account: g.request.account,
    action: g.request.action,
    attemptId: g.request.attemptId,
    setupNonce: g.request.setupNonce,
    setupBodyHash: keccak256(g.request.setupBody),
    payload: g.request.payload,
    order: g.request.order,
    validUntil: g.request.validUntil,
    place: place.place
  })

/** Every way to pick `size` of `places`, each pick in the order given. */
const picksOf = (places: number[], size: number): number[][] => {
  if (size <= 0) {
    return [[]]
  }
  if (places.length < size) {
    return []
  }
  const [first, ...rest] = places
  return [...picksOf(rest, size - 1).map((pick) => [first, ...pick]), ...picksOf(rest, size)]
}

const compareRanks = (a: SetRank, b: SetRank): number => {
  if (a.stopped !== b.stopped) {
    return a.stopped - b.stopped
  }
  if (a.stoppable !== b.stoppable) {
    return a.stoppable - b.stoppable
  }
  const i = a.filed.findIndex((position, j) => position !== b.filed[j])
  return i < 0 ? 0 : a.filed[i] - b.filed[i]
}

/** One request per place, each carrying the payload and the order only on an approval. */
export const approverRequestsOf = (gathering: Gathering): ApproverRequest[] => {
  if (!readsGathering(gathering)) {
    refuseUnread(gathering)
  }
  const r = gathering.request
  const setupBodyHash = keccak256(r.setupBody)
  return gathering.places.map((p) => {
    const request: ApproverRequest = {
      kind: 'recovery-proof-request',
      version: RECORD_VERSION,
      purpose: gathering.purpose,
      chainId: r.chainId,
      manager: r.manager,
      digestVersion: r.digestVersion,
      account: r.account,
      action: r.action,
      attemptId: r.attemptId,
      setupNonce: r.setupNonce,
      setupBodyHash,
      validUntil: r.validUntil,
      place: p.place,
      method: p.method,
      config: p.config,
      salt: p.salt
    }
    if (gathering.purpose === 'approval') {
      request.payload = r.payload
      request.order = r.order
    }
    return request
  })
}

/**
 * Files one reply at its place, replacing an earlier reply there. A reply that
 * does not read, is bound to another request, names an unknown place or
 * another credential, or signs another digest is refused, never thrown.
 */
export const addReplyTo = (gathering: Gathering, reply: ApproverReply): AddResult => {
  const refuse = (cause: AddRefusalReason): AddResult => ({
    gathering,
    reason: { kind: 'add-refusal', cause }
  })
  if (!readsGathering(gathering) || !replyReadable(reply)) {
    return refuse('version-unread')
  }
  const r = gathering.request
  const bound =
    reply.chainId === r.chainId &&
    sameAddress(reply.manager, r.manager) &&
    sameAddress(reply.account, r.account) &&
    sameAddress(reply.action, r.action) &&
    reply.attemptId === r.attemptId &&
    reply.purpose === gathering.purpose
  if (!bound) {
    return refuse('binding-mismatch')
  }
  const place = gathering.places.find((p) => p.place === reply.place)
  if (!place) {
    return refuse('place-unknown')
  }
  if (
    !sameAddress(place.method, reply.method) ||
    place.config.toLowerCase() !== reply.config.toLowerCase() ||
    place.salt.toLowerCase() !== reply.salt.toLowerCase()
  ) {
    return refuse('credential-mismatch')
  }
  if (digestForPlace(gathering, place).toLowerCase() !== reply.digest.toLowerCase()) {
    return refuse('digest-mismatch')
  }
  const displaced = gathering.replies.find((x) => x.place === reply.place)
  const next: Gathering = {
    ...gathering,
    replies: [...gathering.replies.filter((x) => x.place !== reply.place), { ...reply }]
  }
  return displaced ? { gathering: next, displaced } : { gathering: next }
}

/** The filled and missing places, the count per clause, the rule's verdict and the window's findings. */
export const assessGathering = (
  gathering: Gathering,
  now: number,
  { floor, evaluate }: AssessOptions
): Assessment => {
  if (!readsGathering(gathering)) {
    refuseUnread(gathering)
  }
  const r = gathering.request
  const filledSet = new Set(gathering.replies.map((x) => x.place))
  const all = gathering.places.map((p) => p.place)
  const filled = all.filter((p) => filledSet.has(p)).sort((a, b) => a - b)
  const missing = all.filter((p) => !filledSet.has(p)).sort((a, b) => a - b)
  // One rule evaluation everywhere: false for no clauses and for every threshold at zero.
  const rule = evaluate(r.setupBody, filled)
  const clauses = rule.clauses.map(({ clause, threshold, filled: count }) => ({
    clause,
    threshold,
    filled: count
  }))
  const findings: RequestFinding[] = []
  const validUntil = Number(r.validUntil)
  const pinned = Number(r.block.timestamp)
  if (now > validUntil) {
    findings.push(finding('request.expired', 'request', { validUntil, now }))
  }
  if (validUntil - pinned < floor) {
    findings.push(
      finding('request.window-short', 'request', { window: validUntil - pinned, floor })
    )
  }
  if (Math.abs(now - pinned) > MOMENT_SKEW_SPAN) {
    findings.push(
      finding('request.moment-skew', 'request', { now, pinned, span: MOMENT_SKEW_SPAN })
    )
  }
  if (
    gathering.purpose === 'cancellation' &&
    r.consumableAfter &&
    validUntil > Number(r.consumableAfter)
  ) {
    findings.push(
      finding('cancel.window-late', 'request', {
        validUntil,
        consumableAfter: Number(r.consumableAfter)
      })
    )
  }
  return { filled, missing, clauses, ruleSatisfied: rule.satisfied, findings }
}

/**
 * The submission request of a gathering whose filed replies satisfy the rule:
 * over the selection where one is given, else over the best-ranked satisfying
 * set, its proofs in place order.
 */
export const completeGathering = (
  gathering: Gathering,
  selection: number[] | undefined,
  now: number,
  evaluate: RuleEvaluator
): AttemptRequest | CancelRequest => {
  if (!readsGathering(gathering)) {
    refuseUnread(gathering)
  }
  const r = gathering.request
  if (now > Number(r.validUntil)) {
    refuseWith(['request.expired', { validUntil: Number(r.validUntil), now }])
  }
  const byPlace = new Map(gathering.places.map((p) => [p.place, p]))
  const filedOrder = new Map(gathering.replies.map((x, i) => [x.place, i]))
  const whole = evaluate(r.setupBody, [...filedOrder.keys()])
  if (!whole.satisfied) {
    refuseWith(['request.rule-unsatisfied', { clause: whole.failingClause }])
  }

  let chosen: number[]
  if (selection) {
    chosen = [...new Set(selection)]
    const picked = evaluate(r.setupBody, chosen)
    if (!chosen.every((p) => filedOrder.has(p)) || !picked.satisfied) {
      refuseWith(['request.rule-unsatisfied', { selection: chosen, clause: picked.failingClause }])
    }
  } else {
    // The satisfying sets are ranked as whole sets: a set with no stopped
    // method first, then the fewest distinct methods that carry a stop, then
    // the earliest filed replies. Each candidate holds exactly its clause's
    // threshold of filed places, the smallest a satisfying set can be; a larger
    // set never ranks first, since a satisfying subset of it names no more
    // stopped or stoppable methods.
    const placeOf = (p: number): GatheringPlace => byPlace.get(p) as GatheringPlace
    const rankOf = (set: number[]): SetRank => ({
      stopped: set.some((p) => placeOf(p).standing === 'stopped') ? 1 : 0,
      stoppable: distinctAddresses(
        set.filter((p) => placeOf(p).stoppable).map((p) => placeOf(p).method)
      ).length,
      filed: set.map((p) => filedOrder.get(p) as number).sort((a, b) => a - b)
    })
    const candidates = whole.clauses.reduce<number[][]>(
      (sets, c) => {
        const picks = picksOf(
          c.places.filter((p) => filedOrder.has(p)),
          c.threshold
        )
        return sets.flatMap((set) => picks.map((pick) => [...set, ...pick]))
      },
      [[]]
    )
    chosen = candidates
      .map((set) => ({ set, rank: rankOf(set) }))
      .reduce((best, next) => (compareRanks(next.rank, best.rank) < 0 ? next : best)).set
  }
  const proofs: ProofPlace[] = [...chosen]
    .sort((a, b) => a - b)
    .map((p) => {
      const reply = gathering.replies.find((x) => x.place === p) as ApproverReply
      return {
        place: BigInt(p),
        method: reply.method,
        config: reply.config,
        salt: reply.salt,
        proof: reply.proof
      }
    })
  const common = {
    account: r.account,
    action: r.action,
    attemptId: BigInt(r.attemptId),
    setupNonce: BigInt(r.setupNonce),
    setupBody: r.setupBody,
    validUntil: Number(r.validUntil),
    proofs
  }
  if (gathering.purpose === 'cancellation') {
    return common
  }
  return {
    ...common,
    payload: r.payload ?? '0x',
    order: r.order
      ? deserializeOrder(r.order)
      : { token: zeroAddress, amount: 0n, payee: zeroAddress }
  }
}
