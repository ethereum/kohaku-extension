import type { Hex } from '@web/modules/social-recovery/sdk-interfaces'

/** The byte forms the browser's WebAuthn objects hand over. */
export type BytesLike = ArrayBuffer | ArrayBufferView

/** The two integers of an ECDSA signature. */
export interface SignatureParts {
  r: bigint
  s: bigint
}

export interface NormalizedDerSignature {
  signature: Uint8Array
  normalized: boolean
}

/** An uncompressed P-256 public point, each coordinate 32 bytes. */
export interface P256Point {
  x: Hex
  y: Hex
}

/** The CBOR values a COSE key carries. */
export type CborValue = number | Uint8Array | string | CborMap

export type CborMap = Map<number | string, CborValue>

export interface CborRead {
  value: CborValue
  next: number
}
