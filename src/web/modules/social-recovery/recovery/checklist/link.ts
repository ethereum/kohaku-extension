/**
 * The approval page's link: the extension's own full-tab page at the approve
 * route, with one search parameter carrying one place's request as the client
 * cut it. The request names the setup by the hash of its body, never the
 * body, so the link shows a guardian that place's values and nothing else of
 * the path. The approval page reads the link back with the decoder.
 */
import { isHex } from 'viem'

import { WEB_ROUTES } from '@common/modules/router/constants/common'
import { browser } from '@web/constants/browserapi'
import type { ApproverRequest, SerializedPaymentOrder } from '@kohaku-eth/social-recovery'

import { isDecimalString, isStoredAddress } from '@web/modules/social-recovery/shared/records'

import { isIndex, isObject, isPurpose, isText, lineOfRecord, recordOfLine } from './codec'
import { APPROVAL_REQUEST_KEY, TAB_PAGE } from './constants'

/**
 * The extension's full-tab page: the runtime's URL of it, or, where no
 * extension runtime answers, the same page beside the one this tab shows.
 */
export const tabPageUrl = (): string => {
  const runtimeUrl = browser?.runtime?.getURL?.(TAB_PAGE)
  if (typeof runtimeUrl === 'string' && runtimeUrl) {
    return runtimeUrl
  }
  if (typeof window !== 'undefined' && window.location) {
    return new URL(TAB_PAGE, window.location.href).toString()
  }
  return TAB_PAGE
}

/**
 * The request's declared fields in a fresh object, so a field a client adds
 * beside them never travels in the link.
 */
const declaredFieldsOf = (request: ApproverRequest): ApproverRequest => {
  const head = { kind: request.kind, version: request.version }
  const members = {
    chainId: request.chainId,
    manager: request.manager,
    digestVersion: request.digestVersion,
    account: request.account,
    action: request.action,
    attemptId: request.attemptId,
    setupNonce: request.setupNonce,
    setupBodyHash: request.setupBodyHash
  }
  const tail = {
    validUntil: request.validUntil,
    place: request.place,
    method: request.method,
    config: request.config,
    salt: request.salt,
    credentialHoldsCode: request.credentialHoldsCode
  }
  if (request.purpose === 'approval') {
    const { token, amount, payee } = request.order
    return {
      ...head,
      purpose: 'approval',
      ...members,
      payload: request.payload,
      order: { token, amount, payee },
      ...tail
    }
  }
  return { ...head, purpose: 'cancellation', ...members, ...tail }
}

/** The link to the approval page for one place's request, one line. */
export const approvalLinkOf = (request: ApproverRequest, tabUrl: string = tabPageUrl()): string => {
  const query = new URLSearchParams()
  query.set(APPROVAL_REQUEST_KEY, lineOfRecord(declaredFieldsOf(request)))
  return `${tabUrl}#/${WEB_ROUTES.socialRecoveryApprove}?${query.toString()}`
}

/** A request's payment order, or null where it is missing or malformed. */
const orderOf = (value: unknown): SerializedPaymentOrder | null => {
  if (
    !isObject(value) ||
    !isStoredAddress(value.token) ||
    !isDecimalString(value.amount) ||
    !isStoredAddress(value.payee)
  ) {
    return null
  }
  return { token: value.token, amount: value.amount, payee: value.payee }
}

/**
 * The request a link carries, from the link itself or from the route's search
 * string, or null where any field is missing or has the wrong type. An
 * approval request carries the handover bytes and its payment order. A link
 * that does not say whether the credential's address holds code reads as one
 * that holds none.
 */
export const requestOfApprovalLink = (search: string): ApproverRequest | null => {
  const at = search.lastIndexOf('?')
  const query = new URLSearchParams(at === -1 ? search : search.slice(at + 1))
  const line = query.get(APPROVAL_REQUEST_KEY)
  if (!line) {
    return null
  }
  const r = recordOfLine(line)
  if (!isObject(r)) {
    return null
  }
  if (
    r.kind !== 'recovery-proof-request' ||
    !isIndex(r.version) ||
    !isPurpose(r.purpose) ||
    !isDecimalString(r.chainId) ||
    !isStoredAddress(r.manager) ||
    !isText(r.digestVersion) ||
    !isStoredAddress(r.account) ||
    !isStoredAddress(r.action) ||
    !isDecimalString(r.attemptId) ||
    !isDecimalString(r.setupNonce) ||
    !isHex(r.setupBodyHash) ||
    !isDecimalString(r.validUntil) ||
    !isIndex(r.place) ||
    !isStoredAddress(r.method) ||
    !isHex(r.config) ||
    !isHex(r.salt) ||
    (r.credentialHoldsCode !== undefined && typeof r.credentialHoldsCode !== 'boolean')
  ) {
    return null
  }
  const head = { kind: r.kind, version: r.version } as const
  const members = {
    chainId: r.chainId,
    manager: r.manager,
    digestVersion: r.digestVersion,
    account: r.account,
    action: r.action,
    attemptId: r.attemptId,
    setupNonce: r.setupNonce,
    setupBodyHash: r.setupBodyHash
  }
  const tail = {
    validUntil: r.validUntil,
    place: r.place,
    method: r.method,
    config: r.config,
    salt: r.salt,
    credentialHoldsCode: r.credentialHoldsCode ?? false
  }
  if (r.purpose === 'cancellation') {
    return { ...head, purpose: 'cancellation', ...members, ...tail }
  }
  const order = orderOf(r.order)
  if (!isHex(r.payload) || !order) {
    return null
  }
  return { ...head, purpose: 'approval', ...members, payload: r.payload, order, ...tail }
}

/** Opens the approval page in a new full tab, beside the checklist. */
export const openApprovalPage = (link: string): void => {
  if (browser?.tabs?.create) {
    browser.tabs.create({ url: link, active: true })?.catch?.(() => undefined)
    return
  }
  if (typeof window !== 'undefined') {
    window.open(link, '_blank', 'noopener')
  }
}
