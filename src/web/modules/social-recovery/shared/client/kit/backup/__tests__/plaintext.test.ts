/**
 * The clear backup is the serialised plaintext as it stands: a version byte
 * 0x01, the wait as six big-endian bytes, the pause flag, the clause count,
 * then per clause its threshold and credential count, and per credential its
 * method, its config's length in two bytes, the config, and a salt flag
 * followed by the 32 salt bytes where a salt was supplied. Its reader takes
 * nothing it does not understand.
 */
import { getAddress, maxUint48, size } from 'viem'

import type { Configuration, Hex } from '@web/modules/social-recovery/sdk-interfaces'
import {
  backupPlaintextSizeOf,
  clearBackupOf,
  openClearBackup
} from '@web/modules/social-recovery/shared/client/kit/backup'

const METHOD_A = '0x5aaeb6053f3e94c9b9a09f33669435e7ef1beaed'
const METHOD_B = '0xfb6916095ca1df60bb79ce92ce3ea74c37c5d359'
const METHOD_C = '0xdbf03b407c01e7cd3cbea99509d93f8dddc8c6fb'
const SALT: Hex = `0x${'11'.repeat(32)}`

const SMALL: Configuration = {
  wait: 0x010203040506n,
  ignoresPause: true,
  clauses: [
    { threshold: 1, credentials: [{ method: METHOD_A, config: '0xdeadbeef', label: 'Phone' }] },
    {
      threshold: 2,
      credentials: [
        { method: METHOD_B, config: '0x', salt: SALT, label: 'Laptop' },
        { method: METHOD_C, config: '0xaa' }
      ]
    }
  ]
}

/** The plaintext of SMALL written out from the layout, with the two flags a test may change. */
const smallPlaintext = ({ pause = '01', firstSaltFlag = '00' } = {}): Hex =>
  `0x${[
    '01',
    '010203040506',
    pause,
    '02',
    '01',
    '01',
    METHOD_A.slice(2),
    '0004',
    'deadbeef',
    firstSaltFlag,
    '02',
    '02',
    METHOD_B.slice(2),
    '0000',
    '01',
    '11'.repeat(32),
    METHOD_C.slice(2),
    '0001',
    'aa',
    '00'
  ].join('')}`

const SMALL_OPENED: Configuration = {
  wait: 0x010203040506n,
  ignoresPause: true,
  clauses: [
    { threshold: 1, credentials: [{ method: getAddress(METHOD_A), config: '0xdeadbeef' }] },
    {
      threshold: 2,
      credentials: [
        { method: getAddress(METHOD_B), config: '0x', salt: SALT },
        { method: getAddress(METHOD_C), config: '0xaa' }
      ]
    }
  ]
}

const refusalOf = (read: () => unknown): unknown => {
  try {
    read()
  } catch (error) {
    return error
  }
  throw new Error('expected a refusal')
}

describe('the clear backup', () => {
  it('writes the plaintext byte for byte as the layout lays it out', () => {
    expect(clearBackupOf(SMALL)).toBe(smallPlaintext())
    expect(backupPlaintextSizeOf(SMALL)).toBe(119)
    expect(size(smallPlaintext())).toBe(119)
  })

  it('writes an empty rule with no wait as its nine header bytes', () => {
    expect(clearBackupOf({ wait: 0n, ignoresPause: false, clauses: [] })).toBe(
      '0x010000000000000000'
    )
  })

  it('reads the plaintext back with the methods checksummed, the labels dropped and only the supplied salt', () => {
    expect(openClearBackup(smallPlaintext())).toStrictEqual(SMALL_OPENED)
  })

  it('reads back the largest wait and either pause choice', () => {
    const longest = { wait: maxUint48, ignoresPause: false, clauses: [] }
    expect(openClearBackup(clearBackupOf(longest))).toStrictEqual(longest)
    expect(openClearBackup(clearBackupOf({ ...longest, ignoresPause: true }))).toStrictEqual({
      ...longest,
      ignoresPause: true
    })
  })

  it('refuses bytes after the last credential', () => {
    expect(refusalOf(() => openClearBackup(`${smallPlaintext()}00`))).toMatchObject({
      name: 'BackupRefusal',
      reason: 'malformed'
    })
  })

  it('refuses a plaintext that ends inside a credential', () => {
    expect(refusalOf(() => openClearBackup(smallPlaintext().slice(0, -2) as Hex))).toMatchObject({
      reason: 'malformed'
    })
  })

  it('refuses a salt flag that is neither 0 nor 1', () => {
    expect(refusalOf(() => openClearBackup(smallPlaintext({ firstSaltFlag: '02' })))).toMatchObject(
      { reason: 'malformed' }
    )
  })

  it('refuses a pause flag that is neither 0 nor 1', () => {
    expect(refusalOf(() => openClearBackup(smallPlaintext({ pause: '02' })))).toMatchObject({
      reason: 'malformed'
    })
  })

  it('refuses text that is not hex bytes', () => {
    expect(refusalOf(() => openClearBackup('0x01zz' as Hex))).toMatchObject({
      reason: 'malformed'
    })
    expect(refusalOf(() => openClearBackup('0x010'))).toMatchObject({ reason: 'malformed' })
  })

  it('refuses a payload whose leading byte is not the clear version', () => {
    expect(refusalOf(() => openClearBackup(`0x02${smallPlaintext().slice(4)}`))).toMatchObject({
      reason: 'unknown-version',
      version: 2
    })
  })
})
