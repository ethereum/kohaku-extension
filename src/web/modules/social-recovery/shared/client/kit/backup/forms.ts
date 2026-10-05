import { hexToBytes, isHex } from 'viem'

import type { BackupForm, Hex } from '@web/modules/social-recovery/sdk-interfaces'

import { BACKUP_PLAINTEXT_VERSION } from './plaintext'
import { backupRefusal } from './refusal'
import { BACKUP_SEALED_VERSION } from './seal'

/** The empty backup: the setup keeps no copy of its configuration on chain. */
export const EMPTY_BACKUP: Hex = '0x'

/**
 * Which form a backup read from the chain is in, by its leading byte: none for
 * the empty one, 0x01 for the clear one, 0x02 for the sealed one. Refuses any
 * other leading byte.
 */
export const backupFormOf = (payload: Hex): BackupForm => {
  if (!isHex(payload, { strict: true }) || payload.length % 2 !== 0) {
    throw backupRefusal('malformed', 'The backup is malformed: it is not hex bytes.')
  }
  if (payload === EMPTY_BACKUP) {
    return 'empty'
  }
  const version = hexToBytes(payload)[0]
  if (version === BACKUP_PLAINTEXT_VERSION) {
    return 'clear'
  }
  if (version === BACKUP_SEALED_VERSION) {
    return 'encrypted'
  }
  throw backupRefusal('unknown-version', `The backup has version ${version}.`, { version })
}
