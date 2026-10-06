/**
 * A sealed backup opens only with its password and the setup it was sealed
 * for, and only whole: a changed byte anywhere, another password or another
 * bound value is refused alike, a payload of another size or version is
 * refused before any key is derived, and a plaintext with bytes after the rule
 * is refused even when the tag accepts it.
 */
import { bytesToHex, concat, hexToBytes, sliceHex, stringToBytes } from 'viem'

import type { Configuration, Hex } from '@web/modules/social-recovery/sdk-interfaces'
import {
  backupAssociatedDataOf,
  clearBackupOf,
  openBackup,
  sealBackup
} from '@web/modules/social-recovery/shared/client/kit/backup'
import type { BackupBinding } from '@web/modules/social-recovery/shared/client/kit/backup'

jest.setTimeout(30_000)

const PASSWORD = 'correct horse battery staple'
const BINDING: BackupBinding = {
  account: '0x5aAeb6053F3E94C9b9A09f33669435E7Ef1BeAed',
  action: '0xfB6916095ca1df60bB79Ce92cE3Ea74c37c5d359',
  setupCommitment: `0x${'ab'.repeat(32)}`,
  setupNonce: 7n
}

const RULE: Configuration = {
  wait: 3_600n,
  ignoresPause: false,
  clauses: [
    {
      threshold: 1,
      credentials: [{ method: '0xdbF03B407c01E7cD3CBea99509d93f8DDDC8C6FB', config: '0xdeadbeef' }]
    }
  ]
}

const UNOPENED = { name: 'BackupRefusal', reason: 'unopened' }
const MALFORMED = { name: 'BackupRefusal', reason: 'malformed' }

/** The payload with the byte at `index` inverted. */
const flipped = (payload: Hex, index: number): Hex => {
  const bytes = hexToBytes(payload)
  bytes[index] = 0xff - bytes[index]
  return bytesToHex(bytes)
}

let sealed: Hex

beforeAll(async () => {
  sealed = await sealBackup(RULE, PASSWORD, BINDING)
})

describe('a sealed backup', () => {
  it('opens with its password and its setup', async () => {
    await expect(openBackup(sealed, PASSWORD, BINDING)).resolves.toStrictEqual(RULE)
  })

  it('does not open with another password', async () => {
    await expect(openBackup(sealed, `${PASSWORD} `, BINDING)).rejects.toMatchObject(UNOPENED)
  })

  const otherSetups: [string, BackupBinding][] = [
    ['another account', { ...BINDING, account: '0x1000000000000000000000000000000000000001' }],
    ['another action', { ...BINDING, action: '0x2000000000000000000000000000000000000002' }],
    ['another setup commitment', { ...BINDING, setupCommitment: `0x${'ab'.repeat(31)}ac` }],
    ['another setup nonce', { ...BINDING, setupNonce: 8n }]
  ]

  otherSetups.forEach(([what, binding]) => {
    it(`does not open for ${what}`, async () => {
      await expect(openBackup(sealed, PASSWORD, binding)).rejects.toMatchObject(UNOPENED)
    })
  })

  const changedBytes: [string, number][] = [
    ['the key-derivation salt', 1],
    ['the nonce', 28],
    ['the ciphertext', 29],
    ['the tag', 2501]
  ]

  changedBytes.forEach(([where, index]) => {
    it(`does not open with a byte of ${where} changed`, async () => {
      await expect(openBackup(flipped(sealed, index), PASSWORD, BINDING)).rejects.toMatchObject(
        UNOPENED
      )
    })
  })
})

describe('a payload that is not a sealed backup', () => {
  it('is refused by its leading byte', async () => {
    await expect(openBackup(`0x01${sealed.slice(4)}`, PASSWORD, BINDING)).rejects.toMatchObject({
      name: 'BackupRefusal',
      reason: 'unknown-version',
      version: 1
    })
    await expect(openBackup(`0x03${sealed.slice(4)}`, PASSWORD, BINDING)).rejects.toMatchObject({
      reason: 'unknown-version',
      version: 3
    })
  })

  it('is refused at any other size', async () => {
    await expect(openBackup(sliceHex(sealed, 0, 2501), PASSWORD, BINDING)).rejects.toMatchObject(
      MALFORMED
    )
    await expect(openBackup(`${sealed}00`, PASSWORD, BINDING)).rejects.toMatchObject(MALFORMED)
    await expect(openBackup('0x02', PASSWORD, BINDING)).rejects.toMatchObject(MALFORMED)
    await expect(openBackup('0x', PASSWORD, BINDING)).rejects.toMatchObject(MALFORMED)
  })

  it('is refused when it is not hex bytes', async () => {
    await expect(
      openBackup(`${sealed.slice(0, -2)}zz` as Hex, PASSWORD, BINDING)
    ).rejects.toMatchObject(MALFORMED)
    await expect(openBackup(sealed.slice(0, -1) as Hex, PASSWORD, BINDING)).rejects.toMatchObject(
      MALFORMED
    )
  })
})

describe('a payload the tag accepts', () => {
  const SALT = new Uint8Array(16).fill(7)
  const NONCE = new Uint8Array(12).fill(9)
  let key: CryptoKey

  /** Seals the given plaintext bytes with WebCrypto alone, in the sealed layout. */
  const sealByHand = async (plaintext: Uint8Array): Promise<Hex> => {
    const ciphertext = await crypto.subtle.encrypt(
      {
        name: 'AES-GCM',
        iv: NONCE,
        additionalData: new Uint8Array(hexToBytes(backupAssociatedDataOf(BINDING))),
        tagLength: 128
      },
      key,
      new Uint8Array(plaintext)
    )
    return bytesToHex(concat([Uint8Array.of(0x02), SALT, NONCE, new Uint8Array(ciphertext)]))
  }

  const padded = (lastByte: number): Uint8Array => {
    const bytes = new Uint8Array(2457)
    bytes.set(hexToBytes(clearBackupOf(RULE)))
    bytes[2456] = lastByte
    return bytes
  }

  beforeAll(async () => {
    const material = await crypto.subtle.importKey(
      'raw',
      new Uint8Array(stringToBytes(PASSWORD)),
      'PBKDF2',
      false,
      ['deriveKey']
    )
    key = await crypto.subtle.deriveKey(
      { name: 'PBKDF2', hash: 'SHA-256', salt: SALT, iterations: 600_000 },
      material,
      { name: 'AES-GCM', length: 256 },
      false,
      ['encrypt']
    )
  })

  it('opens when every byte after the rule is zero', async () => {
    await expect(openBackup(await sealByHand(padded(0)), PASSWORD, BINDING)).resolves.toStrictEqual(
      RULE
    )
  })

  it('is refused as malformed when its plaintext leads with another version', async () => {
    const plaintext = padded(0)
    plaintext[0] = 0x05
    await expect(openBackup(await sealByHand(plaintext), PASSWORD, BINDING)).rejects.toMatchObject(
      MALFORMED
    )
  })

  it('is refused when a byte after the rule is not zero', async () => {
    await expect(openBackup(await sealByHand(padded(1)), PASSWORD, BINDING)).rejects.toMatchObject(
      MALFORMED
    )
  })
})
