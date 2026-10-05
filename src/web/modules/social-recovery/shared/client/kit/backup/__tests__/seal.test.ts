/**
 * A sealed backup is 2,502 bytes whatever rule it carries: 0x02, the 16-byte
 * key-derivation salt, the 12-byte nonce, then the AES-256-GCM ciphertext of
 * the plaintext padded with zeros to 2,457 bytes and its 16-byte tag. The key
 * is PBKDF2-HMAC-SHA256 over the password in NFC form, 600,000 iterations, and
 * the tag covers the account, the action, the setup commitment, the setup nonce
 * and the version, ABI-encoded. The tests open payloads with WebCrypto directly
 * to check the layout, not only the round trip.
 */
import {
  bytesToHex,
  concat,
  encodeAbiParameters,
  getAddress,
  hexToBytes,
  maxUint48,
  numberToHex,
  padHex,
  size,
  sliceHex,
  stringToBytes
} from 'viem'

import type { Configuration, Credential, Hex } from '@web/modules/social-recovery/sdk-interfaces'
import {
  backupAssociatedDataOf,
  clearBackupOf,
  openBackup,
  sealBackup
} from '@web/modules/social-recovery/shared/client/kit/backup'
import type {
  BackupBinding,
  BackupRandomness
} from '@web/modules/social-recovery/shared/client/kit/backup'
import { sealBackupWithRandomness } from '@web/modules/social-recovery/shared/client/kit/backup/seal'

jest.setTimeout(30_000)

const PASSWORD = 'correct horse battery staple'
const BINDING: BackupBinding = {
  account: '0x5aAeb6053F3E94C9b9A09f33669435E7Ef1BeAed',
  action: '0xfB6916095ca1df60bB79Ce92cE3Ea74c37c5d359',
  setupCommitment: `0x${'ab'.repeat(32)}`,
  setupNonce: 7n
}

const METHOD_A = '0xdbf03b407c01e7cd3cbea99509d93f8dddc8c6fb'
const METHOD_B = '0xd1220a0cf47c7b9be7a2e6ba89f429762e7b9adb'
const SALT: Hex = `0x${'11'.repeat(32)}`

/** Labels, a supplied salt on one credential only, methods in lower case. */
const MIXED: Configuration = {
  wait: 0n,
  ignoresPause: false,
  clauses: [
    {
      threshold: 1,
      credentials: [
        { method: METHOD_A, config: '0xdeadbeef', label: 'Phone', salt: SALT },
        { method: METHOD_B, config: `0x${'aa'.repeat(64)}`, label: 'Laptop' }
      ]
    },
    { threshold: 1, credentials: [{ method: METHOD_B, config: '0x' }] }
  ]
}

const MIXED_OPENED: Configuration = {
  wait: 0n,
  ignoresPause: false,
  clauses: [
    {
      threshold: 1,
      credentials: [
        { method: getAddress(METHOD_A), config: '0xdeadbeef', salt: SALT },
        { method: getAddress(METHOD_B), config: `0x${'aa'.repeat(64)}` }
      ]
    },
    { threshold: 1, credentials: [{ method: getAddress(METHOD_B), config: '0x' }] }
  ]
}

const EMPTY_RULE: Configuration = { wait: maxUint48, ignoresPause: true, clauses: [] }

const widest = (index: number): Credential => ({
  method: getAddress(numberToHex(index + 1, { size: 20 })),
  config: `0x${'cd'.repeat(96)}`,
  salt: `0x${'ee'.repeat(32)}`
})

/** Sixteen one-credential clauses at the widest salted config: a plaintext of exactly 2,457 bytes. */
const SIXTEEN_WIDEST: Configuration = {
  wait: 86_400n,
  ignoresPause: true,
  clauses: Array.from({ length: 16 }, (_, index) => ({
    threshold: 1,
    credentials: [widest(index)]
  }))
}

const FIXED: BackupRandomness = {
  kdfSalt: Uint8Array.from({ length: 16 }, (_, i) => i + 1),
  nonce: Uint8Array.from({ length: 12 }, (_, i) => 0xa0 + i)
}

/** The associated data written out word by word. */
const associatedDataByHand = (binding: BackupBinding): Hex =>
  concat([
    padHex(binding.account.toLowerCase() as Hex, { size: 32 }),
    padHex(binding.action.toLowerCase() as Hex, { size: 32 }),
    binding.setupCommitment,
    numberToHex(binding.setupNonce, { size: 32 }),
    numberToHex(2, { size: 32 })
  ])

/** Opens a payload with WebCrypto alone, following the layout. */
const decryptByHand = async (payload: Hex, password: string, binding: BackupBinding) => {
  const material = await crypto.subtle.importKey(
    'raw',
    new Uint8Array(stringToBytes(password)),
    'PBKDF2',
    false,
    ['deriveKey']
  )
  const key = await crypto.subtle.deriveKey(
    {
      name: 'PBKDF2',
      hash: 'SHA-256',
      salt: new Uint8Array(hexToBytes(sliceHex(payload, 1, 17))),
      iterations: 600_000
    },
    material,
    { name: 'AES-GCM', length: 256 },
    false,
    ['decrypt']
  )
  const plaintext = await crypto.subtle.decrypt(
    {
      name: 'AES-GCM',
      iv: new Uint8Array(hexToBytes(sliceHex(payload, 17, 29))),
      additionalData: new Uint8Array(hexToBytes(associatedDataByHand(binding))),
      tagLength: 128
    },
    key,
    new Uint8Array(hexToBytes(sliceHex(payload, 29)))
  )
  return new Uint8Array(plaintext)
}

