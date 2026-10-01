/**
 * The screen's search, `?kind=<slug>&clause=<n>&member=<m>`, with
 * `&ceremony=<request id>` once a ceremony tab returns to it. A search is a
 * URL the holder can edit, so it is read here once and nowhere else.
 */
import { WEB_ROUTES } from '@common/modules/router/constants/common'
import { SLOT_KINDS } from '@web/modules/social-recovery/shared/records'
import type { SlotKind } from '@web/modules/social-recovery/shared/records'

import type { EnrollSearch } from './types'

/** The search keys the screen reads: the slot's kind and position, and a ceremony that returned. */
export const ENROLL_SEARCH_KEYS = {
  kind: 'kind',
  clause: 'clause',
  member: 'member',
  ceremony: 'ceremony'
} as const

const POSITION = /^(0|[1-9][0-9]{0,3})$/
const REQUEST_ID = /^[A-Za-z0-9_-]{1,128}$/

const isSlotKind = (value: string | null): value is SlotKind =>
  SLOT_KINDS.some((kind) => kind === value)

/**
 * The slot a search names, or null where its kind is not one the address book
 * names or a position is not a whole number. A malformed ceremony id is left
 * out, since no report is due under it.
 */
export const parseEnrollSearch = (search: string): EnrollSearch | null => {
  const query = new URLSearchParams(search)
  const kind = query.get(ENROLL_SEARCH_KEYS.kind)
  if (!isSlotKind(kind)) {
    return null
  }
  const clause = query.get(ENROLL_SEARCH_KEYS.clause) ?? ''
  const member = query.get(ENROLL_SEARCH_KEYS.member) ?? ''
  if (!POSITION.test(clause) || !POSITION.test(member)) {
    return null
  }
  const ceremony = query.get(ENROLL_SEARCH_KEYS.ceremony)
  return {
    kind,
    at: { clause: Number(clause), member: Number(member) },
    ...(ceremony !== null && REQUEST_ID.test(ceremony) ? { ceremony } : {})
  }
}

/** This screen's own path for a slot, with the ceremony whose report the return waits for. */
export const enrollPathOf = (search: EnrollSearch, ceremony?: string): string => {
  const query = new URLSearchParams()
  query.set(ENROLL_SEARCH_KEYS.kind, search.kind)
  query.set(ENROLL_SEARCH_KEYS.clause, String(search.at.clause))
  query.set(ENROLL_SEARCH_KEYS.member, String(search.at.member))
  if (ceremony) {
    query.set(ENROLL_SEARCH_KEYS.ceremony, ceremony)
  }
  return `/${WEB_ROUTES.socialRecoverySetupEnroll}?${query.toString()}`
}
