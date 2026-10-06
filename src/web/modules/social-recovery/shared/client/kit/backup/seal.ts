/**
 * The sealed backup, version 0x02.
 *
 *   [0]              version, 0x02
 *   [1, 17)          key-derivation salt, 16 random bytes
 *   [17, 29)         cipher nonce, 12 random bytes
 *   [29, 2502)       AES-256-GCM ciphertext of the plaintext padded to
 *                    BACKUP_PADDED_SIZE (2,457 bytes), then its 16-byte tag
 *
 * The key is 256 bits of PBKDF2-HMAC-SHA256 over the password's UTF-8 bytes in
 * Unicode NFC form, with the salt above and BACKUP_KDF_ITERATIONS iterations.
 *
 * The associated data is not stored; the reader rebuilds it from the setup
 * event the payload came with:
 *
 *   abi.encode(address account, address action, bytes32 setupCommitment,
 *              uint64 setupNonce, uint8 version), 160 bytes
 *
 * where version is the payload's own leading byte. A wrong password and wrong
 * associated data fail alike, at the tag.
 */
import { bytesToHex, concat, encodeAbiParameters, hexToBytes, isHex, stringToBytes } from 'viem'

import type { Configuration, Hex } from '@web/modules/social-recovery/sdk-interfaces'

import { configurationOfPlaintext, paddedPlaintextOf, BACKUP_PADDED_SIZE } from './plaintext'
import { backupRefusal } from './refusal'
import type { BackupBinding, BackupRandomness } from './types'

export const BACKUP_SEALED_VERSION = 0x02
export const BACKUP_KDF_ITERATIONS = 600_000
export const BACKUP_KDF_SALT_SIZE = 16
export const BACKUP_NONCE_SIZE = 12

const TAG_SIZE = 16

/** The sealed backup's one size, in bytes: 1 + 16 + 12 + 2,457 + 16 = 2,502. */
export const BACKUP_SEALED_SIZE =
  1 + BACKUP_KDF_SALT_SIZE + BACKUP_NONCE_SIZE + BACKUP_PADDED_SIZE + TAG_SIZE

/** The associated data a sealed backup authenticates, in the layout above. */
export const backupAssociatedDataOf = (binding: BackupBinding): Hex =>
  encodeAbiParameters(
    [
      { type: 'address' },
      { type: 'address' },
      { type: 'bytes32' },
      { type: 'uint64' },
      { type: 'uint8' }
    ],
    [
      binding.account,
      binding.action,
      binding.setupCommitment,
      binding.setupNonce,
      BACKUP_SEALED_VERSION
    ]
  )

const keyOf = async (password: string, kdfSalt: Uint8Array): Promise<CryptoKey> => {
  const passwordBytes = new Uint8Array(stringToBytes(password.normalize('NFC')))
  const material = await crypto.subtle.importKey('raw', passwordBytes, 'PBKDF2', false, [
    'deriveKey'
  ])
  passwordBytes.fill(0)
  return crypto.subtle.deriveKey(
    {
      name: 'PBKDF2',
      hash: 'SHA-256',
      salt: new Uint8Array(kdfSalt),
      iterations: BACKUP_KDF_ITERATIONS
    },
    material,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt']
  )
}

const cipherParamsOf = (nonce: Uint8Array, binding: BackupBinding): AesGcmParams => ({
  name: 'AES-GCM',
  iv: new Uint8Array(nonce),
  additionalData: new Uint8Array(hexToBytes(backupAssociatedDataOf(binding))),
  tagLength: TAG_SIZE * 8
})

const drawRandomness = (): BackupRandomness => ({
  kdfSalt: crypto.getRandomValues(new Uint8Array(BACKUP_KDF_SALT_SIZE)),
  nonce: crypto.getRandomValues(new Uint8Array(BACKUP_NONCE_SIZE))
})

// For tests and vectors only: a production seal never takes its random values from a caller.
export const sealBackupWithRandomness = async (
  configuration: Configuration,
  password: string,
  binding: BackupBinding,
  randomness: BackupRandomness
): Promise<Hex> => {
  const { kdfSalt, nonce } = randomness
  if (kdfSalt.length !== BACKUP_KDF_SALT_SIZE || nonce.length !== BACKUP_NONCE_SIZE) {
    throw backupRefusal('field-width', 'The backup salt is not 16 bytes or its nonce not 12.')
  }
  const plaintext = new Uint8Array(paddedPlaintextOf(configuration))
  const key = await keyOf(password, kdfSalt)
  const ciphertext = await crypto.subtle.encrypt(cipherParamsOf(nonce, binding), key, plaintext)
  return bytesToHex(
    concat([Uint8Array.of(BACKUP_SEALED_VERSION), kdfSalt, nonce, new Uint8Array(ciphertext)])
  )
}

/**
 * Seals a configuration under the password, bound to its setup, with a fresh
 * random salt and nonce. Refuses a plaintext wider than BACKUP_PADDED_SIZE.
 */
export const sealBackup = (
  configuration: Configuration,
  password: string,
  binding: BackupBinding
): Promise<Hex> => sealBackupWithRandomness(configuration, password, binding, drawRandomness())

/**
 * Opens a sealed backup read from the chain with the password and the setup it
 * came with. Refuses an unknown version, a payload of the wrong size, and a
 * password or binding the tag does not accept; it never returns a partial result.
 */
export const openBackup = async (
  payload: Hex,
  password: string,
  binding: BackupBinding
): Promise<Configuration> => {
  if (!isHex(payload, { strict: true }) || payload.length % 2 !== 0) {
    throw backupRefusal('malformed', 'The backup is malformed: it is not hex bytes.')
  }
  const bytes = hexToBytes(payload)
  if (bytes.length > 0 && bytes[0] !== BACKUP_SEALED_VERSION) {
    throw backupRefusal('unknown-version', `The sealed backup has version ${bytes[0]}.`, {
      version: bytes[0]
    })
  }
  if (bytes.length !== BACKUP_SEALED_SIZE) {
    throw backupRefusal(
      'malformed',
      `The backup is malformed: it is ${bytes.length} bytes, not ${BACKUP_SEALED_SIZE}.`
    )
  }
  const kdfSaltEnd = 1 + BACKUP_KDF_SALT_SIZE
  const nonceEnd = kdfSaltEnd + BACKUP_NONCE_SIZE
  const params = cipherParamsOf(bytes.subarray(kdfSaltEnd, nonceEnd), binding)
  const key = await keyOf(password, bytes.subarray(1, kdfSaltEnd))
  let plaintext: ArrayBuffer
  try {
    plaintext = await crypto.subtle.decrypt(params, key, new Uint8Array(bytes.subarray(nonceEnd)))
  } catch {
    throw backupRefusal('unopened', 'The backup does not open with this password for this setup.')
  }
  return configurationOfPlaintext(new Uint8Array(plaintext), true)
}