describe('the associated data', () => {
  it('is the five values ABI-encoded, 160 bytes, ending in the sealed version', () => {
    const data = backupAssociatedDataOf(BINDING)
    expect(size(data)).toBe(160)
    expect(data).toBe(associatedDataByHand(BINDING))
    expect(data).toBe(
      encodeAbiParameters(
        [
          { type: 'address' },
          { type: 'address' },
          { type: 'bytes32' },
          { type: 'uint64' },
          { type: 'uint8' }
        ],
        [BINDING.account, BINDING.action, BINDING.setupCommitment, 7n, 2]
      )
    )
  })

  it('changes with each bound value', () => {
    const changed: BackupBinding[] = [
      { ...BINDING, account: BINDING.action },
      { ...BINDING, action: BINDING.account },
      { ...BINDING, setupCommitment: `0x${'ac'.repeat(32)}` },
      { ...BINDING, setupNonce: 8n }
    ]
    changed.forEach((binding) => {
      expect(backupAssociatedDataOf(binding)).toBe(associatedDataByHand(binding))
      expect(backupAssociatedDataOf(binding)).not.toBe(backupAssociatedDataOf(BINDING))
    })
  })
})

describe('a seal with given random values', () => {
  let payload: Hex

  beforeAll(async () => {
    payload = await sealBackupWithRandomness(MIXED, PASSWORD, BINDING, FIXED)
  })

  it('lays out the version, the given salt, the given nonce, then the ciphertext and tag', () => {
    expect(size(payload)).toBe(2502)
    expect(sliceHex(payload, 0, 1)).toBe('0x02')
    expect(sliceHex(payload, 1, 17)).toBe(bytesToHex(FIXED.kdfSalt))
    expect(sliceHex(payload, 17, 29)).toBe(bytesToHex(FIXED.nonce))
    expect(size(sliceHex(payload, 29))).toBe(2473)
  })

  it('seals the clear plaintext padded with zeros to 2,457 bytes, under the stated key and associated data', async () => {
    const plaintext = await decryptByHand(payload, PASSWORD, BINDING)
    const clear = hexToBytes(clearBackupOf(MIXED))
    expect(plaintext.length).toBe(2457)
    expect(plaintext[0]).toBe(0x01)
    expect(bytesToHex(plaintext.subarray(0, clear.length))).toBe(bytesToHex(clear))
    expect(plaintext.subarray(clear.length).every((byte) => byte === 0)).toBe(true)
  })

  it('opens to the rule with the methods checksummed, the labels dropped and only the supplied salt', async () => {
    await expect(openBackup(payload, PASSWORD, BINDING)).resolves.toStrictEqual(MIXED_OPENED)
  })
})

describe('the round trip', () => {
  it('gives back an empty rule with the largest wait and the pause ignored, at the one size', async () => {
    const first = await sealBackup(EMPTY_RULE, PASSWORD, BINDING)
    const second = await sealBackup(
      { ...EMPTY_RULE, wait: 0n, ignoresPause: false },
      PASSWORD,
      BINDING
    )
    expect(size(first)).toBe(2502)
    expect(size(second)).toBe(2502)
    expect(sliceHex(first, 1, 17)).not.toBe(sliceHex(second, 1, 17))
    expect(sliceHex(first, 17, 29)).not.toBe(sliceHex(second, 17, 29))
    await expect(openBackup(first, PASSWORD, BINDING)).resolves.toStrictEqual(EMPTY_RULE)
    await expect(openBackup(second, PASSWORD, BINDING)).resolves.toStrictEqual({
      wait: 0n,
      ignoresPause: false,
      clauses: []
    })
  })

  it('gives back sixteen of the widest salted credentials, at the same size', async () => {
    const payload = await sealBackup(SIXTEEN_WIDEST, PASSWORD, BINDING)
    expect(size(payload)).toBe(2502)
    await expect(openBackup(payload, PASSWORD, BINDING)).resolves.toStrictEqual(SIXTEEN_WIDEST)
  })
})

describe('a binding that does not encode', () => {
  const SHORT_COMMITMENT: BackupBinding = { ...BINDING, setupCommitment: `0x${'ab'.repeat(31)}` }

  it('throws the encoder error from a seal and from an open, not a refusal', async () => {
    const sealError: unknown = await sealBackup(EMPTY_RULE, PASSWORD, SHORT_COMMITMENT).catch(
      (error: unknown) => error
    )
    expect(sealError).toBeInstanceOf(Error)
    expect(sealError).not.toMatchObject({ name: 'BackupRefusal' })
    const payload = await sealBackup(EMPTY_RULE, PASSWORD, BINDING)
    const openError: unknown = await openBackup(payload, PASSWORD, SHORT_COMMITMENT).catch(
      (error: unknown) => error
    )
    expect(openError).toBeInstanceOf(Error)
    expect(openError).not.toMatchObject({ name: 'BackupRefusal' })
  })
})

describe('the password', () => {
  const COMPOSED = 'café Ångström'
  const DECOMPOSED = 'café Ångström'

  it('opens whichever Unicode form it was typed in', async () => {
    expect(DECOMPOSED).not.toBe(COMPOSED)
    expect(DECOMPOSED.normalize('NFC')).toBe(COMPOSED)
    const payload = await sealBackupWithRandomness(MIXED, DECOMPOSED, BINDING, FIXED)
    await expect(openBackup(payload, COMPOSED, BINDING)).resolves.toStrictEqual(MIXED_OPENED)
    const plaintext = await decryptByHand(payload, COMPOSED, BINDING)
    expect(plaintext[0]).toBe(0x01)
  })
})
