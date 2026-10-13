/**
 * The paste check: a pasted approval counts or fails at once, with one
 * written error, and no row ever holds an approval as pending. The steps run
 * in a fixed order: the shape and the version, already in the list, expired,
 * the verify against the request of the reply's own place, then the add. An
 * approval matches by its signer and its place, never by the row it was
 * pasted into.
 */
import { isHex } from 'viem'

import type { ApproverReply, ApproverRequest } from '@web/modules/social-recovery/sdk-interfaces'
import type { Translate } from '@web/modules/social-recovery/shared/display'

import { isDecimalString, isStoredAddress } from '@web/modules/social-recovery/shared/records'

import { isIndex, isObject, isPurpose, lineOfRecord, recordOfLine } from './codec'
import type {
  AddReplyResult,
  ChecklistLayout,
  PasteError,
  PasteInput,
  PasteJudgeInput,
  PasteJudgement,
  PasteOutcome,
  VerifyReply,
  VerifyStep
} from './types'

/** An approval as the one line the guardian sends back. */
export const replyLineOf = (reply: ApproverReply): string => lineOfRecord(reply)

/** The approval a pasted line carries, or null where it is not one; whitespace around it is ignored. */
export const replyOfLine = (text: string): ApproverReply | null => {
  const r = recordOfLine(text)
  if (
    !isObject(r) ||
    r.kind !== 'recovery-proof-reply' ||
    !isIndex(r.version) ||
    !isDecimalString(r.chainId) ||
    !isStoredAddress(r.manager) ||
    !isStoredAddress(r.account) ||
    !isStoredAddress(r.action) ||
    !isDecimalString(r.attemptId) ||
    !isPurpose(r.purpose) ||
    !isIndex(r.place) ||
    !isStoredAddress(r.method) ||
    !isHex(r.config) ||
    !isHex(r.salt) ||
    !isHex(r.digest) ||
    !isHex(r.proof)
  ) {
    return null
  }
  return {
    kind: r.kind,
    version: r.version,
    chainId: r.chainId,
    manager: r.manager,
    account: r.account,
    action: r.action,
    attemptId: r.attemptId,
    purpose: r.purpose,
    place: r.place,
    method: r.method,
    config: r.config,
    salt: r.salt,
    digest: r.digest,
    proof: r.proof
  }
}

/** Whether one approval is the whole request: a one-row path, or a lone group of threshold one. */
export const oneApprovalOf = (layout: ChecklistLayout): boolean =>
  layout.required.length + layout.groups.reduce((sum, group) => sum + group.threshold, 0) === 1

/** The first four steps, before any await: the shape, already in the list, expired, and what to verify. */
export const judgePaste = (input: PasteJudgeInput): PasteJudgement => {
  const reply = replyOfLine(input.text)
  if (!reply || input.versionRefused(reply)) {
    return { kind: 'refused', error: { kind: 'notAnApproval' } }
  }
  const held = input.gathering.replies.some(
    (known) =>
      known.place === reply.place && known.proof.toLowerCase() === reply.proof.toLowerCase()
  )
  if (held) {
    return { kind: 'refused', error: { kind: 'duplicate' } }
  }
  if (input.nowSeconds >= Number(input.gathering.request.validUntil)) {
    return { kind: 'refused', error: { kind: 'expired', one: input.oneApproval } }
  }
  return { kind: 'verify', reply, request: input.requests.get(reply.place) }
}

/**
 * The verify of one reply against its place's request. Only a satisfied
 * verdict passes; a verdict that judges nothing is a failed check the holder
 * retries, as is any thrown read.
 */
export const verifyStepOf = async (
  verify: VerifyReply,
  request: ApproverRequest,
  reply: ApproverReply
): Promise<VerifyStep> => {
  try {
    const verdict = await verify(request, reply)
    if (verdict === 'rejected') {
      return 'rejected'
    }
    return verdict === 'satisfied' ? 'pass' : 'failed'
  } catch {
    return 'failed'
  }
}

const NO_MATCH_CAUSES = [
  'binding-mismatch',
  'digest-mismatch',
  'place-unknown',
  'credential-mismatch'
]

/** The written error an add that did not land renders. */
export const errorOfAdd = (result: Exclude<AddReplyResult, { kind: 'added' }>): PasteError => {
  if (result.kind === 'conflict') {
    return { kind: 'conflict' }
  }
  if (result.kind === 'write-failed') {
    return { kind: 'writeFailed' }
  }
  if (result.cause === 'version-unread') {
    return { kind: 'notAnApproval' }
  }
  return NO_MATCH_CAUSES.includes(result.cause) ? { kind: 'noMatch' } : { kind: 'writeFailed' }
}

const PASTE = 'socialRecovery.checklist.paste'

/**
 * The lines an error renders in the field's error line: the error, then its
 * detail or repair. An approval that matches nothing names its three causes,
 * a repair with each, since the pasted bytes cannot tell them apart.
 */
export const pasteErrorLinesOf = (error: PasteError, t: Translate): string[] => {
  switch (error.kind) {
    case 'notAnApproval':
      return [t(`${PASTE}.notAnApproval`), t(`${PASTE}.notAnApprovalRepair`)]
    case 'duplicate':
      return [t(`${PASTE}.duplicate`), t(`${PASTE}.duplicateDetail`)]
    case 'expired':
      return [
        t(`${PASTE}.expired`),
        t(error.one ? `${PASTE}.expiredDetailOne` : `${PASTE}.expiredDetail`)
      ]
    case 'noMatch':
      return [
        t(`${PASTE}.noMatch`),
        t(`${PASTE}.noMatchLead`),
        t(`${PASTE}.causeSigner`),
        t(`${PASTE}.causeOtherRequest`),
        t(`${PASTE}.causeUndeployed`)
      ]
    case 'checkFailed':
      return [t(`${PASTE}.checkFailed`)]
    case 'writeFailed':
      return [t('socialRecovery.checklist.writeFailed')]
    case 'conflict':
    default:
      return []
  }
}

/** One paste, every step in order; the clock is read once, before any await. */
export const pasteApproval = async (input: PasteInput): Promise<PasteOutcome> => {
  const nowSeconds = Math.floor(input.now() / 1000)
  const judged = judgePaste({ ...input, nowSeconds })
  if (judged.kind === 'refused') {
    return { kind: 'error', error: judged.error }
  }
  const { reply, request } = judged
  if (request) {
    const step = await verifyStepOf(input.verifyReply, request, reply)
    if (step === 'rejected') {
      return { kind: 'error', error: { kind: 'noMatch' } }
    }
    if (step === 'failed') {
      return { kind: 'error', error: { kind: 'checkFailed' } }
    }
  }
  const added = await input.addReply(reply)
  if (added.kind === 'added') {
    return { kind: 'added', place: reply.place }
  }
  return { kind: 'error', error: errorOfAdd(added) }
}
