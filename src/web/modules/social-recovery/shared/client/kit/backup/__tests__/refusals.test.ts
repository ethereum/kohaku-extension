/**
 * A backup is never written with a value cut short. A value wider than its
 * field, or random values of the wrong length, are refused before anything is
 * sealed, and a rule wider than the padded size is refused with both sizes;
 * the clear form, which is not padded, still carries such a rule whole.
 */
import { getAddress, maxUint48, numberToHex, size } from 'viem'

import type {
  Address,
  Configuration,
  Credential
} from '@web/modules/social-recovery/sdk-interfaces'
import {
  BACKUP_PADDED_SIZE,
  backupPlaintextSizeOf,
  clearBackupOf,
  openClearBackup
} from '@web/modules/social-recovery/shared/client/kit/backup'
import { sealBackupWithRandomness } from '@web/modules/social-recovery/shared/client/kit/backup/seal'
import type {
  BackupBinding,
  BackupRandomness
} from '@web/modules/social-recovery/shared/client/kit/backup'

const PASSWORD = 'correct horse battery staple'
const BINDING: BackupBinding = {
  account: '0x1000000000000000000000000000000000000001',
  action: '0x2000000000000000000000000000000000000002',
  setupCommitment: `0x${'ab'.repeat(32)}`,
  setupNonce: 1n
}
const RANDOMNESS = { kdfSalt: new Uint8Array(16), nonce: new Uint8Array(12) }

const methodOf = (index: number): Address => getAddress(numberToHex(index + 1, { size: 20 }))

/** A credential at the widest shipped config, three words, with a supplied salt. */
const widest = (index: number, configBytes = 96): Credential => ({
  method: methodOf(index),
  config: `0x${'cd'.repeat(configBytes)}`,
  salt: `0x${'ee'.repeat(32)}`
})

const oneEach = (credentials: Credential[]): Configuration => ({
  wait: 86_400n,
  ignoresPause: false,
  clauses: credentials.map((credential) => ({ threshold: 1, credentials: [credential] }))
})

const SIXTEEN_WIDEST = oneEach(Array.from({ length: 16 }, (_, index) => widest(index)))
/** The sixteen widest with one config a byte longer: one byte past the padded size. */
const ONE_BYTE_OVER = oneEach(
  Array.from({ length: 16 }, (_, index) => widest(index, index === 15 ? 97 : 96))
)

const small = (overrides: Partial<Configuration> = {}): Configuration => ({
  wait: 60n,
  ignoresPause: false,
  clauses: [{ threshold: 1, credentials: [{ method: methodOf(0), config: '0x01' }] }],
  ...overrides
})

const withCredential = (credential: Partial<Credential>): Configuration =>
  small({
    clauses: [
      { threshold: 1, credentials: [{ ...small().clauses[0].credentials[0], ...credential }] }
    ]
  })

const refusalOf = (read: () => unknown): unknown => {
  try {
    read()
  } catch (error) {
    return error
  }
  throw new Error('expected a refusal')
}

describe('the padded size', () => {
  it('holds sixteen of the widest salted credentials exactly', () => {
    expect(backupPlaintextSizeOf(SIXTEEN_WIDEST)).toBe(2457)
    expect(BACKUP_PADDED_SIZE).toBe(2457)
  })

  it('refuses to seal a rule one byte wider, with both sizes', async () => {
    expect(backupPlaintextSizeOf(ONE_BYTE_OVER)).toBe(2458)
    await expect(
      sealBackupWithRandomness(ONE_BYTE_OVER, PASSWORD, BINDING, RANDOMNESS)
    ).rejects.toMatchObject({
      name: 'BackupRefusal',
      reason: 'too-wide',
      plaintextSize: 2458,
      paddedSize: 2457
    })
  })

  it('refuses seventeen credentials in one clause, with their whole size', async () => {
    const seventeen: Configuration = {
      wait: 0n,
      ignoresPause: false,
      clauses: [{ threshold: 1, credentials: Array.from({ length: 17 }, (_, i) => widest(i)) }]
    }
    await expect(
      sealBackupWithRandomness(seventeen, PASSWORD, BINDING, RANDOMNESS)
    ).rejects.toMatchObject({
      reason: 'too-wide',
      plaintextSize: 9 + 2 + 17 * (20 + 2 + 96 + 1 + 32),
      paddedSize: 2457
    })
  })

  it('writes a rule wider than the padded size whole in the clear form', () => {
    const clear = clearBackupOf(ONE_BYTE_OVER)
    expect(size(clear)).toBe(2458)
    expect(openClearBackup(clear)).toStrictEqual(ONE_BYTE_OVER)
  })
})

describe('a value wider than its field', () => {
  const FIELD_WIDTH = { name: 'BackupRefusal', reason: 'field-width' }

  const tooWide: [string, Configuration][] = [
    ['a wait above six bytes', small({ wait: maxUint48 + 1n })],
    ['a negative wait', small({ wait: -1n })],
    [
      'a threshold above 255',
      small({ clauses: [{ threshold: 256, credentials: small().clauses[0].credentials }] })
    ],
    [
      'more than 255 credentials in one clause',
      small({
        clauses: [
          {
            threshold: 1,
            credentials: Array.from({ length: 256 }, (_, i) => ({
              method: methodOf(i),
              config: '0x'
            }))
          }
        ]
      })
    ],
    [
      'more than 255 clauses',
      small({ clauses: Array.from({ length: 256 }, () => small().clauses[0]) })
    ],
    ['a config above 65535 bytes', withCredential({ config: `0x${'00'.repeat(65_536)}` })],
    ['a salt of 31 bytes', withCredential({ salt: `0x${'11'.repeat(31)}` })],
    ['a salt of 33 bytes', withCredential({ salt: `0x${'11'.repeat(33)}` })]
  ]

  tooWide.forEach(([what, configuration]) => {
    it(`refuses ${what}, in the clear form and in a seal`, async () => {
      expect(refusalOf(() => clearBackupOf(configuration))).toMatchObject(FIELD_WIDTH)
      await expect(
        sealBackupWithRandomness(configuration, PASSWORD, BINDING, RANDOMNESS)
      ).rejects.toMatchObject(FIELD_WIDTH)
    })
  })

  it('carries the widest value each field holds', () => {
    const widestFields = small({
      wait: maxUint48,
      clauses: [
        {
          threshold: 255,
          credentials: [{ method: methodOf(0), config: `0x${'00'.repeat(65_535)}` }]
        },
        ...Array.from({ length: 254 }, () => small().clauses[0])
      ]
    })
    expect(openClearBackup(clearBackupOf(widestFields))).toStrictEqual(widestFields)
  })

  const wrongRandomness: [string, BackupRandomness][] = [
    ['a key-derivation salt of 15 bytes', { ...RANDOMNESS, kdfSalt: new Uint8Array(15) }],
    ['a key-derivation salt of 17 bytes', { ...RANDOMNESS, kdfSalt: new Uint8Array(17) }],
    ['a nonce of 11 bytes', { ...RANDOMNESS, nonce: new Uint8Array(11) }],
    ['a nonce of 13 bytes', { ...RANDOMNESS, nonce: new Uint8Array(13) }]
  ]

  wrongRandomness.forEach(([what, randomness]) => {
    it(`refuses to seal with ${what}`, async () => {
      await expect(
        sealBackupWithRandomness(small(), PASSWORD, BINDING, randomness)
      ).rejects.toMatchObject(FIELD_WIDTH)
    })
  })
})
