/**
 * The one-line forms a record travels in between the recoverer and a
 * guardian. The approval link carries its request as JSON encoded base64url
 * with no padding, since it rides in a URL; the approval a guardian sends back
 * is plain JSON on one line. The field checks read a decoded record whose
 * sender this wallet does not control.
 */
import { bytesToString, stringToBytes } from 'viem'

import { fromBase64Url, toBase64Url } from '@web/modules/social-recovery/shared/ceremony'

const BASE64URL = /^[A-Za-z0-9_-]+$/

/** The longest line a record travels in; a longer one is no record. */
const MAX_LINE_LENGTH = 16 * 1024

/** A record as one line: its JSON, base64url with no padding. */
export const lineOfRecord = (record: object): string =>
  toBase64Url(stringToBytes(JSON.stringify(record)))

/**
 * The JSON value a line carries, or null where the line is longer than a
 * record travels in or is not base64url of JSON.
 */
export const recordOfLine = (line: string): unknown => {
  const text = line.trim()
  if (text.length > MAX_LINE_LENGTH || !BASE64URL.test(text)) {
    return null
  }
  try {
    return JSON.parse(bytesToString(fromBase64Url(text)))
  } catch {
    return null
  }
}

/**
 * The JSON value a pasted text carries, any JSON whitespace accepted, or null
 * where the text is longer than a record travels in or is not JSON.
 */
export const recordOfJsonLine = (text: string): unknown => {
  if (text.length > MAX_LINE_LENGTH) {
    return null
  }
  try {
    return JSON.parse(text)
  } catch {
    return null
  }
}

export const isObject = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value)

export const isText = (value: unknown): value is string => typeof value === 'string'

export const isIndex = (value: unknown): value is number =>
  typeof value === 'number' && Number.isInteger(value) && value >= 0

export const isPurpose = (value: unknown): value is 'approval' | 'cancellation' =>
  value === 'approval' || value === 'cancellation'
