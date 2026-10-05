import type { Address, Hex } from '@web/modules/social-recovery/sdk-interfaces'

/**
 * The five values a sealed backup authenticates beside its own version: the
 * setup it belongs to, read back from the setup event at a restore.
 */
export interface BackupBinding {
  account: Address
  action: Address
  setupCommitment: Hex
  setupNonce: bigint
}

/** The random values a seal draws: the key-derivation salt and the cipher nonce. */
export interface BackupRandomness {
  kdfSalt: Uint8Array
  nonce: Uint8Array
}

/**
 * Why a backup was not written or not read:
 * - `too-wide`: the plaintext does not fit the padded size;
 * - `field-width`: a value does not fit its field (a wait, a threshold, a count,
 *   a config length or a salt that is not 32 bytes);
 * - `unopened`: the password or the bound values do not open the payload;
 * - `unknown-version`: the leading byte names no format this build reads;
 * - `malformed`: the bytes do not follow the format their version names.
 */
export type BackupRefusalReason =
  | 'too-wide'
  | 'field-width'
  | 'unopened'
  | 'unknown-version'
  | 'malformed'

export interface BackupRefusal extends Error {
  name: 'BackupRefusal'
  reason: BackupRefusalReason
  /** The serialised plaintext's size, on `too-wide`. */
  plaintextSize?: number
  /** The padded size, on `too-wide`. */
  paddedSize?: number
  /** The leading byte read, on `unknown-version`. */
  version?: number
}

/** Reads a serialised plaintext front to back. */
export interface PlaintextReader {
  /** The next `length` bytes; refuses where fewer remain. */
  take(length: number): Uint8Array
  byte(): number
  /** Every byte not read yet. */
  rest(): Uint8Array
}
