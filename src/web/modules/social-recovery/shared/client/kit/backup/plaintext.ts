/**
 * The backup plaintext, version 0x01. Integers are big-endian.
 *
 *   [0]          version, 0x01
 *   [1, 7)       wait in seconds, uint48
 *   [7]          0x01 where the setup ignores the pause, 0x00 otherwise
 *   [8]          clause count, uint8
 *   then per clause, in rule order:
 *     [+0]       threshold, uint8
 *     [+1]       credential count, uint8
 *     then per credential, in clause order:
 *       [+0, +20)        method address
 *       [+20, +22)       config length L, uint16
 *       [+22, +22+L)     config, in the method's own layout
 *       [+22+L]          0x01 where a supplied salt follows, 0x00 where the default salt applies
 *       [+23+L, +55+L)   the supplied salt, 32 bytes, present only after 0x01
 *
 * The clear backup is this plaintext as it stands, unpadded. The sealed backup
 * pads it with zero bytes to BACKUP_PADDED_SIZE before the seal, and its reader
 * requires every byte after the last credential to be zero. Labels and default
 * salts are not carried: a default salt recomputes from the account and the place.
 */
import {
  bytesToBigInt,
  bytesToHex,
  bytesToNumber,
  concat,
  getAddress,
  hexToBytes,
  isHex,
  maxUint16,
  maxUint48,
  maxUint8,
  numberToBytes
} from 'viem'

import type { Configuration, Credential, Hex } from '@web/modules/social-recovery/sdk-interfaces'

import { backupRefusal } from './refusal'
import type { PlaintextReader } from './types'

export const BACKUP_PLAINTEXT_VERSION = 0x01

const HEADER_SIZE = 9
const CLAUSE_FRAMING = 2
const CREDENTIAL_FRAMING = 3
const SALT_SIZE = 32

/**
 * The one size every sealed plaintext is padded to: 16 credentials at the
 * widest shipped config (a passkey's three words), each with a supplied salt
 * and its method address, plus this layout's framing for 16 one-credential
 * clauses. 2,368 + 9 + 32 + 48 = 2,457 bytes.
 */
export const BACKUP_PADDED_SIZE =
  16 * (96 + SALT_SIZE + 20) + HEADER_SIZE + 16 * CLAUSE_FRAMING + 16 * CREDENTIAL_FRAMING

const fieldRefusal = (what: string) =>
  backupRefusal('field-width', `The backup cannot carry ${what}.`)

const malformed = (what: string) => backupRefusal('malformed', `The backup is malformed: ${what}.`)

const unsigned = (value: bigint | number, max: bigint, size: number, what: string): Uint8Array => {
  if (typeof value === 'number' && !Number.isSafeInteger(value)) {
    throw fieldRefusal(what)
  }
  const big = BigInt(value)
  if (big < 0n || big > max) {
    throw fieldRefusal(what)
  }
  return numberToBytes(big, { size })
}

const credentialBytes = ({ method, config, salt }: Credential): Uint8Array[] => {
  const configBytes = hexToBytes(config)
  const framed = [
    hexToBytes(method),
    unsigned(configBytes.length, maxUint16, 2, 'a config this long'),
    configBytes
  ]
  if (salt === undefined) {
    return [...framed, Uint8Array.of(0)]
  }
  const saltBytes = hexToBytes(salt)
  if (saltBytes.length !== SALT_SIZE) {
    throw fieldRefusal('a salt that is not 32 bytes')
  }
  return [...framed, Uint8Array.of(1), saltBytes]
}

/** The serialised plaintext of a configuration, unpadded. */
export const backupPlaintextOf = (configuration: Configuration): Uint8Array =>
  concat([
    Uint8Array.of(BACKUP_PLAINTEXT_VERSION),
    unsigned(configuration.wait, maxUint48, 6, 'this wait'),
    Uint8Array.of(configuration.ignoresPause ? 1 : 0),
    unsigned(configuration.clauses.length, maxUint8, 1, 'this many clauses'),
    ...configuration.clauses.flatMap((clause) => [
      unsigned(clause.threshold, maxUint8, 1, 'this threshold'),
      unsigned(clause.credentials.length, maxUint8, 1, 'this many credentials in one clause'),
      ...clause.credentials.flatMap(credentialBytes)
    ])
  ])

