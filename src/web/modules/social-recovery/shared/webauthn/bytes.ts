import type { Hex } from '@web/modules/social-recovery/sdk-interfaces'
import { hexToBytes } from 'viem'

import type { BytesLike } from './types'

export const bytesOf = (data: BytesLike): Uint8Array =>
  data instanceof Uint8Array
    ? data
    : ArrayBuffer.isView(data)
    ? new Uint8Array(data.buffer, data.byteOffset, data.byteLength)
    : new Uint8Array(data)

/**
 * Whether a value handed across the browser boundary is bytes. The tag test
 * accepts an ArrayBuffer from another realm, which `instanceof` refuses.
 */
export const isBytesLike = (value: unknown): value is BytesLike =>
  ArrayBuffer.isView(value) || Object.prototype.toString.call(value) === '[object ArrayBuffer]'

/** base64url without padding, the form a credential id travels in. */
export const toBase64Url = (data: BytesLike): string => {
  const bytes = bytesOf(data)
  let binary = ''
  bytes.forEach((b) => {
    binary += String.fromCharCode(b)
  })
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

/** The bytes of a base64url string, with or without padding. */
export const fromBase64Url = (text: string): Uint8Array => {
  const base64 = text.replace(/-/g, '+').replace(/_/g, '/')
  const padded = base64 + '='.repeat((4 - (base64.length % 4)) % 4)
  const binary = atob(padded)
  return Uint8Array.from(binary, (c) => c.charCodeAt(0))
}

/** The bytes of `hex` in an ArrayBuffer of their own, the buffer type WebCrypto takes. */
export const hexToArrayBuffer = (hex: Hex): ArrayBuffer => Uint8Array.from(hexToBytes(hex)).buffer
