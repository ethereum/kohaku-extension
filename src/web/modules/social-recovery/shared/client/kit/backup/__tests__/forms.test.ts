/**
 * A backup read from the chain names its form by its leading byte: no bytes
 * for the empty one, 0x01 for the clear one, 0x02 for the sealed one. Any
 * other leading byte names no form this build reads.
 */
import type { Hex } from '@web/modules/social-recovery/sdk-interfaces'
import { EMPTY_BACKUP, backupFormOf } from '@web/modules/social-recovery/shared/client/kit/backup'

const refusalOf = (read: () => unknown): unknown => {
  try {
    read()
  } catch (error) {
    return error
  }
  throw new Error('expected a refusal')
}

describe('backupFormOf', () => {
  it('names the empty backup', () => {
    expect(EMPTY_BACKUP).toBe('0x')
    expect(backupFormOf(EMPTY_BACKUP)).toBe('empty')
  })

  it('names the clear and the sealed backups by their leading byte alone', () => {
    expect(backupFormOf('0x01')).toBe('clear')
    expect(backupFormOf('0x010000000000000000')).toBe('clear')
    expect(backupFormOf('0x02')).toBe('encrypted')
    expect(backupFormOf(`0x02${'ff'.repeat(2501)}`)).toBe('encrypted')
  })

  it('refuses any other leading byte and reports it', () => {
    ;(['0x00', '0x03ff', '0xff'] as Hex[]).forEach((payload) =>
      expect(refusalOf(() => backupFormOf(payload))).toMatchObject({
        name: 'BackupRefusal',
        reason: 'unknown-version',
        version: Number.parseInt(payload.slice(2, 4), 16)
      })
    )
  })

  it('refuses text that is not hex bytes', () => {
    ;(['0xzz', '0x012', '01', ''] as Hex[]).forEach((payload) =>
      expect(refusalOf(() => backupFormOf(payload))).toMatchObject({
        name: 'BackupRefusal',
        reason: 'malformed'
      })
    )
  })
})
