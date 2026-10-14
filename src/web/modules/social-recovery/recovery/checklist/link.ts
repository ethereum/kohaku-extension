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
import type {
  ApproverRequest,
  SerializedPaymentOrder
} from '@web/modules/social-recovery/sdk-interfaces'

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
const declaredFieldsOf = ({
  kind,
  version,
  purpose,
  chainId,
  manager,
  digestVersion,
  account,
  action,
  attemptId,
  setupNonce,
  setupBodyHash,
  payload,
  order,
  validUntil,
  place,
  method,
  config,
  salt
}: ApproverRequest): ApproverRequest => ({
  kind,
  version,
  purpose,
  chainId,
  manager,
  digestVersion,
  account,
  action,
  attemptId,
  setupNonce,
  setupBodyHash,
  ...(payload !== undefined ? { payload } : {}),
  ...(order ? { order: { token: order.token, amount: order.amount, payee: order.payee } } : {}),
  validUntil,
  place,
  method,
  config,
  salt
})

/** The link to the approval page for one place's request, one line. */
export const approvalLinkOf = (request: ApproverRequest, tabUrl: string = tabPageUrl()): string => {
  const query = new URLSearchParams()
  query.set(APPROVAL_REQUEST_KEY, lineOfRecord(declaredFieldsOf(request)))
  return `${tabUrl}#/${WEB_ROUTES.socialRecoveryApprove}?${query.toString()}`
}

/** A request's payment order: undefined where it carries none, null where it is malformed. */
const orderOf = (value: unknown): SerializedPaymentOrder | null | undefined => {
  if (value === undefined) {
    return undefined
  }
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
 * approval request carries the handover bytes; a missing payment order means
 * no payment.
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
  const order = orderOf(r.order)
  if (
    order === null ||
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
    (r.payload !== undefined && !isHex(r.payload)) ||
    (r.purpose === 'approval' && r.payload === undefined) ||
    !isDecimalString(r.validUntil) ||
    !isIndex(r.place) ||
    !isStoredAddress(r.method) ||
    !isHex(r.config) ||
    !isHex(r.salt)
  ) {
    return null
  }
  return {
    kind: r.kind,
    version: r.version,
    purpose: r.purpose,
    chainId: r.chainId,
    manager: r.manager,
    digestVersion: r.digestVersion,
    account: r.account,
    action: r.action,
    attemptId: r.attemptId,
    setupNonce: r.setupNonce,
    setupBodyHash: r.setupBodyHash,
    ...(r.payload !== undefined ? { payload: r.payload } : {}),
    ...(order ? { order } : {}),
    validUntil: r.validUntil,
    place: r.place,
    method: r.method,
    config: r.config,
    salt: r.salt
  }
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