/** The serialised plaintext's size, which must not exceed BACKUP_PADDED_SIZE to seal. */
export const backupPlaintextSizeOf = (configuration: Configuration): number =>
  backupPlaintextOf(configuration).length

/** The plaintext padded with zero bytes to BACKUP_PADDED_SIZE; refuses one that does not fit. */
export const paddedPlaintextOf = (configuration: Configuration): Uint8Array => {
  const plaintext = backupPlaintextOf(configuration)
  if (plaintext.length > BACKUP_PADDED_SIZE) {
    throw backupRefusal(
      'too-wide',
      `The backup needs ${plaintext.length} bytes; it holds ${BACKUP_PADDED_SIZE}.`,
      { plaintextSize: plaintext.length, paddedSize: BACKUP_PADDED_SIZE }
    )
  }
  const padded = new Uint8Array(BACKUP_PADDED_SIZE)
  padded.set(plaintext)
  return padded
}

const readerOf = (bytes: Uint8Array): PlaintextReader => {
  let offset = 0
  const take = (length: number): Uint8Array => {
    if (offset + length > bytes.length) {
      throw malformed('it ends early')
    }
    offset += length
    return bytes.subarray(offset - length, offset)
  }
  return { take, byte: () => take(1)[0], rest: () => bytes.subarray(offset) }
}

const readCredential = (reader: PlaintextReader): Credential => {
  const method = getAddress(bytesToHex(reader.take(20)))
  const config = bytesToHex(reader.take(bytesToNumber(reader.take(2))))
  const saltFlag = reader.byte()
  if (saltFlag === 0) {
    return { method, config }
  }
  if (saltFlag !== 1) {
    throw malformed('a salt flag is neither 0 nor 1')
  }
  return { method, config, salt: bytesToHex(reader.take(SALT_SIZE)) }
}

/**
 * Reads a serialised plaintext. With `padded` (the sealed form), every byte
 * after the last credential must be zero and another leading byte is
 * malformed, since the sealed version fixes the plaintext's; without it (the
 * clear form), no byte may follow and another leading byte is an unknown
 * version.
 */
export const configurationOfPlaintext = (bytes: Uint8Array, padded: boolean): Configuration => {
  const reader = readerOf(bytes)
  const version = reader.byte()
  if (version !== BACKUP_PLAINTEXT_VERSION && padded) {
    throw malformed(`the sealed plaintext has version ${version}`)
  }
  if (version !== BACKUP_PLAINTEXT_VERSION) {
    throw backupRefusal('unknown-version', `The backup plaintext has version ${version}.`, {
      version
    })
  }
  const wait = bytesToBigInt(reader.take(6))
  const pauseFlag = reader.byte()
  if (pauseFlag !== 0 && pauseFlag !== 1) {
    throw malformed('the pause flag is neither 0 nor 1')
  }
  const clauses = Array.from({ length: reader.byte() }, () => {
    const threshold = reader.byte()
    const count = reader.byte()
    return { threshold, credentials: Array.from({ length: count }, () => readCredential(reader)) }
  })
  const rest = reader.rest()
  if (padded ? rest.some((b) => b !== 0) : rest.length > 0) {
    throw malformed('bytes follow the last credential')
  }
  return { clauses, wait, ignoresPause: pauseFlag === 1 }
}

/** The clear backup: the serialised plaintext with its version byte, unpadded and unsealed. */
export const clearBackupOf = (configuration: Configuration): Hex =>
  bytesToHex(backupPlaintextOf(configuration))

/** Reads a clear backup read from the chain. */
export const openClearBackup = (payload: Hex): Configuration => {
  if (!isHex(payload, { strict: true }) || payload.length % 2 !== 0) {
    throw malformed('it is not hex bytes')
  }
  return configurationOfPlaintext(hexToBytes(payload), false)
}
