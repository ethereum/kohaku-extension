/**
 * The ceremony a tab runs, read from the route's search params, and the path a
 * caller navigates to. Pure: a test builds and parses the search under node.
 *
 * `tab.html#/social-recovery/ceremony?call=enroll&method=passkey&id=<request id>`
 *
 * - `call`: one of the four lifecycle calls.
 * - `method`: the method kind the caller's row holds, a slug such as `passkey`.
 * - `id`: the request id the caller stored its ceremony under and the key the
 *   verdict returns under.
 * - `handOff`: `phone` where the holder chose the browser's phone hand-off.
 * - `returnTo`: the in-extension path the tab returns to once it has reported.
 */
import { WEB_ROUTES } from '@common/modules/router/constants/common'

import type { CeremonyParams, ParsedCeremony } from './types'
import { isCeremonyCall } from './verdicts'

export const CEREMONY_SEARCH_KEYS = {
  call: 'call',
  method: 'method',
  id: 'id',
  handOff: 'handOff',
  returnTo: 'returnTo'
} as const

const SLUG = /^[a-z0-9][a-z0-9-]{0,63}$/
const REQUEST_ID = /^[A-Za-z0-9_-]{1,128}$/

/**
 * Whether `path` is a path inside this extension's router: it starts with one
 * slash, never two, and names no scheme, so a returned tab never leaves the
 * extension.
 */
export const isInternalPath = (path: string): boolean =>
  path.startsWith('/') &&
  !path.startsWith('//') &&
  !path.includes('\\') &&
  !/^\/*[a-z][a-z0-9+.-]*:/i.test(path.slice(1)) &&
  path.length <= 512

/** Reads the ceremony of a search string or of `URLSearchParams`. */
export const parseCeremonySearch = (search: string | URLSearchParams): ParsedCeremony => {
  const query = typeof search === 'string' ? new URLSearchParams(search) : search
  const call = query.get(CEREMONY_SEARCH_KEYS.call)
  if (!isCeremonyCall(call)) return { ok: false, reason: 'call' }
  const method = query.get(CEREMONY_SEARCH_KEYS.method) ?? ''
  if (!SLUG.test(method)) return { ok: false, reason: 'method' }
  const id = query.get(CEREMONY_SEARCH_KEYS.id) ?? ''
  if (!REQUEST_ID.test(id)) return { ok: false, reason: 'id' }
  const returnTo = query.get(CEREMONY_SEARCH_KEYS.returnTo) ?? undefined
  if (returnTo !== undefined && !isInternalPath(returnTo)) return { ok: false, reason: 'returnTo' }
  return {
    ok: true,
    params: {
      call,
      method,
      id,
      handOff: query.get(CEREMONY_SEARCH_KEYS.handOff) === 'phone',
      ...(returnTo ? { returnTo } : {})
    }
  }
}

/** The search string of a ceremony, `?call=…&method=…&id=…`. */
export const ceremonySearch = (params: CeremonyParams): string => {
  const query = new URLSearchParams()
  query.set(CEREMONY_SEARCH_KEYS.call, params.call)
  query.set(CEREMONY_SEARCH_KEYS.method, params.method)
  query.set(CEREMONY_SEARCH_KEYS.id, params.id)
  if (params.handOff) query.set(CEREMONY_SEARCH_KEYS.handOff, 'phone')
  if (params.returnTo) query.set(CEREMONY_SEARCH_KEYS.returnTo, params.returnTo)
  return `?${query.toString()}`
}

/**
 * The router path a caller navigates to, `/social-recovery/ceremony?…`. A
 * caller already in a tab navigates there in the same tab; one outside a tab
 * opens it through `openInternalPageInTab`, which TabOnlyRoute does for it.
 */
export const ceremonyPath = (params: CeremonyParams): string =>
  `/${WEB_ROUTES.socialRecoveryCeremony}${ceremonySearch(params)}`
